/**
 * @module mapPanel.webview
 * Browser-side script for the map panel. Initialises the Leaflet map and
 * applies tile-layer, GeoJSON and viewport commands forwarded from the
 * extension host.
 */

const vscode = acquireVsCodeApi();

// Init map
const map = L.map('map', {
  center: [0, 0],
  zoom: 2,
  zoomControl: false,
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
