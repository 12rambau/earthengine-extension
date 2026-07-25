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

/** @type {Array<{tileLayer: L.TileLayer, name: string, visible: boolean, opacity: number, visParams: object|null}>} */
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

  // Scale toggle button
  if (entry.visParams && (entry.visParams.palette || entry.visParams.bands)) {
    var scaleBtn = document.createElement('button');
    scaleBtn.className = 'map-btn layer-vis-btn scale-active-btn';
    scaleBtn.title = 'Toggle scale';
    scaleBtn.innerHTML = '<i class="fa-solid fa-sliders"></i>';
    scaleBtn.addEventListener('click', function () {
      if (activeScaleIndex === index) {
        hideScale();
      } else {
        showScale(index);
      }
      scaleBtn.classList.toggle('active', activeScaleIndex === index);
      layersList.querySelectorAll('.scale-active-btn').forEach(function (b) {
        if (b !== scaleBtn) {
          b.classList.remove('active');
        }
      });
    });
    row.appendChild(scaleBtn);
  }

  layersList.appendChild(row);
}

// ==================================================================
// SCALE BAR
// ==================================================================

var scaleBar = document.getElementById('scale-bar');
var activeScaleIndex = -1;

function paletteGradient(palette) {
  if (!palette || palette.length === 0) {
    return 'linear-gradient(to right, #000, #fff)';
  }
  var colors = palette.map(function (c) {
    return c.startsWith('#') ? c : '#' + c;
  });
  return 'linear-gradient(to right, ' + colors.join(', ') + ')';
}

function showScale(index) {
  var entry = overlays[index];
  if (!entry || !entry.visParams) {
    return;
  }
  activeScaleIndex = index;
  var vp = entry.visParams;
  var bands = vp.bands || [];
  var palette = vp.palette || null;
  var minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
  var maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];

  scaleBar.innerHTML = '';

  if (palette && bands.length <= 1) {
    scaleBar.appendChild(
      buildScaleRow(bands[0] || 'b0', minArr[0], maxArr[0], paletteGradient(palette)),
    );
  } else if (bands.length === 3) {
    var ch = ['#ff0000', '#00ff00', '#0000ff'];
    for (var i = 0; i < 3; i++) {
      var mn = minArr[i] != null ? minArr[i] : minArr[0];
      var mx = maxArr[i] != null ? maxArr[i] : maxArr[0];
      scaleBar.appendChild(
        buildScaleRow(
          bands[i] || 'b' + i,
          mn,
          mx,
          'linear-gradient(to right, #000, ' + ch[i] + ')',
        ),
      );
    }
  } else if (palette) {
    scaleBar.appendChild(buildScaleRow('b0', minArr[0], maxArr[0], paletteGradient(palette)));
  } else {
    scaleBar.appendChild(
      buildScaleRow('b0', minArr[0], maxArr[0], 'linear-gradient(to right, #000, #fff)'),
    );
  }

  scaleBar.classList.add('visible');
}

function hideScale() {
  activeScaleIndex = -1;
  scaleBar.classList.remove('visible');
  scaleBar.innerHTML = '';
}

function buildScaleRow(label, min, max, gradient) {
  var row = document.createElement('div');
  row.className = 'scale-row';

  var lbl = document.createElement('span');
  lbl.className = 'scale-label';
  lbl.textContent = label || fmtVal(min) + '\u2013' + fmtVal(max);
  lbl.title = label;
  row.appendChild(lbl);

  var wrap = document.createElement('div');
  wrap.className = 'scale-gradient-wrap';

  var grad = document.createElement('div');
  grad.className = 'scale-gradient';
  grad.style.background = gradient;
  wrap.appendChild(grad);

  var pointer = document.createElement('div');
  pointer.className = 'scale-pointer';
  var tooltip = document.createElement('div');
  tooltip.className = 'scale-tooltip';
  pointer.appendChild(tooltip);
  wrap.appendChild(pointer);

  wrap.addEventListener('mousemove', function (ev) {
    var rect = wrap.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    var val = min + pct * (max - min);
    pointer.style.left = pct * 100 + '%';
    pointer.style.display = 'block';
    tooltip.style.display = 'block';
    tooltip.textContent = fmtVal(val);
  });
  wrap.addEventListener('mouseleave', function () {
    pointer.style.display = 'none';
    tooltip.style.display = 'none';
  });

  row.appendChild(wrap);

  var maxEl = document.createElement('span');
  maxEl.className = 'scale-max';
  maxEl.textContent = fmtVal(min) + '\u2013' + fmtVal(max);
  row.appendChild(maxEl);

  return row;
}

function fmtVal(v) {
  if (v == null) {
    return '';
  }
  var n = Number(v);
  if (Number.isNaN(n)) {
    return String(v);
  }
  if (Number.isInteger(n)) {
    return String(n);
  }
  return n.toPrecision(4);
}

// ==================================================================
// PIXEL → SCALE TRACKING
// ==================================================================

var _sampleCanvas = null;

