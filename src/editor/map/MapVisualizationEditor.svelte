<!-- MapVisualizationEditor: visualization parameter dialog and editing logic -->
<script>
  import ColorPicker from './ColorPicker.svelte';
  import MapButton from './MapButton.svelte';
  import { vscode } from '../../shared/vscode.ts';
  import { trackViewportChanges } from '../../shared/viewportAnchor.ts';
  import {
    mdiCheck,
    mdiChevronDown,
    mdiClose,
    mdiCodeTags,
    mdiContentCopy,
    mdiLoading,
    mdiTrashCan,
  } from '../../shared/icons.ts';
  import {
    interpolateViridis,
    interpolateMagma,
    interpolatePlasma,
    interpolateInferno,
    interpolateCividis,
    interpolateTurbo,
    interpolateRdBu,
    interpolateRdYlGn,
    interpolateBrBG,
    interpolatePiYG,
    interpolateRdYlBu,
    interpolateSpectral,
    interpolateYlGnBu,
    interpolateYlOrRd,
    interpolateGreys,
    schemeCategory10,
    schemePaired,
    schemeSet1,
    schemeSet2,
    schemeSet3,
    schemeDark2,
  } from 'd3-scale-chromatic';

  let { map, overlays = $bindable([]) } = $props();

  // ----------------------------------------------------------------
  // PALETTES
  // ----------------------------------------------------------------

  function rgbToHex(rgb) {
    const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) {
      return rgb;
    }
    return '#' + [m[1], m[2], m[3]].map((v) => parseInt(v).toString(16).padStart(2, '0')).join('');
  }

  function sample(fn, n) {
    if (n < 2) {
      return [rgbToHex(fn(0.5))];
    }
    const colors = [];
    for (let i = 0; i < n; i++) {
      colors.push(rgbToHex(fn(i / (n - 1))));
    }
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

  let vizOpacityOriginal = 100;

  function paletteGradient(palette) {
    if (!palette || palette.length === 0) {
      return 'linear-gradient(to right, #000, #fff)';
    }
    const colors = palette.map((c) => (c.startsWith('#') ? c : '#' + c));
    return 'linear-gradient(to right, ' + colors.join(', ') + ')';
  }

  /** Hard-edged bands, so a discrete scheme never reads as a smooth ramp. */
  function paletteBlocks(colors) {
    const step = 100 / colors.length;
    return (
      'linear-gradient(to right, ' +
      colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ') +
      ')'
    );
  }

  /** Preview strip shown under a palette name in the palette dropdown. */
  function palettePreview(pal, discrete) {
    if (pal.colors) {
      return paletteBlocks(pal.colors.map(normalizeHex));
    }
    const colors = sample(pal.interpolate, PALETTE_PREVIEW_STOPS);
    return discrete ? paletteBlocks(colors) : paletteGradient(colors);
  }

  /** Pins the palette menu to its trigger in viewport space, so the dialog cannot clip it. */
  function anchorMenu(node) {
    const place = () => {
      const trigger = node.parentElement?.querySelector('.viz-palette-trigger');
      if (!trigger) {
        return;
      }
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
    if (v == null) {
      return '';
    }
    const n = Number(v);
    if (Number.isNaN(n)) {
      return String(v);
    }
    if (Number.isInteger(n)) {
      return String(n);
    }
    return n.toPrecision(4);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ----------------------------------------------------------------
  // VIZ EDITOR
  // ----------------------------------------------------------------

  function applyVisParams(vp) {
    const bands = vp.bands || [];
    const isCat = Array.isArray(vp.values) && vp.values.length > 0;

    if (isCat) {
      vizType = 'categorical';
    } else if (vp.palette && bands.length <= 1) {
      vizType = 'continuous';
    } else {
      vizType = 'rgb';
    }

    const minArr = Array.isArray(vp.min) ? vp.min : [vp.min];
    const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max];

    // RGB
    if (bands.length >= 3) {
      vizRgbR = bands[0];
      vizRgbG = bands[1];
      vizRgbB = bands[2];
    }
    vizRgbRMin = minArr[0] != null ? String(minArr[0]) : '';
    vizRgbRMax = maxArr[0] != null ? String(maxArr[0]) : '';
    vizRgbGMin = String(minArr[1] ?? minArr[0] ?? '');
    vizRgbGMax = String(maxArr[1] ?? maxArr[0] ?? '');
    vizRgbBMin = String(minArr[2] ?? minArr[0] ?? '');
    vizRgbBMax = String(maxArr[2] ?? maxArr[0] ?? '');
    if (vp.gamma) {
      vizRgbGamma = String(Array.isArray(vp.gamma) ? vp.gamma[0] : vp.gamma);
    } else {
      vizRgbGamma = '1';
    }

    // HSV
    if (bands.length >= 3) {
      vizHsvH = bands[0];
      vizHsvS = bands[1];
      vizHsvV = bands[2];
    }
    vizHsvHMin = minArr[0] != null ? String(minArr[0]) : '';
    vizHsvHMax = maxArr[0] != null ? String(maxArr[0]) : '';
    vizHsvSMin = String(minArr[1] ?? minArr[0] ?? '');
    vizHsvSMax = String(maxArr[1] ?? maxArr[0] ?? '');
    vizHsvVMin = String(minArr[2] ?? minArr[0] ?? '');
    vizHsvVMax = String(maxArr[2] ?? maxArr[0] ?? '');

    // Continuous
    if (bands.length >= 1) {
      vizContBand = bands[0];
    }
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
    if (bands.length >= 1) {
      vizCatBand = bands[0];
    }
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
      if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) {
        return null;
      }
      const config = { vizType, bands, min, max };
      if (isRgb) {
        const gamma = parseFloat(vizRgbGamma);
        if (gamma && gamma !== 1) {
          config.gamma = gamma;
        }
      }
      return config;
    }
    if (vizType === 'continuous') {
      const min = parseFloat(vizContMin);
      const max = parseFloat(vizContMax);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return null;
      }
      return {
        vizType: 'continuous',
        bands: [vizContBand],
        min: [min],
        max: [max],
        palette: [...vizContColors],
      };
    }
    if (vizType === 'categorical') {
      const values = [],
        labels = [],
        palette = [];
      for (const row of vizCatRows) {
        const v = parseInt(row.value);
        if (!isNaN(v)) {
          values.push(v);
          labels.push(row.label || 'Class ' + values.length);
          palette.push(row.color);
        }
      }
      return { vizType: 'categorical', bands: [vizCatBand], values, labels, palette };
    }
    return null;
  }

  function vizApply() {
    const config = collectVisParams();
    if (!config) {
      return;
    }
    const opacity = clampOpacityPercent(vizOpacity) / 100;
    vscode.postMessage({
      type: 'updateViz',
      data: { layerIndex: vizLayerIndex, opacity, ...config },
    });
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
    if (!config) {
      return 'Complete the visualization parameters first.';
    }
    const opacity = String(clampOpacityPercent(vizOpacity) / 100);
    const entries = [['bands', jsonList(config.bands, true)]];

    if (config.vizType === 'categorical') {
      if (config.values.length === 0) {
        return 'Add at least one class first.';
      }
      entries.push(['min', String(Math.min(...config.values))]);
      entries.push(['max', String(Math.max(...config.values))]);
      entries.push(['palette', jsonList(config.palette, true)]);
      entries.push(['opacity', opacity]);
      return jsonDict(entries);
    }

    const single = config.bands.length === 1;
    entries.push(['min', single ? String(config.min[0]) : jsonList(config.min)]);
    entries.push(['max', single ? String(config.max[0]) : jsonList(config.max)]);
    if (config.gamma) {
      entries.push(['gamma', String(config.gamma)]);
    }
    if (config.palette) {
      entries.push(['palette', jsonList(config.palette, true)]);
    }
    entries.push(['opacity', opacity]);
    return jsonDict(entries);
  }

  const JSON_TOKEN =
    /("(?:\\.|[^"\\])*")(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g;

  function highlightJson(text) {
    const tokens = [];
    let last = 0;
    JSON_TOKEN.lastIndex = 0;
    let match;
    while ((match = JSON_TOKEN.exec(text)) !== null) {
      if (match.index > last) {
        tokens.push({ kind: 'punct', text: text.slice(last, match.index) });
      }
      const raw = match[0];
      let kind = 'num';
      if (match[1]) {
        kind = 'key';
      } else if (raw.startsWith('"')) {
        kind = 'str';
      } else if (raw === 'true' || raw === 'false' || raw === 'null') {
        kind = 'bool';
      }
      tokens.push({ kind, text: raw });
      last = match.index + raw.length;
    }
    if (last < text.length) {
      tokens.push({ kind: 'punct', text: text.slice(last) });
    }
    return tokens;
  }

  const vizJsonText = $derived.by(() => (vizCodeVisible ? buildVizJson() : ''));
  const vizJsonTokens = $derived.by(() => highlightJson(vizJsonText));

  async function copyVizJson() {
    try {
      await navigator.clipboard.writeText(vizJsonText);
      vizCodeCopied = true;
      setTimeout(() => {
        vizCodeCopied = false;
      }, 1500);
    } catch {
      vizCodeCopied = false;
    }
  }

  /** Bands whose range the active viz type exposes, deduplicated. */ function stretchBands() {
    let bands = [];
    if (vizType === 'rgb') {
      bands = [vizRgbR, vizRgbG, vizRgbB];
    } else if (vizType === 'hsv') {
      bands = [vizHsvH, vizHsvS, vizHsvV];
    } else if (vizType === 'continuous') {
      bands = [vizContBand];
    }
    return [...new Set(bands.filter(Boolean))];
  }

  /** Metres per screen pixel at the current zoom and latitude. */
  function viewportScale() {
    const lat = map.getCenter().lat;
    return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
  }

  function applyStretch(mode) {
    vizStretch = mode;
    vizStretchError = '';
    if (mode === 'custom') {
      return;
    }
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
      const r = pick(vizRgbR),
        g = pick(vizRgbG),
        b = pick(vizRgbB);
      if (r) {
        vizRgbRMin = fmtVal(r.min);
        vizRgbRMax = fmtVal(r.max);
      }
      if (g) {
        vizRgbGMin = fmtVal(g.min);
        vizRgbGMax = fmtVal(g.max);
      }
      if (b) {
        vizRgbBMin = fmtVal(b.min);
        vizRgbBMax = fmtVal(b.max);
      }
    } else if (vizType === 'hsv') {
      const h = pick(vizHsvH),
        s = pick(vizHsvS),
        v = pick(vizHsvV);
      if (h) {
        vizHsvHMin = fmtVal(h.min);
        vizHsvHMax = fmtVal(h.max);
      }
      if (s) {
        vizHsvSMin = fmtVal(s.min);
        vizHsvSMax = fmtVal(s.max);
      }
      if (v) {
        vizHsvVMin = fmtVal(v.min);
        vizHsvVMax = fmtVal(v.max);
      }
    } else if (vizType === 'continuous') {
      const c = pick(vizContBand);
      if (c) {
        vizContMin = fmtVal(c.min);
        vizContMax = fmtVal(c.max);
      }
    }
  }

  /** A hand-edited bound no longer matches the selected stretch preset. */
  function markRangeCustom() {
    vizStretch = 'custom';
    vizStretchError = '';
  }

  function clampOpacityPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return 100;
    }
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  /** Applies an opacity percentage to the edited layer without leaving the dialog. */
  function setVizOpacity(percent) {
    vizOpacity = clampOpacityPercent(percent);
    const entry = overlays.find((o) => o.layerIndex === vizLayerIndex);
    if (!entry) {
      return;
    }
    entry.opacity = vizOpacity / 100;
    entry.tileLayer.setOpacity(entry.opacity);
    overlays = [...overlays];
  }

  function setVizGamma(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return;
    }
    vizRgbGamma = String(Math.max(0.1, Math.min(5, Math.round(n * 10) / 10)));
  }

  /** Share of the track left of the thumb, feeding the `--slider-fill` custom property. */
  function sliderFill(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return 0;
    }
    return Math.round(Math.max(0, Math.min(1, (n - min) / (max - min))) * 100);
  }

  function vizApplyPreset(idx) {
    const p = vizPresets[idx];
    if (!p) {
      return;
    }
    const vp = { bands: p.bands || [] };
    if (p.min) {
      vp.min = p.min;
    }
    if (p.max) {
      vp.max = p.max;
    }
    if (p.palette) {
      vp.palette = p.palette;
    }
    if (p.gamma) {
      vp.gamma = p.gamma;
    }
    if (p.labels) {
      vp.labels = p.labels;
    }
    if (p.values) {
      vp.values = p.values;
    }
    const typeMap = {
      rgb: 'rgb',
      hsv: 'hsv',
      continuous: 'continuous',
      categorical: 'categorical',
    };
    vizType = typeMap[p.type] || 'rgb';
    applyVisParams(vp);
  }

  /** `<input type="color">` only accepts a 6-digit `#rrggbb` value. */
  function normalizeHex(color) {
    let hex = String(color).trim();
    if (!hex.startsWith('#')) {
      hex = '#' + hex;
    }
    if (hex.length === 4) {
      hex =
        '#' +
        hex
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('');
    }
    return hex.slice(0, 7).toLowerCase();
  }

  function selectContPalette(name) {
    vizContPaletteName = name;
    const pal = CONTINUOUS_PALETTES.find((p) => p.name === name);
    if (pal) {
      vizContColors = sample(pal.interpolate, vizContColorCount);
    }
  }

  function setContColorCount(value) {
    const n = Math.max(
      MIN_PALETTE_COLORS,
      Math.min(MAX_PALETTE_COLORS, Math.round(Number(value) || 0)),
    );
    vizContColorCount = n;
    const pal = CONTINUOUS_PALETTES.find((p) => p.name === vizContPaletteName);
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
    if (!hex || hex === vizContColors[index]) {
      return;
    }
    vizContColors = vizContColors.map((c, i) => (i === index ? hex : c));
    markPaletteCustom();
  }

  /** Typed hex entry for a class row: mirrors `setContColor`. */
  function setCatColor(index, text, allowShort = false) {
    const hex = parseHex(text, allowShort);
    if (!hex || hex === vizCatRows[index].color) {
      return;
    }
    vizCatRows[index].color = hex;
    vizCatPaletteName = '';
  }

  function removeContColor(index) {
    if (vizContColors.length <= MIN_PALETTE_COLORS) {
      return;
    }
    vizContColors = vizContColors.filter((_, i) => i !== index);
    vizContColorCount = vizContColors.length;
    markPaletteCustom();
  }

  function addContColor() {
    if (vizContColors.length >= MAX_PALETTE_COLORS) {
      return;
    }
    vizContColors = [...vizContColors, vizContColors[vizContColors.length - 1] ?? '#4285f4'];
    vizContColorCount = vizContColors.length;
    markPaletteCustom();
  }

  // ----------------------------------------------------------------
  // VIZ EDITOR — CLASSIFICATION
  // ----------------------------------------------------------------

  /** `n` discrete colours from a scheme, cycling schemes and sampling ramps. */
  function schemeColors(name, n) {
    const discrete = CATEGORICAL_PALETTES.find((p) => p.name === name);
    if (discrete) {
      return Array.from({ length: n }, (_, i) =>
        normalizeHex(discrete.colors[i % discrete.colors.length]),
      );
    }
    const ramp = CONTINUOUS_PALETTES.find((p) => p.name === name);
    return ramp ? sample(ramp.interpolate, n) : [];
  }

  function selectCatPalette(name) {
    vizCatPaletteName = name;
    const colors = schemeColors(name, vizCatRows.length);
    if (colors.length === 0) {
      return;
    }
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

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'vizEditorData') {
      vizLayerIndex = msg.data.layerIndex;
      vizBands = msg.data.bands || [];
      vizPresets = msg.data.presets || [];
      applyVisParams(msg.data.currentVisParams || {});
      vizOpacityOriginal = clampOpacityPercent((msg.data.opacity ?? 1) * 100);
      vizOpacity = vizOpacityOriginal;
      vizStretch = 'custom';
      vizStretchError = '';
      vizVisible = true;
    } else if (msg.type === 'vizStretch') {
      vizComputing = false;
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
    }
  });

  $effect(() => {
    if (
      vizVisible &&
      vizLayerIndex >= 0 &&
      !overlays.some((entry) => entry.layerIndex === vizLayerIndex)
    ) {
      vizVisible = false;
    }
  });
