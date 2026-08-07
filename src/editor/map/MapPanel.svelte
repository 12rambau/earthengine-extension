<!-- MapPanel: Leaflet-based map with EE tile layers, inspector, scale bar and viz editor -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';
  import {
    mdiClose, mdiCrosshairsGps, mdiEye, mdiEyeOff, mdiLayers,
    mdiLoading, mdiMap, mdiRuler, mdiSatelliteVariant, mdiTrashCan, mdiTune,
  } from '../../shared/icons.ts';
  import {
    interpolateViridis, interpolateMagma, interpolatePlasma, interpolateInferno,
    interpolateCividis, interpolateTurbo, interpolateRdBu, interpolateRdYlGn,
    interpolateBrBG, interpolatePiYG, interpolateRdYlBu, interpolateSpectral,
    interpolateYlGnBu, interpolateYlOrRd, interpolateGreys,
    schemeCategory10, schemePaired, schemeSet1, schemeSet2, schemeSet3, schemeDark2,
  } from 'd3-scale-chromatic';

  // ----------------------------------------------------------------
  // PALETTES
  // ----------------------------------------------------------------

  function rgbToHex(rgb) {
    const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return rgb;
    return '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
  }

  function sample(fn, n) {
    const colors = [];
    for (let i = 0; i < n; i++) colors.push(rgbToHex(fn(i / (n - 1))));
    return colors;
  }

  const N = 10;
  const SEQUENTIAL_PALETTES = [
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
  const DIVERGING_PALETTES = [
    { name: 'RdBu', category: 'Diverging', colors: sample(interpolateRdBu, N) },
    { name: 'RdYlGn', category: 'Diverging', colors: sample(interpolateRdYlGn, N) },
    { name: 'BrBG', category: 'Diverging', colors: sample(interpolateBrBG, N) },
    { name: 'PiYG', category: 'Diverging', colors: sample(interpolatePiYG, N) },
    { name: 'RdYlBu', category: 'Diverging', colors: sample(interpolateRdYlBu, N) },
    { name: 'Spectral', category: 'Diverging', colors: sample(interpolateSpectral, N) },
  ];
  const CATEGORICAL_PALETTES = [
    { name: 'Category10', category: 'Categorical', colors: [...schemeCategory10] },
    { name: 'Paired', category: 'Categorical', colors: [...schemePaired] },
    { name: 'Set1', category: 'Categorical', colors: [...schemeSet1] },
    { name: 'Set2', category: 'Categorical', colors: [...schemeSet2] },
    { name: 'Set3', category: 'Categorical', colors: [...schemeSet3] },
    { name: 'Dark2', category: 'Categorical', colors: [...schemeDark2] },
  ];
  const CONTINUOUS_PALETTES = [...SEQUENTIAL_PALETTES, ...DIVERGING_PALETTES];

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------

  const { darkBasemap, lightBasemap, satelliteBasemap, planBasemap } = getInitData();

  let map = $state(null);
  let overlays = $state([]);
  let layersPanelVisible = $state(false);
  let inspectorActive = $state(false);
  let inspectorPanelVisible = $state(false);
  let inspectorMarker = $state(null);
  let inspectorContent = $state({ type: 'hint' });
  let pendingInspect = $state(null);
  let activeScaleIndex = $state(-1);
  let coords = $state('0.0000, 0.0000');
  let zoomLevel = $state(2);
  let activeMode = $state('theme');

  // Viz editor
  let vizVisible = $state(false);
  let vizLayerIndex = $state(-1);
  let vizBands = $state([]);
  let vizPresets = $state([]);
  let vizType = $state('rgb');
  let vizSelectedPalette = $state(null);
  let vizMinMaxData = $state(null);
  // RGB fields
  let vizRgbR = $state('');
  let vizRgbG = $state('');
  let vizRgbB = $state('');
  let vizRgbRMin = $state('');
  let vizRgbRMax = $state('');
  let vizRgbGMin = $state('');
  let vizRgbGMax = $state('');
  let vizRgbBMin = $state('');
  let vizRgbBMax = $state('');
  let vizRgbGamma = $state('1');
  // HSV fields
  let vizHsvH = $state('');
  let vizHsvS = $state('');
  let vizHsvV = $state('');
  let vizHsvHMin = $state('');
  let vizHsvHMax = $state('');
  let vizHsvSMin = $state('');
  let vizHsvSMax = $state('');
  let vizHsvVMin = $state('');
  let vizHsvVMax = $state('');
  // Continuous fields
  let vizContBand = $state('');
  let vizContMin = $state('');
  let vizContMax = $state('');
  // Categorical fields
  let vizCatBand = $state('');
  let vizCatRows = $state([]);
  let vizComputing = $state(false);

  // Internal refs
  let basemapTileLayers = {};
  let currentBasemap = null;
  let nativeLayerControl = null;
  let _sampleCanvas = null;

  // ----------------------------------------------------------------
  // DERIVED
  // ----------------------------------------------------------------

  let scaleData = $derived.by(() => {
    if (activeScaleIndex < 0) return null;
    const entry = overlays[activeScaleIndex];
    if (!entry || !entry.visParams) return null;
    const vp = entry.visParams;
    const bands = vp.bands || [];
    const palette = vp.palette || null;
    const minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
    const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];
    const isCategorical = Array.isArray(vp.values) && vp.values.length > 0;

    if (isCategorical) {
      return { type: 'categorical', palette: palette || [], labels: vp.labels || [], values: vp.values };
    } else if (palette && bands.length <= 1) {
      return { type: 'gradient', rows: [{ label: bands[0] || 'b0', min: minArr[0], max: maxArr[0], gradient: paletteGradient(palette) }] };
    } else if (bands.length === 3) {
      const ch = ['#ff0000', '#00ff00', '#0000ff'];
      return { type: 'gradient', rows: bands.map((b, i) => ({
        label: b || 'b' + i,
        min: minArr[i] != null ? minArr[i] : minArr[0],
        max: maxArr[i] != null ? maxArr[i] : maxArr[0],
        gradient: `linear-gradient(to right, #000, ${ch[i]})`,
      }))};
    } else if (palette) {
      return { type: 'gradient', rows: [{ label: 'b0', min: minArr[0], max: maxArr[0], gradient: paletteGradient(palette) }] };
    }
    return { type: 'gradient', rows: [{ label: 'b0', min: minArr[0], max: maxArr[0], gradient: 'linear-gradient(to right, #000, #fff)' }] };
  });

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------

  function isDarkTheme() {
    return document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
  }

  function paletteGradient(palette) {
    if (!palette || palette.length === 0) return 'linear-gradient(to right, #000, #fff)';
    const colors = palette.map(c => c.startsWith('#') ? c : '#' + c);
    return 'linear-gradient(to right, ' + colors.join(', ') + ')';
  }

  function fmtVal(v) {
    if (v == null) return '';
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    if (Number.isInteger(n)) return String(n);
    return n.toPrecision(4);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ----------------------------------------------------------------
  // MAP INIT (called from onMount equivalent)
  // ----------------------------------------------------------------

  function initMap() {
    const L = window.L;
    map = L.map('map', { center: [0, 0], zoom: 2, zoomControl: false });

    // Basemaps
    basemapTileLayers[darkBasemap] = L.tileLayer.provider(darkBasemap);
    basemapTileLayers[lightBasemap] = L.tileLayer.provider(lightBasemap);
    basemapTileLayers[satelliteBasemap] = L.tileLayer.provider(satelliteBasemap);
    basemapTileLayers[planBasemap] = L.tileLayer.provider(planBasemap);

    nativeLayerControl = L.control.layers(
      { Dark: basemapTileLayers[darkBasemap], Light: basemapTileLayers[lightBasemap], Satellite: basemapTileLayers[satelliteBasemap], Plan: basemapTileLayers[planBasemap] },
      {},
      { collapsed: true },
    ).addTo(map);
    nativeLayerControl.getContainer().style.display = 'none';

    currentBasemap = basemapTileLayers[isDarkTheme() ? darkBasemap : lightBasemap];
    currentBasemap.addTo(map);

    // Theme sync
    new MutationObserver(() => {
      if (activeMode === 'theme') setBasemap(isDarkTheme() ? darkBasemap : lightBasemap);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Status bar events
    map.on('mousemove', (e) => {
      coords = e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
      updateScaleFromMap(e.latlng);
    });
    map.on('zoomend', () => { zoomLevel = map.getZoom(); });

    // Inspector click
    map.on('click', (e) => {
      if (!inspectorActive) return;
      const { lat, lng } = e.latlng;
      const L = window.L;
      if (inspectorMarker) {
        inspectorMarker.setLatLng([lat, lng]);
      } else {
        inspectorMarker = L.marker([lat, lng]).addTo(map);
      }
      inspectorContent = { type: 'loading' };
      pendingInspect = { lat, lng };
      vscode.postMessage({ type: 'inspect', data: { lat, lng, zoom: map.getZoom() } });
    });
  }

  // ----------------------------------------------------------------
  // BASEMAP
  // ----------------------------------------------------------------

  function setBasemap(id) {
    const next = basemapTileLayers[id];
    if (!next || next === currentBasemap) return;
    map.removeLayer(currentBasemap);
    next.addTo(map);
    currentBasemap = next;
  }

  function activateMode(mode) {
    if (activeMode === mode) {
      activeMode = 'theme';
      setBasemap(isDarkTheme() ? darkBasemap : lightBasemap);
    } else {
      activeMode = mode;
      setBasemap(mode === 'satellite' ? satelliteBasemap : planBasemap);
    }
  }

  // ----------------------------------------------------------------
  // LAYERS
  // ----------------------------------------------------------------

  function toggleLayerVisibility(idx) {
    const entry = overlays[idx];
    entry.visible = !entry.visible;
    if (entry.visible) {
      entry.tileLayer.addTo(map);
    } else {
      map.removeLayer(entry.tileLayer);
    }
    overlays = overlays;
  }

  function setLayerOpacity(idx, val) {
    const entry = overlays[idx];
    entry.opacity = val / 10;
    entry.tileLayer.setOpacity(entry.opacity);
    overlays = overlays;
  }

  function toggleScale(idx) {
    if (activeScaleIndex === idx) {
      activeScaleIndex = -1;
    } else {
      activeScaleIndex = idx;
    }
  }

  function openVizEditorForLayer(layerIndex) {
    vscode.postMessage({ type: 'openVizEditor', data: { layerIndex } });
  }

  // ----------------------------------------------------------------
  // INSPECTOR
  // ----------------------------------------------------------------

  function toggleInspector() {
    inspectorActive = !inspectorActive;
    inspectorPanelVisible = inspectorActive;
    if (map) map.getContainer().style.cursor = inspectorActive ? 'crosshair' : '';
  }

  function closeInspector() {
    inspectorActive = false;
    inspectorPanelVisible = false;
    if (map) map.getContainer().style.cursor = '';
    if (inspectorMarker) {
      map.removeLayer(inspectorMarker);
      inspectorMarker = null;
    }
  }

  // ----------------------------------------------------------------
  // SCALE BAR — pixel tracking
  // ----------------------------------------------------------------

  function sampleOverlayPixel(latlng, idx) {
    const entry = overlays[idx];
    if (!entry || !entry.visible) return null;
    const container = entry.tileLayer.getContainer();
    if (!container) return null;
    const pt = map.latLngToContainerPoint(latlng);
    const mapRect = map.getContainer().getBoundingClientRect();
    const tiles = container.querySelectorAll('img');
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const r = tile.getBoundingClientRect();
      const tx = r.left - mapRect.left;
      const ty = r.top - mapRect.top;
      if (pt.x >= tx && pt.x < tx + r.width && pt.y >= ty && pt.y < ty + r.height) {
        try {
          if (!_sampleCanvas) _sampleCanvas = document.createElement('canvas');
          _sampleCanvas.width = tile.naturalWidth || 256;
          _sampleCanvas.height = tile.naturalHeight || 256;
          const ctx = _sampleCanvas.getContext('2d');
          ctx.drawImage(tile, 0, 0);
          const sx = ((pt.x - tx) / r.width) * _sampleCanvas.width;
          const sy = ((pt.y - ty) / r.height) * _sampleCanvas.height;
          return ctx.getImageData(Math.floor(sx), Math.floor(sy), 1, 1).data;
        } catch (_) { return null; }
      }
    }
    return null;
  }

  function updateScaleFromMap(latlng) {
    if (activeScaleIndex < 0) return;
    const rgba = sampleOverlayPixel(latlng, activeScaleIndex);
    if (!rgba || rgba[3] === 0) {
      // Reset pointers via DOM
      document.querySelectorAll('.scale-pointer').forEach(p => { p.style.display = 'none'; });
      document.querySelectorAll('.scale-tooltip').forEach(t => { t.style.display = 'none'; });
      return;
    }
    const entry = overlays[activeScaleIndex];
    if (!entry || !entry.visParams) return;
    const vp = entry.visParams;
    const bands = vp.bands || [];
    const palette = vp.palette || null;
    const minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
    const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];
    const isCategorical = Array.isArray(vp.values) && vp.values.length > 0;

    if (isCategorical && palette) {
      const bestIdx = findClosestPaletteIndex(rgba, palette);
      highlightCategoryDOM(bestIdx);
      return;
    }

    const rows = document.querySelectorAll('.scale-row');
    if (palette && bands.length <= 1 && rows[0]) {
      const bestIdx = findClosestPaletteIndex(rgba, palette);
      const pct = palette.length > 1 ? bestIdx / (palette.length - 1) : 0;
      setPointerDOM(rows[0], pct, minArr[0], maxArr[0]);
    } else if (bands.length === 3) {
      if (rows[0]) setPointerDOM(rows[0], rgba[0] / 255, minArr[0], maxArr[0]);
      if (rows[1]) setPointerDOM(rows[1], rgba[1] / 255, minArr[1] ?? minArr[0], maxArr[1] ?? maxArr[0]);
      if (rows[2]) setPointerDOM(rows[2], rgba[2] / 255, minArr[2] ?? minArr[0], maxArr[2] ?? maxArr[0]);
    }
  }

  function findClosestPaletteIndex(rgba, palette) {
    let bestIdx = 0, bestDist = Infinity;
    for (let pi = 0; pi < palette.length; pi++) {
      const hex = palette[pi].startsWith('#') ? palette[pi].slice(1) : palette[pi];
      const len = hex.length === 3 ? 1 : 2;
      const pr = parseInt(hex.slice(0, len).padStart(2, hex[0]), 16);
      const pg = parseInt(hex.slice(len, len * 2).padStart(2, hex[len]), 16);
      const pb = parseInt(hex.slice(len * 2, len * 3).padStart(2, hex[len * 2]), 16);
      const dist = (rgba[0] - pr) ** 2 + (rgba[1] - pg) ** 2 + (rgba[2] - pb) ** 2;
      if (dist < bestDist) { bestDist = dist; bestIdx = pi; }
    }
    return bestIdx;
  }

  function setPointerDOM(row, pct, min, max) {
    const pointer = row.querySelector('.scale-pointer');
    const tooltip = row.querySelector('.scale-tooltip');
    const maxEl = row.querySelector('.scale-max');
    if (!pointer || !tooltip) return;
    const c = Math.max(0, Math.min(1, pct));
    pointer.style.left = c * 100 + '%';
    pointer.style.display = 'block';
    tooltip.style.display = 'block';
    const val = min + c * (max - min);
    tooltip.textContent = fmtVal(val);
    if (maxEl) maxEl.textContent = fmtVal(val);
  }

  function highlightCategoryDOM(index) {
    const segments = document.querySelectorAll('.scale-cat-segment');
    const pointer = document.querySelector('.scale-cat-pointer');
    const tooltip = pointer ? pointer.querySelector('.scale-tooltip') : null;
    const maxEl = document.querySelector('.scale-bar .scale-max');
    const n = segments.length;
    if (!pointer || !tooltip || n === 0) return;
    const pct = ((index + 0.5) / n) * 100;
    pointer.style.left = pct + '%';
    pointer.style.display = 'block';
    tooltip.style.display = 'block';
    const seg = segments[index];
    if (seg) {
      const label = seg.dataset.catLabel || 'Class ' + index;
      tooltip.textContent = label;
      if (maxEl) maxEl.textContent = label;
    }
  }

  function handleScaleRowHover(e, min, max) {
    const wrap = e.currentTarget;
    const rect = wrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const val = min + pct * (max - min);
    const pointer = wrap.querySelector('.scale-pointer');
    const tooltip = wrap.querySelector('.scale-tooltip');
    if (pointer) { pointer.style.left = pct * 100 + '%'; pointer.style.display = 'block'; }
    if (tooltip) { tooltip.style.display = 'block'; tooltip.textContent = fmtVal(val); }
  }

  function handleScaleRowLeave(e) {
    const wrap = e.currentTarget;
    const pointer = wrap.querySelector('.scale-pointer');
    const tooltip = wrap.querySelector('.scale-tooltip');
    if (pointer) pointer.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
  }

  // ----------------------------------------------------------------
  // VIZ EDITOR
  // ----------------------------------------------------------------

  function applyVisParams(vp) {
    const bands = vp.bands || [];
    const isCat = Array.isArray(vp.values) && vp.values.length > 0;

    if (isCat) vizType = 'categorical';
    else if (vp.palette && bands.length <= 1) vizType = 'continuous';
    else vizType = 'rgb';

    const minArr = Array.isArray(vp.min) ? vp.min : [vp.min];
    const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max];

    // RGB
    if (bands.length >= 3) { vizRgbR = bands[0]; vizRgbG = bands[1]; vizRgbB = bands[2]; }
    vizRgbRMin = minArr[0] != null ? String(minArr[0]) : '';
    vizRgbRMax = maxArr[0] != null ? String(maxArr[0]) : '';
    vizRgbGMin = String(minArr[1] ?? minArr[0] ?? '');
    vizRgbGMax = String(maxArr[1] ?? maxArr[0] ?? '');
    vizRgbBMin = String(minArr[2] ?? minArr[0] ?? '');
    vizRgbBMax = String(maxArr[2] ?? maxArr[0] ?? '');
    if (vp.gamma) vizRgbGamma = String(Array.isArray(vp.gamma) ? vp.gamma[0] : vp.gamma);

    // HSV
    if (bands.length >= 3) { vizHsvH = bands[0]; vizHsvS = bands[1]; vizHsvV = bands[2]; }
    vizHsvHMin = minArr[0] != null ? String(minArr[0]) : '';
    vizHsvHMax = maxArr[0] != null ? String(maxArr[0]) : '';
    vizHsvSMin = String(minArr[1] ?? minArr[0] ?? '');
    vizHsvSMax = String(maxArr[1] ?? maxArr[0] ?? '');
    vizHsvVMin = String(minArr[2] ?? minArr[0] ?? '');
    vizHsvVMax = String(maxArr[2] ?? maxArr[0] ?? '');

    // Continuous
    if (bands.length >= 1) vizContBand = bands[0];
    vizContMin = minArr[0] != null ? String(minArr[0]) : '';
    vizContMax = maxArr[0] != null ? String(maxArr[0]) : '';

    // Categorical
    if (bands.length >= 1) vizCatBand = bands[0];
    if (isCat) {
      const palette = vp.palette || [];
      const labels = vp.labels || [];
      const values = vp.values || [];
      const n = Math.max(palette.length, values.length);
      vizCatRows = Array.from({ length: n }, (_, i) => ({
        color: palette[i] || '#4285f4',
        value: values[i] != null ? String(values[i]) : '',
        label: labels[i] || '',
      }));
    }
    vizSelectedPalette = null;
  }

  function collectVisParams() {
    if (vizType === 'rgb' || vizType === 'hsv') {
      const isRgb = vizType === 'rgb';
      const bands = isRgb ? [vizRgbR, vizRgbG, vizRgbB] : [vizHsvH, vizHsvS, vizHsvV];
      const min = isRgb
        ? [parseFloat(vizRgbRMin), parseFloat(vizRgbGMin), parseFloat(vizRgbBMin)]
        : [parseFloat(vizHsvHMin), parseFloat(vizHsvSMin), parseFloat(vizHsvVMin)];
      const max = isRgb
        ? [parseFloat(vizRgbRMax), parseFloat(vizRgbGMax), parseFloat(vizRgbBMax)]
        : [parseFloat(vizHsvHMax), parseFloat(vizHsvSMax), parseFloat(vizHsvVMax)];
      if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return null;
      const config = { vizType, bands, min, max };
      if (isRgb) {
        const gamma = parseFloat(vizRgbGamma);
        if (gamma && gamma !== 1) config.gamma = gamma;
      }
      return config;
    }
    if (vizType === 'continuous') {
      const min = parseFloat(vizContMin);
      const max = parseFloat(vizContMax);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      const palette = vizSelectedPalette ? vizSelectedPalette.colors : [];
      return { vizType: 'continuous', bands: [vizContBand], min: [min], max: [max], palette };
    }
    if (vizType === 'categorical') {
      const values = [], labels = [], palette = [];
      for (const row of vizCatRows) {
        const v = parseInt(row.value);
        if (!isNaN(v)) {
          values.push(v);
          labels.push(row.label || 'Class ' + (values.length));
          palette.push(row.color);
        }
      }
      return { vizType: 'categorical', bands: [vizCatBand], values, labels, palette };
    }
    return null;
  }

  function vizApply() {
    const config = collectVisParams();
    if (!config) return;
    vscode.postMessage({ type: 'updateViz', data: { layerIndex: vizLayerIndex, ...config } });
    vizVisible = false;
  }

  function vizClose() { vizVisible = false; }

  function vizComputeMinMax() {
    vizComputing = true;
    vscode.postMessage({ type: 'computeMinMax', data: { layerIndex: vizLayerIndex } });
  }

  function vizApplyPreset(idx) {
    const p = vizPresets[idx];
    if (!p) return;
    const vp = { bands: p.bands || [] };
    if (p.min) vp.min = p.min;
    if (p.max) vp.max = p.max;
    if (p.palette) vp.palette = p.palette;
    if (p.gamma) vp.gamma = p.gamma;
    if (p.labels) vp.labels = p.labels;
    if (p.values) vp.values = p.values;
    const typeMap = { rgb: 'rgb', hsv: 'hsv', continuous: 'continuous', categorical: 'categorical' };
    vizType = typeMap[p.type] || 'rgb';
    applyVisParams(vp);
  }

  function vizSelectPalette(pal) {
    vizSelectedPalette = pal;
    if (pal.category === 'Categorical') {
      const existing = [...vizCatRows];
      vizCatRows = pal.colors.map((c, i) => ({
        color: c,
        value: existing[i]?.value ?? '',
        label: existing[i]?.label ?? '',
      }));
    }
  }

  function vizAddCatRow() {
    vizCatRows = [...vizCatRows, { color: '#4285f4', value: '', label: '' }];
  }

  function vizRemoveCatRow(idx) {
    vizCatRows = vizCatRows.filter((_, i) => i !== idx);
  }

  function autoFillMinMax(minMax) {
    if (vizType === 'continuous') {
      if (vizContBand && minMax[vizContBand]) {
        if (!vizContMin) vizContMin = String(minMax[vizContBand].min);
        if (!vizContMax) vizContMax = String(minMax[vizContBand].max);
      }
    } else if (vizType === 'rgb') {
      const bands = [vizRgbR, vizRgbG, vizRgbB];
      const mins = [vizRgbRMin, vizRgbGMin, vizRgbBMin];
      const maxs = [vizRgbRMax, vizRgbGMax, vizRgbBMax];
      bands.forEach((b, i) => {
        if (b && minMax[b]) {
          if (!mins[i]) { if (i === 0) vizRgbRMin = String(minMax[b].min); else if (i === 1) vizRgbGMin = String(minMax[b].min); else vizRgbBMin = String(minMax[b].min); }
          if (!maxs[i]) { if (i === 0) vizRgbRMax = String(minMax[b].max); else if (i === 1) vizRgbGMax = String(minMax[b].max); else vizRgbBMax = String(minMax[b].max); }
        }
      });
    } else if (vizType === 'hsv') {
      const bands = [vizHsvH, vizHsvS, vizHsvV];
      const mins = [vizHsvHMin, vizHsvSMin, vizHsvVMin];
      const maxs = [vizHsvHMax, vizHsvSMax, vizHsvVMax];
      bands.forEach((b, i) => {
        if (b && minMax[b]) {
          if (!mins[i]) { if (i === 0) vizHsvHMin = String(minMax[b].min); else if (i === 1) vizHsvSMin = String(minMax[b].min); else vizHsvVMin = String(minMax[b].min); }
          if (!maxs[i]) { if (i === 0) vizHsvHMax = String(minMax[b].max); else if (i === 1) vizHsvSMax = String(minMax[b].max); else vizHsvVMax = String(minMax[b].max); }
        }
      });
    }
  }

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------

  window.addEventListener('message', (e) => {
    const msg = e.data;
    const L = window.L;

    if (msg.type === 'addTileLayer') {
      const d = msg.data;
      const opacity = d.opacity ?? 1.0;
      const tileLayer = L.tileLayer(d.url, {
        maxZoom: 24, opacity, attribution: 'Google Earth Engine', crossOrigin: 'anonymous',
      });
      nativeLayerControl.addOverlay(tileLayer, d.name || 'Layer');
      const entry = {
        tileLayer, name: d.name || 'Layer', visible: d.shown !== false,
        opacity, visParams: d.visParams || null, layerIndex: d.layerIndex,
      };
      overlays = [...overlays, entry];
      if (d.shown !== false) tileLayer.addTo(map);
    } else if (msg.type === 'centerObject') {
      const d = msg.data;
      if (d.bounds) {
        const bounds = L.latLngBounds(L.latLng(d.bounds[0], d.bounds[1]), L.latLng(d.bounds[2], d.bounds[3]));
        if (d.zoom) map.setView(bounds.getCenter(), d.zoom);
        else map.fitBounds(bounds);
      }
    } else if (msg.type === 'setCenter') {
      const d = msg.data;
      map.setView([d.lat, d.lon], d.zoom || map.getZoom());
    } else if (msg.type === 'inspectResult') {
      if (pendingInspect && msg.data.lat === pendingInspect.lat && msg.data.lng === pendingInspect.lng) {
        inspectorContent = { type: 'result', data: msg.data };
      }
    } else if (msg.type === 'vizEditorData') {
      vizLayerIndex = msg.data.layerIndex;
      vizBands = msg.data.bands || [];
      vizPresets = msg.data.presets || [];
      applyVisParams(msg.data.currentVisParams || {});
      vizVisible = true;
    } else if (msg.type === 'vizMinMax') {
      vizComputing = false;
      if (msg.data.layerIndex === vizLayerIndex && msg.data.minMax) {
        vizMinMaxData = msg.data.minMax;
        autoFillMinMax(msg.data.minMax);
      }
    } else if (msg.type === 'replaceTileLayer') {
      const d = msg.data;
      const idx = overlays.findIndex(o => o.layerIndex === d.layerIndex);
      if (idx >= 0) {
        const entry = overlays[idx];
        if (entry.visible) map.removeLayer(entry.tileLayer);
        entry.tileLayer = L.tileLayer(d.url, {
          maxZoom: 24, opacity: entry.opacity, attribution: 'Google Earth Engine', crossOrigin: 'anonymous',
        });
        entry.visParams = d.visParams;
        if (entry.visible) entry.tileLayer.addTo(map);
        overlays = [...overlays];
        if (activeScaleIndex === idx) {
          if (entry.visParams && (entry.visParams.palette || entry.visParams.bands)) {
            activeScaleIndex = idx;
          } else {
            activeScaleIndex = -1;
          }
        }
      }
    }
  });

  // ----------------------------------------------------------------
  // LIFECYCLE
  // ----------------------------------------------------------------

  // Use $effect to run after first render
  $effect(() => {
    if (!map && document.getElementById('map')) {
      initMap();
    }
  });
