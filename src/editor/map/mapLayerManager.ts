/**
 * @module mapLayerManager
 * Manages EE overlay layers for the map panel.
 *
 * Resolves tile URLs via the EE Maps REST API, keeps layer records
 * for downstream use (pixel inspection), and notifies the WebView.
 */

import { ensureEe, getMapIdUrl, computeValue, evaluate } from '../../shared/eeSession.js';
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
    eeLayer.visParams = finalVisParams;

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

  /** Computes min/max per band for the image at `layerIndex`. */
  async computeMinMax(layerIndex: number): Promise<Record<string, { min: number; max: number }>> {
    const layer = this._layers.get(layerIndex);
    if (!layer) {
      return {};
    }
    const ee = await ensureEe();
    const image = ee.Deserializer.fromJSON(layer.serialized);
    const reduced = (image as any).reduceRegion({
      reducer: ee.Reducer.minMax(),
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-175, -85],
            [175, -85],
            [175, 85],
            [-175, 85],
            [-175, -85],
          ],
        ],
      },
      scale: 1000,
      bestEffort: true,
      maxPixels: 1e8,
    });
    const values = await evaluate<Record<string, number>>(reduced);
    const result: Record<string, { min: number; max: number }> = {};
    for (const [key, val] of Object.entries(values)) {
      const m = key.match(/^(.+)_(min|max)$/);
      if (m) {
        if (!result[m[1]]) {
          result[m[1]] = { min: 0, max: 0 };
        }
        result[m[1]][m[2] as 'min' | 'max'] = val;
      }
    }
    return result;
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
    layer.visParams = finalVisParams;

    postMessage({
      type: 'replaceTileLayer',
      data: { layerIndex, url, visParams: finalVisParams },
    });
  }
}
