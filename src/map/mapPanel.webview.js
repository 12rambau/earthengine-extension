/**
 * @module mapPanel.webview
 * Browser-side entry point for the map panel. Initialises all components and
 * handles messages forwarded from the extension host.
 */

import { map } from './webview/mapInstance.js';
import { initBasemap, addNativeOverlay } from './webview/basemap.js';
import { initControls } from './webview/controls.js';
import { overlays } from './webview/overlays.js';
import { renderOverlayLayer } from './webview/layersPanel.js';
import { activeScaleIndex, showScale, hideScale } from './webview/scaleBar.js';
import { initInspector, handleInspectResult } from './webview/inspector.js';
import { initVizEditor, handleVizEditorData, handleVizMinMax } from './webview/vizEditor.js';
import './webview/statusBar.js';

// ==================================================================
// INIT DATA
// ==================================================================

const { darkBasemap, lightBasemap, satelliteBasemap, planBasemap } = JSON.parse(
  document.getElementById('init-data').textContent,
);

const vscode = acquireVsCodeApi();

// ==================================================================
// COMPONENT INIT
// ==================================================================

initBasemap({ darkBasemap, lightBasemap, satelliteBasemap, planBasemap });
initControls({ satelliteBasemap, planBasemap, darkBasemap, lightBasemap });
initInspector(vscode);
initVizEditor(vscode);

// ==================================================================
// MESSAGE HANDLER
// ==================================================================

window.addEventListener('message', (e) => {
  const msg = e.data;

  if (msg.type === 'addTileLayer') {
    const d = msg.data;
    const opacity = d.opacity ?? 1.0;
    const tileLayer = L.tileLayer(d.url, {
      maxZoom: 24,
      opacity,
      attribution: 'Google Earth Engine',
      crossOrigin: 'anonymous',
    });
    addNativeOverlay(tileLayer, d.name || 'Layer');
    overlays.push({
      tileLayer,
      name: d.name || 'Layer',
      visible: d.shown !== false,
      opacity,
      visParams: d.visParams || null,
      layerIndex: d.layerIndex,
    });
    renderOverlayLayer(d.layerIndex);
    if (d.shown !== false) {
      tileLayer.addTo(map);
    }
  } else if (msg.type === 'centerObject') {
    const d = msg.data;
    if (d.bounds) {
      const bounds = L.latLngBounds(
        L.latLng(d.bounds[0], d.bounds[1]),
        L.latLng(d.bounds[2], d.bounds[3]),
      );
      if (d.zoom) {
        map.setView(bounds.getCenter(), d.zoom);
      } else {
        map.fitBounds(bounds);
      }
    }
  } else if (msg.type === 'setCenter') {
    const d = msg.data;
    map.setView([d.lat, d.lon], d.zoom || map.getZoom());
  } else if (msg.type === 'clear') {
    // TODO: implement clear
  } else if (msg.type === 'inspectResult') {
    handleInspectResult(msg.data);
  } else if (msg.type === 'vizEditorData') {
    handleVizEditorData(msg.data);
  } else if (msg.type === 'vizMinMax') {
    handleVizMinMax(msg.data);
  } else if (msg.type === 'replaceTileLayer') {
    const d = msg.data;
    // Find the overlay by layerIndex
    const entry = overlays.find((o) => o.layerIndex === d.layerIndex);
    if (entry) {
      if (entry.visible) {
        map.removeLayer(entry.tileLayer);
      }
      entry.tileLayer = L.tileLayer(d.url, {
        maxZoom: 24,
        opacity: entry.opacity,
        attribution: 'Google Earth Engine',
        crossOrigin: 'anonymous',
      });
      entry.visParams = d.visParams;
      if (entry.visible) {
        entry.tileLayer.addTo(map);
      }
      const arrayIdx = overlays.indexOf(entry);
      if (activeScaleIndex === arrayIdx) {
        if (entry.visParams && (entry.visParams.palette || entry.visParams.bands)) {
          showScale(arrayIdx);
        } else {
          hideScale();
        }
      }
    }
  }
});