</script>

<!-- MAP -->
<div id="map"></div>

<!-- CONTROLS -->
<div class="map-controls">
  <button class="map-btn" class:active={layersPanelVisible} title="Manage layers"
    onclick={() => { layersPanelVisible = !layersPanelVisible; }}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={mdiLayers}/></svg>
  </button>
  <button class="map-btn" class:active={inspectorActive} title="Pixel inspector"
    onclick={toggleInspector}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={mdiCrosshairsGps}/></svg>
  </button>
  <button class="map-btn" class:active={activeMode === 'plan'} title="Toggle plan view"
    onclick={() => activateMode('plan')}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={mdiMap}/></svg>
  </button>
  <button class="map-btn" class:active={activeMode === 'satellite'} title="Toggle satellite view"
    onclick={() => activateMode('satellite')}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={mdiSatelliteVariant}/></svg>
  </button>
</div>

<!-- LAYERS PANEL -->
{#if layersPanelVisible}
<div class="layers-panel visible">
  <div class="layers-panel-header">
    <span>Layers</span>
    <button class="map-btn layers-close-btn" title="Close"
      onclick={() => { layersPanelVisible = false; }}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiClose}/></svg>
    </button>
  </div>
  <div class="layers-list">
    {#if overlays.length === 0}
      <p class="layers-empty">No layers yet.</p>
    {:else}
      {#each overlays as entry, idx}
        <div class="layer-row">
          <span class="layer-name" title={entry.name}>{entry.name}</span>
          <div class="layer-controls">
            <input type="range" class="layer-opacity" min="0" max="10"
              value={Math.round(entry.opacity * 10)}
              oninput={(e) => setLayerOpacity(idx, Number(e.target.value))} />
            <button class="map-btn layer-vis-btn" class:active={entry.visible}
              title="Toggle visibility" onclick={() => toggleLayerVisibility(idx)}>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={entry.visible ? mdiEye : mdiEyeOff}/></svg>
            </button>
            {#if entry.visParams && (entry.visParams.palette || entry.visParams.bands)}
              <button class="map-btn layer-vis-btn" class:active={activeScaleIndex === idx}
                title="Toggle scale" onclick={() => toggleScale(idx)}>
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiRuler}/></svg>
              </button>
            {:else}
              <button class="map-btn layer-vis-btn" style="visibility:hidden" title="Toggle scale">
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiRuler}/></svg>
              </button>
            {/if}
            <button class="map-btn layer-vis-btn" title="Edit visualization"
              onclick={() => openVizEditorForLayer(entry.layerIndex)}>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiTune}/></svg>
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
{/if}

