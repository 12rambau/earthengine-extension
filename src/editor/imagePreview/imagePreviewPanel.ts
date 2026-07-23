/**
 * @module imagePreviewPanel
 * WebView panel for previewing an Earth Engine Image asset.
 *
 * Renders a two-column layout mimicking the EE Code Editor asset details:
 * - Left sidebar: thumbnail, Image ID, dates, file size, band count, last modified.
 * - Right content: 3 tabs — DESCRIPTION, BANDS, PROPERTIES.
 *
 * The thumbnail is fetched from the EE thumbnail API using the first band
 * and the image footprint (falls back to near-global extent if missing).
 * Band min/max values are computed lazily via the ee.Reducer.minMax()
 * expression endpoint with bestEffort enabled.
 */

import * as vscode from 'vscode';
import { marked } from 'marked';
import { EEAsset, EEBand } from '../../sidebar/assets/eeApiClient.js';
import { httpRequest } from '../../shared/httpClient.js';
import {
  escapeHtml,
  formatBytes,
  formatDate,
  webviewBaseStyle,
} from '../../shared/webviewUtils.js';

// ── Constants ───────────────────────────────────────────────────────

const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

/** Near-global bbox in EPSG:4326, shrunk a few degrees to avoid antimeridian issues. */
const GLOBAL_BBOX = [-175, -85, 175, 85];

// ── Public API ──────────────────────────────────────────────────────

/** Opens a read-only WebView showing full metadata for an IMAGE asset. */
export function openImagePreview(asset: EEAsset, accessToken: string): void {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.imagePreview',
    `Asset details: ${asset.id || asset.name.split('/').pop() || 'Image'}`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  panel.webview.html = buildImageHtml(asset, panel.webview);

  // Handle messages from the WebView (lazy loading of thumbnail + min/max)
  panel.webview.onDidReceiveMessage(async (msg: { type: string }) => {
    if (msg.type === 'ready') {
      // Fire-and-forget: send thumbnail + min/max data asynchronously
      sendThumbnail(asset, accessToken, panel);
      sendMinMax(asset, accessToken, panel);
    }
  });
}

// ── Thumbnail ───────────────────────────────────────────────────────

async function sendThumbnail(
  asset: EEAsset,
  accessToken: string,
  panel: vscode.WebviewPanel,
): Promise<void> {
  try {
    const thumbUrl = await getThumbnailUrl(asset, accessToken);
    panel.webview.postMessage({ type: 'thumbnail', url: thumbUrl });
  } catch {
    panel.webview.postMessage({ type: 'thumbnail', url: '' });
  }
}

async function getThumbnailUrl(asset: EEAsset, accessToken: string): Promise<string> {
  const firstBand = asset.bands?.[0]?.id;
  const expression: Record<string, unknown> = {
    result: '0',
    values: {
      '0': {
        functionInvocationValue: {
          functionName: 'Image.visualize',
          arguments: {
            image: {
              functionInvocationValue: {
                functionName: 'Image.load',
                arguments: { id: { constantValue: asset.name } },
              },
            },
            bands: { constantValue: firstBand ? [firstBand] : [] },
          },
        },
      },
    },
  };

  const region = getFootprintOrGlobal(asset);

  const body = JSON.stringify({
    expression,
    fileFormat: 'PNG',
    bandIds: firstBand ? [firstBand] : undefined,
    grid: {
      dimensions: { width: 256, height: 256 },
    },
    region,
    bestEffort: true,
  });

  const url = `${EE_API_BASE}/projects/earthengine-legacy/thumbnails`;
  const resp = await httpRequest(url, 'POST', accessToken, body);
  const parsed = JSON.parse(resp) as { name?: string };
  if (parsed.name) {
    return `https://earthengine.googleapis.com/v1/${parsed.name}:getPixels`;
  }
  throw new Error('No thumbnail name returned');
}

// ── Min/Max ─────────────────────────────────────────────────────────

async function sendMinMax(
  asset: EEAsset,
  accessToken: string,
  panel: vscode.WebviewPanel,
): Promise<void> {
  try {
    const minMax = await computeMinMax(asset, accessToken);
    panel.webview.postMessage({ type: 'minmax', data: minMax });
  } catch {
    panel.webview.postMessage({ type: 'minmax', data: null });
  }
}

interface BandMinMax {
  [bandId: string]: { min: number | null; max: number | null };
}

