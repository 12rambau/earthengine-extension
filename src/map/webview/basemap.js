/**
 * @module basemap
 * Manages Leaflet tile-layer basemaps and the native layer control used for
 * proper Leaflet group ordering.
 */

import { map } from './mapInstance.js';

// ==================================================================
// BASEMAP
// ==================================================================

const basemapTileLayers = {};
let currentBasemap = null;

/** Leaflet native layer control (its UI is hidden — the custom panel handles UX). */
export let nativeLayerControl = null;

/** Returns true when VS Code is using a dark or high-contrast theme. */
export function isDarkTheme() {
  return (
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
  );
}

/**
 * Creates all basemap tile layers and the native layer control from provider IDs.
 * Must be called once before any other basemap function.
 *
 * @param {{ darkBasemap: string, lightBasemap: string, satelliteBasemap: string, planBasemap: string }} config
 */
export function initBasemap({ darkBasemap, lightBasemap, satelliteBasemap, planBasemap }) {
  basemapTileLayers[darkBasemap] = L.tileLayer.provider(darkBasemap);
  basemapTileLayers[lightBasemap] = L.tileLayer.provider(lightBasemap);
  basemapTileLayers[satelliteBasemap] = L.tileLayer.provider(satelliteBasemap);
  basemapTileLayers[planBasemap] = L.tileLayer.provider(planBasemap);

  nativeLayerControl = L.control
    .layers(
      {
        Dark: basemapTileLayers[darkBasemap],
        Light: basemapTileLayers[lightBasemap],
        Satellite: basemapTileLayers[satelliteBasemap],
        Plan: basemapTileLayers[planBasemap],
      },
      {},
      { collapsed: true },
    )
    .addTo(map);
  nativeLayerControl.getContainer().style.display = 'none';

  currentBasemap = basemapTileLayers[isDarkTheme() ? darkBasemap : lightBasemap];
  currentBasemap.addTo(map);
}

/**
 * Switches the active basemap to the layer identified by `id`.
 * No-ops if `id` is already active or unknown.
 *
 * @param {string} id - Provider ID (one of the values passed to `initBasemap`).
 */
export function setBasemap(id) {
  const next = basemapTileLayers[id];
  if (!next || next === currentBasemap) {
    return;
  }
  map.removeLayer(currentBasemap);
  next.addTo(map);
  currentBasemap = next;
}

/**
 * Registers an overlay tile layer with the native Leaflet layer control.
 *
 * @param {L.TileLayer} tileLayer
 * @param {string} name
 */
export function addNativeOverlay(tileLayer, name) {
  nativeLayerControl.addOverlay(tileLayer, name);
}
