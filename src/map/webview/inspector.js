/**
 * @module inspector
 * Pixel inspector panel: places a marker on map click and displays per-layer
 * band values returned by the extension host.
 */

import { map } from './mapInstance.js';

// ==================================================================
// PIXEL INSPECTOR
// ==================================================================

let _vscode;
let inspectorActive = false;
let inspectorMarker = null;

const inspectorToggleBtn = document.getElementById('inspector-toggle');
const inspectorPanel = document.getElementById('inspector-panel');
const inspectorContent = document.getElementById('inspector-content');
const inspectorCloseBtn = document.getElementById('inspector-close');

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setInspectorActive(active) {
  inspectorActive = active;
  inspectorToggleBtn.classList.toggle('active', active);
  map.getContainer().style.cursor = active ? 'crosshair' : '';
  inspectorPanel.classList.toggle('visible', active);
}

/**
 * Wires the inspector to the VS Code messaging API.
 * Must be called before the user can trigger an inspect click.
 *
 * @param {{ postMessage(msg: unknown): void }} vscode
 */
export function initInspector(vscode) {
  _vscode = vscode;
}

/**
 * Renders an `inspectResult` message payload into the inspector panel.
 *
 * @param {{ lat: number, lng: number, scale: number, results: Array }} d
 */
export function handleInspectResult(d) {
  let html =
    '<p class="inspector-coords">\u{1F4CD} ' +
    d.lng.toFixed(4) +
    ', ' +
    d.lat.toFixed(4) +
    ' @ ' +
    d.scale +
    'm</p>';

  for (const layer of d.results) {
    html +=
      '<div class="inspector-layer"><span class="inspector-layer-name">' +
      escapeHtml(layer.name) +
      '</span>';
    if (layer.error) {
      html += '<p class="inspector-error">' + escapeHtml(layer.error) + '</p>';
    } else {
      const entries = Object.entries(layer.values || {});
      if (entries.length === 0) {
        html += '<p class="inspector-no-data">No data at this location.</p>';
      } else {
        html += '<table class="inspector-table">';
        for (const [k, v] of entries) {
          const display = v === null ? '\u2014' : typeof v === 'number' ? v.toFixed(4) : String(v);
          html +=
            '<tr><td class="inspector-band">' +
            escapeHtml(k) +
            '</td><td class="inspector-val">' +
            display +
            '</td></tr>';
        }
        html += '</table>';
      }
    }
    html += '</div>';
  }

  if (d.results.length === 0) {
    html += '<p class="inspector-hint">No layers to inspect.</p>';
  }

  inspectorContent.innerHTML = html;
}

inspectorToggleBtn.addEventListener('click', () => setInspectorActive(!inspectorActive));

inspectorCloseBtn.addEventListener('click', () => {
  setInspectorActive(false);
  inspectorPanel.classList.remove('visible');
  if (inspectorMarker) {
    map.removeLayer(inspectorMarker);
    inspectorMarker = null;
  }
});

map.on('click', (e) => {
  if (!inspectorActive) {
    return;
  }
  const { lat, lng } = e.latlng;

  if (inspectorMarker) {
    inspectorMarker.setLatLng([lat, lng]);
  } else {
    inspectorMarker = L.marker([lat, lng]).addTo(map);
  }

  inspectorContent.innerHTML =
    '<p class="inspector-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading\u2026</p>';

  _vscode.postMessage({ type: 'inspect', data: { lat, lng, zoom: map.getZoom() } });
});
