/**
 * @module mapInstance
 * Shared Leaflet map instance used by all webview components.
 */

// ==================================================================
// MAP
// ==================================================================

export const map = L.map('map', {
  center: [0, 0],
  zoom: 2,
  zoomControl: false,
});