</script>

<!-- VIZ EDITOR OVERLAY -->
{#snippet stretchRow()}
  <div class="viz-channel-row">
    <span class="viz-channel-label">Range</span>
    <select
      class="viz-band-select"
      disabled={vizComputing}
      value={vizStretch}
      onchange={(e) => applyStretch(e.target.value)}
    >
      {#each STRETCH_MODES as mode}
        <option value={mode.id}>{mode.label}</option>
      {/each}
    </select>
    {#if vizComputing}
      <span class="viz-stretch-status">
        <svg
          class="mdi-spin"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          aria-hidden="true"
          fill="currentColor"><path d={mdiLoading} /></svg
        >
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
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"
        ><path d={mdiChevronDown} /></svg
      >
    </button>
    {#if open}
      <div class="viz-palette-backdrop" role="presentation" onclick={toggle}></div>
      <div class="viz-palette-menu" use:anchorMenu>
        {#each groups as group}
          <div class="viz-palette-group">{group.label}</div>
          {#each group.items as pal}
            <button
              type="button"
              class="viz-palette-option"
              class:selected={pal.name === current}
              onclick={() => pick(pal.name)}
            >
              <span class="viz-palette-option-name">{pal.name}</span>
              <span class="viz-palette-strip" style="background:{palettePreview(pal, discrete)}"
              ></span>
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
          <select
            class="viz-preset-select"
            onchange={(e) => vizApplyPreset(parseInt(e.target.value))}
          >
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
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"
            ><path d={mdiClose} /></svg
          >
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
            <input
              class="viz-input"
              placeholder="Min"
              bind:value={vizRgbRMin}
              oninput={markRangeCustom}
            />
            <input
              class="viz-input"
              placeholder="Max"
              bind:value={vizRgbRMax}
              oninput={markRangeCustom}
            />
          </div>
          <div class="viz-channel-row">
            <span class="viz-channel-label">Green</span>
            <select class="viz-band-select" bind:value={vizRgbG}>
              <option value="">—</option>
              {#each vizBands as b}<option value={b}>{b}</option>{/each}
            </select>
            <input
              class="viz-input"
              placeholder="Min"
              bind:value={vizRgbGMin}
              oninput={markRangeCustom}
            />
            <input
              class="viz-input"
              placeholder="Max"
              bind:value={vizRgbGMax}
              oninput={markRangeCustom}
            />
          </div>
          <div class="viz-channel-row">
            <span class="viz-channel-label">Blue</span>
            <select class="viz-band-select" bind:value={vizRgbB}>
              <option value="">—</option>
              {#each vizBands as b}<option value={b}>{b}</option>{/each}
            </select>
            <input
              class="viz-input"
              placeholder="Min"
              bind:value={vizRgbBMin}
              oninput={markRangeCustom}
            />
            <input
              class="viz-input"
              placeholder="Max"
              bind:value={vizRgbBMax}
              oninput={markRangeCustom}
            />
          </div>
          {@render stretchRow()}
          <div class="viz-channel-row">
            <span class="viz-channel-label">Gamma</span>
            <input
              type="range"
              class="range-slider viz-range"
              min="0.1"
              max="5"
              step="0.1"
              style="--slider-fill: {sliderFill(vizRgbGamma, 0.1, 5)}%"
              value={vizRgbGamma}
              oninput={(e) => setVizGamma(e.target.value)}
            />
            <input
              type="number"
              class="viz-input viz-range-value"
              min="0.1"
              max="5"
              step="0.1"
              value={vizRgbGamma}
              oninput={(e) => setVizGamma(e.target.value)}
            />
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
            <input
              class="viz-input"
              placeholder="Min"
              bind:value={vizHsvHMin}
              oninput={markRangeCustom}
            />
            <input
              class="viz-input"
              placeholder="Max"
              bind:value={vizHsvHMax}
              oninput={markRangeCustom}
            />
          </div>
          <div class="viz-channel-row">
            <span class="viz-channel-label">Saturation</span>
            <select class="viz-band-select" bind:value={vizHsvS}>
              <option value="">—</option>
              {#each vizBands as b}<option value={b}>{b}</option>{/each}
            </select>
            <input
              class="viz-input"
              placeholder="Min"
              bind:value={vizHsvSMin}
              oninput={markRangeCustom}
            />
            <input
              class="viz-input"
              placeholder="Max"
              bind:value={vizHsvSMax}
              oninput={markRangeCustom}
            />
          </div>
          <div class="viz-channel-row">
            <span class="viz-channel-label">Value</span>
            <select class="viz-band-select" bind:value={vizHsvV}>
              <option value="">—</option>
              {#each vizBands as b}<option value={b}>{b}</option>{/each}
            </select>
            <input
              class="viz-input"
              placeholder="Min"
              bind:value={vizHsvVMin}
              oninput={markRangeCustom}
            />
            <input
              class="viz-input"
              placeholder="Max"
              bind:value={vizHsvVMax}
              oninput={markRangeCustom}
            />
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
            <input
              class="viz-input"
              placeholder="Min"
              bind:value={vizContMin}
              oninput={markRangeCustom}
            />
            <input
              class="viz-input"
              placeholder="Max"
              bind:value={vizContMax}
              oninput={markRangeCustom}
            />
          </div>
          {@render stretchRow()}
          <div class="viz-section-label">Palette</div>
          <div class="viz-channel-row">
            <span class="viz-channel-label">Colours</span>
            <input
              type="number"
              class="viz-input"
              min={MIN_PALETTE_COLORS}
              max={MAX_PALETTE_COLORS}
              step="1"
              value={vizContColorCount}
              oninput={(e) => setContColorCount(e.target.value)}
            />
            {@render paletteSelect(
              vizContPaletteName,
              vizContPaletteOpen,
              CONTINUOUS_PALETTE_GROUPS,
              false,
              () => {
                vizContPaletteOpen = !vizContPaletteOpen;
              },
              (name) => {
                vizContPaletteOpen = false;
                selectContPalette(name);
              },
            )}
          </div>
          {#if vizContColors.length > 0}
            <div class="viz-ramp-preview" style="background:{paletteGradient(vizContColors)}"></div>
            <div class="viz-legend">
              {#each vizContColors as color, i}
                <div class="viz-legend-row">
                  <ColorPicker
                    bind:value={vizContColors[i]}
                    onChange={markPaletteCustom}
                    label="Colour {i + 1}"
                  />
                  <span class="viz-legend-index">{i + 1}</span>
                  <input
                    type="text"
                    class="viz-legend-hex"
                    spellcheck="false"
                    maxlength="7"
                    value={color}
                    aria-label="Hex colour {i + 1}"
                    oninput={(e) => setContColor(i, e.target.value)}
                    onblur={(e) => {
                      setContColor(i, e.target.value, true);
                      e.target.value = vizContColors[i];
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') {
                        e.target.blur();
                      }
                    }}
                  />
                  <MapButton
                    class="viz-legend-del"
                    title="Remove colour"
                    disabled={vizContColors.length <= MIN_PALETTE_COLORS}
                    onclick={() => removeContColor(i)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      aria-hidden="true"
                      fill="currentColor"><path d={mdiTrashCan} /></svg
                    >
                  </MapButton>
                </div>
              {/each}
            </div>
          {:else}
            <p class="viz-ramp-hint">Pick a preset to build the colour ramp.</p>
          {/if}
          <button
            class="viz-btn viz-btn-secondary viz-legend-add"
            disabled={vizContColors.length >= MAX_PALETTE_COLORS}
            onclick={addContColor}>+ Add colour</button
          >
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
              vizCatPaletteName,
              vizCatPaletteOpen,
              CATEGORICAL_PALETTE_GROUPS,
              true,
              () => {
                vizCatPaletteOpen = !vizCatPaletteOpen;
              },
              (name) => {
                vizCatPaletteOpen = false;
                selectCatPalette(name);
              },
            )}
            <button
              class="viz-btn viz-btn-secondary"
              disabled={vizCatDetecting}
              onclick={autoDetectClasses}
              title="Replace the legend with the classes present in the visible area"
            >
              {vizCatDetecting ? 'Detecting…' : 'Detect'}
            </button>
          </div>
          {#if vizCatNotice}
            <p class="viz-stretch-error">{vizCatNotice}</p>
          {/if}
          {#if vizCatRows.length > 0}
            <div
              class="viz-ramp-preview"
              style="background:{paletteBlocks(vizCatRows.map((r) => normalizeHex(r.color)))}"
            ></div>
          {/if}
          <div class="viz-legend">
            {#each vizCatRows as row, i}
              <div class="viz-legend-row">
                <ColorPicker
                  bind:value={row.color}
                  onChange={() => {
                    vizCatPaletteName = '';
                  }}
                  label="Colour for class {i + 1}"
                />
                <input
                  type="text"
                  class="viz-legend-hex"
                  spellcheck="false"
                  maxlength="7"
                  value={row.color}
                  aria-label="Hex colour for class {i + 1}"
                  oninput={(e) => setCatColor(i, e.target.value)}
                  onblur={(e) => {
                    setCatColor(i, e.target.value, true);
                    e.target.value = row.color;
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.target.blur();
                    }
                  }}
                />
                <input
                  type="number"
                  class="viz-legend-value"
                  placeholder="Value"
                  bind:value={row.value}
                />
                <input
                  type="text"
                  class="viz-legend-name"
                  placeholder="Name"
                  bind:value={row.label}
                />
                <MapButton
                  class="viz-legend-del"
                  title="Remove class"
                  onclick={() => vizRemoveCatRow(i)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    aria-hidden="true"
                    fill="currentColor"><path d={mdiTrashCan} /></svg
                  >
                </MapButton>
              </div>
            {/each}
          </div>
          <button class="viz-btn viz-btn-secondary viz-legend-add" onclick={vizAddCatRow}
            >+ Add class</button
          >
        {/if}
      </div>
      <!-- Opacity (all viz types) -->
      <div class="viz-opacity-bar">
        <span class="viz-channel-label">Opacity</span>
        <input
          type="range"
          class="range-slider viz-range"
          min="0"
          max="100"
          step="1"
          style="--slider-fill: {sliderFill(vizOpacity, 0, 100)}%"
          value={vizOpacity}
          oninput={(e) => setVizOpacity(e.target.value)}
        />
        <input
          type="number"
          class="viz-input viz-range-value"
          min="0"
          max="100"
          step="1"
          value={vizOpacity}
          oninput={(e) => setVizOpacity(e.target.value)}
        />
        <span class="viz-opacity-unit">%</span>
      </div>
      <!-- Footer -->
      <div class="viz-editor-footer">
        <button
          class="viz-btn viz-btn-secondary viz-btn-code"
          title="Show these parameters as JSON"
          onclick={() => {
            vizCodeVisible = true;
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"
            ><path d={mdiCodeTags} /></svg
          >
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
        <MapButton
          class="viz-close-btn"
          title="Close"
          onclick={() => {
            vizCodeVisible = false;
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"
            ><path d={mdiClose} /></svg
          >
        </MapButton>
      </div>
      <div class="viz-editor-body">
        <div class="viz-code-wrap">
          <MapButton
            class="viz-code-copy"
            title={vizCodeCopied ? 'Copied' : 'Copy'}
            onclick={copyVizJson}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"
              ><path d={vizCodeCopied ? mdiCheck : mdiContentCopy} /></svg
            >
          </MapButton>
          <pre class="viz-code-block">{#each vizJsonTokens as token}<span class="json-{token.kind}"
                >{token.text}</span
              >{/each}</pre>
        </div>
      </div>
      <div class="viz-editor-footer">
        <button
          class="viz-btn viz-btn-primary"
          onclick={() => {
            vizCodeVisible = false;
          }}>Close</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  :global {
    /* ==================================================================
       VISUALIZATION EDITOR
       ================================================================== */
    .viz-editor-overlay {
      position: absolute;
      inset: 0;
      z-index: 2000;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .viz-editor-dialog {
      background: var(--vscee-color-editor-background);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-lg);
      box-shadow: var(--vscee-shadow-xl);
      width: 420px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .viz-editor-header {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-md);
      padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      font-size: var(--vscee-font-compact-md);
      font-weight: 600;
      color: var(--vscee-color-foreground);
    }
    .viz-editor-header span {
      flex: 1;
    }
    .viz-type-select,
    .viz-preset-select {
      background: var(--vscee-color-dropdown-background);
      color: var(--vscee-color-dropdown-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-dropdown-border);
      border-radius: var(--vscee-radius-md);
      font-size: var(--vscee-font-compact-sm);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-preset-select {
      max-width: 140px;
    }
    .viz-close-btn {
      width: 22px;
      height: 22px;
      box-shadow: none;
      opacity: 0.6;
    }
    .viz-editor-body {
      overflow-y: auto;
      padding: var(--vscee-space-lg);
      flex: 1;
    }
    .viz-editor-footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--vscee-space-sm);
      padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-top: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    }
    .viz-btn {
      font-size: var(--vscee-font-compact-sm);
      padding: var(--vscee-space-xs) var(--vscee-space-lg);
      border: var(--vscee-border-sm) solid var(--vscee-color-button-border, transparent);
      border-radius: var(--vscee-radius-md);
      cursor: pointer;
      color: var(--vscee-color-foreground);
      background: transparent;
    }
    .viz-btn-primary {
      background: var(--vscee-color-button-background);
      color: var(--vscee-color-button-foreground);
    }
    .viz-btn-primary:hover {
      background: var(--vscee-color-button-hover);
    }
    .viz-btn-secondary {
      background: var(--vscee-color-button-secondary-background);
      color: var(--vscee-color-button-secondary-foreground);
    }
    .viz-btn-code {
      display: inline-flex;
      align-items: center;
      gap: var(--vscee-space-xs);
      margin-right: auto;
      padding-inline: var(--vscee-space-md);
    }
    .viz-code-overlay {
      z-index: 2600;
    }
    .viz-code-dialog {
      width: 520px;
    }
    .viz-code-wrap {
      position: relative;

      .viz-code-copy {
        position: absolute;
        top: var(--vscee-space-xs);
        right: var(--vscee-space-xs);
        width: 24px;
        height: 24px;
      }
    }
    .viz-code-block {
      font-family: var(--vscee-editor-font-family, monospace);
      font-size: var(--vscee-font-compact-sm);
      line-height: 1.5;
      white-space: pre;
      overflow-x: auto;
      tab-size: 4;
      color: var(--vscee-color-editor-foreground);
      background: var(--vscee-color-code-background);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-md);
      padding: var(--vscee-space-md);
      padding-right: calc(var(--vscee-space-md) + 24px);

      .json-key {
        color: var(--vscee-color-code-key, var(--vscee-color-chart-blue));
      }
      .json-str {
        color: var(--vscee-color-code-string, var(--vscee-color-chart-orange));
      }
      .json-num {
        color: var(--vscee-color-code-number, var(--vscee-color-chart-green));
      }
      .json-bool {
        color: var(--vscee-color-code-boolean, var(--vscee-color-chart-purple));
      }
      .json-punct {
        color: var(--vscee-color-muted);
      }
    }
    .viz-section-label {
      font-size: var(--vscee-font-compact-xs);
      font-weight: 600;
      color: var(--vscee-color-muted);
      text-transform: uppercase;
      margin: var(--vscee-space-lg) 0 var(--vscee-space-xs);
    }
    .viz-channel-row {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      margin-bottom: var(--vscee-space-sm);
    }
    .viz-channel-label {
      width: 60px;
      flex-shrink: 0;
      font-size: var(--vscee-font-compact-sm);
      color: var(--vscee-color-muted);
    }
    .viz-band-select {
      flex: 1;
      min-width: 0;
      background: var(--vscee-color-dropdown-background);
      color: var(--vscee-color-dropdown-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-dropdown-border);
      border-radius: var(--vscee-radius-md);
      font-size: var(--vscee-font-compact-sm);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-input {
      width: 60px;
      background: var(--vscee-color-input-background);
      color: var(--vscee-color-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
      border-radius: var(--vscee-radius-md);
      font-size: var(--vscee-font-compact-sm);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-stretch-status {
      display: inline-flex;
      color: var(--vscee-color-muted);
    }
    .viz-stretch-error {
      font-size: var(--vscee-font-compact-xs);
      color: var(--vscee-color-error);
      margin-bottom: var(--vscee-space-sm);
    }
    .viz-ramp-preview {
      height: 14px;
      border-radius: var(--vscee-radius-sm);
      margin-top: var(--vscee-space-xs);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    }
    .viz-ramp-hint {
      font-size: var(--vscee-font-compact-xs);
      color: var(--vscee-color-muted);
      margin-top: var(--vscee-space-xs);
    }
    .viz-palette-select {
      position: relative;
      flex: 1;
      min-width: 0;

      .viz-palette-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--vscee-space-xs);
        width: 100%;
        cursor: pointer;
        text-align: left;
        background: var(--vscee-color-dropdown-background);
        color: var(--vscee-color-dropdown-foreground);
        border: var(--vscee-border-sm) solid var(--vscee-color-dropdown-border);
        border-radius: var(--vscee-radius-md);
        font-size: var(--vscee-font-compact-sm);
        padding: var(--vscee-space-xxs) var(--vscee-space-xs);
      }
      .viz-palette-current {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* Swallows the next click so the menu closes when focus goes elsewhere. */
      .viz-palette-backdrop {
        position: fixed;
        inset: 0;
        z-index: 3000;
      }
      .viz-palette-menu {
        position: fixed;
        z-index: 3001;
        overflow-y: auto;
        padding: var(--vscee-space-xxs);
        background: var(--vscee-color-dropdown-background);
        border: var(--vscee-border-sm) solid var(--vscee-color-dropdown-border);
        border-radius: var(--vscee-radius-md);
        box-shadow: 0 2px 8px rgb(0 0 0 / 40%);
      }
      .viz-palette-group {
        font-size: var(--vscee-font-compact-xxs);
        font-weight: 600;
        text-transform: uppercase;
        color: var(--vscee-color-muted);
        padding: var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-xxs);
      }
      .viz-palette-option {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        cursor: pointer;
        text-align: left;
        background: transparent;
        border: none;
        color: var(--vscee-color-dropdown-foreground);
        padding: var(--vscee-space-xxs) var(--vscee-space-xs);
        border-radius: var(--vscee-radius-sm);

        &:hover {
          background: var(--vscee-color-list-hover);
        }
        &.selected {
          background: var(--vscee-color-list-selection-background);
          color: var(--vscee-color-list-selection-foreground);
        }
      }
      .viz-palette-option-name {
        font-size: var(--vscee-font-compact-sm);
      }
      .viz-palette-strip {
        display: block;
        height: 8px;
        border-radius: var(--vscee-radius-sm);
      }
    }
    .viz-legend {
      display: flex;
      flex-direction: column;
      gap: var(--vscee-space-xxs);
      max-height: 220px;
      overflow-y: auto;
      margin-top: var(--vscee-space-xs);
    }
    .viz-legend-row {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-xxs);
      padding: var(--vscee-space-xxs);
      border-radius: var(--vscee-radius-sm);
      background: var(--vscee-color-editor-widget-background);
    }
    .viz-legend-value {
      width: 50px;
      background: var(--vscee-color-input-background);
      color: var(--vscee-color-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
      border-radius: var(--vscee-radius-md);
      font-size: var(--vscee-font-compact-sm);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-legend-name {
      flex: 1;
      background: var(--vscee-color-input-background);
      color: var(--vscee-color-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
      border-radius: var(--vscee-radius-md);
      font-size: var(--vscee-font-compact-sm);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-legend-index {
      width: 50px;
      flex-shrink: 0;
      padding-left: var(--vscee-space-xs);
      font-size: var(--vscee-font-compact-sm);
      color: var(--vscee-color-muted);
      font-variant-numeric: tabular-nums;
    }
    .viz-legend-hex {
      flex: 1;
      min-width: 0;
      font-family: var(--vscee-editor-font-family);
      font-size: var(--vscee-font-compact-sm);
      background: var(--vscee-color-input-background);
      color: var(--vscee-color-input-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
      border-radius: var(--vscee-radius-md);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
    }
    .viz-legend-del {
      width: 22px;
      height: 22px;
      box-shadow: none;
      opacity: 0.5;

      &:disabled {
        opacity: 0.2;
        cursor: default;
      }
    }
    .viz-legend-add {
      margin-top: var(--vscee-space-xs);
      align-self: flex-start;
    }
    .viz-range {
      flex: 1;
      min-width: 0;
    }
    .viz-range-value {
      width: 56px;
      font-variant-numeric: tabular-nums;
    }
    .viz-opacity-bar {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-top: var(--vscee-border-sm) solid var(--vscee-color-widget-border);

      .viz-opacity-unit {
        font-size: var(--vscee-font-compact-sm);
        color: var(--vscee-color-muted);
      }
    }
    @keyframes mdi-spin {
      to {
        transform: rotate(360deg);
      }
    }
    .mdi-spin {
      animation: mdi-spin 1s linear infinite;
      display: inline-block;
      vertical-align: middle;
    }
  }
</style>
