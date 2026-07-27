/**
 * @module pixelTracker
 * Samples a pixel from the topmost visible overlay tile at a map coordinate
 * and updates the active scale-bar pointer accordingly.
 */

import { map } from './mapInstance.js';
import { overlays } from './overlays.js';
import { scaleBarEl, activeScaleIndex, setPointer, resetScaleLabels } from './scaleBar.js';

// ==================================================================
// PIXEL → SCALE TRACKING
// ==================================================================

let _sampleCanvas = null;

/**
 * Samples the RGBA value of overlay `idx` at the given `latlng`.
 * Returns `null` when the overlay is not visible or the tile cannot be read.
 *
 * @param {L.LatLng} latlng
 * @param {number} idx
 * @returns {Uint8ClampedArray|null}
 */
function sampleOverlayPixel(latlng, idx) {
  const entry = overlays[idx];
  if (!entry || !entry.visible) {
    return null;
  }
  const container = entry.tileLayer.getContainer();
  if (!container) {
    return null;
  }
  const pt = map.latLngToContainerPoint(latlng);
  const mapRect = map.getContainer().getBoundingClientRect();
  const tiles = container.querySelectorAll('img');
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const r = tile.getBoundingClientRect();
    const tx = r.left - mapRect.left;
    const ty = r.top - mapRect.top;
    if (pt.x >= tx && pt.x < tx + r.width && pt.y >= ty && pt.y < ty + r.height) {
      try {
        if (!_sampleCanvas) {
          _sampleCanvas = document.createElement('canvas');
        }
        _sampleCanvas.width = tile.naturalWidth || 256;
        _sampleCanvas.height = tile.naturalHeight || 256;
        const ctx = _sampleCanvas.getContext('2d');
        ctx.drawImage(tile, 0, 0);
        const sx = ((pt.x - tx) / r.width) * _sampleCanvas.width;
        const sy = ((pt.y - ty) / r.height) * _sampleCanvas.height;
        return ctx.getImageData(Math.floor(sx), Math.floor(sy), 1, 1).data;
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

/**
 * Reads the pixel colour under `latlng` and moves the scale-bar pointer to the
 * corresponding position.  No-ops when no scale is active.
 *
 * @param {L.LatLng} latlng
 */
export function updateScaleFromMap(latlng) {
  if (activeScaleIndex < 0) {
    return;
  }
  const rgba = sampleOverlayPixel(latlng, activeScaleIndex);
  const rows = scaleBarEl.querySelectorAll('.scale-row');
  if (!rgba || rgba[3] === 0) {
    rows.forEach((row, i) => {
      const p = row.querySelector('.scale-pointer');
      const t = row.querySelector('.scale-tooltip');
      if (p) {
        p.style.display = 'none';
      }
      if (t) {
        t.style.display = 'none';
      }
      resetScaleLabels(row, i);
    });
    return;
  }
  const entry = overlays[activeScaleIndex];
  if (!entry || !entry.visParams) {
    return;
  }
  const vp = entry.visParams;
  const bands = vp.bands || [];
  const palette = vp.palette || null;
  const minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
  const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];

  if (palette && bands.length <= 1 && rows[0]) {
    const lum = (rgba[0] * 0.299 + rgba[1] * 0.587 + rgba[2] * 0.114) / 255;
    setPointer(rows[0], lum, minArr[0], maxArr[0]);
  } else if (bands.length === 3) {
    if (rows[0]) {
      setPointer(rows[0], rgba[0] / 255, minArr[0], maxArr[0]);
    }
    if (rows[1]) {
      setPointer(
        rows[1],
        rgba[1] / 255,
        minArr[1] != null ? minArr[1] : minArr[0],
        maxArr[1] != null ? maxArr[1] : maxArr[0],
      );
    }
    if (rows[2]) {
      setPointer(
        rows[2],
        rgba[2] / 255,
        minArr[2] != null ? minArr[2] : minArr[0],
        maxArr[2] != null ? maxArr[2] : maxArr[0],
      );
    }
  }
}
