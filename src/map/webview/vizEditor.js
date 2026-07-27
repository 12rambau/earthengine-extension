/**
 * @module vizEditor
 * Modal dialog for editing Earth Engine layer visualization parameters.
 *
 * Supports four visualization types (RGB, HSV, Continuous, Categorical)
 * and SEPAL preset selection.  Communicates with the extension host via
 * custom DOM events (openVizEditor) and vscode.postMessage.
 */

import { SEQUENTIAL_PALETTES, DIVERGING_PALETTES, CATEGORICAL_PALETTES } from './palettes.js';

// ==================================================================
// STATE
// ==================================================================

let _vscode;
let _overlay = null; // The overlay div element
let _currentLayerIndex = -1;
let _bands = [];
let _presets = [];

// ==================================================================
// INIT
// ==================================================================

/**
 * Wires the editor to the VS Code messaging API and creates the overlay DOM.
 *
 * @param {{ postMessage(msg: unknown): void }} vscode
 */
export function initVizEditor(vscode) {
  _vscode = vscode;
  _overlay = buildOverlay();
  document.body.appendChild(_overlay);

  // Listen for cog button clicks dispatched by layersPanel
  document.addEventListener('openVizEditor', (e) => {
    _currentLayerIndex = e.detail.layerIndex;
    _vscode.postMessage({ type: 'openVizEditor', data: { layerIndex: _currentLayerIndex } });
  });
}

/**
 * Opens the editor dialog with data received from the extension host.
 *
 * @param {{ layerIndex: number, bands: string[], minMax: Object, currentVisParams: Object, presets: Array }} data
 */
export function handleVizEditorData(data) {
  _currentLayerIndex = data.layerIndex;
  _bands = data.bands || [];
  _presets = data.presets || [];

  populateBandSelects(_bands);
  populatePresets(_presets);
  applyVisParams(data.currentVisParams || {});

  _overlay.classList.add('visible');
}

/**
 * Updates min/max fields after async computation from the host.
 *
 * @param {{ layerIndex: number, minMax: Object }} data
 */
export function handleVizMinMax(data) {
  if (data.layerIndex !== _currentLayerIndex) {
    return;
  }
  const btn = _overlay.querySelector('.viz-compute-btn');
  if (btn) {
    btn.textContent = 'Compute';
    btn.disabled = false;
  }
  if (!data.minMax) {
    return;
  }
  // Store for later use and auto-fill if fields are empty
  _overlay._minMaxData = data.minMax;
  autoFillMinMax(data.minMax);
}

// ==================================================================
// DOM CONSTRUCTION
// ==================================================================

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'viz-editor-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'viz-editor-dialog';

  // ── Header ───────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'viz-editor-header';

  const title = document.createElement('span');
  title.textContent = 'Visualization';
  header.appendChild(title);

  // Presets dropdown (populated later, hidden when empty)
  const presetSelect = document.createElement('select');
  presetSelect.className = 'viz-preset-select';
  presetSelect.style.display = 'none';
  presetSelect.addEventListener('change', () => {
    const idx = parseInt(presetSelect.value);
    if (isNaN(idx) || idx < 0) {
      return;
    }
    const p = _presets[idx];
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
    const editorType = typeMap[p.type] || 'rgb';
    typeSelect.value = editorType;
    showTypeEditor(editorType);
    applyVisParams(vp);
  });
  header.appendChild(presetSelect);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'viz-type-select';
  ['rgb', 'hsv', 'continuous', 'categorical'].forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    typeSelect.appendChild(opt);
  });
  typeSelect.addEventListener('change', () => showTypeEditor(typeSelect.value));
  header.appendChild(typeSelect);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'map-btn viz-close-btn';
  closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  closeBtn.addEventListener('click', () => close());
  header.appendChild(closeBtn);

  dialog.appendChild(header);

  // ── Body ────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'viz-editor-body';
  body.appendChild(buildRgbEditor());
  body.appendChild(buildHsvEditor());
  body.appendChild(buildContinuousEditor());
  body.appendChild(buildCategoricalEditor());
  dialog.appendChild(body);

  // ── Footer ──────────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.className = 'viz-editor-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'viz-btn viz-btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => close());

  const applyBtn = document.createElement('button');
  applyBtn.className = 'viz-btn viz-btn-primary';
  applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', () => apply());

  footer.appendChild(cancelBtn);
  footer.appendChild(applyBtn);
  dialog.appendChild(footer);

  overlay.appendChild(dialog);
  return overlay;
}

