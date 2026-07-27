/**
 * @module sepalViz
 * Parses and converts SEPAL-format visualization metadata stored as EE image
 * properties into standard EE vis-params.
 *
 * SEPAL stores visualization presets directly on an image asset using property
 * keys of the form `visualization_<N>_<keyword>: <value>` (values are always
 * strings, comma-separated when multi-valued).
 *
 * Reference:
 * https://pysepal.readthedocs.io/en/latest/tutorials/create_asset.html
 */

// ==================================================================
// TYPES
// ==================================================================

/** A single parsed SEPAL visualization preset. */
export interface SepalViz {
  /** Integer index extracted from the property key. */
  index: number;
  /** Display name (defaults to `"Visualization <index>"` if absent). */
  name: string;
  /** Rendering type. */
  type: 'rgb' | 'hsv' | 'continuous' | 'categorical';
  /** Band names or numbers (as strings). */
  bands: string[];
  min?: number[];
  max?: number[];
  palette?: string[];
  gamma?: number[];
  /** Per-band inversion flags. */
  inverted?: boolean[];
  /** Category display labels (`categorical` only). */
  labels?: string[];
  /** Category pixel values (`categorical` only). */
  values?: number[];
}

// ==================================================================
// PARSING
// ==================================================================

/**
 * Parses all SEPAL visualization presets from an image property dictionary.
 * Returns them sorted by index ascending.
 *
 * @param props - Raw property dictionary (values coerced to string).
 */
export function parseSepalVisualizations(props: Record<string, unknown>): SepalViz[] {
  const byIndex = new Map<number, Record<string, string>>();

  for (const [key, raw] of Object.entries(props)) {
    const match = key.match(/^visualization_(\d+)_(.+)$/);
    if (!match) {
      continue;
    }
    const idx = parseInt(match[1], 10);
    const field = match[2];
    if (!byIndex.has(idx)) {
      byIndex.set(idx, {});
    }
    byIndex.get(idx)![field] = String(raw);
  }

  const result: SepalViz[] = [];
  for (const [idx, fields] of [...byIndex.entries()].sort(([a], [b]) => a - b)) {
    const type = fields['type'] as SepalViz['type'] | undefined;
    if (!type) {
      continue; // malformed entry — skip
    }
    result.push({
      index: idx,
      name: fields['name'] ?? `Visualization ${idx}`,
      type,
      bands: fields['bands'] ? splitComma(fields['bands']) : [],
      min: fields['min'] ? parseFloats(fields['min']) : undefined,
      max: fields['max'] ? parseFloats(fields['max']) : undefined,
      palette: fields['palette'] ? splitComma(fields['palette']) : undefined,
      gamma: fields['gamma'] ? parseFloats(fields['gamma']) : undefined,
      inverted: fields['inverted'] ? parseBools(fields['inverted']) : undefined,
      labels: fields['labels'] ? splitComma(fields['labels']) : undefined,
      values: fields['values'] ? parseFloats(fields['values']) : undefined,
    });
  }
  return result;
}

// ==================================================================
// SELECTION
// ==================================================================

/**
 * Finds a visualization by name or integer index.
 *
 * - `string` selector: returns the first entry whose `name` matches exactly;
 *   falls back to the first entry if no name matches.
 * - `number` selector: returns the entry whose `index` equals the value, then
 *   tries positional access, then falls back to the first entry.
 *
 * Returns `undefined` only when `vizs` is empty.
 */
export function selectSepalViz(vizs: SepalViz[], selector: string | number): SepalViz | undefined {
  if (vizs.length === 0) {
    return undefined;
  }
  if (typeof selector === 'number') {
    return vizs.find((v) => v.index === selector) ?? vizs[selector] ?? vizs[0];
  }
  return vizs.find((v) => v.name === selector) ?? vizs[0];
}

// ==================================================================
// CONVERSION
// ==================================================================

/**
 * Converts a `SepalViz` into `{ image, visParams }` ready for `getMapIdUrl`.
 *
 * | Type         | Strategy                                                  |
 * |--------------|-----------------------------------------------------------|
 * | `rgb`        | Standard EE `{ bands, min, max, gamma }` vis-params.      |
 * | `continuous` | Single-band palette ramp `{ bands, min, max, palette }`.  |
 * | `categorical`| Palette ramp bounded by `min(values)` – `max(values)`.   |
 * | `hsv`        | Normalise bands to [0, 1] then `hsvToRgb()` on the image. |
 *
 * For `rgb` and `hsv`, the `inverted` flag swaps min/max for the affected band,
 * producing a reversed colour ramp on that channel.
 *
 * @param viz   - The parsed visualization preset.
 * @param image - A deserialized EE Image object.
 * @param ee    - The EE namespace (typed as `any` — no TS types for the JS client).
 */
