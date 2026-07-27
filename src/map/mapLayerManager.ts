/**
 * @module mapLayerManager
 * Manages EE overlay layers for the map panel.
 *
 * Resolves tile URLs via the EE Maps REST API, keeps layer records
 * for downstream use (pixel inspection), and notifies the WebView.
 */

import { ensureEe, getMapIdUrl } from '../shared/eeSession.js';
import { EeLayer } from './eeLayer.js';

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
    const url = await getMapIdUrl(image, payload.visParams ?? {});

    postMessage({
      type: 'addTileLayer',
      data: {
        url,
        name: payload.name,
        shown: payload.shown,
        opacity: payload.opacity,
        layerIndex,
        visParams: payload.visParams,
      },
    });
  }

  /** Clears all layers and resets the insertion counter. */
  clear(): void {
    this._layers.clear();
    this.layerCount = 0;
  }
}
