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
        const vizKeys = Object.keys(props ?? {}).filter((k) => k.startsWith('visualization_'));
        console.log(`[MapLayerManager] Found ${vizKeys.length} visualization_* properties`);
        const vizs = parseSepalVisualizations(props ?? {});
        console.log(
          `[MapLayerManager] Parsed ${vizs.length} SEPAL presets:`,
          vizs.map((v) => `${v.index}:${v.name}(${v.type})`).join(', '),
        );
        if (vizs.length > 0) {
          const selector = hasDefault ? (rawVisParams['default'] as string | number) : 0; // no default specified → use first preset
          const viz = selectSepalViz(vizs, selector);
          console.log(
            `[MapLayerManager] Selected viz for '${selector}':`,
            viz ? `${viz.name}(${viz.type}) bands=${viz.bands} values=${viz.values}` : 'none',
          );
          if (viz) {
            const resolved = resolveSepalViz(viz, image, ee);
            resolvedImage = resolved.image;
            resolvedVisParams = resolved.visParams;
            displayVisParams = resolved.displayVisParams;
            console.log('[MapLayerManager] Resolved visParams:', JSON.stringify(resolvedVisParams));
            console.log('[MapLayerManager] Display visParams:', JSON.stringify(displayVisParams));
          }
        }
      } catch (err) {
        // Property fetch failed — log for diagnostics and fall through to
        // EE's default rendering.
        console.log(
          '[MapLayerManager] SEPAL viz resolution failed:',
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
