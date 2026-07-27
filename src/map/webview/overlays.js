/**
 * @module overlays
 * Shared overlay registry — the single source of truth for all EE tile layers
 * added to the map.
 */

// ==================================================================
// OVERLAYS
// ==================================================================

/**
 * @type {Array<{tileLayer: L.TileLayer, name: string, visible: boolean, opacity: number, visParams: object|null}>}
 */
export const overlays = [];