// ------------------------------------------------------------------
// RGB / HSV editor
// ------------------------------------------------------------------

function buildChannelRow(label, prefix) {
  const row = document.createElement('div');
  row.className = 'viz-channel-row';

  const lbl = document.createElement('span');
  lbl.className = 'viz-channel-label';
  lbl.textContent = label;
  row.appendChild(lbl);

  const sel = document.createElement('select');
  sel.className = 'viz-band-select';
  sel.dataset.channel = prefix;
  row.appendChild(sel);

  row.appendChild(makeInput(prefix + '-min', 'Min'));
  row.appendChild(makeInput(prefix + '-max', 'Max'));

  return row;
}

function buildRgbEditor() {
  const div = document.createElement('div');
  div.className = 'viz-type-editor viz-rgb-editor';
  div.dataset.vizType = 'rgb';

  div.appendChild(buildChannelRow('Red', 'rgb-r'));
  div.appendChild(buildChannelRow('Green', 'rgb-g'));
  div.appendChild(buildChannelRow('Blue', 'rgb-b'));

  const gammaRow = document.createElement('div');
  gammaRow.className = 'viz-channel-row';
  const gammaLbl = document.createElement('span');
  gammaLbl.className = 'viz-channel-label';
  gammaLbl.textContent = 'Gamma';
  gammaRow.appendChild(gammaLbl);
  gammaRow.appendChild(makeInput('rgb-gamma', '1'));
  div.appendChild(gammaRow);

  div.appendChild(buildComputeBtn());
  return div;
}

function buildHsvEditor() {
  const div = document.createElement('div');
  div.className = 'viz-type-editor viz-hsv-editor';
  div.dataset.vizType = 'hsv';

  div.appendChild(buildChannelRow('Hue', 'hsv-h'));
  div.appendChild(buildChannelRow('Saturation', 'hsv-s'));
  div.appendChild(buildChannelRow('Value', 'hsv-v'));

  div.appendChild(buildComputeBtn());
  return div;
}

// ------------------------------------------------------------------
// Continuous editor
// ------------------------------------------------------------------

function buildContinuousEditor() {
  const div = document.createElement('div');
  div.className = 'viz-type-editor viz-continuous-editor';
  div.dataset.vizType = 'continuous';

  const bandRow = document.createElement('div');
  bandRow.className = 'viz-channel-row';
  const bandLbl = document.createElement('span');
  bandLbl.className = 'viz-channel-label';
  bandLbl.textContent = 'Band';
  bandRow.appendChild(bandLbl);
  const bandSel = document.createElement('select');
  bandSel.className = 'viz-band-select';
  bandSel.dataset.channel = 'cont-band';
  bandRow.appendChild(bandSel);
  bandRow.appendChild(makeInput('cont-min', 'Min'));
  bandRow.appendChild(makeInput('cont-max', 'Max'));
  div.appendChild(bandRow);

  div.appendChild(buildComputeBtn());

  // Palette selector
  const palLabel = document.createElement('div');
  palLabel.className = 'viz-section-label';
  palLabel.textContent = 'Palette';
  div.appendChild(palLabel);

  div.appendChild(buildPaletteGrid([...SEQUENTIAL_PALETTES, ...DIVERGING_PALETTES]));

  return div;
}

// ------------------------------------------------------------------
// Categorical editor
// ------------------------------------------------------------------