function sampleOverlayPixel(latlng, idx) {
  var entry = overlays[idx];
  if (!entry || !entry.visible) {
    return null;
  }
  var container = entry.tileLayer.getContainer();
  if (!container) {
    return null;
  }
  var pt = map.latLngToContainerPoint(latlng);
  var mapRect = map.getContainer().getBoundingClientRect();
  var tiles = container.querySelectorAll('img');
  for (var i = 0; i < tiles.length; i++) {
    var tile = tiles[i];
    var r = tile.getBoundingClientRect();
    var tx = r.left - mapRect.left;
    var ty = r.top - mapRect.top;
    if (pt.x >= tx && pt.x < tx + r.width && pt.y >= ty && pt.y < ty + r.height) {
      try {
        if (!_sampleCanvas) {
          _sampleCanvas = document.createElement('canvas');
        }
        _sampleCanvas.width = tile.naturalWidth || 256;
        _sampleCanvas.height = tile.naturalHeight || 256;
        var ctx = _sampleCanvas.getContext('2d');
        ctx.drawImage(tile, 0, 0);
        var sx = ((pt.x - tx) / r.width) * _sampleCanvas.width;
        var sy = ((pt.y - ty) / r.height) * _sampleCanvas.height;
        return ctx.getImageData(Math.floor(sx), Math.floor(sy), 1, 1).data;
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

function updateScaleFromMap(latlng) {
  if (activeScaleIndex < 0) {
    return;
  }
  var rgba = sampleOverlayPixel(latlng, activeScaleIndex);
  var rows = scaleBar.querySelectorAll('.scale-row');
  if (!rgba || rgba[3] === 0) {
    // No data — hide pointers and restore original min/max labels
    rows.forEach(function (row, i) {
      var p = row.querySelector('.scale-pointer');
      var t = row.querySelector('.scale-tooltip');
      if (p) {
        p.style.display = 'none';
      }
      if (t) {
        t.style.display = 'none';
      }
      resetScaleLabels(row, i);
    });
    return;
  }
  var entry = overlays[activeScaleIndex];
  if (!entry || !entry.visParams) {
    return;
  }
  var vp = entry.visParams;
  var bands = vp.bands || [];
  var palette = vp.palette || null;
  var minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
  var maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];

  if (palette && bands.length <= 1 && rows[0]) {
    // Single band — use luminance as proxy for position
    var lum = (rgba[0] * 0.299 + rgba[1] * 0.587 + rgba[2] * 0.114) / 255;
    setPointer(rows[0], lum, minArr[0], maxArr[0]);
  } else if (bands.length === 3) {
    // RGB — each channel maps to its bar
    if (rows[0]) {
      setPointer(rows[0], rgba[0] / 255, minArr[0], maxArr[0]);
    }
    if (rows[1]) {
      setPointer(
        rows[1],
        rgba[1] / 255,
        minArr[1] != null ? minArr[1] : minArr[0],
        maxArr[1] != null ? maxArr[1] : maxArr[0],
      );
    }
    if (rows[2]) {
      setPointer(
        rows[2],
        rgba[2] / 255,
        minArr[2] != null ? minArr[2] : minArr[0],
        maxArr[2] != null ? maxArr[2] : maxArr[0],
      );
    }
  }
}

function setPointer(row, pct, min, max) {
  var pointer = row.querySelector('.scale-pointer');
  var tooltip = row.querySelector('.scale-tooltip');
  var minEl = row.querySelector('.scale-min');
  var maxEl = row.querySelector('.scale-max');
  if (!pointer || !tooltip) {
    return;
  }
  var c = Math.max(0, Math.min(1, pct));
  pointer.style.left = c * 100 + '%';
  pointer.style.display = 'block';
  tooltip.style.display = 'block';
  var val = min + c * (max - min);
  tooltip.textContent = fmtVal(val);
  if (maxEl) {
    maxEl.textContent = fmtVal(val);
  }
}

function resetScaleLabels(row, bandIndex) {
  if (activeScaleIndex < 0) {
    return;
  }
  var entry = overlays[activeScaleIndex];
  if (!entry || !entry.visParams) {
    return;
  }
  var vp = entry.visParams;
  var minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
  var maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];
  var mn = minArr[bandIndex] != null ? minArr[bandIndex] : minArr[0];
  var mx = maxArr[bandIndex] != null ? maxArr[bandIndex] : maxArr[0];
  var maxEl = row.querySelector('.scale-max');
  if (maxEl) {
    maxEl.textContent = fmtVal(mn) + '\u2013' + fmtVal(mx);
  }
}

// ==================================================================
// STATUS BAR
// ==================================================================

map.on('mousemove', (e) => {
  document.getElementById('coords').textContent =
    e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
  updateScaleFromMap(e.latlng);
});
map.on('zoomend', () => {
  document.getElementById('zoom').textContent = 'Zoom: ' + map.getZoom();
});

// ==================================================================
// PIXEL INSPECTOR
// ==================================================================

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
  if (active) {
    inspectorPanel.classList.add('visible');
  }
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

  vscode.postMessage({ type: 'inspect', data: { lat, lng, zoom: map.getZoom() } });
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
      crossOrigin: 'anonymous',
    });
    nativeLayerControl.addOverlay(tileLayer, d.name || 'Layer');
    const index = overlays.length;
    overlays.push({
      tileLayer,
      name: d.name || 'Layer',
      visible: d.shown !== false,
      opacity,
      visParams: d.visParams || null,
    });
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
  } else if (msg.type === 'inspectResult') {
    const d = msg.data;
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
            const display =
              v === null ? '\u2014' : typeof v === 'number' ? v.toFixed(4) : String(v);
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
});