<!-- INSPECTOR PANEL -->
{#if inspectorPanelVisible}
<div class="inspector-panel visible">
  <div class="inspector-panel-header">
    <span>Inspector</span>
    <button class="map-btn layers-close-btn" title="Close" onclick={closeInspector}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiClose}/></svg>
    </button>
  </div>
  <div class="inspector-content">
    {#if inspectorContent.type === 'hint'}
      <p class="inspector-hint">Activate then click on the map.</p>
    {:else if inspectorContent.type === 'loading'}
      <p class="inspector-loading"><svg class="mdi-spin" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiLoading}/></svg> Loading…</p>
    {:else if inspectorContent.type === 'result'}
      {@const d = inspectorContent.data}
      <p class="inspector-coords">{d.lng.toFixed(4)}, {d.lat.toFixed(4)} @ {d.scale}m</p>
      {#each d.results as layer}
        <div class="inspector-layer">
          <span class="inspector-layer-name">{layer.name}</span>
          {#if layer.error}
            <p class="inspector-error">{layer.error}</p>
          {:else}
            {@const entries = Object.entries(layer.values || {})}
            {#if entries.length === 0}
              <p class="inspector-no-data">No data at this location.</p>
            {:else}
              <table class="inspector-table"><tbody>
                {#each entries as [k, v]}
                  <tr>
                    <td class="inspector-band">{k}</td>
                    <td class="inspector-val">{v === null ? '—' : typeof v === 'number' ? v.toFixed(4) : String(v)}</td>
                  </tr>
                {/each}
              </tbody></table>
            {/if}
          {/if}
        </div>
      {/each}
      {#if d.results.length === 0}
        <p class="inspector-hint">No layers to inspect.</p>
      {/if}
    {/if}
  </div>
</div>
{/if}

<!-- SCALE BAR -->
{#if scaleData}
<div class="scale-bar visible">
  {#if scaleData.type === 'categorical'}
    <div class="scale-row">
      <span class="scale-label"></span>
      <div class="scale-gradient-wrap scale-cat-wrap">
        {#each scaleData.palette as color, i}
          {@const catLabel = (scaleData.labels[i] || 'Class ' + i) + (scaleData.values[i] != null ? ' (' + scaleData.values[i] + ')' : '')}
          <div class="scale-cat-segment" style="background:{color.startsWith('#') ? color : '#' + color};width:{100/scaleData.palette.length}%"
            data-index={i} data-cat-label={catLabel}></div>
        {/each}
        <div class="scale-pointer scale-cat-pointer">
          <div class="scale-tooltip"></div>
        </div>
      </div>
      <span class="scale-max">{scaleData.palette.length} classes</span>
    </div>
  {:else}
    {#each scaleData.rows as row}
      <div class="scale-row">
        <span class="scale-label" title={row.label}>{row.label}</span>
        <div class="scale-gradient-wrap" role="slider" tabindex="0" aria-valuenow={row.min} aria-valuemin={row.min} aria-valuemax={row.max}
          onmousemove={(e) => handleScaleRowHover(e, row.min, row.max)}
          onmouseleave={handleScaleRowLeave}>
          <div class="scale-gradient" style="background:{row.gradient}"></div>
          <div class="scale-pointer">
            <div class="scale-tooltip"></div>
          </div>
        </div>
        <span class="scale-max">{fmtVal(row.min)}–{fmtVal(row.max)}</span>
      </div>
    {/each}
  {/if}
</div>
{/if}

<!-- STATUS BAR -->
<div class="status-bar">
  <span>{coords}</span>
  <span>Zoom: {zoomLevel}</span>
</div>

<!-- VIZ EDITOR OVERLAY -->
{#if vizVisible}
<div class="viz-editor-overlay visible">
  <div class="viz-editor-dialog">
    <!-- Header -->
    <div class="viz-editor-header">
      <span>Visualization</span>
      {#if vizPresets.length > 0}
        <select class="viz-preset-select" onchange={(e) => vizApplyPreset(parseInt(e.target.value))}>
          <option value="-1" disabled selected>Preset…</option>
          {#each vizPresets as p, i}
            <option value={i}>{p.name} ({p.type})</option>
          {/each}
        </select>
      {/if}
      <select class="viz-type-select" bind:value={vizType}>
        <option value="rgb">RGB</option>
        <option value="hsv">HSV</option>
        <option value="continuous">Continuous</option>
        <option value="categorical">Categorical</option>
      </select>
      <button class="map-btn viz-close-btn" title="Close" onclick={vizClose}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiClose}/></svg>
      </button>
    </div>
    <!-- Body -->
    <div class="viz-editor-body">
      <!-- RGB -->
      {#if vizType === 'rgb'}
        <div class="viz-channel-row">
          <span class="viz-channel-label">Red</span>
          <select class="viz-band-select" bind:value={vizRgbR}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizRgbRMin} />
          <input class="viz-input" placeholder="Max" bind:value={vizRgbRMax} />
        </div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Green</span>
          <select class="viz-band-select" bind:value={vizRgbG}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizRgbGMin} />
          <input class="viz-input" placeholder="Max" bind:value={vizRgbGMax} />
        </div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Blue</span>
          <select class="viz-band-select" bind:value={vizRgbB}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizRgbBMin} />
          <input class="viz-input" placeholder="Max" bind:value={vizRgbBMax} />
        </div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Gamma</span>
          <input class="viz-input" placeholder="1" bind:value={vizRgbGamma} />
        </div>
        <button class="viz-btn viz-btn-secondary viz-compute-btn" disabled={vizComputing} onclick={vizComputeMinMax}>
          {vizComputing ? 'Computing…' : 'Compute min/max'}
        </button>
      {/if}
      <!-- HSV -->
      {#if vizType === 'hsv'}
        <div class="viz-channel-row">
          <span class="viz-channel-label">Hue</span>
          <select class="viz-band-select" bind:value={vizHsvH}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizHsvHMin} />
          <input class="viz-input" placeholder="Max" bind:value={vizHsvHMax} />
        </div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Saturation</span>
          <select class="viz-band-select" bind:value={vizHsvS}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizHsvSMin} />
          <input class="viz-input" placeholder="Max" bind:value={vizHsvSMax} />
        </div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Value</span>
          <select class="viz-band-select" bind:value={vizHsvV}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizHsvVMin} />
          <input class="viz-input" placeholder="Max" bind:value={vizHsvVMax} />
        </div>
        <button class="viz-btn viz-btn-secondary viz-compute-btn" disabled={vizComputing} onclick={vizComputeMinMax}>
          {vizComputing ? 'Computing…' : 'Compute min/max'}
        </button>
      {/if}
      <!-- Continuous -->
      {#if vizType === 'continuous'}
        <div class="viz-channel-row">
          <span class="viz-channel-label">Band</span>
          <select class="viz-band-select" bind:value={vizContBand}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizContMin} />
          <input class="viz-input" placeholder="Max" bind:value={vizContMax} />
        </div>
        <button class="viz-btn viz-btn-secondary viz-compute-btn" disabled={vizComputing} onclick={vizComputeMinMax}>
          {vizComputing ? 'Computing…' : 'Compute min/max'}
        </button>
        <div class="viz-section-label">Palette</div>
        <div class="viz-palette-grid">
          {#each CONTINUOUS_PALETTES as pal}
            <div class="viz-palette-item" class:selected={vizSelectedPalette === pal}
              title={pal.name} role="option" aria-selected={vizSelectedPalette === pal} tabindex="0"
              onclick={() => vizSelectPalette(pal)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vizSelectPalette(pal); } }}>
              <div class="viz-palette-bar" style="background:linear-gradient(to right, {pal.colors.join(', ')})"></div>
              <span class="viz-palette-name">{pal.name}</span>
            </div>
          {/each}
        </div>
      {/if}
      <!-- Categorical -->
      {#if vizType === 'categorical'}
        <div class="viz-channel-row">
          <span class="viz-channel-label">Band</span>
          <select class="viz-band-select" bind:value={vizCatBand}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
        </div>
        <div class="viz-section-label">Colour scheme</div>
        <div class="viz-palette-grid">
          {#each CATEGORICAL_PALETTES as pal}
            <div class="viz-palette-item" class:selected={vizSelectedPalette === pal}
              title={pal.name} role="option" aria-selected={vizSelectedPalette === pal} tabindex="0"
              onclick={() => vizSelectPalette(pal)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vizSelectPalette(pal); } }}>
              <div class="viz-palette-bar" style="background:linear-gradient(to right, {pal.colors.join(', ')})"></div>
              <span class="viz-palette-name">{pal.name}</span>
            </div>
          {/each}
        </div>
        <div class="viz-section-label">Legend</div>
        <div class="viz-cat-legend">
          {#each vizCatRows as row, i}
            <div class="viz-cat-row">
              <input type="color" class="viz-cat-color" bind:value={row.color} />
              <input type="number" class="viz-cat-value" placeholder="Value" bind:value={row.value} />
              <input type="text" class="viz-cat-label-input" placeholder="Label" bind:value={row.label} />
              <button class="map-btn viz-cat-del" title="Remove class" onclick={() => vizRemoveCatRow(i)}>
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiTrashCan}/></svg>
              </button>
            </div>
          {/each}
        </div>
        <button class="viz-btn viz-btn-secondary viz-cat-add" onclick={vizAddCatRow}>+ Add class</button>
      {/if}
    </div>
    <!-- Footer -->
    <div class="viz-editor-footer">
      <button class="viz-btn viz-btn-secondary" onclick={vizClose}>Cancel</button>
      <button class="viz-btn viz-btn-primary" onclick={vizApply}>Apply</button>
    </div>
  </div>
</div>
{/if}

<style>
  :global {
    /* ==================================================================
       RESET & LAYOUT
       ================================================================== */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 100vw; height: 100vh; overflow: hidden; font-family: var(--vscode-font-family, sans-serif); }
    #app { width: 100%; height: 100%; }
    #map { width: 100%; height: calc(100% - 20px); }

    /* ==================================================================
       SCALE BAR
       ================================================================== */
    .scale-bar {
      position: absolute; bottom: 20px; left: 0; right: 0; z-index: 1000;
      display: none; background: var(--vscode-statusBar-background);
      padding: var(--vscee-space-xxs) var(--vscee-space-lg); gap: var(--vscee-space-xs); flex-direction: column;
    }
    .scale-bar.visible { display: flex; }
    .scale-row { display: flex; align-items: center; gap: var(--vscee-space-sm); height: 16px; }
    .scale-label {
      font-size: var(--vscee-font-compact-xxs); color: var(--vscode-descriptionForeground);
      width: 28px; flex-shrink: 0; text-align: right;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .scale-gradient-wrap {
      flex: 1; height: 12px; position: relative;
      border-radius: var(--vscee-radius-sm); overflow: visible; cursor: crosshair;
    }
    .scale-gradient { width: 100%; height: 100%; border-radius: var(--vscee-radius-sm); }
    .scale-max {
      font-size: var(--vscee-font-compact-xxs); color: var(--vscode-descriptionForeground);
      flex-shrink: 0; width: 70px; font-variant-numeric: tabular-nums; text-align: right;
    }
    .scale-pointer {
      position: absolute; top: 0; width: 2px; height: 100%;
      background: var(--vscode-foreground); pointer-events: none;
      display: none; opacity: 0.9; transition: left 0.1s ease-out;
    }
    .scale-tooltip {
      position: absolute; top: -18px; transform: translateX(-50%);
      background: var(--vscode-editor-background); color: var(--vscode-foreground);
      font-size: var(--vscee-font-compact-xxs); padding: var(--vscee-space-xxs) var(--vscee-space-xs); border-radius: var(--vscee-radius-sm);
      white-space: nowrap; pointer-events: none; display: none;
      box-shadow: var(--vscee-shadow-xs); font-variant-numeric: tabular-nums;
    }
    .scale-cat-wrap { display: flex; overflow: visible; gap: 0; cursor: pointer; }
    .scale-cat-segment { height: 100%; position: relative; transition: opacity 0.1s; }
    .scale-cat-segment:first-child { border-radius: var(--vscee-radius-sm) 0 0 var(--vscee-radius-sm); }
    .scale-cat-segment:last-child { border-radius: 0 var(--vscee-radius-sm) var(--vscee-radius-sm) 0; }
    .scale-cat-pointer { left: 50%; transform: translateX(-50%); transition: left 0.1s ease-out; }

    /* ==================================================================
       MAP CONTROLS
       ================================================================== */
    .map-controls {
      position: absolute; top: 10px; left: 10px; z-index: 1000;
      display: flex; flex-direction: column; gap: var(--vscee-space-sm);
    }
    .map-btn {
      width: 32px; height: 32px; border: none; border-radius: var(--vscee-radius-md);
      background: var(--vscode-editor-background); color: var(--vscode-foreground);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      box-shadow: var(--vscee-shadow-sm); opacity: 0.85; transition: opacity 0.15s;
    }
    .map-btn:hover { opacity: 1; }
    .map-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }

    /* ==================================================================
       LEAFLET ATTRIBUTION
       ================================================================== */
    .leaflet-control-attribution { background: var(--vscode-editor-background) !important; color: var(--vscode-foreground) !important; opacity: 0.8; }
    .leaflet-control-attribution a { color: var(--vscode-textLink-foreground) !important; }

    /* ==================================================================
       LAYERS PANEL
       ================================================================== */
    .layers-panel {
      position: absolute; top: 10px; left: 48px; z-index: 1000; width: 240px;
      background: var(--vscode-editor-background); border: var(--vscee-border-sm) solid var(--vscode-widget-border);
      border-radius: var(--vscee-radius-md); box-shadow: var(--vscee-shadow-md);
    }
    .layers-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-lg); border-bottom: var(--vscee-border-sm) solid var(--vscode-widget-border);
      font-size: var(--vscee-font-compact-sm); font-weight: 600; color: var(--vscode-foreground);
    }
    .layers-close-btn { width: 22px; height: 22px; box-shadow: none; opacity: 0.6; }
    .layers-list { max-height: 320px; overflow-y: auto; }
    .layers-empty {
      padding: var(--vscee-space-lg); font-size: var(--vscee-font-compact-sm); color: var(--vscode-descriptionForeground); text-align: center;
    }
    .layer-row {
      padding: var(--vscee-space-xs) var(--vscee-space-md); border-bottom: var(--vscee-border-sm) solid var(--vscode-widget-border);
      display: flex; align-items: center; gap: var(--vscee-space-sm); min-width: 0;
    }
    .layer-row:last-child { border-bottom: none; }
    .layer-vis-btn { width: 22px; height: 22px; flex-shrink: 0; box-shadow: none; opacity: 0.5; }
    .layer-vis-btn.active { opacity: 1; background: transparent; color: var(--vscode-foreground); }
    .layer-name {
      flex: 1; min-width: 0; font-size: var(--vscee-font-compact-sm); color: var(--vscode-foreground);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .layer-controls { display: flex; align-items: center; gap: var(--vscee-space-xs); flex-shrink: 0; margin-left: auto; }
    .layer-opacity { width: 60px; flex-shrink: 0; accent-color: var(--vscode-button-background); cursor: pointer; }

    /* ==================================================================
       INSPECTOR PANEL
       ================================================================== */
    .inspector-panel {
      position: absolute; top: 10px; left: 48px; z-index: 1000; width: 220px;
      background: var(--vscode-editor-background); border: var(--vscee-border-sm) solid var(--vscode-widget-border);
      border-radius: var(--vscee-radius-md); box-shadow: var(--vscee-shadow-md);
    }
    .inspector-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-lg); border-bottom: var(--vscee-border-sm) solid var(--vscode-widget-border);
      font-size: var(--vscee-font-compact-sm); font-weight: 600; color: var(--vscode-foreground);
    }
    .inspector-content { max-height: 360px; overflow-y: auto; padding: var(--vscee-space-sm) var(--vscee-space-md); }
    .inspector-hint { font-size: var(--vscee-font-compact-sm); color: var(--vscode-descriptionForeground); text-align: center; padding: var(--vscee-space-xs) 0; }
    .inspector-coords { font-size: var(--vscee-font-compact-sm); color: var(--vscode-descriptionForeground); margin-bottom: var(--vscee-space-sm); }
    .inspector-loading { font-size: var(--vscee-font-compact-sm); color: var(--vscode-descriptionForeground); text-align: center; padding: var(--vscee-space-xs) 0; }
    .inspector-layer { margin-bottom: var(--vscee-space-md); }
    .inspector-layer-name {
      display: block; font-size: var(--vscee-font-compact-sm); font-weight: 600; color: var(--vscode-foreground);
      margin-bottom: var(--vscee-space-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .inspector-no-data { font-size: var(--vscee-font-compact-sm); color: var(--vscode-descriptionForeground); font-style: italic; }
    .inspector-error { font-size: var(--vscee-font-compact-xs); color: var(--vscode-errorForeground); word-break: break-all; }
    .inspector-table { width: 100%; border-collapse: collapse; font-size: var(--vscee-font-compact-sm); }
    .inspector-band { color: var(--vscode-descriptionForeground); padding: var(--vscee-space-xxs) var(--vscee-space-xs) var(--vscee-space-xxs) 0; }
    .inspector-val { color: var(--vscode-foreground); text-align: right; font-variant-numeric: tabular-nums; }

    /* ==================================================================
       STATUS BAR
       ================================================================== */
    .status-bar {
      position: absolute; bottom: 0; left: 0; right: 0; z-index: 1000;
      background: var(--vscode-statusBar-background); color: var(--vscode-statusBar-foreground);
      padding: var(--vscee-space-xxs) var(--vscee-space-lg); font-size: var(--vscee-font-compact-sm); display: flex; justify-content: space-between;
    }

    /* ==================================================================
       VISUALIZATION EDITOR
       ================================================================== */
    .viz-editor-overlay {
      position: absolute; inset: 0; z-index: 2000;
      background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;
    }
    .viz-editor-dialog {
      background: var(--vscode-editor-background); border: var(--vscee-border-sm) solid var(--vscode-widget-border);
      border-radius: var(--vscee-radius-lg); box-shadow: var(--vscee-shadow-xl);
      width: 420px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden;
    }
    .viz-editor-header {
      display: flex; align-items: center; gap: var(--vscee-space-md); padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-widget-border);
      font-size: var(--vscee-font-compact-md); font-weight: 600; color: var(--vscode-foreground);
    }
    .viz-editor-header span { flex: 1; }
    .viz-type-select, .viz-preset-select {
      background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
      border: var(--vscee-border-sm) solid var(--vscode-dropdown-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-preset-select { max-width: 140px; }
    .viz-close-btn { width: 22px; height: 22px; box-shadow: none; opacity: 0.6; }
    .viz-editor-body { overflow-y: auto; padding: var(--vscee-space-lg); flex: 1; }
    .viz-editor-footer {
      display: flex; justify-content: flex-end; gap: var(--vscee-space-sm); padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-top: var(--vscee-border-sm) solid var(--vscode-widget-border);
    }
    .viz-btn {
      font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xs) var(--vscee-space-lg); border: var(--vscee-border-sm) solid var(--vscode-button-border, transparent);
      border-radius: var(--vscee-radius-md); cursor: pointer; color: var(--vscode-foreground); background: transparent;
    }
    .viz-btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .viz-btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .viz-btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .viz-section-label {
      font-size: var(--vscee-font-compact-xs); font-weight: 600; color: var(--vscode-descriptionForeground);
      text-transform: uppercase; margin: var(--vscee-space-lg) 0 var(--vscee-space-xs);
    }
    .viz-channel-row { display: flex; align-items: center; gap: var(--vscee-space-sm); margin-bottom: var(--vscee-space-sm); }
    .viz-channel-label { width: 60px; flex-shrink: 0; font-size: var(--vscee-font-compact-sm); color: var(--vscode-descriptionForeground); }
    .viz-band-select {
      flex: 1; min-width: 0; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
      border: var(--vscee-border-sm) solid var(--vscode-dropdown-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-input {
      width: 60px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscode-input-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-compute-btn { margin-top: var(--vscee-space-xs); }
    .viz-palette-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--vscee-space-xs); margin-top: var(--vscee-space-xs); }
    .viz-palette-item {
      cursor: pointer; border: var(--vscee-border-sm) solid transparent; border-radius: var(--vscee-radius-md); padding: var(--vscee-space-xxs); text-align: center;
    }
    .viz-palette-item:hover { border-color: var(--vscode-focusBorder); }
    .viz-palette-item.selected { border-color: var(--vscode-focusBorder); background: var(--vscode-list-hoverBackground); }
    .viz-palette-bar { height: 10px; border-radius: var(--vscee-radius-sm); }
    .viz-palette-name { font-size: var(--vscee-font-compact-xxs); color: var(--vscode-descriptionForeground); display: block; margin-top: var(--vscee-space-xxs); }
    .viz-cat-legend { display: flex; flex-direction: column; gap: var(--vscee-space-xs); max-height: 200px; overflow-y: auto; }
    .viz-cat-row { display: flex; align-items: center; gap: var(--vscee-space-xs); }
    .viz-cat-color { width: 28px; height: 22px; border: none; padding: 0; cursor: pointer; border-radius: var(--vscee-radius-md); }
    .viz-cat-value {
      width: 50px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscode-input-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-cat-label-input {
      flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscode-input-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-cat-del { width: 22px; height: 22px; box-shadow: none; opacity: 0.5; }
    .viz-cat-add { margin-top: var(--vscee-space-xs); align-self: flex-start; }
    @keyframes mdi-spin { to { transform: rotate(360deg); } }
    .mdi-spin { animation: mdi-spin 1s linear infinite; display: inline-block; vertical-align: middle; }
  }
</style>
