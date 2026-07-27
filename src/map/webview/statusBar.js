/**
 * @module statusBar
 * Status bar: displays live cursor coordinates and the current zoom level.
 */

import { map } from './mapInstance.js';
import { updateScaleFromMap } from './pixelTracker.js';

// ==================================================================
// STATUS BAR
// ==================================================================

map.on('mousemove', (e) => {
  document.getElementById('coords').textContent =
    e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
  updateScaleFromMap(e.latlng);
});

map.on('zoomend', () => {
  document.getElementById('zoom').textContent = 'Zoom: ' + map.getZoom();
});