export function resolveSepalViz(
  viz: SepalViz,
  image: unknown,
  ee: any,
): {
  image: unknown;
  visParams: Record<string, unknown>;
  displayVisParams?: Record<string, unknown>;
} {
  const minArr = viz.min ?? [];
  const maxArr = viz.max ?? [];

  switch (viz.type) {
    case 'rgb': {
      const { finalMin, finalMax } = applyInverted(minArr, maxArr, viz.inverted);
      const visParams: Record<string, unknown> = { bands: viz.bands };
      if (finalMin.length > 0) {
        visParams['min'] = finalMin.length === 1 ? finalMin[0] : finalMin;
      }
      if (finalMax.length > 0) {
        visParams['max'] = finalMax.length === 1 ? finalMax[0] : finalMax;
      }
      if (viz.gamma && viz.gamma.length > 0) {
        visParams['gamma'] = viz.gamma.length === 1 ? viz.gamma[0] : viz.gamma;
      }
      return { image, visParams };
    }

    case 'continuous': {
      const visParams: Record<string, unknown> = { bands: viz.bands };
      if (minArr.length > 0) {
        visParams['min'] = minArr[0];
      }
      if (maxArr.length > 0) {
        visParams['max'] = maxArr[0];
      }
      if (viz.palette && viz.palette.length > 0) {
        visParams['palette'] = viz.palette;
      }
      return { image, visParams };
    }

    case 'categorical': {
      // Remap discrete category values to sequential indices so that each
      // value maps to exactly one palette colour instead of being linearly
      // interpolated across a continuous gradient.
      const values = viz.values ?? [];
      const nClasses = Math.max(values.length, (viz.palette ?? []).length);
      const indices = values.map((_v, i) => i);
      const imageAny = image as any;
      const band = viz.bands.length > 0 ? viz.bands[0] : null;
      const selected = band ? imageAny.select([band]) : imageAny;
      // Use ee.List wrappers to guarantee correct argument types.  The JS
      // client's `remap` takes positional args: (from, to, defaultValue, bandName).
      const remapped =
        values.length > 0 ? selected.remap(ee.List(values), ee.List(indices)).byte() : selected;

      // Do NOT pass `bands` — the remapped image is single-band and
      // `.visualize({ min, max, palette })` will use that band directly.
      const visParams: Record<string, unknown> = {};
      visParams['min'] = 0;
      visParams['max'] = Math.max(nClasses - 1, 0);
      if (viz.palette && viz.palette.length > 0) {
        visParams['palette'] = viz.palette;
      }

      // Pass labels and values to the WebView so the scale bar can render
      // discrete category swatches instead of a continuous gradient.
      // Include `bands` (single element) so the scale bar shows the band name
      // and does NOT trigger the 3-band RGB path.
      const displayVisParams: Record<string, unknown> = { ...visParams };
      displayVisParams['bands'] = [band ?? 'class'];
      if (viz.labels && viz.labels.length > 0) {
        displayVisParams['labels'] = viz.labels;
      }
      if (viz.values && viz.values.length > 0) {
        displayVisParams['values'] = viz.values;
      }
      return { image: remapped, visParams, displayVisParams };
    }

    case 'hsv': {
      // Normalise each of the 3 bands to [0, 1] (respecting inverted), then
      // convert the stacked H/S/V image to RGB with hsvToRgb().
      const { finalMin, finalMax } = applyInverted(minArr, maxArr, viz.inverted);
      const imageAny = image as any;

      const bandImages = viz.bands.map((band, i) => {
        const mn = finalMin[i] ?? finalMin[0] ?? 0;
        const mx = finalMax[i] ?? finalMax[0] ?? 1;
        const range = mx !== mn ? mx - mn : 1;
        return imageAny.select([band]).subtract(mn).divide(range).clamp(0, 1);
      });

      const stacked = ee.Image.cat(bandImages);
      // Keep original band metadata as displayVisParams so the WebView scale
      // bar can show the H/S/V ranges.  The rendered tile is RGB so pixel-level
      // hover tracking is approximate for HSV layers.
      const displayVisParams: Record<string, unknown> = { bands: viz.bands };
      if (finalMin.length > 0) {
        displayVisParams['min'] = finalMin.length === 1 ? finalMin[0] : finalMin;
      }
      if (finalMax.length > 0) {
        displayVisParams['max'] = finalMax.length === 1 ? finalMax[0] : finalMax;
      }
      return { image: stacked.hsvToRgb(), visParams: {}, displayVisParams };
    }

    default:
      return { image, visParams: {} };
  }
}

// ==================================================================
// PRIVATE HELPERS
// ==================================================================

function splitComma(s: string): string[] {
  return s.split(',').map((v) => v.trim());
}

function parseFloats(s: string): number[] {
  return s.split(',').map((v) => parseFloat(v.trim()));
}

function parseBools(s: string): boolean[] {
  return s.split(',').map((v) => v.trim().toLowerCase() === 'true');
}

/**
 * Applies the per-band `inverted` flags by swapping min/max for those bands.
 * Returns copies of the arrays; originals are unmodified.
 */
function applyInverted(
  min: number[],
  max: number[],
  inverted?: boolean[],
): { finalMin: number[]; finalMax: number[] } {
  if (!inverted || inverted.every((v) => !v)) {
    return { finalMin: [...min], finalMax: [...max] };
  }
  const finalMin = min.map((v, i) => (inverted[i] ? (max[i] ?? v) : v));
  const finalMax = max.map((v, i) => (inverted[i] ? (min[i] ?? v) : v));
  return { finalMin, finalMax };
}
