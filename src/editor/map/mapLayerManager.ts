/**
 * @module mapLayerManager
 * Manages EE overlay layers for the map panel.
 *
 * Resolves tile URLs via the EE Maps REST API, keeps layer records
 * for downstream use (pixel inspection), and notifies the WebView.
 */

import { ensureEe, getEeContext, getMapIdUrl, computeValue } from '../../shared/eeSession.js';
import { getImageVisualizations } from '../../shared/imageVisualizations.js';
import { getAsset } from '../../sidebar/assets/eeApiClient.js';
import { EeLayer } from './eeLayer.js';
import {
  type SepalViz,
  parseSepalVisualizations,
  resolveSepalViz,
  selectSepalViz,
  vectorVisParams,
} from '../../shared/sepalViz.js';

type VisualizationType = SepalViz['type'] | 'auto';

function visualizationType(
  visParams: Record<string, unknown>,
  sourceType: 'image' | 'featureCollection',
): VisualizationType {
  const hasDefault = 'default' in visParams;
  const hasValues = visParams['values'] != null;
  const hasBreaks = visParams['breaks'] != null;
  const hasPalette = visParams['palette'] != null;
  const explicit = visParams['type'];
  const hasDirectParams = Object.entries(visParams).some(
    ([key, value]) => key !== 'type' && key !== 'default' && value != null,
  );
  if (hasDefault && hasDirectParams) {
    throw new Error('A preset selector cannot be combined with direct visualization parameters.');
  }
  if (hasValues && hasBreaks) {
    throw new Error('Use either categorical values or interval breaks, not both.');
  }
  let inferred: VisualizationType;
  if (hasDefault || Object.keys(visParams).length === 0) {
    inferred = 'auto';
  } else if (hasBreaks) {
    inferred = 'intervals';
  } else if (hasValues) {
    inferred = 'categorical';
  } else if (hasPalette) {
    inferred = 'continuous';
  } else {
    inferred = sourceType === 'image' ? 'rgb' : 'uniform';
  }
  const renderType = explicit ?? inferred;
  const allowed =
    sourceType === 'image'
      ? ['rgb', 'hsv', 'continuous', 'categorical', 'intervals', 'auto']
      : ['uniform', 'continuous', 'categorical', 'intervals', 'auto'];
  if (typeof renderType !== 'string' || !allowed.includes(renderType)) {
    throw new Error(`Unsupported ${sourceType} visualization type: ${String(renderType)}.`);
  }
  if (
    (hasDefault && renderType !== 'auto') ||
    (renderType === 'auto' && hasDirectParams) ||
    (hasValues && renderType !== 'categorical') ||
    (hasBreaks && renderType !== 'intervals') ||
    (hasPalette && ['rgb', 'hsv', 'uniform'].includes(renderType))
  ) {
    throw new Error('The visualization type conflicts with its parameters.');
  }
  return renderType as VisualizationType;
}

/** Converts explicit discrete image visualization parameters into a rendered image and legend. */
export function resolveDiscreteImageVis(
  visParams: Record<string, unknown>,
  image: unknown,
  ee: any,
): ReturnType<typeof resolveSepalViz> {
  if (visParams['values'] != null && visParams['breaks'] != null) {
    throw new Error('Use either categorical values or interval breaks, not both.');
  }
  const categorical = visParams['values'] != null;
  if (categorical) {
    const values = visParams['values'];
    const palette = visParams['palette'];
    const bands = visParams['bands'];
    if (
      !Array.isArray(bands) ||
      bands.length !== 1 ||
      typeof bands[0] !== 'string' ||
      !bands[0] ||
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((value) => typeof value !== 'number' || !Number.isFinite(value)) ||
      new Set(values).size !== values.length ||
      !Array.isArray(palette) ||
      palette.length !== values.length ||
      palette.some((color) => typeof color !== 'string' || !color.trim())
    ) {
      throw new Error(
        'Categorical visualization requires one band and unique numeric values with one color each.',
      );
    }
  }
  return resolveSepalViz(
    {
      index: -1,
      name: categorical ? 'Custom Classification' : 'Custom Intervals',
      type: categorical ? 'categorical' : 'intervals',
      bands: visParams['bands'] as string[],
      values: categorical ? (visParams['values'] as number[]) : undefined,
      breaks: categorical ? undefined : (visParams['breaks'] as number[]),
      palette: visParams['palette'] as string[],
      labels: visParams['labels'] as string[] | undefined,
    },
    image,
    ee,
  );
}

