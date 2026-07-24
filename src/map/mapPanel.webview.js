/**
 * @module mapPanel.webview
 * Browser-side script for the map panel. Initialises the Leaflet map with base
 * layers, layer control and status bar, and applies tile-layer, GeoJSON and
 * viewport commands forwarded from the extension host.
 */

const vscode = acquireVsCodeApi();

// Init map
const map = L.map('map', {
  center: [0, 0],
  zoom: 2,
  zoomControl: true,
});

// Base layers
const osmDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  maxZoom: 24,
  subdomains: 'abcd',
});
const osmLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OSM &copy; CARTO',
  maxZoom: 24,
  subdomains: 'abcd',
});
const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    attribution: '&copy; Esri',
    maxZoom: 24,
  },
);

// Detect theme
const isDark =
  document.body.style.backgroundColor === '' ||
  getComputedStyle(document.body).backgroundColor.includes('30') ||
  getComputedStyle(document.body).backgroundColor.includes('1e');
(isDark ? osmDark : osmLight).addTo(map);

L.control
  .layers(
    {
      Dark: osmDark,
      Light: osmLight,
      Satellite: satellite,
    },
    {},
    { position: 'topleft' },
  )
  .addTo(map);

// Track layers
const overlayLayers = {};
let layerCounter = 0;

function updateLayerControl() {
  const list = document.getElementById('layerList');
  const keys = Object.keys(overlayLayers);
  if (keys.length === 0) {
    list.innerHTML = '<div style="opacity:0.5;padding:4px 0">No layers added</div>';
    return;
  }
  list.innerHTML = keys
    .map((key) => {
      const layer = overlayLayers[key];
      const checked = map.hasLayer(layer.leafletLayer) ? 'checked' : '';
      const opacity = Math.round((layer.leafletLayer.options.opacity || 1) * 100);
      return (
        '<div class="layer-item">' +
        '<input type="checkbox" ' +
        checked +
        ' onchange="toggleLayer(\'' +
        esc(key) +
        '\', this.checked)">' +
        '<label>' +
        esc(layer.name) +
        '</label>' +
        '<input type="range" class="opacity-slider" min="0" max="100" value="' +
        opacity +
        '" onchange="setOpacity(\'' +
        esc(key) +
        '\', this.value/100)" title="Opacity">' +
        '<button class="remove-btn" onclick="removeLayer(\'' +
        esc(key) +
        '\')" title="Remove">&times;</button>' +
        '</div>'
      );
    })
    .join('');
}

function esc(s) {
  return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function toggleLayer(key, visible) {
  const layer = overlayLayers[key];
  if (!layer) {
    return;
  }
  if (visible) {
    map.addLayer(layer.leafletLayer);
  } else {
    map.removeLayer(layer.leafletLayer);
  }
}

function setOpacity(key, opacity) {
  const layer = overlayLayers[key];
  if (!layer) {
    return;
  }
  layer.leafletLayer.setOpacity(opacity);
}

function removeLayer(key) {
  const layer = overlayLayers[key];
  if (!layer) {
    return;
  }
  map.removeLayer(layer.leafletLayer);
  delete overlayLayers[key];
  updateLayerControl();
}

// Status bar updates
map.on('mousemove', (e) => {
  document.getElementById('coords').textContent =
    e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
});
map.on('zoomend', () => {
  document.getElementById('zoom').textContent = 'Zoom: ' + map.getZoom();
});

// Handle messages from the extension (forwarded from Python)
window.addEventListener('message', (e) => {
  const msg = e.data;

  if (msg.type === 'addTileLayer') {
    const d = msg.data;
    const key = 'layer_' + ++layerCounter;
    const tileLayer = L.tileLayer(d.url, {
      maxZoom: 24,
      opacity: d.opacity || 1.0,
      attribution: 'Google Earth Engine',
    });
    if (d.shown !== false) {
      tileLayer.addTo(map);
    }
    overlayLayers[key] = { name: d.name || 'Layer', leafletLayer: tileLayer };
    updateLayerControl();
  } else if (msg.type === 'addGeoJson') {
    const d = msg.data;
    const key = 'layer_' + ++layerCounter;
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
    overlayLayers[key] = { name: d.name || 'Vector', leafletLayer: geoLayer };
    updateLayerControl();
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
    for (const key of Object.keys(overlayLayers)) {
      map.removeLayer(overlayLayers[key].leafletLayer);
      delete overlayLayers[key];
    }
    updateLayerControl();
  }
});

updateLayerControl();