function buildCategoricalEditor() {
  const div = document.createElement('div');
  div.className = 'viz-type-editor viz-categorical-editor';
  div.dataset.vizType = 'categorical';

  const bandRow = document.createElement('div');
  bandRow.className = 'viz-channel-row';
  const bandLbl = document.createElement('span');
  bandLbl.className = 'viz-channel-label';
  bandLbl.textContent = 'Band';
  bandRow.appendChild(bandLbl);
  const bandSel = document.createElement('select');
  bandSel.className = 'viz-band-select';
  bandSel.dataset.channel = 'cat-band';
  bandRow.appendChild(bandSel);
  div.appendChild(bandRow);

  // Palette preset for quick fill
  const palLabel = document.createElement('div');
  palLabel.className = 'viz-section-label';
  palLabel.textContent = 'Colour scheme';
  div.appendChild(palLabel);
  div.appendChild(buildPaletteGrid(CATEGORICAL_PALETTES));

  // Legend rows
  const legendLabel = document.createElement('div');
  legendLabel.className = 'viz-section-label';
  legendLabel.textContent = 'Legend';
  div.appendChild(legendLabel);

  const legendList = document.createElement('div');
  legendList.className = 'viz-cat-legend';
  div.appendChild(legendList);

  const addBtn = document.createElement('button');
  addBtn.className = 'viz-btn viz-btn-secondary viz-cat-add';
  addBtn.textContent = '+ Add class';
  addBtn.addEventListener('click', () => addCategoryRow(legendList));
  div.appendChild(addBtn);

  return div;
}

function addCategoryRow(legendList, value, label, color) {
  const row = document.createElement('div');
  row.className = 'viz-cat-row';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'viz-cat-color';
  colorInput.value = color || '#4285f4';

  const valInput = document.createElement('input');
  valInput.type = 'number';
  valInput.className = 'viz-cat-value';
  valInput.placeholder = 'Value';
  if (value != null) {
    valInput.value = String(value);
  }

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'viz-cat-label-input';
  labelInput.placeholder = 'Label';
  if (label) {
    labelInput.value = label;
  }

  const delBtn = document.createElement('button');
  delBtn.className = 'map-btn viz-cat-del';
  delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
  delBtn.addEventListener('click', () => row.remove());

  row.appendChild(colorInput);
  row.appendChild(valInput);
  row.appendChild(labelInput);
  row.appendChild(delBtn);
  legendList.appendChild(row);
}

// ------------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------------

function makeInput(id, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'viz-input';
  input.dataset.field = id;
  input.placeholder = placeholder;
  return input;
}

function buildComputeBtn() {
  const btn = document.createElement('button');
  btn.className = 'viz-btn viz-btn-secondary viz-compute-btn';
  btn.textContent = 'Compute min/max';
  btn.addEventListener('click', () => {
    btn.textContent = 'Computing\u2026';
    btn.disabled = true;
    _vscode.postMessage({ type: 'computeMinMax', data: { layerIndex: _currentLayerIndex } });
  });
  return btn;
}

function buildPaletteGrid(palettes) {
  const grid = document.createElement('div');
  grid.className = 'viz-palette-grid';

  for (const pal of palettes) {
    const item = document.createElement('div');
    item.className = 'viz-palette-item';
    item.title = pal.name;
    item.role = 'option';
    item.tabIndex = 0;

    const bar = document.createElement('div');
    bar.className = 'viz-palette-bar';
    bar.style.background = 'linear-gradient(to right, ' + pal.colors.join(', ') + ')';
    item.appendChild(bar);

    const name = document.createElement('span');
    name.className = 'viz-palette-name';
    name.textContent = pal.name;
    item.appendChild(name);

    item.addEventListener('click', () => {
      grid.querySelectorAll('.viz-palette-item').forEach((el) => el.classList.remove('selected'));
      item.classList.add('selected');
      item._colors = pal.colors;

      // For categorical, auto-fill class rows from this palette
      if (pal.category === 'Categorical') {
        const editor = _overlay.querySelector('.viz-categorical-editor');
        const legend = editor.querySelector('.viz-cat-legend');
        const existingRows = legend.querySelectorAll('.viz-cat-row');
        pal.colors.forEach((c, i) => {
          if (existingRows[i]) {
            existingRows[i].querySelector('.viz-cat-color').value = c;
          } else {
            addCategoryRow(legend, undefined, undefined, c);
          }
        });
      }
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });

    grid.appendChild(item);
  }
  return grid;
}

