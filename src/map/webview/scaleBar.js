/**
 * @module scaleBar
 * Scale-bar component: renders a colour gradient strip with min/max labels and a
 * value pointer, driven by the active overlay's visualisation parameters.
 */

import { overlays } from './overlays.js';

// ==================================================================
// SCALE BAR
// ==================================================================

export const scaleBarEl = document.getElementById('scale-bar');

/** Index of the overlay whose scale is currently shown, or -1 when hidden. */
export let activeScaleIndex = -1;

// ------------------------------------------------------------------
// Formatting helpers
// ------------------------------------------------------------------

/**
 * Formats a numeric value for display in the scale bar.
 *
 * @param {*} v
 * @returns {string}
 */
export function fmtVal(v) {
  if (v == null) {
    return '';
  }
  const n = Number(v);
  if (Number.isNaN(n)) {
    return String(v);
  }
  if (Number.isInteger(n)) {
    return String(n);
  }
  return n.toPrecision(4);
}

function paletteGradient(palette) {
  if (!palette || palette.length === 0) {
    return 'linear-gradient(to right, #000, #fff)';
  }
  const colors = palette.map((c) => (c.startsWith('#') ? c : '#' + c));
  return 'linear-gradient(to right, ' + colors.join(', ') + ')';
}

// ------------------------------------------------------------------
// Categorical legend
// ------------------------------------------------------------------

/**
 * Builds a horizontal segmented colour bar for categorical data.
 * Each category gets an equal-width segment; hovering shows a tooltip
 * with the label and value.
 *
 * @param {string[]} palette
 * @param {string[]} labels
 * @param {number[]} values
 */
function buildCategoricalLegend(palette, labels, values) {
  const row = document.createElement('div');
  row.className = 'scale-row';

  const lbl = document.createElement('span');
  lbl.className = 'scale-label';
  lbl.textContent = '';
  row.appendChild(lbl);

  const wrap = document.createElement('div');
  wrap.className = 'scale-gradient-wrap scale-cat-wrap';

  // Store labels for tooltip lookup
  const catLabels = [];
  for (let i = 0; i < palette.length; i++) {
    const seg = document.createElement('div');
    seg.className = 'scale-cat-segment';
    seg.style.background = palette[i].startsWith('#') ? palette[i] : '#' + palette[i];
    seg.style.width = 100 / palette.length + '%';
    seg.dataset.index = String(i);

    const name = (labels && labels[i]) || 'Class ' + i;
    const val = values && values[i] != null ? ' (' + values[i] + ')' : '';
    catLabels.push(name + val);
    seg.dataset.catLabel = name + val;

    seg.addEventListener('mouseenter', () => {
      // Position the shared pointer at the centre of this segment
      const pct = ((i + 0.5) / palette.length) * 100;
      pointer.style.left = pct + '%';
      pointer.style.display = 'block';
      tooltip.style.display = 'block';
      tooltip.textContent = catLabels[i];
      maxEl.textContent = catLabels[i];
    });
    seg.addEventListener('mouseleave', () => {
      pointer.style.display = 'none';
      tooltip.style.display = 'none';
      maxEl.textContent = palette.length + ' classes';
    });

    wrap.appendChild(seg);
  }

  // Single pointer bar + tooltip on the wrapper — moves between segments
  const pointer = document.createElement('div');
  pointer.className = 'scale-pointer scale-cat-pointer';
  const tooltip = document.createElement('div');
  tooltip.className = 'scale-tooltip';
  pointer.appendChild(tooltip);
  wrap.appendChild(pointer);

  row.appendChild(wrap);

  const maxEl = document.createElement('span');
  maxEl.className = 'scale-max';
  maxEl.textContent = palette.length + ' classes';
  row.appendChild(maxEl);

  scaleBarEl.appendChild(row);
}

/**
 * Highlights the category segment at `index` and shows its tooltip.
 *
 * @param {number} index
 */
export function highlightCategory(index) {
  const segments = scaleBarEl.querySelectorAll('.scale-cat-segment');
  const pointer = scaleBarEl.querySelector('.scale-cat-pointer');
  const tooltip = pointer ? pointer.querySelector('.scale-tooltip') : null;
  const maxEl = scaleBarEl.querySelector('.scale-max');
  const n = segments.length;
  if (!pointer || !tooltip || n === 0) {
    return;
  }
  const pct = ((index + 0.5) / n) * 100;
  pointer.style.left = pct + '%';
  pointer.style.display = 'block';
  tooltip.style.display = 'block';
  // Read the label from the segment's stored text
  const seg = segments[index];
  if (seg) {
    const label = seg.dataset.catLabel || 'Class ' + index;
    tooltip.textContent = label;
    if (maxEl) {
      maxEl.textContent = label;
    }
  }
}

