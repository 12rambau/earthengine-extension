/**
 * @module eeLayer
 * Represents a single Earth Engine overlay layer registered on the map.
 */

// ==================================================================
// EELAYER
// ==================================================================
/** Stores the data needed to display and inspect a single EE overlay layer. */
export class EeLayer {
  constructor(
    /** Insertion-order index used to correlate with the WebView overlay. */
    public readonly index: number,
    /** Serialized EE expression (legacy `toJSON` format) before `visualize()`. */
    public readonly serialized: string,
    /** Display name shown in the layer panel. */
    public readonly name: string,
    /** The vis-params last used to render this layer. */
    public visParams: Record<string, unknown> = {},
  ) {}
}