// ==================================================================
// POPULATION
// ==================================================================

function populateBandSelects(bands) {
  _overlay.querySelectorAll('.viz-band-select').forEach((sel) => {
    sel.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '\u2014';
    sel.appendChild(empty);
    for (const b of bands) {
      const opt = document.createElement('option');
      opt.value = b;
      opt.textContent = b;
      sel.appendChild(opt);
    }
  });
}

function populatePresets(presets) {
  const sel = _overlay.querySelector('.viz-preset-select');
  sel.innerHTML = '';
  if (presets.length === 0) {
    sel.style.display = 'none';
    return;
  }
  sel.style.display = '';

  const placeholder = document.createElement('option');
  placeholder.value = '-1';
  placeholder.textContent = 'Preset\u2026';
  placeholder.disabled = true;
  placeholder.selected = true;
  sel.appendChild(placeholder);

  for (let i = 0; i < presets.length; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = presets[i].name + ' (' + presets[i].type + ')';
    sel.appendChild(opt);
  }
}

function applyVisParams(vp) {
  const type = _overlay.querySelector('.viz-type-select');
  const bands = vp.bands || [];
  const isCat = Array.isArray(vp.values) && vp.values.length > 0;

  if (isCat) {
    type.value = 'categorical';
  } else if (vp.palette && bands.length <= 1) {
    type.value = 'continuous';
  } else if (bands.length === 3) {
    type.value = 'rgb';
  } else {
    type.value = 'rgb';
  }
  showTypeEditor(type.value);

  // Fill RGB fields
  if (bands.length >= 3) {
    setSelectValue('rgb-r', bands[0]);
    setSelectValue('rgb-g', bands[1]);
    setSelectValue('rgb-b', bands[2]);
  }
  const minArr = Array.isArray(vp.min) ? vp.min : [vp.min];
  const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max];
  setFieldValue('rgb-r-min', minArr[0]);
  setFieldValue('rgb-r-max', maxArr[0]);
  setFieldValue('rgb-g-min', minArr[1] ?? minArr[0]);
  setFieldValue('rgb-g-max', maxArr[1] ?? maxArr[0]);
  setFieldValue('rgb-b-min', minArr[2] ?? minArr[0]);
  setFieldValue('rgb-b-max', maxArr[2] ?? maxArr[0]);
  if (vp.gamma) {
    setFieldValue('rgb-gamma', Array.isArray(vp.gamma) ? vp.gamma[0] : vp.gamma);
  }

  // Fill continuous fields
  if (bands.length >= 1) {
    setSelectValue('cont-band', bands[0]);
  }
  setFieldValue('cont-min', minArr[0]);
  setFieldValue('cont-max', maxArr[0]);

  // Fill categorical
  if (bands.length >= 1) {
    setSelectValue('cat-band', bands[0]);
  }
  if (isCat) {
    const legend = _overlay.querySelector('.viz-cat-legend');
    legend.innerHTML = '';
    const palette = vp.palette || [];
    const labels = vp.labels || [];
    const values = vp.values || [];
    const n = Math.max(palette.length, values.length);
    for (let i = 0; i < n; i++) {
      addCategoryRow(legend, values[i], labels[i], palette[i]);
    }
  }
}

function showTypeEditor(vizType) {
  _overlay.querySelectorAll('.viz-type-editor').forEach((el) => {
    el.style.display = el.dataset.vizType === vizType ? '' : 'none';
  });
}

// ==================================================================
// COLLECT & APPLY
// ==================================================================

