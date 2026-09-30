/**
 * @module mapLayerManager
 * Manages EE overlay layers for the map panel.
 *
 * Resolves tile URLs via the EE Maps REST API, keeps layer records
 * for downstream use (pixel inspection), and notifies the WebView.
 */

import { ensureEe, getMapIdUrl, computeValue } from '../../shared/eeSession.js';
import { EeLayer } from './eeLayer.js';
import {
  parseSepalVisualizations,
  resolveSepalViz,
  selectSepalViz,
} from '../../shared/sepalViz.js';

/** Shape of an `addLayer` command payload received from the bridge server. */
export interface AddLayerPayload {
  serialized: string;
  visParams: Record<string, unknown>;
  name: string;
  shown: boolean;
  opacity: number;
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
  private layerCount = 0;

  /** All registered layers, keyed by insertion index. */
  get layers(): ReadonlyMap<number, EeLayer> {
    return this._layers;
  }

  /**
   * Registers a new layer, resolves its tile URL, and notifies the WebView.
   *
   * @param payload - The `addLayer` command data from the bridge server.
   * @param postMessage - Callback that sends a message to the WebView.
   */
  async add(payload: AddLayerPayload, postMessage: (msg: unknown) => void): Promise<void> {
    const layerIndex = this.layerCount++;
    const eeLayer = new EeLayer(layerIndex, payload.serialized, payload.name);
    this._layers.set(layerIndex, eeLayer);

    const ee = await ensureEe();
    const image = ee.Deserializer.fromJSON(payload.serialized);

    const rawVisParams = payload.visParams ?? {};
    const hasDefault = 'default' in rawVisParams;
    // If explicit vis-params (min/max/bands/etc.) are present, skip SEPAL lookup.
    const hasExplicitViz = !hasDefault && Object.keys(rawVisParams).length > 0;

    let resolvedImage: unknown = image;
    // Strip the non-EE `default` key so it is never forwarded to visualize().
    let resolvedVisParams: Record<string, unknown> = hasDefault ? {} : rawVisParams;
    let displayVisParams: Record<string, unknown> | undefined;

    if (!hasExplicitViz) {
      // Either {default: <selector>} or {} — try to resolve a SEPAL viz preset
      // from the image's stored properties.
      try {
        const props = await computeValue<Record<string, unknown>>((image as any).toDictionary());
        const vizs = parseSepalVisualizations(props ?? {});
        if (vizs.length > 0) {
          const selector = hasDefault ? (rawVisParams['default'] as string | number) : 0;
          const viz = selectSepalViz(vizs, selector);
          if (viz) {
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

    const finalVisParams = displayVisParams ?? resolvedVisParams;
    eeLayer.url = url;
    eeLayer.visParams = finalVisParams;
    eeLayer.shown = payload.shown;
    eeLayer.opacity = payload.opacity;

    postMessage({
      type: 'addTileLayer',
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

  /** Returns parsed SEPAL visualization presets for the image at `layerIndex`. */

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
    }>
  > {
    const layer = this._layers.get(layerIndex);
    if (!layer) {
      return [];
    }
    try {
      const ee = await ensureEe();
      const image = ee.Deserializer.fromJSON(layer.serialized);
      const props = await computeValue<Record<string, unknown>>((image as any).toDictionary());
      return parseSepalVisualizations(props ?? {}).map((v) => ({
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
      }));
    } catch {
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

    let resolvedImage: unknown = image;
    let resolvedVisParams: Record<string, unknown> = {};
    let displayVisParams: Record<string, unknown> | undefined;

    // Preset selection
    if (config.preset) {
      const preset = config.preset as { index: number; name: string; type: string };
      const props = await computeValue<Record<string, unknown>>((image as any).toDictionary());
      const vizs = parseSepalVisualizations(props ?? {});
      const viz = selectSepalViz(vizs, preset.name);
      if (viz) {
        const resolved = resolveSepalViz(viz, image, ee);
        resolvedImage = resolved.image;
        resolvedVisParams = resolved.visParams;
        displayVisParams = resolved.displayVisParams;
      }
    } else {
      // Custom viz config
      const vizType = config.vizType as string;
      const bands = (config.bands as string[]) || [];
      const min = config.min as number[];
      const max = config.max as number[];

      if (vizType === 'rgb') {
        resolvedVisParams = { bands, min, max };
        if (config.gamma) {
          resolvedVisParams.gamma = config.gamma;
        }
      } else if (vizType === 'hsv') {
        const viz = {
          index: -1,
          name: 'Custom HSV',
          type: 'hsv' as const,
          bands,
          min,
          max,
        };
        const resolved = resolveSepalViz(viz, image, ee);
        resolvedImage = resolved.image;
        resolvedVisParams = resolved.visParams;
        displayVisParams = resolved.displayVisParams;
      } else if (vizType === 'continuous') {
        resolvedVisParams = { bands, min: min?.[0], max: max?.[0] };
        if (config.palette) {
          resolvedVisParams.palette = config.palette;
        }
      } else if (vizType === 'categorical') {
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
      }
    }

    const url = await getMapIdUrl(resolvedImage, resolvedVisParams);
    const finalVisParams = displayVisParams ?? resolvedVisParams;
    layer.url = url;
    layer.visParams = finalVisParams;

    postMessage({
      type: 'replaceTileLayer',
      data: { layerIndex, url, visParams: finalVisParams },
    });
  }
}
