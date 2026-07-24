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

let currentBasemap = null;

function isDarkTheme() {
  return (
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
  );
}

function themeBasemapId() {
  return isDarkTheme() ? darkBasemap : lightBasemap;
}

function setBasemap(id) {
  if (currentBasemap) {
    map.removeLayer(currentBasemap);
  }
  try {
    currentBasemap = L.tileLayer.provider(id);
    currentBasemap.addTo(map);
  } catch (e) {
    console.warn('Unknown basemap provider:', id);
  }
}

setBasemap(themeBasemapId());

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
    setBasemap(themeBasemapId());
  } else {
    activeMode = mode;
    satelliteBtn.classList.toggle('active', mode === 'satellite');
    planBtn.classList.toggle('active', mode === 'plan');
    setBasemap(mode === 'satellite' ? satelliteBasemap : planBasemap);
  }
}

new MutationObserver(() => {
  if (activeMode === 'theme') {
    setBasemap(themeBasemapId());
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

satelliteBtn.addEventListener('click', () => activateMode('satellite'));
planBtn.addEventListener('click', () => activateMode('plan'));

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
    const tileLayer = L.tileLayer(d.url, {
      maxZoom: 24,
      opacity: d.opacity || 1.0,
      attribution: 'Google Earth Engine',
    });
    if (d.shown !== false) {
      tileLayer.addTo(map);
    }
  } else if (msg.type === 'addGeoJson') {
    const d = msg.data;
    const style = d.style || {};
    const geoLayer = L.geoJSON(d.geojson, {
      style: {
        color: style.color || '#3388ff',
        weight: style.weight || 2,
        opacity: d.opacity || 1.0,
        fillOpacity: style.fillOpacity || 0.2,
      },
    });
    if (d.shown !== false) {
      geoLayer.addTo(map);
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
