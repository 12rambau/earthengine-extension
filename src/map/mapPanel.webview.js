/**
 * @module mapPanel.webview
 * Browser-side script for the map panel. Initialises the Leaflet map,
 * manages configurable base layers and satellite toggle, and applies tile-layer,
 * GeoJSON and viewport commands forwarded from the extension host.
 */

// ==================================================================
// INIT DATA
// ==================================================================

const { darkBasemap, lightBasemap, satelliteBasemap, planBasemap } = JSON.parse(
  document.getElementById('init-data').textContent,
);

const vscode = acquireVsCodeApi();

// ==================================================================
// MAP
// ==================================================================

const map = L.map('map', {
  center: [0, 0],
  zoom: 2,
  zoomControl: false,
});

// ==================================================================
// BASEMAP MANAGEMENT
// ==================================================================

function isDarkTheme() {
  return (
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
  );
}

// Create all basemap tile layers upfront as fixed instances.
const basemapTileLayers = {
  [darkBasemap]: L.tileLayer.provider(darkBasemap),
  [lightBasemap]: L.tileLayer.provider(lightBasemap),
  [satelliteBasemap]: L.tileLayer.provider(satelliteBasemap),
  [planBasemap]: L.tileLayer.provider(planBasemap),
};

// Register base layers in L.control.layers for proper Leaflet group ordering.
// The native control UI is hidden — the custom panel below handles UX.
const nativeLayerControl = L.control
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

let currentBasemap = basemapTileLayers[isDarkTheme() ? darkBasemap : lightBasemap];
currentBasemap.addTo(map);

function setBasemap(id) {
  const next = basemapTileLayers[id];
  if (!next || next === currentBasemap) {
    return;
  }
  map.removeLayer(currentBasemap);
  next.addTo(map);
  currentBasemap = next;
}

// ==================================================================
// MAP CONTROLS
// ==================================================================

let activeMode = 'theme'; // 'theme' | 'plan' | 'satellite'
const satelliteBtn = document.getElementById('satellite-toggle');
const planBtn = document.getElementById('plan-toggle');

function activateMode(mode) {
  if (activeMode === mode) {
    activeMode = 'theme';
    satelliteBtn.classList.remove('active');
    planBtn.classList.remove('active');
    setBasemap(isDarkTheme() ? darkBasemap : lightBasemap);
  } else {
    activeMode = mode;
    satelliteBtn.classList.toggle('active', mode === 'satellite');
    planBtn.classList.toggle('active', mode === 'plan');
    setBasemap(mode === 'satellite' ? satelliteBasemap : planBasemap);
  }
}

new MutationObserver(() => {
  if (activeMode === 'theme') {
    setBasemap(isDarkTheme() ? darkBasemap : lightBasemap);
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

satelliteBtn.addEventListener('click', () => activateMode('satellite'));
planBtn.addEventListener('click', () => activateMode('plan'));

// ==================================================================
// LAYERS PANEL
// ==================================================================

/** @type {Array<{tileLayer: L.TileLayer, name: string, visible: boolean, opacity: number}>} */
const overlays = [];

const layersPanel = document.getElementById('layers-panel');
const layersList = document.getElementById('layers-list');
const layersToggleBtn = document.getElementById('layers-toggle');
const layersCloseBtn = document.getElementById('layers-close');

layersToggleBtn.addEventListener('click', () => {
  layersPanel.classList.toggle('visible');
  layersToggleBtn.classList.toggle('active', layersPanel.classList.contains('visible'));
});
layersCloseBtn.addEventListener('click', () => {
  layersPanel.classList.remove('visible');
  layersToggleBtn.classList.remove('active');
});

function renderOverlayLayer(index) {
  const entry = overlays[index];

  // Remove empty-state placeholder if this is the first layer
  const empty = layersList.querySelector('.layers-empty');
  if (empty) {
    empty.remove();
  }

  const row = document.createElement('div');
  row.className = 'layer-row';
  row.dataset.index = index;

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

  const nameEl = document.createElement('span');
  nameEl.className = 'layer-name';
  nameEl.textContent = entry.name;
  nameEl.title = entry.name;

  row.appendChild(visBtn);
  row.appendChild(slider);
  row.appendChild(nameEl);
  layersList.appendChild(row);
}

// ==================================================================
// STATUS BAR
// ==================================================================

map.on('mousemove', (e) => {
  document.getElementById('coords').textContent =
    e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
});
map.on('zoomend', () => {
  document.getElementById('zoom').textContent = 'Zoom: ' + map.getZoom();
});

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
    });
    nativeLayerControl.addOverlay(tileLayer, d.name || 'Layer');
    const index = overlays.length;
    overlays.push({ tileLayer, name: d.name || 'Layer', visible: d.shown !== false, opacity });
    renderOverlayLayer(index);
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
  }
});