async function computeMinMax(asset: EEAsset, accessToken: string): Promise<BandMinMax> {
  const region = getFootprintOrGlobal(asset);

  const body = JSON.stringify({
    expression: {
      result: '0',
      values: {
        '0': {
          functionInvocationValue: {
            functionName: 'Image.reduceRegion',
            arguments: {
              image: {
                functionInvocationValue: {
                  functionName: 'Image.load',
                  arguments: { id: { constantValue: asset.name } },
                },
              },
              reducer: {
                functionInvocationValue: { functionName: 'Reducer.minMax', arguments: {} },
              },
              geometry: { constantValue: region },
              bestEffort: { constantValue: true },
              maxPixels: { constantValue: 1e8 },
            },
          },
        },
      },
    },
  });

  const url = `${EE_API_BASE}/projects/earthengine-legacy/value:compute`;
  const resp = await httpRequest(url, 'POST', accessToken, body);
  const parsed = JSON.parse(resp) as { result?: Record<string, number> };

  const result: BandMinMax = {};
  if (parsed.result) {
    for (const [key, val] of Object.entries(parsed.result)) {
      const match = key.match(/^(.+)_(min|max)$/);
      if (match) {
        const bandId = match[1];
        const kind = match[2] as 'min' | 'max';
        if (!result[bandId]) {
          result[bandId] = { min: null, max: null };
        }
        result[bandId][kind] = val;
      }
    }
  }
  return result;
}

// ── Geometry helper ─────────────────────────────────────────────────

function getFootprintOrGlobal(asset: EEAsset): Record<string, unknown> {
  if (asset.geometry) {
    return asset.geometry as Record<string, unknown>;
  }
  // Near-global rectangle in GeoJSON
  return {
    type: 'Polygon',
    coordinates: [
      [
        [GLOBAL_BBOX[0], GLOBAL_BBOX[1]],
        [GLOBAL_BBOX[2], GLOBAL_BBOX[1]],
        [GLOBAL_BBOX[2], GLOBAL_BBOX[3]],
        [GLOBAL_BBOX[0], GLOBAL_BBOX[3]],
        [GLOBAL_BBOX[0], GLOBAL_BBOX[1]],
      ],
    ],
  };
}

// ── HTML builder ────────────────────────────────────────────────────

function buildImageHtml(asset: EEAsset, webview: vscode.Webview): string {
  const bands = asset.bands || [];
  const nonce = getNonce();
  const title = asset.id || asset.name.split('/').pop() || 'Image';
  const assetId = asset.name;
  const startDate = formatDate(asset.startTime);
  const endDate = formatDate(asset.endTime);
  const fileSize = formatBytes(asset.sizeBytes);
  const lastModified = formatDate(asset.updateTime);
  const bandCount = bands.length;

  const description = asset.properties?.['description']
    ? String(asset.properties['description'])
    : '';

  const bandsRowsHtml = bands
    .map((b, i) => {
      const dims = b.grid?.dimensions
        ? `${b.grid.dimensions.width}x${b.grid.dimensions.height} px`
        : 'N/A';
      const crs = b.grid?.crsCode || 'N/A';
      const scale = b.grid?.affineTransform?.scaleX
        ? `${Math.abs(b.grid.affineTransform.scaleX).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}`
        : 'N/A';
      const dtype = b.dataType?.precision || 'N/A';
      return `<tr>
        <td>${i}</td>
        <td>${escapeHtml(b.id)}</td>
        <td>${dtype}</td>
        <td>${dims}</td>
        <td>${crs}</td>
        <td>${scale}</td>
        <td class="minmax" data-band="${escapeHtml(b.id)}"><span class="spinner"></span></td>
        <td class="minmax" data-band="${escapeHtml(b.id)}"><span class="spinner"></span></td>
      </tr>`;
    })
    .join('');

  const propsHtml = buildPropertiesRows(asset.properties);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
${imagePreviewStyle()}
</style>
</head>
<body>
<header class="title-bar">
  <h1>Asset details: ${escapeHtml(title)}</h1>
</header>

<div class="layout">
  <!-- Left sidebar -->
  <aside class="sidebar">
    <div class="thumbnail-container">
      <div class="thumbnail-placeholder" id="thumbnail">
        <span class="thumb-loading">Loading thumbnail...</span>
      </div>
    </div>

    <div class="sidebar-info">
      <div class="info-row">
        <span class="info-label">Image ID</span>
        <span class="info-value asset-id" id="asset-id" title="${escapeHtml(assetId)}">${escapeHtml(assetId)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date</span>
        <span class="info-value">Start date: ${startDate}<br>End date: ${endDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">File Size</span>
        <span class="info-value">${fileSize}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Number of Bands</span>
        <span class="info-value">${bandCount}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Last modified</span>
        <span class="info-value">${lastModified}</span>
      </div>
    </div>
  </aside>

  <!-- Right content with tabs -->
  <main class="content">
    <nav class="tabs">
      <button class="tab active" data-tab="description">DESCRIPTION</button>
      <button class="tab" data-tab="bands">BANDS</button>
      <button class="tab" data-tab="properties">PROPERTIES</button>
    </nav>

    <section class="tab-panel active" id="tab-description">
      ${description ? `<div class="description-text">${marked(description)}</div>` : '<p class="description-text">No description.</p>'}
    </section>

    <section class="tab-panel" id="tab-bands">
      <table class="bands-table">
        <thead>
          <tr>
            <th>Index</th>
            <th>Name</th>
            <th>Type</th>
            <th>Dimensions</th>
            <th>CRS</th>
            <th>Nominal Scale</th>
            <th>Min</th>
            <th>Max</th>
          </tr>
        </thead>
        <tbody>
          ${bandsRowsHtml}
        </tbody>
      </table>
    </section>

    <section class="tab-panel" id="tab-properties">
      <table class="props-table">
        <thead><tr><th>Property</th><th>Value</th></tr></thead>
        <tbody>${propsHtml}</tbody>
      </table>
    </section>
  </main>
</div>

<script nonce="${nonce}">
(function() {
  const vscode = acquireVsCodeApi();

  // Tab switching
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Signal ready to load async data
  vscode.postMessage({ type: 'ready' });

  // Listen for messages from extension
  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'thumbnail') {
      const el = document.getElementById('thumbnail');
      if (msg.url) {
        el.innerHTML = '<img src="' + msg.url + '" alt="Thumbnail" />';
      } else {
        el.innerHTML = '<span class="thumb-unavailable">Thumbnail not available.</span>';
      }
    } else if (msg.type === 'minmax') {
      const cells = document.querySelectorAll('.minmax');
      cells.forEach(cell => {
        const band = cell.dataset.band;
        const bandData = msg.data ? msg.data[band] : null;
        // Determine if this is a min or max cell (even index = min, odd = max)
        const sibling = cell.previousElementSibling;
        const isMin = sibling && !sibling.classList.contains('minmax');
        if (bandData) {
          if (isMin) {
            cell.textContent = bandData.min !== null ? formatNum(bandData.min) : '—';
          } else {
            cell.textContent = bandData.max !== null ? formatNum(bandData.max) : '—';
          }
        } else {
          cell.textContent = '—';
        }
      });
    }
  });

  function formatNum(n) {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(4);
  }
})();
</script>
</body>
</html>`;
}

// ── Properties helper ───────────────────────────────────────────────

/** Property keys excluded from the PROPERTIES tab (system + description). */
const EXCLUDED_PROP_PREFIXES = ['system:'];
const EXCLUDED_PROP_KEYS = new Set(['description']);

function buildPropertiesRows(props?: Record<string, unknown>): string {
  if (!props || Object.keys(props).length === 0) {
    return '<tr><td colspan="2"><em>No properties</em></td></tr>';
  }
  const entries = Object.entries(props)
    .filter(
      ([k]) => !EXCLUDED_PROP_PREFIXES.some((p) => k.startsWith(p)) && !EXCLUDED_PROP_KEYS.has(k),
    )
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return '<tr><td colspan="2"><em>No properties</em></td></tr>';
  }
  return entries
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v ?? ''))}</td></tr>`)
    .join('');
}