function collectVisParams() {
  const type = _overlay.querySelector('.viz-type-select').value;

  if (type === 'rgb' || type === 'hsv') {
    const prefix = type === 'rgb' ? 'rgb' : 'hsv';
    const chans = type === 'rgb' ? ['r', 'g', 'b'] : ['h', 's', 'v'];
    const bands = chans.map((c) => getSelectValue(prefix + '-' + c));
    const min = chans.map((c) => parseFloat(getFieldValue(prefix + '-' + c + '-min')));
    const max = chans.map((c) => parseFloat(getFieldValue(prefix + '-' + c + '-max')));
    if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return null;
    const config = { vizType: type, bands, min, max };
    if (type === 'rgb') {
      const gamma = parseFloat(getFieldValue('rgb-gamma'));
      if (gamma && gamma !== 1) {
        config.gamma = gamma;
      }
    }
    return config;
  }

  if (type === 'continuous') {
    const band = getSelectValue('cont-band');
    const min = parseFloat(getFieldValue('cont-min'));
    const max = parseFloat(getFieldValue('cont-max'));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const selectedPal = _overlay.querySelector('.viz-continuous-editor .viz-palette-item.selected');
    const palette = selectedPal ? selectedPal._colors : [];
    return { vizType: 'continuous', bands: [band], min: [min], max: [max], palette };
  }

  if (type === 'categorical') {
    const band = getSelectValue('cat-band');
    const rows = _overlay.querySelectorAll('.viz-categorical-editor .viz-cat-row');
    const values = [];
    const labels = [];
    const palette = [];
    rows.forEach((row) => {
      const v = parseInt(row.querySelector('.viz-cat-value').value);
      const l = row.querySelector('.viz-cat-label-input').value;
      const c = row.querySelector('.viz-cat-color').value;
      if (!isNaN(v)) {
        values.push(v);
        labels.push(l || 'Class ' + values.length);
        palette.push(c);
      }
    });
    return { vizType: 'categorical', bands: [band], values, labels, palette };
  }

  return { vizType: type };
}

function apply() {
  const config = collectVisParams();
  if (!config) return;
  _vscode.postMessage({
    type: 'updateViz',
    data: { layerIndex: _currentLayerIndex, ...config },
  });
  close();
}

function close() {
  _overlay.classList.remove('visible');
}

// ==================================================================
// FIELD HELPERS
// ==================================================================

function setSelectValue(channel, val) {
  const sel = _overlay.querySelector('.viz-band-select[data-channel="' + channel + '"]');
  if (sel && val) {
    sel.value = val;
  }
}

function getSelectValue(channel) {
  const sel = _overlay.querySelector('.viz-band-select[data-channel="' + channel + '"]');
  return sel ? sel.value : '';
}

function setFieldValue(field, val) {
  const input = _overlay.querySelector('.viz-input[data-field="' + field + '"]');
  if (input && val != null && val !== '') {
    input.value = String(val);
  }
}

function getFieldValue(field) {
  const input = _overlay.querySelector('.viz-input[data-field="' + field + '"]');
  return input ? input.value : '';
}

function autoFillMinMax(minMax) {
  const type = _overlay.querySelector('.viz-type-select').value;
  if (type === 'continuous') {
    const band = getSelectValue('cont-band');
    if (band && minMax[band]) {
      if (!getFieldValue('cont-min')) {
        setFieldValue('cont-min', minMax[band].min);
      }
      if (!getFieldValue('cont-max')) {
        setFieldValue('cont-max', minMax[band].max);
      }
    }
  } else if (type === 'rgb' || type === 'hsv') {
    const prefix = type === 'rgb' ? 'rgb' : 'hsv';
    const chans = type === 'rgb' ? ['r', 'g', 'b'] : ['h', 's', 'v'];
    chans.forEach((c) => {
      const band = getSelectValue(prefix + '-' + c);
      if (band && minMax[band]) {
        if (!getFieldValue(prefix + '-' + c + '-min')) {
          setFieldValue(prefix + '-' + c + '-min', minMax[band].min);
        }
        if (!getFieldValue(prefix + '-' + c + '-max')) {
          setFieldValue(prefix + '-' + c + '-max', minMax[band].max);
        }
      }
    });
  }
}
