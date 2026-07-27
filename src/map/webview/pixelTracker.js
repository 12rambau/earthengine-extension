/**
 * @module pixelTracker
 * Samples a pixel from the topmost visible overlay tile at a map coordinate
 * and updates the active scale-bar pointer accordingly.
 */

import { map } from './mapInstance.js';
import { overlays } from './overlays.js';
import {
  scaleBarEl,
  activeScaleIndex,
  setPointer,
  resetScaleLabels,
  highlightCategory,
  clearCategoryHighlight,
} from './scaleBar.js';

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
    clearCategoryHighlight();
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

  // Categorical: find the nearest palette entry and highlight the matching swatch.
  const isCategorical = Array.isArray(vp.values) && vp.values.length > 0;
  if (isCategorical && palette) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let pi = 0; pi < palette.length; pi++) {
      const hex = palette[pi].startsWith('#') ? palette[pi].slice(1) : palette[pi];
      const len = hex.length === 3 ? 1 : 2;
      const pr = parseInt(hex.slice(0, len).padStart(2, hex[0]), 16);
      const pg = parseInt(hex.slice(len, len * 2).padStart(2, hex[len]), 16);
      const pb = parseInt(hex.slice(len * 2, len * 3).padStart(2, hex[len * 2]), 16);
      const dist = (rgba[0] - pr) ** 2 + (rgba[1] - pg) ** 2 + (rgba[2] - pb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = pi;
      }
    }
    highlightCategory(bestIdx);
    return;
  }

  if (palette && bands.length <= 1 && rows[0]) {
    // Find the palette entry whose RGB is closest to the sampled pixel and use
    // its normalised index as the position within [min, max].  Luminance is not
    // used because it does not follow data order for non-monotone palettes.
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let pi = 0; pi < palette.length; pi++) {
      const hex = palette[pi].startsWith('#') ? palette[pi].slice(1) : palette[pi];
      const len = hex.length === 3 ? 1 : 2;
      const pr = parseInt(hex.slice(0, len).padStart(2, hex[0]), 16);
      const pg = parseInt(hex.slice(len, len * 2).padStart(2, hex[len]), 16);
      const pb = parseInt(hex.slice(len * 2, len * 3).padStart(2, hex[len * 2]), 16);
      const dist = (rgba[0] - pr) ** 2 + (rgba[1] - pg) ** 2 + (rgba[2] - pb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = pi;
      }
    }
    const pct = palette.length > 1 ? bestIdx / (palette.length - 1) : 0;
    setPointer(rows[0], pct, minArr[0], maxArr[0]);
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