// ── Styles ──────────────────────────────────────────────────────────

function imagePreviewStyle(): string {
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.5;
  }
  .title-bar {
    padding: 12px 20px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .title-bar h1 {
    font-size: 1.2em;
    font-weight: 500;
  }
  .layout {
    display: flex;
    height: calc(100vh - 52px);
  }
  .sidebar {
    width: 280px;
    min-width: 280px;
    border-right: 1px solid var(--vscode-panel-border);
    padding: 16px;
    overflow-y: auto;
  }
  .thumbnail-container {
    width: 100%;
    aspect-ratio: 1;
    background: var(--vscode-list-hoverBackground);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    overflow: hidden;
  }
  .thumbnail-container img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .thumb-loading, .thumb-unavailable {
    font-size: 0.85em;
    opacity: 0.6;
    text-align: center;
    padding: 12px;
  }
  .sidebar-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .info-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .info-label {
    font-weight: 600;
    font-size: 0.85em;
  }
  .info-value {
    font-size: 0.85em;
    opacity: 0.85;
  }
  .asset-id {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.78em;
    word-break: break-all;
    background: var(--vscode-textCodeBlock-background);
    padding: 4px 6px;
    border-radius: 3px;
  }
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 0 16px;
  }
  .tab {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    padding: 10px 16px;
    cursor: pointer;
    font-size: 0.85em;
    font-weight: 500;
    opacity: 0.7;
    border-bottom: 2px solid transparent;
    transition: opacity 0.15s, border-color 0.15s;
  }
  .tab:hover { opacity: 1; }
  .tab.active {
    opacity: 1;
    border-bottom-color: var(--vscode-focusBorder);
  }
  .tab-panel {
    display: none;
    padding: 16px;
    overflow: auto;
    flex: 1;
  }
  .tab-panel.active { display: block; }
  .description-text {
    font-size: 0.9em;
    white-space: pre-wrap;
    opacity: 0.85;
  }
  .bands-table, .props-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
  }
  .bands-table th, .props-table th {
    text-align: left;
    background: var(--vscode-list-hoverBackground);
    padding: 6px 10px;
    font-weight: 600;
    position: sticky;
    top: 0;
  }
  .bands-table td, .props-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .bands-table tbody tr:nth-child(even) {
    background: var(--vscode-list-hoverBackground);
  }
  .props-table td:first-child {
    font-weight: 500;
    width: 30%;
  }
  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--vscode-foreground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    opacity: 0.5;
    vertical-align: middle;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  `;
}

// ── Nonce helper ────────────────────────────────────────────────────

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
