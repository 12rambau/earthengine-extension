/**
 * @module layersPanel
 * Layers-panel component: floating sidebar listing all EE overlay layers with
 * per-layer visibility toggle, opacity slider and scale-bar toggle.
 */

import { map } from './mapInstance.js';
import { overlays } from './overlays.js';
import { showScale, hideScale, activeScaleIndex } from './scaleBar.js';

// ==================================================================
// LAYERS PANEL
// ==================================================================

const layersPanelEl = document.getElementById('layers-panel');
const layersList = document.getElementById('layers-list');
const layersToggleBtn = document.getElementById('layers-toggle');
const layersCloseBtn = document.getElementById('layers-close');

layersToggleBtn.addEventListener('click', () => {
  layersPanelEl.classList.toggle('visible');
  layersToggleBtn.classList.toggle('active', layersPanelEl.classList.contains('visible'));
});
layersCloseBtn.addEventListener('click', () => {
  layersPanelEl.classList.remove('visible');
  layersToggleBtn.classList.remove('active');
});

/**
 * Appends a new row to the layers list for the overlay at `index`.
 *
 * @param {number} index - Index into the shared `overlays` array.
 */
export function renderOverlayLayer(index) {
  const entry = overlays[index];

  const empty = layersList.querySelector('.layers-empty');
  if (empty) {
    empty.remove();
  }

  const row = document.createElement('div');
  row.className = 'layer-row';
  row.dataset.index = index;

  const nameEl = document.createElement('span');
  nameEl.className = 'layer-name';
  nameEl.textContent = entry.name;
  nameEl.title = entry.name;

  const controls = document.createElement('div');
  controls.className = 'layer-controls';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'layer-opacity';
  slider.min = '0';
  slider.max = '10';
  slider.value = String(Math.round(entry.opacity * 10));
  slider.addEventListener('input', () => {
    entry.opacity = Number(slider.value) / 10;
    entry.tileLayer.setOpacity(entry.opacity);
  });

  const visBtn = document.createElement('button');
  visBtn.className = 'map-btn layer-vis-btn' + (entry.visible ? ' active' : '');
  visBtn.title = 'Toggle visibility';
  visBtn.innerHTML = '<i class="fa-solid ' + (entry.visible ? 'fa-eye' : 'fa-eye-slash') + '"></i>';
  visBtn.addEventListener('click', () => {
    entry.visible = !entry.visible;
    if (entry.visible) {
      entry.tileLayer.addTo(map);
      visBtn.classList.add('active');
      visBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
    } else {
      map.removeLayer(entry.tileLayer);
      visBtn.classList.remove('active');
      visBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    }
  });

  controls.appendChild(slider);
  controls.appendChild(visBtn);

  const scaleBtn = document.createElement('button');
  scaleBtn.className = 'map-btn layer-vis-btn scale-active-btn';
  scaleBtn.title = 'Toggle scale';
  scaleBtn.innerHTML = '<i class="fa-solid fa-ruler-horizontal"></i>';

  if (entry.visParams && (entry.visParams.palette || entry.visParams.bands)) {
    scaleBtn.addEventListener('click', () => {
      if (activeScaleIndex === index) {
        hideScale();
      } else {
        showScale(index);
      }
      scaleBtn.classList.toggle('active', activeScaleIndex === index);
      layersList.querySelectorAll('.scale-active-btn').forEach((b) => {
        if (b !== scaleBtn) {
          b.classList.remove('active');
        }
      });
    });
  } else {
    // No scale data — hide the button but keep it in the layout so all rows
    // have identical controls width and the eye button stays aligned.
    scaleBtn.style.visibility = 'hidden';
  }

  controls.appendChild(scaleBtn);

  // Cog button — opens the visualization editor
  const cogBtn = document.createElement('button');
  cogBtn.className = 'map-btn layer-vis-btn';
  cogBtn.title = 'Edit visualization';
  cogBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
  cogBtn.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('openVizEditor', { detail: { layerIndex: index } }));
  });
  controls.appendChild(cogBtn);

  row.appendChild(nameEl);
  row.appendChild(controls);
  layersList.appendChild(row);
}