/** Converts explicit HSV bands and ranges to an RGB tile while preserving HSV display metadata. */
function resolveHsvImageVis(
  visParams: Record<string, unknown>,
  image: unknown,
  ee: any,
): ReturnType<typeof resolveSepalViz> {
  const range = (value: unknown, fallback: number): unknown[] =>
    value == null ? [fallback] : Array.isArray(value) ? value : [value];
  const min = range(visParams['min'], 0);
  const max = range(visParams['max'], 1);
  const bands = visParams['bands'];
  if (
    !Array.isArray(bands) ||
    bands.length !== 3 ||
    bands.some((band) => typeof band !== 'string' || !band) ||
    [min, max].some(
      (values) =>
        values.length === 0 ||
        values.length > 3 ||
        values.some((value) => typeof value !== 'number' || !Number.isFinite(value)),
    )
  ) {
    throw new Error('HSV visualization requires three bands and finite min/max values.');
  }
  return resolveSepalViz(
    {
      index: -1,
      name: 'Custom HSV',
      type: 'hsv',
      bands,
      min: min as number[],
      max: max as number[],
    },
    image,
    ee,
  );
}

/** Shape of an `addLayer` payload received from the bridge or asset API. */
export interface AddLayerPayload {
  serialized: string;
  sourceType?: 'image' | 'featureCollection';
  visParams: Record<string, unknown>;
  name: string;
  shown: boolean;
  opacity: number;
  assetName?: string;
}

/** Percentile pairs backing the `percent-*` stretch modes, as [low, high]. */
const PERCENTILE_BOUNDS: Record<string, [number, number]> = {
  'percent-90': [5, 95],
  'percent-98': [1, 99],
  'percent-100': [0, 100],
};

/** Metres of slack allowed when intersecting the viewport with a footprint. */
const STRETCH_ERROR_MARGIN = 1000;

/** Upper bound on the classes `computeClasses` reports, keeping the legend usable. */
const MAX_AUTO_CLASSES = 30;