/** Removes the hover highlight from all category segments. */
export function clearCategoryHighlight() {
  const pointer = scaleBarEl.querySelector('.scale-cat-pointer');
  if (pointer) {
    pointer.style.display = 'none';
    const tooltip = pointer.querySelector('.scale-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  }
  const maxEl = scaleBarEl.querySelector('.scale-max');
  const count = scaleBarEl.querySelectorAll('.scale-cat-segment').length;
  if (maxEl && count > 0) {
    maxEl.textContent = count + ' classes';
  }
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/** Shows the scale bar for the overlay at `index`. */
export function showScale(index) {
  const entry = overlays[index];
  if (!entry || !entry.visParams) {
    return;
  }
  activeScaleIndex = index;
  const vp = entry.visParams;
  const bands = vp.bands || [];
  const palette = vp.palette || null;
  const minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
  const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];
  const isCategorical = Array.isArray(vp.values) && vp.values.length > 0;

  scaleBarEl.innerHTML = '';

  if (isCategorical) {
    buildCategoricalLegend(palette || [], vp.labels || [], vp.values);
  } else if (palette && bands.length <= 1) {
    scaleBarEl.appendChild(
      buildScaleRow(bands[0] || 'b0', minArr[0], maxArr[0], paletteGradient(palette)),
    );
  } else if (bands.length === 3) {
    const ch = ['#ff0000', '#00ff00', '#0000ff'];
    for (let i = 0; i < 3; i++) {
      const mn = minArr[i] != null ? minArr[i] : minArr[0];
      const mx = maxArr[i] != null ? maxArr[i] : maxArr[0];
      scaleBarEl.appendChild(
        buildScaleRow(
          bands[i] || 'b' + i,
          mn,
          mx,
          'linear-gradient(to right, #000, ' + ch[i] + ')',
        ),
      );
    }
  } else if (palette) {
    scaleBarEl.appendChild(buildScaleRow('b0', minArr[0], maxArr[0], paletteGradient(palette)));
  } else {
    scaleBarEl.appendChild(
      buildScaleRow('b0', minArr[0], maxArr[0], 'linear-gradient(to right, #000, #fff)'),
    );
  }

  scaleBarEl.classList.add('visible');
}

/** Hides the scale bar and resets the active index. */
export function hideScale() {
  activeScaleIndex = -1;
  scaleBarEl.classList.remove('visible');
  scaleBarEl.innerHTML = '';
}

/**
 * Builds a single gradient row element for the scale bar.
 *
 * @param {string} label
 * @param {number} min
 * @param {number} max
 * @param {string} gradient - CSS gradient string.
 * @returns {HTMLElement}
 */
export function buildScaleRow(label, min, max, gradient) {
  const row = document.createElement('div');
  row.className = 'scale-row';

  const lbl = document.createElement('span');
  lbl.className = 'scale-label';
  lbl.textContent = label || fmtVal(min) + '\u2013' + fmtVal(max);
  lbl.title = label;
  row.appendChild(lbl);

  const wrap = document.createElement('div');
  wrap.className = 'scale-gradient-wrap';

  const grad = document.createElement('div');
  grad.className = 'scale-gradient';
  grad.style.background = gradient;
  wrap.appendChild(grad);

  const pointer = document.createElement('div');
  pointer.className = 'scale-pointer';
  const tooltip = document.createElement('div');
  tooltip.className = 'scale-tooltip';
  pointer.appendChild(tooltip);
  wrap.appendChild(pointer);

  wrap.addEventListener('mousemove', (ev) => {
    const rect = wrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    const val = min + pct * (max - min);
    pointer.style.left = pct * 100 + '%';
    pointer.style.display = 'block';
    tooltip.style.display = 'block';
    tooltip.textContent = fmtVal(val);
  });
  wrap.addEventListener('mouseleave', () => {
    pointer.style.display = 'none';
    tooltip.style.display = 'none';
  });

  row.appendChild(wrap);

  const maxEl = document.createElement('span');
  maxEl.className = 'scale-max';
  maxEl.textContent = fmtVal(min) + '\u2013' + fmtVal(max);
  row.appendChild(maxEl);

  return row;
}

// ------------------------------------------------------------------
// Pointer manipulation (used by pixelTracker)
// ------------------------------------------------------------------

/**
 * Moves the hover pointer on a scale row to reflect a sampled pixel value.
 *
 * @param {HTMLElement} row
 * @param {number} pct - Normalised position in [0, 1].
 * @param {number} min
 * @param {number} max
 */
export function setPointer(row, pct, min, max) {
  const pointer = row.querySelector('.scale-pointer');
  const tooltip = row.querySelector('.scale-tooltip');
  const maxEl = row.querySelector('.scale-max');
  if (!pointer || !tooltip) {
    return;
  }
  const c = Math.max(0, Math.min(1, pct));
  pointer.style.left = c * 100 + '%';
  pointer.style.display = 'block';
  tooltip.style.display = 'block';
  const val = min + c * (max - min);
  tooltip.textContent = fmtVal(val);
  if (maxEl) {
    maxEl.textContent = fmtVal(val);
  }
}

/**
 * Resets the scale row labels back to the original min–max range display.
 *
 * @param {HTMLElement} row
 * @param {number} bandIndex
 */
export function resetScaleLabels(row, bandIndex) {
  if (activeScaleIndex < 0) {
    return;
  }
  const entry = overlays[activeScaleIndex];
  if (!entry || !entry.visParams) {
    return;
  }
  const vp = entry.visParams;
  const minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
  const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];
  const mn = minArr[bandIndex] != null ? minArr[bandIndex] : minArr[0];
  const mx = maxArr[bandIndex] != null ? maxArr[bandIndex] : maxArr[0];
  const maxEl = row.querySelector('.scale-max');
  if (maxEl) {
    maxEl.textContent = fmtVal(mn) + '\u2013' + fmtVal(mx);
  }
}
