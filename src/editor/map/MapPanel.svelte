<!-- MapPanel: Leaflet-based map with EE tile layers, inspector, scale bar and viz editor -->
<script>
  import L from 'leaflet';
  import ColorPicker from './ColorPicker.svelte';
  import MapButton from './MapButton.svelte';
  import MapInspector from './MapInspector.svelte';
  import { vscode } from '../../shared/vscode.ts';
  import { trackViewportChanges } from '../../shared/viewportAnchor.ts';
  import {
    mdiAlertCircleOutline, mdiCheck, mdiChevronDown, mdiClose, mdiCodeTags, mdiContentCopy,
    mdiCrosshairsGps, mdiEye, mdiEyeOff,
    mdiLayers, mdiLoading, mdiMap, mdiRuler, mdiSatelliteVariant, mdiTrashCan, mdiTune,
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
    if (!m) {return rgb;}
    return '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
  }

  function sample(fn, n) {
    if (n < 2) {return [rgbToHex(fn(0.5))];}
    const colors = [];
    for (let i = 0; i < n; i++) {colors.push(rgbToHex(fn(i / (n - 1))));}
    return colors;
  }

  // Continuous ramps stay as interpolators so they can be resampled at any
  // number of stops; categorical schemes are fixed discrete lists.
  const SEQUENTIAL_PALETTES = [
    { name: 'Viridis', category: 'Sequential', interpolate: interpolateViridis },
    { name: 'Magma', category: 'Sequential', interpolate: interpolateMagma },
    { name: 'Plasma', category: 'Sequential', interpolate: interpolatePlasma },
    { name: 'Inferno', category: 'Sequential', interpolate: interpolateInferno },
    { name: 'Cividis', category: 'Sequential', interpolate: interpolateCividis },
    { name: 'Turbo', category: 'Sequential', interpolate: interpolateTurbo },
    { name: 'Greys', category: 'Sequential', interpolate: interpolateGreys },
    { name: 'YlGnBu', category: 'Sequential', interpolate: interpolateYlGnBu },
    { name: 'YlOrRd', category: 'Sequential', interpolate: interpolateYlOrRd },
  ];
  const DIVERGING_PALETTES = [
    { name: 'RdBu', category: 'Diverging', interpolate: interpolateRdBu },
    { name: 'RdYlGn', category: 'Diverging', interpolate: interpolateRdYlGn },
    { name: 'BrBG', category: 'Diverging', interpolate: interpolateBrBG },
    { name: 'PiYG', category: 'Diverging', interpolate: interpolatePiYG },
    { name: 'RdYlBu', category: 'Diverging', interpolate: interpolateRdYlBu },
    { name: 'Spectral', category: 'Diverging', interpolate: interpolateSpectral },
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
  const MIN_PALETTE_COLORS = 2;
  const MAX_PALETTE_COLORS = 12;
  const CONTINUOUS_PALETTE_GROUPS = [
    { label: 'Sequential', items: SEQUENTIAL_PALETTES },
    { label: 'Diverging', items: DIVERGING_PALETTES },
  ];
  const CATEGORICAL_PALETTE_GROUPS = [
    { label: 'Categorical', items: CATEGORICAL_PALETTES },
    ...CONTINUOUS_PALETTE_GROUPS,
  ];
  const PALETTE_PREVIEW_STOPS = 9;
  const MENU_MAX_HEIGHT = 320;
  const MENU_MIN_WIDTH = 220;

  // Range presets computed from the pixels currently visible on the map.
  const STRETCH_MODES = [
    { id: 'custom', label: 'Custom' },
    { id: 'sigma-1', label: 'Stretch: 1 \u03c3' },
    { id: 'sigma-2', label: 'Stretch: 2 \u03c3' },
    { id: 'sigma-3', label: 'Stretch: 3 \u03c3' },
    { id: 'percent-90', label: 'Stretch: 90%' },
    { id: 'percent-98', label: 'Stretch: 98%' },
    { id: 'percent-100', label: 'Stretch: 100%' },
  ];

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------

  let map = $state(null);
  let overlays = $state([]);
  let layersPanelVisible = $state(false);
  let inspectorActive = $state(false);
  let activeScaleIndex = $state(-1);
  let coords = $state('0.0000, 0.0000');
  let zoomLevel = $state(2);

  // Floating tooltip that follows the mouse while a colour-scale layer is active.
  let cursorTooltipText = $state('');
  let cursorTooltipX = $state(0);
  let cursorTooltipY = $state(0);
  let activeMode = $state('theme');
  // Message shown when the Google Maps API key is missing or createSession failed.
  let basemapError = $state('');

  // Viz editor
  let vizVisible = $state(false);
  let vizCodeVisible = $state(false);
  let vizCodeCopied = $state(false);
  let vizLayerIndex = $state(-1);
  let vizBands = $state([]);
  let vizPresets = $state([]);
  let vizType = $state('rgb');
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
  // Colour ramp built from a preset resampled to `vizContColorCount` stops.
  let vizContColorCount = $state(7);
  let vizContPaletteName = $state('');
  let vizContPaletteOpen = $state(false);
  let vizContColors = $state([]);
  // Categorical fields
  let vizCatBand = $state('');
  let vizCatRows = $state([]);
  let vizCatPaletteName = $state('');
  let vizCatPaletteOpen = $state(false);
  let vizCatDetecting = $state(false);
  let vizCatNotice = $state('');
  let vizComputing = $state(false);
  // Layer opacity in percent — shared by every viz type, previewed live.
  let vizOpacity = $state(100);
  let vizStretch = $state('custom');
  let vizStretchError = $state('');

  // Internal refs
  let basemapTileLayers = {};
  let basemapIsFallback = {};
  let pendingBasemaps = new Set();
  let currentBasemap = null;
  let currentBasemapId = 'light';
  let googleCopyright = '';
  let attributionTimer = null;
  let nativeLayerControl = null;
  let _sampleCanvas = null;
  // Opacity the edited layer had when the dialog opened, restored on Cancel.
  let vizOpacityOriginal = 100;

  // ----------------------------------------------------------------
  // DERIVED
  // ----------------------------------------------------------------

  let scaleData = $derived.by(() => {
    if (activeScaleIndex < 0) {return null;}
    const entry = overlays[activeScaleIndex];
    if (!entry || !entry.visParams) {return null;}
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
    if (!palette || palette.length === 0) {return 'linear-gradient(to right, #000, #fff)';}
    const colors = palette.map(c => c.startsWith('#') ? c : '#' + c);
    return 'linear-gradient(to right, ' + colors.join(', ') + ')';
  }

  /** Hard-edged bands, so a discrete scheme never reads as a smooth ramp. */
  function paletteBlocks(colors) {
    const step = 100 / colors.length;
    return 'linear-gradient(to right, '
      + colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ') + ')';
  }

  /** Preview strip shown under a palette name in the palette dropdown. */
  function palettePreview(pal, discrete) {
    if (pal.colors) {return paletteBlocks(pal.colors.map(normalizeHex));}
    const colors = sample(pal.interpolate, PALETTE_PREVIEW_STOPS);
    return discrete ? paletteBlocks(colors) : paletteGradient(colors);
  }

  /** Pins the palette menu to its trigger in viewport space, so the dialog cannot clip it. */
  function anchorMenu(node) {
    const place = () => {
      const trigger = node.parentElement?.querySelector('.viz-palette-trigger');
      if (!trigger) {return;}
      const r = trigger.getBoundingClientRect();
      const gap = 4;
      const below = window.innerHeight - r.bottom - gap * 2;
      const above = r.top - gap * 2;
      const flipUp = below < Math.min(MENU_MAX_HEIGHT, above);
      node.style.left = Math.round(r.left) + 'px';
      node.style.width = Math.round(Math.max(r.width, MENU_MIN_WIDTH)) + 'px';
      node.style.maxHeight = Math.round(Math.min(MENU_MAX_HEIGHT, flipUp ? above : below)) + 'px';
      node.style.top = flipUp ? 'auto' : Math.round(r.bottom + gap) + 'px';
      node.style.bottom = flipUp ? Math.round(window.innerHeight - r.top + gap) + 'px' : 'auto';
    };
    return trackViewportChanges(place);
  }

  function fmtVal(v) {
    if (v == null) {return '';}
    const n = Number(v);
    if (Number.isNaN(n)) {return String(v);}
    if (Number.isInteger(n)) {return String(n);}
    return n.toPrecision(4);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ----------------------------------------------------------------
  // MAP INIT (called from onMount equivalent)
  // ----------------------------------------------------------------

  function initMap() {
    map = L.map('map', { center: [0, 0], zoom: 2, zoomControl: false });

    // Set per basemap: Google's terms require the "Google Maps" mark, the
    // keyless fallbacks must not carry it.
    map.attributionControl.setPrefix('');

    nativeLayerControl = L.control.layers({}, {}, { collapsed: true }).addTo(map);
    nativeLayerControl.getContainer().style.display = 'none';

    setBasemap(resolveBasemapId());

    // Theme sync
    new MutationObserver(() => {
      setBasemap(resolveBasemapId());
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Status bar events
    map.on('mousemove', (e) => {
      coords = e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
      cursorTooltipX = e.originalEvent.clientX;
      cursorTooltipY = e.originalEvent.clientY;
      updateScaleFromMap(e.latlng);
    });
    map.on('mouseout', () => { cursorTooltipText = ''; });
    map.on('zoomend', () => { zoomLevel = map.getZoom(); });
    map.on('moveend zoomend', requestAttribution);

    // Signal the extension host that the map is ready to receive layers.
    // The host uses this to replay any layer added before the panel was (re)opened.
    vscode.postMessage({ type: 'ready' });
  }

  // ----------------------------------------------------------------
  // BASEMAP
  // ----------------------------------------------------------------

  // Maps the two toggles plus the VS Code colour theme onto a basemap slot.
  function resolveBasemapId() {
    if (activeMode === 'satellite') {return 'satellite';}
    if (activeMode === 'plan') {return isDarkTheme() ? 'planDark' : 'planLight';}
    return isDarkTheme() ? 'dark' : 'light';
  }

  // Tile URLs carry a session token minted by the extension host, so they are
  // fetched on demand rather than all five up front.
  function setBasemap(id) {
    currentBasemapId = id;
    const next = basemapTileLayers[id];
    if (next) {
      applyBasemap(next);
    } else if (!pendingBasemaps.has(id)) {
      pendingBasemaps.add(id);
      vscode.postMessage({ type: 'requestBasemap', data: { id } });
    }
  }

  function applyBasemap(next) {
    if (next === currentBasemap) {return;}
    if (currentBasemap) {map.removeLayer(currentBasemap);}
    next.addTo(map);
    // Leaflet stacks tile layers in DOM order, so a freshly added basemap would
    // otherwise sit on top of the Earth Engine overlays.
    next.bringToBack();
    currentBasemap = next;
    basemapError = '';
    if (basemapIsFallback[currentBasemapId]) {
      setCopyright('');
      map.attributionControl.setPrefix('');
    } else {
      map.attributionControl.setPrefix('Google Maps');
      requestAttribution();
    }
  }

  // Drops every cached basemap: the API key or a basemap setting changed.
  function resetBasemaps() {
    if (currentBasemap) {map.removeLayer(currentBasemap);}
    currentBasemap = null;
    basemapTileLayers = {};
    basemapIsFallback = {};
    pendingBasemaps = new Set();
    setBasemap(currentBasemapId);
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Google requires the copyright string for the visible extent, which changes
  // as the user pans; debounce so a drag costs one viewport call.
  function requestAttribution() {
    if (!map || !currentBasemap) {return;}
    clearTimeout(attributionTimer);
    attributionTimer = setTimeout(() => {
      const b = map.getBounds();
      vscode.postMessage({
        type: 'requestAttribution',
        data: {
          id: currentBasemapId,
          zoom: map.getZoom(),
          bounds: {
            north: clamp(b.getNorth(), -85, 85),
            south: clamp(b.getSouth(), -85, 85),
            east: clamp(b.getEast(), -180, 180),
            west: clamp(b.getWest(), -180, 180),
          },
        },
      });
    }, 600);
  }

  function setCopyright(text) {
    if (text === googleCopyright) {return;}
    if (googleCopyright) {map.attributionControl.removeAttribution(googleCopyright);}
    googleCopyright = text;
    if (text) {map.attributionControl.addAttribution(text);}
  }

  function activateMode(mode) {
    activeMode = activeMode === mode ? 'theme' : mode;
    setBasemap(resolveBasemapId());
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
    vscode.postMessage({
      type: 'layerVisibility',
      data: { layerIndex: entry.layerIndex, shown: entry.visible },
    });
  }

  function setLayerOpacity(idx, val) {
    const entry = overlays[idx];
    entry.opacity = val / 100;
    entry.tileLayer.setOpacity(entry.opacity);
    overlays = overlays;
    vscode.postMessage({
      type: 'layerOpacity',
      data: { layerIndex: entry.layerIndex, opacity: entry.opacity },
    });
  }

  function removeLayer(idx) {
    const entry = overlays[idx];
    if (entry.visible) {map.removeLayer(entry.tileLayer);}
    nativeLayerControl.removeLayer(entry.tileLayer);
    overlays = overlays.filter((_, index) => index !== idx);
    if (activeScaleIndex === idx) {
      activeScaleIndex = -1;
    } else if (activeScaleIndex > idx) {
      activeScaleIndex--;
    }
    if (vizLayerIndex === entry.layerIndex) {
      vizVisible = false;
    }
    vscode.postMessage({ type: 'removeLayer', data: { layerIndex: entry.layerIndex } });
  }

  function toggleScale(idx) {
    if (activeScaleIndex === idx) {
      activeScaleIndex = -1;
    } else {
      if (!overlays[idx].visible) {
        toggleLayerVisibility(idx);
      }
      activeScaleIndex = idx;
    }
  }

  function openVizEditorForLayer(layerIndex) {
    vscode.postMessage({ type: 'openVizEditor', data: { layerIndex } });
  }

  function toggleLayersPanel() {
    layersPanelVisible = !layersPanelVisible;
    if (layersPanelVisible) {inspectorActive = false;}
  }

  // ----------------------------------------------------------------
  // SCALE BAR — pixel tracking
  // ----------------------------------------------------------------

  function sampleOverlayPixel(latlng, idx) {
    const entry = overlays[idx];
    if (!entry || !entry.visible) {return null;}
    const container = entry.tileLayer.getContainer();
    if (!container) {return null;}
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
          if (!_sampleCanvas) {_sampleCanvas = document.createElement('canvas');}
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
    if (activeScaleIndex < 0) {return;}
    const rgba = sampleOverlayPixel(latlng, activeScaleIndex);
    if (!rgba || rgba[3] === 0) {
      document.querySelectorAll('.scale-pointer').forEach(p => { p.style.display = 'none'; });
      cursorTooltipText = '';
      return;
    }
    const entry = overlays[activeScaleIndex];
    if (!entry || !entry.visParams) {return;}
    const vp = entry.visParams;
    const bands = vp.bands || [];
    const palette = vp.palette || null;
    const minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
    const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];
    const isCategorical = Array.isArray(vp.values) && vp.values.length > 0;

    const parts = [];
    if (isCategorical && palette) {
      const bestIdx = findClosestPaletteIndex(rgba, palette);
      const label = highlightCategoryDOM(bestIdx);
      if (label) {parts.push(label);}
      cursorTooltipText = parts.join('\n');
      return;
    }

    const rows = document.querySelectorAll('.scale-row');
    if (palette && bands.length <= 1 && rows[0]) {
      const bestIdx = findClosestPaletteIndex(rgba, palette);
      const pct = palette.length > 1 ? bestIdx / (palette.length - 1) : 0;
      const t = setPointerDOM(rows[0], pct, minArr[0], maxArr[0]);
      if (t) {parts.push(t);}
    } else if (bands.length === 3) {
      if (rows[0]) {
        const t = setPointerDOM(rows[0], rgba[0] / 255, minArr[0], maxArr[0]);
        if (t) {parts.push(`${bands[0] || 'R'}: ${t}`);}
      }
      if (rows[1]) {
        const t = setPointerDOM(rows[1], rgba[1] / 255, minArr[1] ?? minArr[0], maxArr[1] ?? maxArr[0]);
        if (t) {parts.push(`${bands[1] || 'G'}: ${t}`);}
      }
      if (rows[2]) {
        const t = setPointerDOM(rows[2], rgba[2] / 255, minArr[2] ?? minArr[0], maxArr[2] ?? maxArr[0]);
        if (t) {parts.push(`${bands[2] || 'B'}: ${t}`);}
      }
    }
    cursorTooltipText = parts.join('\n');
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
    const maxEl = row.querySelector('.scale-max');
    if (!pointer) {return null;}
    const c = Math.max(0, Math.min(1, pct));
    pointer.style.left = c * 100 + '%';
    pointer.style.display = 'block';
    const val = min + c * (max - min);
    const text = fmtVal(val);
    if (maxEl) {maxEl.textContent = text;}
    return text;
  }

  function highlightCategoryDOM(index) {
    const segments = document.querySelectorAll('.scale-cat-segment');
    const pointer = document.querySelector('.scale-cat-pointer');
    const maxEl = document.querySelector('.scale-bar .scale-max');
    const n = segments.length;
    if (!pointer || n === 0) {return null;}
    const pct = ((index + 0.5) / n) * 100;
    pointer.style.left = pct + '%';
    pointer.style.display = 'block';
    const seg = segments[index];
    if (!seg) {return null;}
    const label = seg.dataset.catLabel || 'Class ' + index;
    if (maxEl) {maxEl.textContent = label;}
    return label;
  }

  function handleScaleRowHover(e, min, max) {
    const wrap = e.currentTarget;
    const rect = wrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const val = min + pct * (max - min);
    const pointer = wrap.querySelector('.scale-pointer');
    if (pointer) { pointer.style.left = pct * 100 + '%'; pointer.style.display = 'block'; }
    const maxEl = wrap.parentElement?.querySelector('.scale-max');
    if (maxEl) { maxEl.textContent = fmtVal(val); }
  }

  function handleScaleRowLeave(e) {
    const wrap = e.currentTarget;
    const pointer = wrap.querySelector('.scale-pointer');
    if (pointer) {pointer.style.display = 'none';}
  }

  // ----------------------------------------------------------------
  // VIZ EDITOR
  // ----------------------------------------------------------------

  function applyVisParams(vp) {
    const bands = vp.bands || [];
    const isCat = Array.isArray(vp.values) && vp.values.length > 0;

    if (isCat) {vizType = 'categorical';}
    else if (vp.palette && bands.length <= 1) {vizType = 'continuous';}
    else {vizType = 'rgb';}

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
    if (vp.gamma) {vizRgbGamma = String(Array.isArray(vp.gamma) ? vp.gamma[0] : vp.gamma);}
    else {vizRgbGamma = '1';}

    // HSV
    if (bands.length >= 3) { vizHsvH = bands[0]; vizHsvS = bands[1]; vizHsvV = bands[2]; }
    vizHsvHMin = minArr[0] != null ? String(minArr[0]) : '';
    vizHsvHMax = maxArr[0] != null ? String(maxArr[0]) : '';
    vizHsvSMin = String(minArr[1] ?? minArr[0] ?? '');
    vizHsvSMax = String(maxArr[1] ?? maxArr[0] ?? '');
    vizHsvVMin = String(minArr[2] ?? minArr[0] ?? '');
    vizHsvVMax = String(maxArr[2] ?? maxArr[0] ?? '');

    // Continuous
    if (bands.length >= 1) {vizContBand = bands[0];}
    vizContMin = minArr[0] != null ? String(minArr[0]) : '';
    vizContMax = maxArr[0] != null ? String(maxArr[0]) : '';
    if (!isCat && Array.isArray(vp.palette) && vp.palette.length > 0) {
      vizContColors = vp.palette.map(normalizeHex);
      vizContColorCount = vizContColors.length;
    } else {
      vizContColors = [];
    }
    vizContPaletteName = '';

    // Categorical
    if (bands.length >= 1) {vizCatBand = bands[0];}
    if (isCat) {
      const palette = vp.palette || [];
      const labels = vp.labels || [];
      const values = vp.values || [];
      const n = Math.max(palette.length, values.length);
      vizCatRows = Array.from({ length: n }, (_, i) => ({
        color: palette[i] ? normalizeHex(palette[i]) : '#4285f4',
        value: values[i] != null ? String(values[i]) : '',
        label: labels[i] || '',
      }));
    } else {
      vizCatRows = [];
    }
    vizCatPaletteName = '';
    vizCatNotice = '';
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
      if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) {return null;}
      const config = { vizType, bands, min, max };
      if (isRgb) {
        const gamma = parseFloat(vizRgbGamma);
        if (gamma && gamma !== 1) {config.gamma = gamma;}
      }
      return config;
    }
    if (vizType === 'continuous') {
      const min = parseFloat(vizContMin);
      const max = parseFloat(vizContMax);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {return null;}
      return {
        vizType: 'continuous',
        bands: [vizContBand],
        min: [min],
        max: [max],
        palette: [...vizContColors],
      };
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
    if (!config) {return;}
    const opacity = clampOpacityPercent(vizOpacity) / 100;
    vscode.postMessage({ type: 'updateViz', data: { layerIndex: vizLayerIndex, opacity, ...config } });
    vizVisible = false;
  }

  function vizClose() {
    setVizOpacity(vizOpacityOriginal);
    vizVisible = false;
  }

  /* ==================================================================
     VISUALIZATION PARAMETERS AS JSON
     ================================================================== */

  function jsonStr(value) {
    return JSON.stringify(String(value));
  }

  function jsonList(items, quote) {
    return '[' + items.map((v) => (quote ? jsonStr(v) : String(v))).join(', ') + ']';
  }

  function jsonDict(entries) {
    return '{\n' + entries.map(([k, v]) => `  ${jsonStr(k)}: ${v}`).join(',\n') + '\n}';
  }

  /** Renders the current editor state as a vis_params object, valid both as JSON and as a Python dict. */
  function buildVizJson() {
    const config = collectVisParams();
    if (!config) {return 'Complete the visualization parameters first.';}
    const opacity = String(clampOpacityPercent(vizOpacity) / 100);
    const entries = [['bands', jsonList(config.bands, true)]];

    if (config.vizType === 'categorical') {
      if (config.values.length === 0) {return 'Add at least one class first.';}
      entries.push(['min', String(Math.min(...config.values))]);
      entries.push(['max', String(Math.max(...config.values))]);
      entries.push(['palette', jsonList(config.palette, true)]);
      entries.push(['opacity', opacity]);
      return jsonDict(entries);
    }

    const single = config.bands.length === 1;
    entries.push(['min', single ? String(config.min[0]) : jsonList(config.min)]);
    entries.push(['max', single ? String(config.max[0]) : jsonList(config.max)]);
    if (config.gamma) {entries.push(['gamma', String(config.gamma)]);}
    if (config.palette) {entries.push(['palette', jsonList(config.palette, true)]);}
    entries.push(['opacity', opacity]);
    return jsonDict(entries);
  }

  const JSON_TOKEN = /("(?:\\.|[^"\\])*")(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g;

  function highlightJson(text) {
    const tokens = [];
    let last = 0;
    JSON_TOKEN.lastIndex = 0;
    let match;
    while ((match = JSON_TOKEN.exec(text)) !== null) {
      if (match.index > last) {tokens.push({ kind: 'punct', text: text.slice(last, match.index) });}
      const raw = match[0];
      let kind = 'num';
      if (match[1]) {kind = 'key';}
      else if (raw.startsWith('"')) {kind = 'str';}
      else if (raw === 'true' || raw === 'false' || raw === 'null') {kind = 'bool';}
      tokens.push({ kind, text: raw });
      last = match.index + raw.length;
    }
    if (last < text.length) {tokens.push({ kind: 'punct', text: text.slice(last) });}
    return tokens;
  }

  const vizJsonText = $derived.by(() => (vizCodeVisible ? buildVizJson() : ''));
  const vizJsonTokens = $derived.by(() => highlightJson(vizJsonText));

  async function copyVizJson() {
    try {
      await navigator.clipboard.writeText(vizJsonText);
      vizCodeCopied = true;
      setTimeout(() => { vizCodeCopied = false; }, 1500);
    } catch {
      vizCodeCopied = false;
    }
  }

  /** Bands whose range the active viz type exposes, deduplicated. */  function stretchBands() {
    let bands = [];
    if (vizType === 'rgb') {bands = [vizRgbR, vizRgbG, vizRgbB];}
    else if (vizType === 'hsv') {bands = [vizHsvH, vizHsvS, vizHsvV];}
    else if (vizType === 'continuous') {bands = [vizContBand];}
    return [...new Set(bands.filter(Boolean))];
  }

  /** Metres per screen pixel at the current zoom and latitude. */
  function viewportScale() {
    const lat = map.getCenter().lat;
    return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom());
  }

  function applyStretch(mode) {
    vizStretch = mode;
    vizStretchError = '';
    if (mode === 'custom') {return;}
    const bands = stretchBands();
    if (bands.length === 0) {
      vizStretchError = 'Select a band first.';
      vizStretch = 'custom';
      return;
    }
    const b = map.getBounds();
    vizComputing = true;
    vscode.postMessage({
      type: 'computeStretch',
      data: {
        layerIndex: vizLayerIndex,
        bands,
        mode,
        bounds: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
        scale: viewportScale(),
      },
    });
  }

  function applyStretchResult(ranges) {
    const pick = (band) => (band && ranges[band]) || null;
    if (vizType === 'rgb') {
      const r = pick(vizRgbR), g = pick(vizRgbG), b = pick(vizRgbB);
      if (r) { vizRgbRMin = fmtVal(r.min); vizRgbRMax = fmtVal(r.max); }
      if (g) { vizRgbGMin = fmtVal(g.min); vizRgbGMax = fmtVal(g.max); }
      if (b) { vizRgbBMin = fmtVal(b.min); vizRgbBMax = fmtVal(b.max); }
    } else if (vizType === 'hsv') {
      const h = pick(vizHsvH), s = pick(vizHsvS), v = pick(vizHsvV);
      if (h) { vizHsvHMin = fmtVal(h.min); vizHsvHMax = fmtVal(h.max); }
      if (s) { vizHsvSMin = fmtVal(s.min); vizHsvSMax = fmtVal(s.max); }
      if (v) { vizHsvVMin = fmtVal(v.min); vizHsvVMax = fmtVal(v.max); }
    } else if (vizType === 'continuous') {
      const c = pick(vizContBand);
      if (c) { vizContMin = fmtVal(c.min); vizContMax = fmtVal(c.max); }
    }
  }

  /** A hand-edited bound no longer matches the selected stretch preset. */
  function markRangeCustom() {
    vizStretch = 'custom';
    vizStretchError = '';
  }

  function clampOpacityPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {return 100;}
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  /** Applies an opacity percentage to the edited layer without leaving the dialog. */
  function setVizOpacity(percent) {
    vizOpacity = clampOpacityPercent(percent);
    const entry = overlays.find(o => o.layerIndex === vizLayerIndex);
    if (!entry) {return;}
    entry.opacity = vizOpacity / 100;
    entry.tileLayer.setOpacity(entry.opacity);
    overlays = [...overlays];
  }

  function setVizGamma(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {return;}
    vizRgbGamma = String(Math.max(0.1, Math.min(5, Math.round(n * 10) / 10)));
  }

  /** Share of the track left of the thumb, feeding the `--slider-fill` custom property. */
  function sliderFill(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) {return 0;}
    return Math.round(Math.max(0, Math.min(1, (n - min) / (max - min))) * 100);
  }

  function vizApplyPreset(idx) {
    const p = vizPresets[idx];
    if (!p) {return;}
    const vp = { bands: p.bands || [] };
    if (p.min) {vp.min = p.min;}
    if (p.max) {vp.max = p.max;}
    if (p.palette) {vp.palette = p.palette;}
    if (p.gamma) {vp.gamma = p.gamma;}
    if (p.labels) {vp.labels = p.labels;}
    if (p.values) {vp.values = p.values;}
    const typeMap = { rgb: 'rgb', hsv: 'hsv', continuous: 'continuous', categorical: 'categorical' };
    vizType = typeMap[p.type] || 'rgb';
    applyVisParams(vp);
  }

  /** `<input type="color">` only accepts a 6-digit `#rrggbb` value. */
  function normalizeHex(color) {
    let hex = String(color).trim();
    if (!hex.startsWith('#')) {hex = '#' + hex;}
    if (hex.length === 4) {hex = '#' + hex.slice(1).split('').map(c => c + c).join('');}
    return hex.slice(0, 7).toLowerCase();
  }

  function selectContPalette(name) {
    vizContPaletteName = name;
    const pal = CONTINUOUS_PALETTES.find(p => p.name === name);
    if (pal) {vizContColors = sample(pal.interpolate, vizContColorCount);}
  }

  function setContColorCount(value) {
    const n = Math.max(MIN_PALETTE_COLORS, Math.min(MAX_PALETTE_COLORS, Math.round(Number(value) || 0)));
    vizContColorCount = n;
    const pal = CONTINUOUS_PALETTES.find(p => p.name === vizContPaletteName);
    if (pal) {
      vizContColors = sample(pal.interpolate, n);
    } else if (vizContColors.length > 0) {
      // Hand-picked stops: keep the ends and drop or repeat the middle.
      const last = vizContColors[vizContColors.length - 1];
      vizContColors = Array.from({ length: n }, (_, i) => vizContColors[i] ?? last);
    }
  }

  /** Editing a swatch detaches the ramp from its preset. */
  function markPaletteCustom() {
    vizContPaletteName = '';
  }

  /** Accepts `rgb`/`rrggbb`, with or without the leading `#`; `null` when unparseable. */
  function parseHex(text, allowShort) {
    const value = String(text).trim().replace(/^#/, '');
    const pattern = allowShort ? /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i : /^[0-9a-f]{6}$/i;
    return pattern.test(value) ? normalizeHex(value) : null;
  }

  /** Typed hex entry: while typing only a complete `#rrggbb` commits, so the field is never rewritten mid-word. */
  function setContColor(index, text, allowShort = false) {
    const hex = parseHex(text, allowShort);
    if (!hex || hex === vizContColors[index]) {return;}
    vizContColors = vizContColors.map((c, i) => (i === index ? hex : c));
    markPaletteCustom();
  }

  /** Typed hex entry for a class row: mirrors `setContColor`. */
  function setCatColor(index, text, allowShort = false) {
    const hex = parseHex(text, allowShort);
    if (!hex || hex === vizCatRows[index].color) {return;}
    vizCatRows[index].color = hex;
    vizCatPaletteName = '';
  }

  function removeContColor(index) {
    if (vizContColors.length <= MIN_PALETTE_COLORS) {return;}
    vizContColors = vizContColors.filter((_, i) => i !== index);
    vizContColorCount = vizContColors.length;
    markPaletteCustom();
  }

  function addContColor() {
    if (vizContColors.length >= MAX_PALETTE_COLORS) {return;}
    vizContColors = [...vizContColors, vizContColors[vizContColors.length - 1] ?? '#4285f4'];
    vizContColorCount = vizContColors.length;
    markPaletteCustom();
  }

  // ----------------------------------------------------------------
  // VIZ EDITOR — CLASSIFICATION
  // ----------------------------------------------------------------

  /** `n` discrete colours from a scheme, cycling schemes and sampling ramps. */
  function schemeColors(name, n) {
    const discrete = CATEGORICAL_PALETTES.find(p => p.name === name);
    if (discrete) {
      return Array.from({ length: n }, (_, i) => normalizeHex(discrete.colors[i % discrete.colors.length]));
    }
    const ramp = CONTINUOUS_PALETTES.find(p => p.name === name);
    return ramp ? sample(ramp.interpolate, n) : [];
  }

  function selectCatPalette(name) {
    vizCatPaletteName = name;
    const colors = schemeColors(name, vizCatRows.length);
    if (colors.length === 0) {return;}
    vizCatRows = vizCatRows.map((row, i) => ({ ...row, color: colors[i] }));
  }

  /** Reads back the class values actually drawn in the current viewport. */
  function autoDetectClasses() {
    vizCatNotice = '';
    if (!vizCatBand) {
      vizCatNotice = 'Select a band first.';
      return;
    }
    const b = map.getBounds();
    vizCatDetecting = true;
    vscode.postMessage({
      type: 'computeClasses',
      data: {
        layerIndex: vizLayerIndex,
        band: vizCatBand,
        bounds: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
        scale: viewportScale(),
      },
    });
  }

  function applyDetectedClasses(values, truncated) {
    if (values.length === 0) {
      vizCatNotice = 'No classes found in the visible area.';
      return;
    }
    const scheme = vizCatPaletteName || CATEGORICAL_PALETTES[0].name;
    vizCatPaletteName = scheme;
    const colors = schemeColors(scheme, values.length);
    vizCatRows = values.map((value, i) => ({
      color: colors[i],
      value: String(value),
      label: 'Class ' + value,
    }));
    vizCatNotice = truncated ? `Showing the ${values.length} most frequent classes.` : '';
  }

  function vizAddCatRow() {
    vizCatRows = [...vizCatRows, { color: '#4285f4', value: '', label: '' }];
  }

  function vizRemoveCatRow(idx) {
    vizCatRows = vizCatRows.filter((_, i) => i !== idx);
  }

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------

  window.addEventListener('message', (e) => {
    const msg = e.data;

    if (msg.type === 'basemapUrl') {
      const d = msg.data;
      pendingBasemaps.delete(d.id);
      basemapIsFallback[d.id] = d.fallback === true;
      // Leaflet upscales past `maxNativeZoom` so the basemap does not vanish
      // under a deeply zoomed Earth Engine layer.
      basemapTileLayers[d.id] = L.tileLayer(d.url, {
        maxZoom: 24,
        maxNativeZoom: d.maxNativeZoom,
        attribution: d.attribution,
        crossOrigin: 'anonymous',
      });
      if (d.id === currentBasemapId) {applyBasemap(basemapTileLayers[d.id]);}
    } else if (msg.type === 'basemapError') {
      pendingBasemaps.delete(msg.data.id);
      if (msg.data.id === currentBasemapId) {basemapError = msg.data.message;}
    } else if (msg.type === 'basemapReset') {
      resetBasemaps();
    } else if (msg.type === 'attribution') {
      if (msg.data.id === currentBasemapId && !basemapIsFallback[msg.data.id]) {
        setCopyright(msg.data.copyright);
      }
    } else if (msg.type === 'addTileLayer') {
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
      if (d.shown !== false) {tileLayer.addTo(map);}
    } else if (msg.type === 'centerObject') {
      const d = msg.data;
      if (d.bounds) {
        const bounds = L.latLngBounds(L.latLng(d.bounds[0], d.bounds[1]), L.latLng(d.bounds[2], d.bounds[3]));
        if (d.zoom) {map.setView(bounds.getCenter(), d.zoom);}
        else {map.fitBounds(bounds);}
      }
    } else if (msg.type === 'setCenter') {
      const d = msg.data;
      map.setView([d.lat, d.lon], d.zoom || map.getZoom());
    } else if (msg.type === 'vizEditorData') {
      vizLayerIndex = msg.data.layerIndex;
      vizBands = msg.data.bands || [];
      vizPresets = msg.data.presets || [];
      applyVisParams(msg.data.currentVisParams || {});
      vizOpacityOriginal = clampOpacityPercent((msg.data.opacity ?? 1) * 100);
      vizOpacity = vizOpacityOriginal;
      vizStretch = 'custom';
      vizStretchError = '';
      vizVisible = true;
    } else if (msg.type === 'vizStretch') {      vizComputing = false;
      if (msg.data.layerIndex === vizLayerIndex) {
        if (msg.data.ranges) {
          applyStretchResult(msg.data.ranges);
        } else {
          vizStretchError = msg.data.error || 'Stretch computation failed.';
          vizStretch = 'custom';
        }
      }
    } else if (msg.type === 'vizClasses') {
      vizCatDetecting = false;
      if (msg.data.layerIndex === vizLayerIndex) {
        if (msg.data.values) {
          applyDetectedClasses(msg.data.values, msg.data.truncated === true);
        } else {
          vizCatNotice = msg.data.error || 'Class detection failed.';
        }
      }
    } else if (msg.type === 'replaceTileLayer') {
      const d = msg.data;
      const idx = overlays.findIndex(o => o.layerIndex === d.layerIndex);
      if (idx >= 0) {
        const entry = overlays[idx];
        // `shown`/`opacity` are only sent by addLayer replacements; updateLayer omits them.
        const opacity = d.opacity ?? entry.opacity;
        const visible = d.shown === undefined ? entry.visible : d.shown !== false;
        if (entry.visible) {map.removeLayer(entry.tileLayer);}
        nativeLayerControl.removeLayer(entry.tileLayer);
        entry.tileLayer = L.tileLayer(d.url, {
          maxZoom: 24, opacity, attribution: 'Google Earth Engine', crossOrigin: 'anonymous',
        });
        entry.opacity = opacity;
        entry.visible = visible;
        nativeLayerControl.addOverlay(entry.tileLayer, entry.name);
        entry.visParams = d.visParams;
        if (visible) {entry.tileLayer.addTo(map);}
        overlays = [...overlays];
        if (activeScaleIndex === idx) {
          if (entry.visParams && (entry.visParams.palette || entry.visParams.bands)) {
            activeScaleIndex = idx;
          } else {
            activeScaleIndex = -1;
          }
        }
      }
    } else if (msg.type === 'clearLayers') {
      for (const entry of overlays) {
        if (entry.visible) {map.removeLayer(entry.tileLayer);}
        nativeLayerControl.removeLayer(entry.tileLayer);
      }
      overlays = [];
      activeScaleIndex = -1;
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
<MapInspector map={map} bind:active={inspectorActive} />

{#if basemapError}
  <div class="basemap-error">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d={mdiAlertCircleOutline}/></svg>
    <span class="basemap-error-text">{basemapError}</span>
    <button class="basemap-error-btn" onclick={() => vscode.postMessage({ type: 'setApiKey' })}>
      Set API key
    </button>
    <MapButton class="basemap-error-close" title="Dismiss" onclick={() => { basemapError = ''; }}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiClose}/></svg>
    </MapButton>
  </div>
{/if}

{#if activeScaleIndex >= 0 && cursorTooltipText}
  <div class="cursor-value-tooltip"
    style="left: {cursorTooltipX + 12}px; top: {cursorTooltipY + 12}px;">
    {cursorTooltipText}
  </div>
{/if}

<!-- CONTROLS -->
<div class="map-controls">
  <MapButton active={layersPanelVisible} title="Manage layers"
    onclick={toggleLayersPanel}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={mdiLayers}/></svg>
  </MapButton>
  <MapButton active={inspectorActive} title="Pixel inspector"
    onclick={() => { inspectorActive = !inspectorActive; layersPanelVisible = false; }}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={mdiCrosshairsGps}/></svg>
  </MapButton>
  <MapButton active={activeMode === 'plan'} title="Toggle plan view"
    onclick={() => activateMode('plan')}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={mdiMap}/></svg>
  </MapButton>
  <MapButton active={activeMode === 'satellite'} title="Toggle satellite view"
    onclick={() => activateMode('satellite')}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={mdiSatelliteVariant}/></svg>
  </MapButton>
</div>

<div class="map-controls map-controls-right">
  <MapButton title="Clear all layers"
    onclick={() => vscode.postMessage({ type: 'clearAllLayers' })}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={mdiTrashCan}/></svg>
  </MapButton>
</div>

<!-- LAYERS PANEL -->
{#if layersPanelVisible}
<div class="layers-panel visible">
  <div class="layers-panel-header">
    <span>Layers</span>
    <MapButton class="layers-close-btn" title="Close"
      onclick={() => { layersPanelVisible = false; }}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiClose}/></svg>
    </MapButton>
  </div>
  <div class="layers-list">
    {#if overlays.length === 0}
      <p class="layers-empty">No layers yet.</p>
    {:else}
      {#each overlays as entry, idx}
        <div class="layer-row">
          <span class="layer-name" title={entry.name}>{entry.name}</span>
          <div class="layer-controls">
            <input type="range" class="range-slider layer-opacity" min="0" max="100" step="1"
              style="--slider-fill: {Math.round(entry.opacity * 100)}%"
              value={Math.round(entry.opacity * 100)}
              oninput={(e) => setLayerOpacity(idx, Number(e.target.value))} />
            <MapButton class="layer-vis-btn" active={entry.visible}
              title="Toggle visibility" onclick={() => toggleLayerVisibility(idx)}>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={entry.visible ? mdiEye : mdiEyeOff}/></svg>
            </MapButton>
            {#if entry.visParams && (entry.visParams.palette || entry.visParams.bands)}
              <MapButton class="layer-vis-btn" active={activeScaleIndex === idx}
                title="Toggle scale" onclick={() => toggleScale(idx)}>
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiRuler}/></svg>
              </MapButton>
            {:else}
              <MapButton class="layer-vis-btn" style="visibility:hidden" title="Toggle scale">
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiRuler}/></svg>
              </MapButton>
            {/if}
            <MapButton class="layer-vis-btn" title="Edit visualization"
              onclick={() => openVizEditorForLayer(entry.layerIndex)}>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiTune}/></svg>
            </MapButton>
            <MapButton class="layer-vis-btn" title="Remove layer"
              onclick={() => removeLayer(idx)}>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiTrashCan}/></svg>
            </MapButton>
          </div>
        </div>
      {/each}
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
        <div class="scale-pointer scale-cat-pointer"></div>
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
          <div class="scale-pointer"></div>
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
{#snippet stretchRow()}
  <div class="viz-channel-row">
    <span class="viz-channel-label">Range</span>
    <select class="viz-band-select" disabled={vizComputing}
      value={vizStretch} onchange={(e) => applyStretch(e.target.value)}>
      {#each STRETCH_MODES as mode}
        <option value={mode.id}>{mode.label}</option>
      {/each}
    </select>
    {#if vizComputing}
      <span class="viz-stretch-status">
        <svg class="mdi-spin" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiLoading}/></svg>
      </span>
    {/if}
  </div>
  {#if vizStretchError}
    <p class="viz-stretch-error">{vizStretchError}</p>
  {/if}
{/snippet}

{#snippet paletteSelect(current, open, groups, discrete, toggle, pick)}
  <div class="viz-palette-select">
    <button type="button" class="viz-palette-trigger" onclick={toggle}>
      <span class="viz-palette-current">{current || 'Custom…'}</span>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiChevronDown}/></svg>
    </button>
    {#if open}
      <div class="viz-palette-backdrop" role="presentation" onclick={toggle}></div>
      <div class="viz-palette-menu" use:anchorMenu>
        {#each groups as group}
          <div class="viz-palette-group">{group.label}</div>
          {#each group.items as pal}
            <button type="button" class="viz-palette-option" class:selected={pal.name === current}
              onclick={() => pick(pal.name)}>
              <span class="viz-palette-option-name">{pal.name}</span>
              <span class="viz-palette-strip" style="background:{palettePreview(pal, discrete)}"></span>
            </button>
          {/each}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

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
      <MapButton class="viz-close-btn" title="Close" onclick={vizClose}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiClose}/></svg>
      </MapButton>
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
          <input class="viz-input" placeholder="Min" bind:value={vizRgbRMin} oninput={markRangeCustom} />
          <input class="viz-input" placeholder="Max" bind:value={vizRgbRMax} oninput={markRangeCustom} />
        </div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Green</span>
          <select class="viz-band-select" bind:value={vizRgbG}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizRgbGMin} oninput={markRangeCustom} />
          <input class="viz-input" placeholder="Max" bind:value={vizRgbGMax} oninput={markRangeCustom} />
        </div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Blue</span>
          <select class="viz-band-select" bind:value={vizRgbB}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizRgbBMin} oninput={markRangeCustom} />
          <input class="viz-input" placeholder="Max" bind:value={vizRgbBMax} oninput={markRangeCustom} />
        </div>
        {@render stretchRow()}
        <div class="viz-channel-row">
          <span class="viz-channel-label">Gamma</span>
          <input type="range" class="range-slider viz-range" min="0.1" max="5" step="0.1"
            style="--slider-fill: {sliderFill(vizRgbGamma, 0.1, 5)}%"
            value={vizRgbGamma}
            oninput={(e) => setVizGamma(e.target.value)} />
          <input type="number" class="viz-input viz-range-value" min="0.1" max="5" step="0.1"
            value={vizRgbGamma}
            oninput={(e) => setVizGamma(e.target.value)} />
        </div>
      {/if}
      <!-- HSV -->
      {#if vizType === 'hsv'}
        <div class="viz-channel-row">
          <span class="viz-channel-label">Hue</span>
          <select class="viz-band-select" bind:value={vizHsvH}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizHsvHMin} oninput={markRangeCustom} />
          <input class="viz-input" placeholder="Max" bind:value={vizHsvHMax} oninput={markRangeCustom} />
        </div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Saturation</span>
          <select class="viz-band-select" bind:value={vizHsvS}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizHsvSMin} oninput={markRangeCustom} />
          <input class="viz-input" placeholder="Max" bind:value={vizHsvSMax} oninput={markRangeCustom} />
        </div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Value</span>
          <select class="viz-band-select" bind:value={vizHsvV}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizHsvVMin} oninput={markRangeCustom} />
          <input class="viz-input" placeholder="Max" bind:value={vizHsvVMax} oninput={markRangeCustom} />
        </div>
        {@render stretchRow()}
      {/if}
      <!-- Continuous -->
      {#if vizType === 'continuous'}
        <div class="viz-channel-row">
          <span class="viz-channel-label">Band</span>
          <select class="viz-band-select" bind:value={vizContBand}>
            <option value="">—</option>
            {#each vizBands as b}<option value={b}>{b}</option>{/each}
          </select>
          <input class="viz-input" placeholder="Min" bind:value={vizContMin} oninput={markRangeCustom} />
          <input class="viz-input" placeholder="Max" bind:value={vizContMax} oninput={markRangeCustom} />
        </div>
        {@render stretchRow()}
        <div class="viz-section-label">Palette</div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Colours</span>
          <input type="number" class="viz-input" min={MIN_PALETTE_COLORS} max={MAX_PALETTE_COLORS} step="1"
            value={vizContColorCount}
            oninput={(e) => setContColorCount(e.target.value)} />
          {@render paletteSelect(
            vizContPaletteName, vizContPaletteOpen, CONTINUOUS_PALETTE_GROUPS, false,
            () => { vizContPaletteOpen = !vizContPaletteOpen; },
            (name) => { vizContPaletteOpen = false; selectContPalette(name); })}
        </div>
        {#if vizContColors.length > 0}
          <div class="viz-ramp-preview" style="background:{paletteGradient(vizContColors)}"></div>
          <div class="viz-legend">
            {#each vizContColors as color, i}
              <div class="viz-legend-row">
                <ColorPicker bind:value={vizContColors[i]} onChange={markPaletteCustom}
                  label="Colour {i + 1}" />
                <span class="viz-legend-index">{i + 1}</span>
                <input type="text" class="viz-legend-hex" spellcheck="false" maxlength="7"
                  value={color} aria-label="Hex colour {i + 1}"
                  oninput={(e) => setContColor(i, e.target.value)}
                  onblur={(e) => { setContColor(i, e.target.value, true); e.target.value = vizContColors[i]; }}
                  onkeydown={(e) => { if (e.key === 'Enter') {e.target.blur();} }} />
                <MapButton class="viz-legend-del" title="Remove colour"
                  disabled={vizContColors.length <= MIN_PALETTE_COLORS}
                  onclick={() => removeContColor(i)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiTrashCan}/></svg>
                </MapButton>
              </div>
            {/each}
          </div>
        {:else}
          <p class="viz-ramp-hint">Pick a preset to build the colour ramp.</p>
        {/if}
        <button class="viz-btn viz-btn-secondary viz-legend-add"
          disabled={vizContColors.length >= MAX_PALETTE_COLORS} onclick={addContColor}>+ Add colour</button>
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
        <div class="viz-section-label">Classes</div>
        <div class="viz-channel-row">
          <span class="viz-channel-label">Scheme</span>
          {@render paletteSelect(
            vizCatPaletteName, vizCatPaletteOpen, CATEGORICAL_PALETTE_GROUPS, true,
            () => { vizCatPaletteOpen = !vizCatPaletteOpen; },
            (name) => { vizCatPaletteOpen = false; selectCatPalette(name); })}
          <button class="viz-btn viz-btn-secondary" disabled={vizCatDetecting} onclick={autoDetectClasses}
            title="Replace the legend with the classes present in the visible area">
            {vizCatDetecting ? 'Detecting…' : 'Detect'}
          </button>
        </div>
        {#if vizCatNotice}
          <p class="viz-stretch-error">{vizCatNotice}</p>
        {/if}
        {#if vizCatRows.length > 0}
          <div class="viz-ramp-preview" style="background:{paletteBlocks(vizCatRows.map((r) => normalizeHex(r.color)))}"></div>
        {/if}
        <div class="viz-legend">
          {#each vizCatRows as row, i}
            <div class="viz-legend-row">
              <ColorPicker bind:value={row.color} onChange={() => { vizCatPaletteName = ''; }}
                label="Colour for class {i + 1}" />
              <input type="text" class="viz-legend-hex" spellcheck="false" maxlength="7"
                value={row.color} aria-label="Hex colour for class {i + 1}"
                oninput={(e) => setCatColor(i, e.target.value)}
                onblur={(e) => { setCatColor(i, e.target.value, true); e.target.value = row.color; }}
                onkeydown={(e) => { if (e.key === 'Enter') {e.target.blur();} }} />
              <input type="number" class="viz-legend-value" placeholder="Value" bind:value={row.value} />
              <input type="text" class="viz-legend-name" placeholder="Name" bind:value={row.label} />
              <MapButton class="viz-legend-del" title="Remove class" onclick={() => vizRemoveCatRow(i)}>
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiTrashCan}/></svg>
              </MapButton>
            </div>
          {/each}
        </div>
        <button class="viz-btn viz-btn-secondary viz-legend-add" onclick={vizAddCatRow}>+ Add class</button>
      {/if}
    </div>
    <!-- Opacity (all viz types) -->
    <div class="viz-opacity-bar">
      <span class="viz-channel-label">Opacity</span>
      <input type="range" class="range-slider viz-range" min="0" max="100" step="1"
        style="--slider-fill: {sliderFill(vizOpacity, 0, 100)}%"
        value={vizOpacity}
        oninput={(e) => setVizOpacity(e.target.value)} />
      <input type="number" class="viz-input viz-range-value" min="0" max="100" step="1"
        value={vizOpacity}
        oninput={(e) => setVizOpacity(e.target.value)} />
      <span class="viz-opacity-unit">%</span>
    </div>
    <!-- Footer -->
    <div class="viz-editor-footer">
      <button class="viz-btn viz-btn-secondary viz-btn-code" title="Show these parameters as JSON"
        onclick={() => { vizCodeVisible = true; }}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiCodeTags}/></svg>
        JSON
      </button>
      <button class="viz-btn viz-btn-secondary" onclick={vizClose}>Cancel</button>
      <button class="viz-btn viz-btn-primary" onclick={vizApply}>Apply</button>
    </div>
  </div>
</div>
{/if}

<!-- VIZ PARAMETERS AS JSON -->
{#if vizCodeVisible}
<div class="viz-editor-overlay visible viz-code-overlay">
  <div class="viz-editor-dialog viz-code-dialog">
    <div class="viz-editor-header">
      <span>Python visualization parameters</span>
      <MapButton class="viz-close-btn" title="Close" onclick={() => { vizCodeVisible = false; }}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={mdiClose}/></svg>
      </MapButton>
    </div>
    <div class="viz-editor-body">
      <div class="viz-code-wrap">
        <MapButton class="viz-code-copy" title={vizCodeCopied ? 'Copied' : 'Copy'} onclick={copyVizJson}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d={vizCodeCopied ? mdiCheck : mdiContentCopy}/></svg>
        </MapButton>
        <pre class="viz-code-block">{#each vizJsonTokens as token}<span class="json-{token.kind}">{token.text}</span>{/each}</pre>
      </div>
    </div>
    <div class="viz-editor-footer">
      <button class="viz-btn viz-btn-primary" onclick={() => { vizCodeVisible = false; }}>Close</button>
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
    body { width: 100vw; height: 100vh; overflow: hidden; font-family: var(--vscee-font-family, sans-serif); }
    #app { width: 100%; height: 100%; }
    #map { width: 100%; height: calc(100% - 20px); }

    /* ==================================================================
       SCALE BAR
       ================================================================== */
    .scale-bar {
      position: absolute; bottom: 20px; left: 0; right: 0; z-index: 1000;
      display: none; background: var(--vscee-color-statusbar-background);
      padding: var(--vscee-space-xxs) var(--vscee-space-lg); gap: var(--vscee-space-xs); flex-direction: column;
    }
    .scale-bar.visible { display: flex; }
    .scale-row { display: flex; align-items: center; gap: var(--vscee-space-sm); height: 16px; }
    .scale-label {
      font-size: var(--vscee-font-compact-xxs); color: var(--vscee-color-muted);
      width: 28px; flex-shrink: 0; text-align: right;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .scale-gradient-wrap {
      flex: 1; height: 12px; position: relative;
      border-radius: var(--vscee-radius-sm); overflow: visible; cursor: crosshair;
    }
    .scale-gradient { width: 100%; height: 100%; border-radius: var(--vscee-radius-sm); }
    .scale-max {
      font-size: var(--vscee-font-compact-xxs); color: var(--vscee-color-muted);
      flex-shrink: 0; width: 70px; font-variant-numeric: tabular-nums; text-align: right;
    }
    .scale-pointer {
      position: absolute; top: 0; width: 2px; height: 100%;
      background: var(--vscee-color-foreground); pointer-events: none;
      display: none; opacity: 0.9; transition: left 0.1s ease-out;
    }
    .scale-tooltip { display: none; }
    .cursor-value-tooltip {
      position: fixed; pointer-events: none; z-index: 1000;
      background: var(--vscee-color-editor-background); color: var(--vscee-color-foreground);
      font-size: var(--vscee-font-compact-xxs);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs); border-radius: var(--vscee-radius-sm);
      white-space: pre-line; box-shadow: var(--vscee-shadow-xs);
      font-variant-numeric: tabular-nums;
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
    .map-controls-right { left: auto; right: 10px; }
    /* ==================================================================
       BASEMAP ERROR BANNER
       ================================================================== */
    .basemap-error {
      position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 1100;
      display: flex; align-items: center; gap: var(--vscee-space-sm);
      max-width: min(640px, calc(100% - 120px));
      padding: var(--vscee-space-sm) var(--vscee-space-md);
      border: 1px solid var(--vscee-color-validation-warning-border);
      border-radius: var(--vscee-radius-md);
      background: var(--vscee-color-validation-warning-background);
      color: var(--vscee-color-foreground);
      box-shadow: var(--vscee-shadow-sm);
    }
    .basemap-error-text { flex: 1; font-size: var(--vscee-font-sm); }
    .basemap-error-btn {
      flex-shrink: 0; border: none; border-radius: var(--vscee-radius-sm);
      padding: 2px 10px; cursor: pointer;
      background: var(--vscee-color-button-background); color: var(--vscee-color-button-foreground);
      font-size: var(--vscee-font-sm);
    }
    .basemap-error-btn:hover { background: var(--vscee-color-button-hover); }
    .basemap-error-close { width: 22px; height: 22px; box-shadow: none; background: transparent; }

    /* ==================================================================
       LEAFLET ATTRIBUTION
       ================================================================== */
    .leaflet-control-attribution { background: var(--vscee-color-editor-background) !important; color: var(--vscee-color-foreground) !important; opacity: 0.8; }
    .leaflet-control-attribution a { color: var(--vscee-color-link) !important; }

    /* ==================================================================
       RANGE SLIDERS
       ================================================================== */
    .range-slider {
      height: 12px; cursor: pointer;
      appearance: none; background: transparent;

      /* Track is painted up to --slider-fill so the filled side survives the custom thumb. */
      &::-webkit-slider-runnable-track {
        height: 3px; border-radius: var(--vscee-radius-sm);
        background: linear-gradient(to right,
          var(--vscee-color-button-background) 0 var(--slider-fill),
          var(--vscee-color-scrollbar-slider) var(--slider-fill));
      }
      &::-moz-range-track {
        height: 3px; border-radius: var(--vscee-radius-sm);
        background: linear-gradient(to right,
          var(--vscee-color-button-background) 0 var(--slider-fill),
          var(--vscee-color-scrollbar-slider) var(--slider-fill));
      }
      &::-webkit-slider-thumb {
        appearance: none; width: 12px; height: 12px; margin-top: -4.5px; box-sizing: border-box;
        border: var(--vscee-border-sm) solid var(--vscee-color-button-background); border-radius: 50%;
        background: var(--vscee-color-button-background);
        /* Carves the ring out of the disc, leaving a round dot in the middle. */
        box-shadow: inset 0 0 0 3px var(--vscee-color-editor-background), var(--vscee-shadow-xs);
      }
      &::-moz-range-thumb {
        width: 12px; height: 12px; box-sizing: border-box;
        border: var(--vscee-border-sm) solid var(--vscee-color-button-background); border-radius: 50%;
        background: var(--vscee-color-button-background);
        box-shadow: inset 0 0 0 3px var(--vscee-color-editor-background), var(--vscee-shadow-xs);
      }
      &:focus { outline: none; }
      &:focus-visible::-webkit-slider-thumb { box-shadow: inset 0 0 0 3px var(--vscee-color-editor-background), var(--vscee-shadow-sm); }
      &:focus-visible::-moz-range-thumb { box-shadow: inset 0 0 0 3px var(--vscee-color-editor-background), var(--vscee-shadow-sm); }
    }

    /* ==================================================================
       LAYERS PANEL
       ================================================================== */
    .layers-panel {
      position: absolute; top: 10px; left: 48px; z-index: 1000; width: 240px;
      background: var(--vscee-color-editor-background); border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-md); box-shadow: var(--vscee-shadow-md);
    }
    .layers-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-lg); border-bottom: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      font-size: var(--vscee-font-compact-sm); font-weight: 600; color: var(--vscee-color-foreground);
    }
    .layers-close-btn { width: 22px; height: 22px; box-shadow: none; opacity: 0.6; }
    .layers-list { max-height: 320px; overflow-y: auto; }
    .layers-empty {
      padding: var(--vscee-space-lg); font-size: var(--vscee-font-compact-sm); color: var(--vscee-color-muted); text-align: center;
    }
    .layer-row {
      padding: var(--vscee-space-xs) var(--vscee-space-md); border-bottom: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      display: flex; align-items: center; gap: var(--vscee-space-sm); min-width: 0;
    }
    .layer-row:last-child { border-bottom: none; }
    .layer-vis-btn { width: 22px; height: 22px; flex-shrink: 0; box-shadow: none; opacity: 0.5; }
    .layer-vis-btn.active { opacity: 1; background: transparent; color: var(--vscee-color-foreground); }
    .layer-name {
      flex: 1; min-width: 0; font-size: var(--vscee-font-compact-sm); color: var(--vscee-color-foreground);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .layer-controls { display: flex; align-items: center; gap: var(--vscee-space-xs); flex-shrink: 0; margin-left: auto; }
    .layer-opacity { width: 60px; flex-shrink: 0; }

    /* ==================================================================
       STATUS BAR
       ================================================================== */
    .status-bar {
      position: absolute; bottom: 0; left: 0; right: 0; z-index: 1000;
      background: var(--vscee-color-statusbar-background); color: var(--vscee-color-statusbar-foreground);
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
      background: var(--vscee-color-editor-background); border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-lg); box-shadow: var(--vscee-shadow-xl);
      width: 420px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden;
    }
    .viz-editor-header {
      display: flex; align-items: center; gap: var(--vscee-space-md); padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      font-size: var(--vscee-font-compact-md); font-weight: 600; color: var(--vscee-color-foreground);
    }
    .viz-editor-header span { flex: 1; }
    .viz-type-select, .viz-preset-select {
      background: var(--vscee-color-dropdown-background); color: var(--vscee-color-dropdown-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-dropdown-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-preset-select { max-width: 140px; }
    .viz-close-btn { width: 22px; height: 22px; box-shadow: none; opacity: 0.6; }
    .viz-editor-body { overflow-y: auto; padding: var(--vscee-space-lg); flex: 1; }
    .viz-editor-footer {
      display: flex; justify-content: flex-end; gap: var(--vscee-space-sm); padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-top: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    }
    .viz-btn {
      font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xs) var(--vscee-space-lg); border: var(--vscee-border-sm) solid var(--vscee-color-button-border, transparent);
      border-radius: var(--vscee-radius-md); cursor: pointer; color: var(--vscee-color-foreground); background: transparent;
    }
    .viz-btn-primary { background: var(--vscee-color-button-background); color: var(--vscee-color-button-foreground); }
    .viz-btn-primary:hover { background: var(--vscee-color-button-hover); }
    .viz-btn-secondary { background: var(--vscee-color-button-secondary-background); color: var(--vscee-color-button-secondary-foreground); }
    .viz-btn-code {
      display: inline-flex; align-items: center; gap: var(--vscee-space-xs);
      margin-right: auto; padding-inline: var(--vscee-space-md);
    }
    .viz-code-overlay { z-index: 2600; }
    .viz-code-dialog { width: 520px; }
    .viz-code-wrap {
      position: relative;

      .viz-code-copy { position: absolute; top: var(--vscee-space-xs); right: var(--vscee-space-xs); width: 24px; height: 24px; }
    }
    .viz-code-block {
      font-family: var(--vscee-editor-font-family, monospace);
      font-size: var(--vscee-font-compact-sm); line-height: 1.5;
      white-space: pre; overflow-x: auto; tab-size: 4;
      color: var(--vscee-color-editor-foreground); background: var(--vscee-color-code-background);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-md); padding: var(--vscee-space-md);
      padding-right: calc(var(--vscee-space-md) + 24px);

      .json-key { color: var(--vscee-color-code-key, var(--vscee-color-chart-blue)); }
      .json-str { color: var(--vscee-color-code-string, var(--vscee-color-chart-orange)); }
      .json-num { color: var(--vscee-color-code-number, var(--vscee-color-chart-green)); }
      .json-bool { color: var(--vscee-color-code-boolean, var(--vscee-color-chart-purple)); }
      .json-punct { color: var(--vscee-color-muted); }
    }
    .viz-section-label {
      font-size: var(--vscee-font-compact-xs); font-weight: 600; color: var(--vscee-color-muted);
      text-transform: uppercase; margin: var(--vscee-space-lg) 0 var(--vscee-space-xs);
    }
    .viz-channel-row { display: flex; align-items: center; gap: var(--vscee-space-sm); margin-bottom: var(--vscee-space-sm); }
    .viz-channel-label { width: 60px; flex-shrink: 0; font-size: var(--vscee-font-compact-sm); color: var(--vscee-color-muted); }
    .viz-band-select {
      flex: 1; min-width: 0; background: var(--vscee-color-dropdown-background); color: var(--vscee-color-dropdown-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-dropdown-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-input {
      width: 60px; background: var(--vscee-color-input-background); color: var(--vscee-color-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-stretch-status { display: inline-flex; color: var(--vscee-color-muted); }
    .viz-stretch-error {
      font-size: var(--vscee-font-compact-xs); color: var(--vscee-color-error);
      margin-bottom: var(--vscee-space-sm);
    }
    .viz-ramp-preview {
      height: 14px; border-radius: var(--vscee-radius-sm); margin-top: var(--vscee-space-xs);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    }
    .viz-ramp-hint { font-size: var(--vscee-font-compact-xs); color: var(--vscee-color-muted); margin-top: var(--vscee-space-xs); }
    .viz-palette-select {
      position: relative; flex: 1; min-width: 0;

      .viz-palette-trigger {
        display: flex; align-items: center; justify-content: space-between; gap: var(--vscee-space-xs);
        width: 100%; cursor: pointer; text-align: left;
        background: var(--vscee-color-dropdown-background); color: var(--vscee-color-dropdown-foreground);
        border: var(--vscee-border-sm) solid var(--vscee-color-dropdown-border); border-radius: var(--vscee-radius-md);
        font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
      }
      .viz-palette-current { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      /* Swallows the next click so the menu closes when focus goes elsewhere. */
      .viz-palette-backdrop { position: fixed; inset: 0; z-index: 3000; }
      .viz-palette-menu {
        position: fixed; z-index: 3001;
        overflow-y: auto; padding: var(--vscee-space-xxs);
        background: var(--vscee-color-dropdown-background);
        border: var(--vscee-border-sm) solid var(--vscee-color-dropdown-border);
        border-radius: var(--vscee-radius-md); box-shadow: 0 2px 8px rgb(0 0 0 / 40%);
      }
      .viz-palette-group {
        font-size: var(--vscee-font-compact-xxs); font-weight: 600; text-transform: uppercase;
        color: var(--vscee-color-muted);
        padding: var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-xxs);
      }
      .viz-palette-option {
        display: flex; flex-direction: column; gap: 2px; width: 100%; cursor: pointer; text-align: left;
        background: transparent; border: none; color: var(--vscee-color-dropdown-foreground);
        padding: var(--vscee-space-xxs) var(--vscee-space-xs); border-radius: var(--vscee-radius-sm);

        &:hover { background: var(--vscee-color-list-hover); }
        &.selected { background: var(--vscee-color-list-selection-background); color: var(--vscee-color-list-selection-foreground); }
      }
      .viz-palette-option-name { font-size: var(--vscee-font-compact-sm); }
      .viz-palette-strip { display: block; height: 8px; border-radius: var(--vscee-radius-sm); }
    }
    .viz-legend {
      display: flex; flex-direction: column; gap: var(--vscee-space-xxs);
      max-height: 220px; overflow-y: auto; margin-top: var(--vscee-space-xs);
    }
    .viz-legend-row {
      display: flex; align-items: center; gap: var(--vscee-space-xxs);
      padding: var(--vscee-space-xxs); border-radius: var(--vscee-radius-sm);
      background: var(--vscee-color-editor-widget-background);
    }
    .viz-legend-value {
      width: 50px; background: var(--vscee-color-input-background); color: var(--vscee-color-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-legend-name {
      flex: 1; background: var(--vscee-color-input-background); color: var(--vscee-color-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border); border-radius: var(--vscee-radius-md); font-size: var(--vscee-font-compact-sm); padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-legend-index {
      width: 50px; flex-shrink: 0; padding-left: var(--vscee-space-xs);
      font-size: var(--vscee-font-compact-sm); color: var(--vscee-color-muted);
      font-variant-numeric: tabular-nums;
    }
    .viz-legend-hex {
      flex: 1; min-width: 0; font-family: var(--vscee-editor-font-family); font-size: var(--vscee-font-compact-sm);
      background: var(--vscee-color-input-background); color: var(--vscee-color-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border); border-radius: var(--vscee-radius-md);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-legend-del {
      width: 22px; height: 22px; box-shadow: none; opacity: 0.5;

      &:disabled { opacity: 0.2; cursor: default; }
    }
    .viz-legend-add { margin-top: var(--vscee-space-xs); align-self: flex-start; }
    .viz-range { flex: 1; min-width: 0; }
    .viz-range-value { width: 56px; font-variant-numeric: tabular-nums; }
    .viz-opacity-bar {
      display: flex; align-items: center; gap: var(--vscee-space-sm);
      padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-top: var(--vscee-border-sm) solid var(--vscee-color-widget-border);

      .viz-opacity-unit { font-size: var(--vscee-font-compact-sm); color: var(--vscee-color-muted); }
    }
    @keyframes mdi-spin { to { transform: rotate(360deg); } }
    .mdi-spin { animation: mdi-spin 1s linear infinite; display: inline-block; vertical-align: middle; }

  }
</style>
