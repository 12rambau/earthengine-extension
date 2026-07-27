/**
 * @module mapLayerManager
 * Manages EE overlay layers for the map panel.
 *
 * Resolves tile URLs via the EE Maps REST API, keeps layer records
 * for downstream use (pixel inspection), and notifies the WebView.
 */

import { ensureEe, getMapIdUrl, computeValue } from '../shared/eeSession.js';
import { EeLayer } from './eeLayer.js';
import { parseSepalVisualizations, resolveSepalViz, selectSepalViz } from '../shared/sepalViz.js';

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
    this._layers.set(layerIndex, new EeLayer(layerIndex, payload.serialized, payload.name));

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

    postMessage({
      type: 'addTileLayer',
      data: {
        url,
        name: payload.name,
        shown: payload.shown,
        opacity: payload.opacity,
        layerIndex,
        // Use displayVisParams when present (e.g. HSV — the rendered image is
        // already RGB but we still want to show the original band ranges in the
        // scale bar).
        visParams: displayVisParams ?? resolvedVisParams,
      },
    });
  }

  /** Clears all layers and resets the insertion counter. */
  clear(): void {
    this._layers.clear();
    this.layerCount = 0;
  }
}
