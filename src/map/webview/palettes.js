/**
 * @module palettes
 * Scientific colour palettes sampled from d3-scale-chromatic.
 *
 * Each palette is a small array of hex key-colours; EE interpolates between
 * them for continuous data.  Categorical schemes use the colours as-is.
 */

import {
  interpolateViridis,
  interpolateMagma,
  interpolatePlasma,
  interpolateInferno,
  interpolateCividis,
  interpolateTurbo,
  interpolateRdBu,
  interpolateRdYlGn,
  interpolateBrBG,
  interpolatePiYG,
  interpolateRdYlBu,
  interpolateSpectral,
  interpolateYlGnBu,
  interpolateYlOrRd,
  interpolateGreys,
  schemeCategory10,
  schemePaired,
  schemeSet1,
  schemeSet2,
  schemeSet3,
  schemeDark2,
} from 'd3-scale-chromatic';

// ==================================================================
// HELPERS
// ==================================================================

function rgbToHex(rgb) {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) {
    return rgb;
  }
  return (
    '#' +
    parseInt(m[1]).toString(16).padStart(2, '0') +
    parseInt(m[2]).toString(16).padStart(2, '0') +
    parseInt(m[3]).toString(16).padStart(2, '0')
  );
}

function sample(fn, n) {
  const colors = [];
  for (let i = 0; i < n; i++) {
    colors.push(rgbToHex(fn(i / (n - 1))));
  }
  return colors;
}

// ==================================================================
// SEQUENTIAL PALETTES
// ==================================================================

const N = 10;

/** @type {Array<{name: string, category: string, colors: string[]}>} */
export const SEQUENTIAL_PALETTES = [
  { name: 'Viridis', category: 'Sequential', colors: sample(interpolateViridis, N) },
  { name: 'Magma', category: 'Sequential', colors: sample(interpolateMagma, N) },
  { name: 'Plasma', category: 'Sequential', colors: sample(interpolatePlasma, N) },
  { name: 'Inferno', category: 'Sequential', colors: sample(interpolateInferno, N) },
  { name: 'Cividis', category: 'Sequential', colors: sample(interpolateCividis, N) },
  { name: 'Turbo', category: 'Sequential', colors: sample(interpolateTurbo, N) },
  { name: 'Greys', category: 'Sequential', colors: sample(interpolateGreys, N) },
  { name: 'YlGnBu', category: 'Sequential', colors: sample(interpolateYlGnBu, N) },
  { name: 'YlOrRd', category: 'Sequential', colors: sample(interpolateYlOrRd, N) },
];

// ==================================================================
// DIVERGING PALETTES
// ==================================================================

export const DIVERGING_PALETTES = [
  { name: 'RdBu', category: 'Diverging', colors: sample(interpolateRdBu, N) },
  { name: 'RdYlGn', category: 'Diverging', colors: sample(interpolateRdYlGn, N) },
  { name: 'BrBG', category: 'Diverging', colors: sample(interpolateBrBG, N) },
  { name: 'PiYG', category: 'Diverging', colors: sample(interpolatePiYG, N) },
  { name: 'RdYlBu', category: 'Diverging', colors: sample(interpolateRdYlBu, N) },
  { name: 'Spectral', category: 'Diverging', colors: sample(interpolateSpectral, N) },
];

// ==================================================================
// CATEGORICAL PALETTES
// ==================================================================

export const CATEGORICAL_PALETTES = [
  { name: 'Category10', category: 'Categorical', colors: [...schemeCategory10] },
  { name: 'Paired', category: 'Categorical', colors: [...schemePaired] },
  { name: 'Set1', category: 'Categorical', colors: [...schemeSet1] },
  { name: 'Set2', category: 'Categorical', colors: [...schemeSet2] },
  { name: 'Set3', category: 'Categorical', colors: [...schemeSet3] },
  { name: 'Dark2', category: 'Categorical', colors: [...schemeDark2] },
];

// ==================================================================
// ALL PALETTES
// ==================================================================

export const ALL_PALETTES = [
  ...SEQUENTIAL_PALETTES,
  ...DIVERGING_PALETTES,
  ...CATEGORICAL_PALETTES,
];
