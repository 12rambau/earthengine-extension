/**
 * @module mapInspector
 * Pixel-level inspection for EE layers on the map.
 *
 * On a WebView click, reduces each registered EE layer to the clicked
 * point via `Image.reduceRegion` and sends the band values back.
 */

import { computeValue, ensureEe } from '../../shared/eeSession.js';
import { EeLayer } from './eeLayer.js';

/** Band values returned for one layer after a pixel inspection. */
export interface InspectResult {
  name: string;
  values: Record<string, number | null>;
  error?: string;
}

// ==================================================================
// MAPINSPECTOR
// ==================================================================
/** Performs server-side pixel inspection across all registered EE layers. */
export class MapInspector {
  /**
   * Reduces every layer in `layers` to the clicked point and fires
   * `postMessage` with an `inspectResult` WebView event.
   *
   * @param lat - Click latitude (WGS-84).
   * @param lng - Click longitude (WGS-84).
   * @param zoom - Current Leaflet zoom level (used to estimate ground resolution).
   * @param layers - Registry of layers to inspect.
   * @param postMessage - Callback that sends a message to the WebView.
   */
  async inspect(
    lat: number,
    lng: number,
    zoom: number,
    layers: ReadonlyMap<number, EeLayer>,
    postMessage: (msg: unknown) => void,
  ): Promise<void> {
    const eeAny = (await ensureEe()) as any;

    // Approximate ground resolution in metres at the click latitude.
    const scale = Math.max(
      1,
      Math.round((40075016 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom)),
    );
    const point = eeAny.Geometry.Point([lng, lat]);
    const results: InspectResult[] = [];

    for (const [, layer] of layers) {
      try {
        const image = eeAny.Image(eeAny.Deserializer.fromJSON(layer.serialized));
        const reduced = image.reduceRegion({
          reducer: eeAny.Reducer.mean(),
          geometry: point,
          scale,
          maxPixels: 1e9,
          bestEffort: true,
        });
        const values = await computeValue<Record<string, number | null>>(reduced);
        results.push({ name: layer.name, values: values ?? {} });
      } catch (err) {
        results.push({
          name: layer.name,
          values: {},
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    postMessage({ type: 'inspectResult', data: { lat, lng, scale, results } });
  }
}