/** Styles a collection with the same uniform or property-based parameters used by map layers. */
export function styleFeatureCollection(
  source: any,
  visParams: Record<string, unknown>,
  ee: any,
): unknown {
  const collection = ee.FeatureCollection(source);
  const {
    property,
    type: requestedType,
    palette,
    values,
    breaks,
    min,
    max,
    strokeWidth,
    ...style
  } = visParams;
  const renderType = requestedType ?? ('values' in visParams ? 'categorical' : undefined);
  const base = {
    color: style['color'] ?? '000000',
    fillColor: style['fillColor'] ?? '00000000',
    width: style['width'] ?? strokeWidth ?? 2,
    pointSize: style['pointSize'] ?? 3,
    ...(style['pointShape'] ? { pointShape: style['pointShape'] } : {}),
    ...(style['lineType'] ? { lineType: style['lineType'] } : {}),
  };
  if (!property && !palette && (!renderType || renderType === 'uniform')) {
    return collection.style(base);
  }
  if (
    typeof property !== 'string' ||
    !['continuous', 'categorical', 'intervals'].includes(String(renderType))
  ) {
    throw new Error('Select one property and a supported vector visualization mode.');
  }
  if (!Array.isArray(palette) || palette.length === 0) {
    throw new Error('A palette is required for property styling.');
  }

  let colors = palette;
  if (renderType === 'continuous') {
    if (typeof min !== 'number' || typeof max !== 'number' || min >= max || palette.length < 2) {
      throw new Error('A continuous palette requires at least two colors and increasing min/max.');
    }
    const stops = palette.map((color) => {
      const hex = String(color).replace(/^#/, '');
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
        throw new Error('Palette colors must be hex RGB.');
      }
      return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
    });
    colors = Array.from({ length: 256 }, (_, index) => {
      const position = (index / 255) * (stops.length - 1);
      const start = Math.min(Math.floor(position), stops.length - 2);
      return stops[start]
        .map((channel, offset) =>
          Math.round(channel + (stops[start + 1][offset] - channel) * (position - start))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    });
  } else if (
    renderType === 'categorical' &&
    (!Array.isArray(values) ||
      values.length !== palette.length ||
      new Set(values).size !== values.length ||
      values.some(
        (value) =>
          typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)),
      ))
  ) {
    throw new Error('Categorical values must be distinct strings or numbers, with one color each.');
  } else if (
    renderType === 'intervals' &&
    (!Array.isArray(breaks) ||
      breaks.length !== palette.length + 1 ||
      breaks.some(
        (value, index) => typeof value !== 'number' || (index > 0 && value <= breaks[index - 1]),
      ))
  ) {
    throw new Error('Intervals require increasing breaks and one color per interval.');
  }

  if (palette.some((color) => !/^#?[0-9a-fA-F]{6}$/.test(String(color)))) {
    throw new Error('Palette colors must be hex RGB.');
  }
  const colorList = ee.List(colors.map((color) => String(color).replace(/^#/, '')));
  const valueList = renderType === 'categorical' ? ee.List(values) : null;
  const intervalBreaks = renderType === 'intervals' ? (breaks as number[]) : [];
  const matching =
    renderType === 'categorical'
      ? collection.filter(ee.Filter.inList(property, valueList))
      : collection;
  const styled = matching.map((feature: any) => {
    const value = feature.get(property);
    const number =
      renderType === 'categorical'
        ? null
        : ee.Number(ee.Algorithms.If(ee.Algorithms.IsEqual(value, null), 0, value));
    let index: any;
    if (renderType === 'continuous') {
      index = number
        .subtract(min)
        .divide(ee.Number(max).subtract(min))
        .multiply(255)
        .round()
        .max(0)
        .min(255);
    } else if (renderType === 'categorical') {
      index = valueList.indexOf(value);
    } else {
      index = ee.Number(-1);
      for (let offset = 0; offset < palette.length; offset++) {
        index = ee.Number(
          ee.Algorithms.If(
            number.gte(intervalBreaks[offset]).and(number.lt(intervalBreaks[offset + 1])),
            offset,
            index,
          ),
        );
      }
    }
    const color = ee.String(colorList.get(ee.Number(index).max(0)));
    const fallback = ee.String(base.color).replace('#', '');
    const selected = ee.String(
      ee.Algorithms.If(
        ee.Algorithms.IsEqual(value, null),
        fallback,
        renderType === 'continuous'
          ? color
          : ee.Algorithms.If(ee.Number(index).gte(0), color, fallback),
      ),
    );
    return feature.set('_vsceeStyle', {
      ...base,
      color: selected,
      fillColor: selected.cat('AA'),
    });
  });
  return styled.style({ styleProperty: '_vsceeStyle' });
}

// ==================================================================
// MAPLAYERMANAGER
// ==================================================================
/**
 * Owns the registry of EE overlay layers.
 *
 * Call `add()` for each incoming `addLayer` command; the manager resolves
 * the tile URL and fires `postMessage` with the `addTileLayer` WebView event.
 */
export class MapLayerManager {
  private readonly _layers = new Map<number, EeLayer>();
  private readonly pendingAdds = new Map<string, Promise<void>>();
  private layerCount = 0;

  /** All registered layers, keyed by insertion index. */
  get layers(): ReadonlyMap<number, EeLayer> {
    return this._layers;
  }

  /**
   * Registers a new layer, resolves its tile URL, and notifies the WebView.
   *
   * Calls targeting the same layer name run one after another, so a slower
   * earlier call can never overwrite the tiles produced by a later one.
   *
   * @param payload - The `addLayer` command data from the bridge server.
   * @param postMessage - Callback that sends a message to the WebView.
   */
  add(payload: AddLayerPayload, postMessage: (msg: unknown) => void): Promise<void> {
    const previous = this.pendingAdds.get(payload.name) ?? Promise.resolve();
    const run = previous.then(() => this.resolveAndPost(payload, postMessage));
    // The queued chain swallows rejections so one failure does not reject the next caller.
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.pendingAdds.set(payload.name, settled);
    void settled.then(() => {
      if (this.pendingAdds.get(payload.name) === settled) {
        this.pendingAdds.delete(payload.name);
      }
    });
    return run;
  }

  private async resolveVectorVisParams(
    source: any,
    visParams: Record<string, unknown>,
    assetName?: string,
  ): Promise<Record<string, unknown>> {
    if (!('default' in visParams)) {
      return visParams;
    }
    const props = assetName
      ? ((await getAsset(assetName, (await getEeContext()).token)).properties ?? {})
      : await computeValue<Record<string, unknown>>(source.toDictionary());
    const presets = parseSepalVisualizations(props).filter((preset) =>
      ['uniform', 'continuous', 'categorical', 'intervals'].includes(preset.type),
    );
    const preset = selectSepalViz(presets, visParams['default'] as string | number);
    if (!preset) {
      throw new Error('No FeatureCollection visualization presets found.');
    }
    return vectorVisParams(preset);
  }

  /** Resolves the tile URL for one `addLayer` payload and posts the result. */
  private async resolveAndPost(
    payload: AddLayerPayload,
    postMessage: (msg: unknown) => void,
  ): Promise<void> {
    const existingLayer = [...this._layers.values()].find((layer) => layer.name === payload.name);

    const ee = await ensureEe();
    const image = ee.Deserializer.fromJSON(payload.serialized);

    if (payload.sourceType === 'featureCollection') {
      visualizationType(payload.visParams, 'featureCollection');
      const visParams = await this.resolveVectorVisParams(
        image,
        payload.visParams,
        payload.assetName,
      );
      const renderType = visualizationType(visParams, 'featureCollection');
      const normalized = {
        ...visParams,
        type: renderType === 'auto' ? 'uniform' : renderType,
      };
      const url = await getMapIdUrl(styleFeatureCollection(image, normalized, ee), {});
      const layerIndex = existingLayer?.index ?? this.layerCount++;
      this._layers.set(
        layerIndex,
        new EeLayer(
          layerIndex,
          payload.serialized,
          payload.name,
          url,
          normalized,
          payload.shown,
          payload.opacity,
          payload.assetName,
          'featureCollection',
        ),
      );
      postMessage({
        type: existingLayer ? 'replaceTileLayer' : 'addTileLayer',
        data: {
          url,
          name: payload.name,
          shown: payload.shown,
          opacity: payload.opacity,
          layerIndex,
          visParams: normalized,
        },
      });
      return;
    }

    const rawVisParams = payload.visParams ?? {};
    const requestedType = visualizationType(rawVisParams, 'image');
    const hasDefault = 'default' in rawVisParams;
    // If explicit vis-params (min/max/bands/etc.) are present, skip SEPAL lookup.
    const hasExplicitViz = requestedType !== 'auto';

    let resolvedImage: unknown = image;
    // Strip the non-EE `default` key so it is never forwarded to visualize().
    let resolvedVisParams: Record<string, unknown> = { ...rawVisParams };
    delete resolvedVisParams['type'];
    delete resolvedVisParams['default'];
    let displayVisParams: Record<string, unknown> | undefined;
    let resolvedType = requestedType;

    if (requestedType === 'hsv') {
      const resolved = resolveHsvImageVis(rawVisParams, image, ee);
      resolvedImage = resolved.image;
      resolvedVisParams = resolved.visParams;
      displayVisParams = resolved.displayVisParams;
    } else if (requestedType === 'categorical' || requestedType === 'intervals') {
      const resolved = resolveDiscreteImageVis(rawVisParams, image, ee);
      resolvedImage = resolved.image;
      resolvedVisParams = resolved.visParams;
      displayVisParams = resolved.displayVisParams;
    } else if (!hasExplicitViz) {
      // Either {default: <selector>} or {} — try to resolve a SEPAL viz preset
      // from the image's stored properties.
      try {
        const props = await computeValue<Record<string, unknown>>((image as any).toDictionary());
        const vizs = await getImageVisualizations(props, undefined, payload.assetName);
        if (vizs.length > 0) {
          const selector = hasDefault ? (rawVisParams['default'] as string | number) : 0;
          const viz = selectSepalViz(vizs, selector);
          if (viz) {
            resolvedType = viz.type;
            const resolved = resolveSepalViz(viz, image, ee);
            resolvedImage = resolved.image;
            resolvedVisParams = resolved.visParams;
            displayVisParams = resolved.displayVisParams;
          } else if (hasDefault) {
            throw new Error(
              `SEPAL visualization preset '${rawVisParams['default']}' not found. ` +
                `Available: ${vizs.map((v) => v.name).join(', ')}`,
            );
          }
        } else if (hasDefault) {
          throw new Error(
            `No SEPAL visualization presets found on this image ` +
              `(requested default: '${rawVisParams['default']}').`,
          );
        }
      } catch (err) {
        if (hasDefault) {
          // An explicit default was requested — propagate the error so the
          // caller's existing error-reporting path can surface it to the user.
          throw err;
        }
        // No explicit default — silently fall through to EE's default rendering.
        console.log(
          '[MapLayerManager] SEPAL viz resolution failed (non-fatal):',
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    const url = await getMapIdUrl(resolvedImage, resolvedVisParams);

    const finalVisParams = {
      ...(displayVisParams ?? resolvedVisParams),
      type: resolvedType === 'auto' ? 'rgb' : resolvedType,
    };
    // Commit only now: on failure above the previous entry stays usable for replay().
    const layerIndex = existingLayer?.index ?? this.layerCount++;
    this._layers.set(
      layerIndex,
      new EeLayer(
        layerIndex,
        payload.serialized,
        payload.name,
        url,
        finalVisParams,
        payload.shown,
        payload.opacity,
        payload.assetName,
        'image',
      ),
    );

    postMessage({
      type: existingLayer ? 'replaceTileLayer' : 'addTileLayer',
      data: {
        url,
        name: payload.name,
        shown: payload.shown,
        opacity: payload.opacity,
        layerIndex,
        visParams: finalVisParams,
      },
    });
  }

  /** Re-emits `addTileLayer` for every stored layer — used after a WebView reload. */
  replay(postMessage: (msg: unknown) => void): void {
    for (const layer of this._layers.values()) {
      if (!layer.url) {
        continue;
      }
      postMessage({
        type: 'addTileLayer',
        data: {
          url: layer.url,
          name: layer.name,
          shown: layer.shown,
          opacity: layer.opacity,
          layerIndex: layer.index,
          visParams: layer.visParams,
        },
      });
    }
  }

  /** Records a visibility change coming from the WebView. */
  setLayerVisibility(layerIndex: number, shown: boolean): void {
    const layer = this._layers.get(layerIndex);
    if (layer) {
      layer.shown = shown;
    }
  }

  /** Records an opacity change coming from the WebView. */
  setLayerOpacity(layerIndex: number, opacity: number): void {
    const layer = this._layers.get(layerIndex);
    if (layer) {
      layer.opacity = opacity;
    }
  }

  /** Moves a layer one position in replay order, toward the top (+1) or bottom (-1). */
  move(layerIndex: number, direction: number): void {
    if (direction !== 1 && direction !== -1) {
      return;
    }
    const entries = [...this._layers.entries()];
    const index = entries.findIndex(([key]) => key === layerIndex);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= entries.length) {
      return;
    }
    [entries[index], entries[target]] = [entries[target], entries[index]];
    this._layers.clear();
    for (const [key, layer] of entries) {
      this._layers.set(key, layer);
    }
  }

  /** Removes the layer identified by `layerIndex`. */
  remove(layerIndex: number): void {
    this._layers.delete(layerIndex);
  }

  /** Clears all layers and resets the insertion counter. */
  clear(): void {
    this._layers.clear();
    this.layerCount = 0;
  }

  // ── Visualization editor helpers ─────────────────────────────

  /** Returns band names for the image at `layerIndex`. */
  async getBandNames(layerIndex: number): Promise<string[]> {
    const layer = this._layers.get(layerIndex);
    if (!layer) {
      return [];
    }
    try {
      const ee = await ensureEe();
      const image = ee.Deserializer.fromJSON(layer.serialized);
      return await computeValue<string[]>((image as any).bandNames());
    } catch {
      return [];
    }
  }

  /** Returns properties present on the first feature of a vector layer. */
  async getPropertyNames(layerIndex: number): Promise<string[]> {
    const layer = this._layers.get(layerIndex);
    if (!layer || layer.sourceType !== 'featureCollection') {
      return [];
    }
    try {
      const ee = await ensureEe();
      const collection = ee.Deserializer.fromJSON(layer.serialized) as any;
      const names = await computeValue<string[]>(collection.first().propertyNames());
      return names.filter((name) => !name.startsWith('system:'));
    } catch {
      return [];
    }
  }

  /** Detects class values in the visible part of a vector collection. */
  async getPropertyClasses(
    layerIndex: number,
    property: string,
    bounds: [number, number, number, number],
  ): Promise<{ values: (string | number)[]; truncated: boolean }> {
    const layer = this._layers.get(layerIndex);
    if (!layer || layer.sourceType !== 'featureCollection') {
      return { values: [], truncated: false };
    }
    const ee = (await ensureEe()) as any;
    const [south, west, north, east] = bounds;
    const region = ee.Geometry.Rectangle([west, south, east, north], null, false);
    const collection = ee.Deserializer.fromJSON(layer.serialized);
    const histogram = await computeValue<Record<string, number>>(
      collection.filterBounds(region).aggregate_histogram(property),
    );
    const entries = Object.entries(histogram ?? {}).sort((left, right) => right[1] - left[1]);
    const first = await computeValue<unknown>(
      collection
        .filter(ee.Filter.notNull([property]))
        .first()
        .get(property),
    );
    const numeric = typeof first === 'number';
    const values = entries
      .slice(0, MAX_AUTO_CLASSES)
      .map(([value]) => (numeric ? Number(value) : value));
    values.sort((left, right) =>
      numeric ? Number(left) - Number(right) : String(left).localeCompare(String(right)),
    );
    return { values, truncated: entries.length > MAX_AUTO_CLASSES };
  }

  /** Returns the numeric range of a vector property inside the viewport. */
  async getPropertyRange(
    layerIndex: number,
    property: string,
    bounds: [number, number, number, number],
  ): Promise<{ min: number; max: number }> {
    const layer = this._layers.get(layerIndex);
    if (!layer || layer.sourceType !== 'featureCollection') {
      throw new Error('Vector layer not found.');
    }
    const ee = (await ensureEe()) as any;
    const [south, west, north, east] = bounds;
    const region = ee.Geometry.Rectangle([west, south, east, north], null, false);
    const collection = ee.Deserializer.fromJSON(layer.serialized)
      .filterBounds(region)
      .filter(ee.Filter.notNull([property]));
    const range = await computeValue<{ min: number | null; max: number | null }>(
      collection.reduceColumns(ee.Reducer.minMax(), [property]),
    );
    if (!Number.isFinite(range?.min) || !Number.isFinite(range?.max)) {
      throw new Error('No numeric values found for this property in the visible area.');
    }
    return { min: range.min!, max: range.max! };
  }

  /**
   * Returns the image at `layerIndex` restricted to `bands`, together with the
   * region where it overlaps the viewport.
   *
   * @param bounds - Viewport as `[south, west, north, east]` in degrees.
   */
  private async viewportTarget(
    layerIndex: number,
    bands: string[],
    bounds: [number, number, number, number],
  ): Promise<{ image: any; region: unknown } | null> {
    const layer = this._layers.get(layerIndex);
    if (!layer || bands.length === 0) {
      return null;
    }
    const ee = await ensureEe();
    const eeAny = ee as any;
    const source = ee.Deserializer.fromJSON(layer.serialized) as any;
    // A collection has no reduceRegion — flatten it to the image actually drawn.
    const image = (typeof source.mosaic === 'function' ? source.mosaic() : source).select(bands);

    const [south, west, north, east] = bounds;
    // Web Mercator cannot represent the poles; EE rejects out-of-range latitudes.
    const s = Math.max(-85, Math.min(85, south));
    const n = Math.max(-85, Math.min(85, north));
    const w = Math.max(-180, Math.min(180, west));
    const e = Math.max(-180, Math.min(180, east));
    // Planar edges: geodesic ones bow outside the viewport at low zoom.
    const window = eeAny.Geometry.Rectangle([w, s, e, n], null, false);
    // Intersecting with the footprint keeps unbounded images from reducing
    // over empty space, which is what blows the response size up.
    return { image, region: window.intersection(image.geometry(), STRETCH_ERROR_MARGIN) };
  }

  /**
   * Computes a display range for `bands` from the pixels inside `bounds`,
   * mirroring the Code Editor stretch presets.
   *
   * @param mode - `sigma-1|2|3` (mean ± n·σ) or `percent-90|98|100`.
   * @param bounds - Viewport as `[south, west, north, east]` in degrees.
   * @param scale - Metres per screen pixel at the current zoom.
   */
  async computeStretch(
    layerIndex: number,
    bands: string[],
    mode: string,
    bounds: [number, number, number, number],
    scale: number,
  ): Promise<Record<string, { min: number; max: number }>> {
    const target = await this.viewportTarget(layerIndex, bands, bounds);
    if (!target) {
      return {};
    }
    const ee = await ensureEe();

    const isSigma = mode.startsWith('sigma-');
    const reducer = isSigma
      ? ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true })
      : ee.Reducer.percentile(PERCENTILE_BOUNDS[mode] ?? [0, 100]);

    const reduced = target.image.reduceRegion({
      reducer,
      geometry: target.region,
      scale: Math.max(1, scale),
      bestEffort: true,
      maxPixels: 1e8,
      tileScale: 4,
    });
    // computeValue goes through the REST client; `evaluate` uses the JS client
    // transport that is unreliable in the extension host.
    const values = await computeValue<Record<string, number>>(reduced);

    const result: Record<string, { min: number; max: number }> = {};
    if (isSigma) {
      const sigmas = Number(mode.slice('sigma-'.length)) || 1;
      for (const band of bands) {
        const mean = values[`${band}_mean`];
        const sd = values[`${band}_stdDev`];
        if (Number.isFinite(mean) && Number.isFinite(sd)) {
          result[band] = { min: mean - sigmas * sd, max: mean + sigmas * sd };
        }
      }
    } else {
      const [lo, hi] = PERCENTILE_BOUNDS[mode] ?? [0, 100];
      for (const band of bands) {
        const min = values[`${band}_p${lo}`];
        const max = values[`${band}_p${hi}`];
        if (Number.isFinite(min) && Number.isFinite(max)) {
          result[band] = { min, max };
        }
      }
    }
    return result;
  }

  /**
   * Lists the distinct values of `band` present in the viewport, most frequent
   * first, capped at `MAX_AUTO_CLASSES`.
   *
   * @param bounds - Viewport as `[south, west, north, east]` in degrees.
   * @param scale - Metres per screen pixel at the current zoom.
   */
  async computeClasses(
    layerIndex: number,
    band: string,
    bounds: [number, number, number, number],
    scale: number,
  ): Promise<{ values: number[]; truncated: boolean }> {
    const target = await this.viewportTarget(layerIndex, [band], bounds);
    if (!target) {
      return { values: [], truncated: false };
    }
    const ee = await ensureEe();
    const reduced = target.image.reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(),
      geometry: target.region,
      scale: Math.max(1, scale),
      bestEffort: true,
      maxPixels: 1e8,
      tileScale: 4,
    });
    const result = await computeValue<Record<string, Record<string, number> | null>>(reduced);
    const histogram = result?.[band] ?? {};

    // Keep the dominant classes, then present them in value order.
    const counted = Object.entries(histogram)
      .map(([key, count]) => ({ value: Number(key), count: Number(count) }))
      .filter((entry) => Number.isFinite(entry.value));
    counted.sort((a, b) => b.count - a.count);
    const kept = counted.slice(0, MAX_AUTO_CLASSES).map((entry) => entry.value);
    kept.sort((a, b) => a - b);
    return { values: kept, truncated: counted.length > MAX_AUTO_CLASSES };
  }

  /** Returns parsed visualization presets for the asset at `layerIndex`. */

  async getPresets(layerIndex: number): Promise<
    Array<{
      index: number;
      name: string;
      type: string;
      bands: string[];
      min?: number[];
      max?: number[];
      palette?: string[];
      gamma?: number[];
      labels?: string[];
      values?: number[];
      breaks?: number[];
      color?: string;
      fillColor?: string;
      width?: number;
    }>
  > {
    const layer = this._layers.get(layerIndex);
    if (!layer) {
      return [];
    }
    try {
      let props: Record<string, unknown>;
      if (layer.sourceType === 'featureCollection' && layer.assetName) {
        props = (await getAsset(layer.assetName, (await getEeContext()).token)).properties ?? {};
      } else {
        const ee = await ensureEe();
        const source = ee.Deserializer.fromJSON(layer.serialized);
        props = await computeValue<Record<string, unknown>>((source as any).toDictionary());
      }
      const vizs =
        layer.sourceType === 'featureCollection'
          ? parseSepalVisualizations(props).filter((viz) =>
              ['uniform', 'continuous', 'categorical', 'intervals'].includes(viz.type),
            )
          : await getImageVisualizations(props, undefined, layer.assetName);
      return vizs.map((v) => ({
        index: v.index,
        name: v.name,
        type: v.type,
        bands: v.bands,
        min: v.min,
        max: v.max,
        palette: v.palette,
        gamma: v.gamma,
        labels: v.labels,
        values: v.values,
        breaks: v.breaks,
        color: v.color,
        fillColor: v.fillColor,
        width: v.width,
      }));
    } catch (error) {
      if (layer.sourceType === 'featureCollection' && layer.assetName) {
        throw error;
      }
      return [];
    }
  }

  /**
   * Re-renders the layer at `layerIndex` with new visualisation parameters.
   * Supports both raw EE vis-params and SEPAL-preset selection.
   */
  async updateLayer(
    layerIndex: number,
    config: Record<string, unknown>,
    postMessage: (msg: unknown) => void,
  ): Promise<void> {
    const layer = this._layers.get(layerIndex);
    if (!layer) {
      throw new Error(`Layer ${layerIndex} not found`);
    }
    const ee = await ensureEe();
    const image = ee.Deserializer.fromJSON(layer.serialized);

    if (layer.sourceType === 'featureCollection') {
      const visParams = { ...config };
      delete visParams['opacity'];
      delete visParams['layerIndex'];
      const resolvedVisParams = await this.resolveVectorVisParams(
        image,
        visParams,
        layer.assetName,
      );
      const renderType = visualizationType(resolvedVisParams, 'featureCollection');
      const normalized = {
        ...resolvedVisParams,
        type: renderType === 'auto' ? 'uniform' : renderType,
      };
      const url = await getMapIdUrl(styleFeatureCollection(image, normalized, ee), {});
      layer.url = url;
      layer.visParams = normalized;
      postMessage({
        type: 'replaceTileLayer',
        data: { layerIndex, url, visParams: normalized },
      });
      return;
    }

    let resolvedImage: unknown = image;
    let resolvedVisParams: Record<string, unknown> = {};
    let displayVisParams: Record<string, unknown> | undefined;
    let selectedType: string | undefined;

    // Preset selection
    if (config.preset) {
      const preset = config.preset as { index: number; name: string; type: string };
      const props = await computeValue<Record<string, unknown>>((image as any).toDictionary());
      const vizs = await getImageVisualizations(props, undefined, layer.assetName);
      const viz = selectSepalViz(vizs, preset.name);
      if (viz) {
        selectedType = viz.type;
        const resolved = resolveSepalViz(viz, image, ee);
        resolvedImage = resolved.image;
        resolvedVisParams = resolved.visParams;
        displayVisParams = resolved.displayVisParams;
      }
    } else {
      // Custom viz config
      const renderType = config.type as string;
      const bands = (config.bands as string[]) || [];
      const min = config.min as number[];
      const max = config.max as number[];

      if (renderType === 'rgb') {
        resolvedVisParams = { bands, min, max };
        if (config.gamma) {
          resolvedVisParams.gamma = config.gamma;
        }
      } else if (renderType === 'hsv') {
        const resolved = resolveHsvImageVis(config, image, ee);
        resolvedImage = resolved.image;
        resolvedVisParams = resolved.visParams;
        displayVisParams = resolved.displayVisParams;
      } else if (renderType === 'continuous') {
        resolvedVisParams = { bands, min: min?.[0], max: max?.[0] };
        if (config.palette) {
          resolvedVisParams.palette = config.palette;
        }
      } else if (renderType === 'categorical') {
        const viz = {
          index: -1,
          name: 'Custom Classification',
          type: 'categorical' as const,
          bands,
          values: config.values as number[],
          labels: config.labels as string[],
          palette: config.palette as string[],
        };
        const resolved = resolveSepalViz(viz, image, ee);
        resolvedImage = resolved.image;
        resolvedVisParams = resolved.visParams;
        displayVisParams = resolved.displayVisParams;
      } else if (renderType === 'intervals') {
        const viz = {
          index: -1,
          name: 'Custom Intervals',
          type: 'intervals' as const,
          bands,
          breaks: config.breaks as number[],
          labels: config.labels as string[],
          palette: config.palette as string[],
        };
        const resolved = resolveSepalViz(viz, image, ee);
        resolvedImage = resolved.image;
        resolvedVisParams = resolved.visParams;
        displayVisParams = resolved.displayVisParams;
      }
    }

    const url = await getMapIdUrl(resolvedImage, resolvedVisParams);
    const finalVisParams = {
      ...(displayVisParams ?? resolvedVisParams),
      type: selectedType ?? config.type,
    };
    layer.url = url;
    layer.visParams = finalVisParams;

    postMessage({
      type: 'replaceTileLayer',
      data: { layerIndex, url, visParams: finalVisParams },
    });
  }
}
