/**
 * @module featureCollectionPreviewPanel
 * WebView panel for previewing an Earth Engine FeatureCollection (Table) asset.
 *
 * Renders a two-column layout mimicking the EE Code Editor asset details:
 * - Left sidebar: thumbnail, Table ID, dates, file size, feature count, last modified.
 * - Right content: 4 tabs — DESCRIPTION, FEATURES, COLUMNS, PROPERTIES.
 *
 * The thumbnail is generated from the FeatureCollection footprint rendered
 * with dark outlines. Features tab shows the first 20 rows with all columns.
 * Columns tab lists column names and inferred types from the first feature.
 */

import * as vscode from 'vscode';
import { marked } from 'marked';
import { EEAsset, listFeatures } from '../../sidebar/assets/eeApiClient.js';
import { httpRequest } from '../../shared/httpClient.js';
import { escapeHtml, formatBytes, formatDate } from '../../shared/webviewUtils.js';

// ── Constants ───────────────────────────────────────────────────────

const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

/** Number of features to display in the FEATURES tab. */
const FEATURES_PAGE_SIZE = 20;

// ── Public API ──────────────────────────────────────────────────────

/** Opens a read-only WebView showing full metadata for a TABLE asset. */
export async function openFeatureCollectionPreview(
  asset: EEAsset,
  accessToken: string,
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.featureCollectionPreview',
    `Asset details: ${asset.id || asset.name.split('/').pop() || 'Table'} (Table)`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  // Fetch the first 20 features upfront (needed for FEATURES + COLUMNS tabs)
  let features: { properties?: Record<string, unknown> }[] = [];
  try {
    const resp = await listFeatures(asset.name, accessToken, FEATURES_PAGE_SIZE);
    features = resp.features ?? [];
  } catch {
    // Will show empty table
  }

  panel.webview.html = buildHtml(asset, features, panel.webview);

  // Handle messages from the WebView (lazy thumbnail loading)
  panel.webview.onDidReceiveMessage(async (msg: { type: string }) => {
    if (msg.type === 'ready') {
      sendThumbnail(asset, accessToken, panel);
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
    const thumbUrl = await getTableThumbnailUrl(asset, accessToken);
    panel.webview.postMessage({ type: 'thumbnail', url: thumbUrl });
  } catch {
    panel.webview.postMessage({
      type: 'thumbnail',
      url: '',
      error: 'The table size is too large to generate a thumbnail.',
    });
  }
}

async function getTableThumbnailUrl(asset: EEAsset, accessToken: string): Promise<string> {
  // Paint the FeatureCollection boundaries as dark strokes on a white background
  const expression = {
    result: '0',
    values: {
      '0': {
        functionInvocationValue: {
          functionName: 'Image.paint',
          arguments: {
            image: {
              functionInvocationValue: {
                functionName: 'Image.constant',
                arguments: { value: { constantValue: 1 } },
              },
            },
            featureCollection: {
              functionInvocationValue: {
                functionName: 'FeatureCollection.load',
                arguments: { id: { constantValue: asset.name } },
              },
            },
            color: { constantValue: 0 },
            width: { constantValue: 1 },
          },
        },
      },
    },
  };

  const body = JSON.stringify({
    expression,
    fileFormat: 'PNG',
    grid: { dimensions: { width: 256, height: 256 } },
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

// ── Column type inference ───────────────────────────────────────────

interface ColumnInfo {
  name: string;
  type: string;
}

function inferColumns(features: { properties?: Record<string, unknown> }[]): ColumnInfo[] {
  const first = features[0];
  if (!first?.properties) {
    return [];
  }
  return Object.entries(first.properties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({
      name: key,
      type: inferType(val),
    }));
}

function inferType(val: unknown): string {
  if (val === null || val === undefined) {
    return 'Unknown';
  }
  if (typeof val === 'number') {
    return Number.isInteger(val) ? 'Integer' : 'Float';
  }
  if (typeof val === 'string') {
    return 'String';
  }
  if (typeof val === 'boolean') {
    return 'Boolean';
  }
  if (Array.isArray(val)) {
    return 'Array';
  }
  return 'Object';
}

// ── HTML builder ────────────────────────────────────────────────────

function buildHtml(
  asset: EEAsset,
  features: { properties?: Record<string, unknown> }[],
  _webview: vscode.Webview,
): string {
  const nonce = getNonce();
  const title = asset.id || asset.name.split('/').pop() || 'Table';
  const assetId = asset.name;
  const startDate = formatDate(asset.startTime);
  const endDate = formatDate(asset.endTime);
  const fileSize = formatBytes(asset.sizeBytes);
  const lastModified = formatDate(asset.updateTime);
  const featureCount = asset.featureCount
    ? parseInt(asset.featureCount, 10).toLocaleString()
    : 'N/A';

  // Description from properties
  const description = asset.properties?.['description']
    ? String(asset.properties['description'])
    : '';

  // Columns inferred from first feature
  const columns = inferColumns(features);

  // Features table
  const featuresTableHtml = buildFeaturesTable(features, columns);

  // Columns tab
  const columnsTableHtml = buildColumnsTable(columns);

  // Properties (non-system)
  const propsHtml = buildPropertiesRows(asset.properties);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
${featureCollectionStyle()}
</style>
</head>
<body>
<header class="title-bar">
  <h1>Asset details: ${escapeHtml(title)} (Table)</h1>
</header>

<div class="layout">
  <!-- Left sidebar -->
  <aside class="sidebar">
    <div class="thumbnail-container">
      <div class="thumbnail-placeholder" id="thumbnail">
        <span class="thumb-loading"><span class="spinner"></span> Loading thumbnail...</span>
      </div>
    </div>

    <div class="sidebar-info">
      <div class="info-row">
        <span class="info-label">Table ID</span>
        <span class="info-value asset-id" title="${escapeHtml(assetId)}">${escapeHtml(assetId)}</span>
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
        <span class="info-label">Number of Features</span>
        <span class="info-value">${featureCount}</span>
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
      <button class="tab" data-tab="features">FEATURES</button>
      <button class="tab" data-tab="columns">COLUMNS</button>
      <button class="tab" data-tab="properties">PROPERTIES</button>
    </nav>

    <section class="tab-panel active" id="tab-description">
      ${description ? `<div class="description-text">${marked(description)}</div>` : '<p class="empty-state">No description.</p>'}
    </section>

    <section class="tab-panel" id="tab-features">
      ${featuresTableHtml}
    </section>

    <section class="tab-panel" id="tab-columns">
      ${columnsTableHtml}
    </section>

    <section class="tab-panel" id="tab-properties">
      ${propsHtml}
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
        const errorMsg = msg.error || 'Thumbnail not available.';
        el.innerHTML = '<span class="thumb-unavailable">' + errorMsg + '</span>';
      }
    }
  });
})();
</script>
</body>
</html>`;
}

// ── Features table ──────────────────────────────────────────────────

function buildFeaturesTable(
  features: { properties?: Record<string, unknown> }[],
  columns: ColumnInfo[],
): string {
  if (features.length === 0) {
    return '<p class="empty-state">No features available.</p>';
  }

  const headerCells = columns
    .map((c) => `<th>${escapeHtml(c.name)} (${escapeHtml(c.type)})</th>`)
    .join('');

  const rows = features
    .map((f, i) => {
      const cells = columns
        .map((c) => {
          const val = f.properties?.[c.name];
          const display = val !== null && val !== undefined ? String(val) : '';
          return `<td>${escapeHtml(display)}</td>`;
        })
        .join('');
      return `<tr><td class="idx">${i}</td>${cells}</tr>`;
    })
    .join('');

  return `<div class="table-scroll">
    <table class="features-table">
      <thead><tr><th>Feature Index</th>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Columns table ───────────────────────────────────────────────────

function buildColumnsTable(columns: ColumnInfo[]): string {
  if (columns.length === 0) {
    return '<p class="empty-state">No columns detected.</p>';
  }

  const rows = columns
    .map(
      (c, i) =>
        `<tr><td class="idx">${i}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.type)}</td></tr>`,
    )
    .join('');

  return `<table class="columns-table">
    <thead><tr><th>Index</th><th>Column Name</th><th>Inferred Type</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Properties helper ───────────────────────────────────────────────

/** System property prefixes and keys to exclude from the PROPERTIES tab. */
const SYSTEM_PREFIXES = ['system:'];
const EXCLUDED_KEYS = new Set(['description']);

function buildPropertiesRows(props?: Record<string, unknown>): string {
  if (!props || Object.keys(props).length === 0) {
    return '<p class="empty-state">No properties.</p>';
  }

  const entries = Object.entries(props)
    .filter(([k]) => !SYSTEM_PREFIXES.some((p) => k.startsWith(p)) && !EXCLUDED_KEYS.has(k))
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return '<p class="empty-state">No properties.</p>';
  }

  const rows = entries
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v ?? ''))}</td></tr>`)
    .join('');

  return `<table class="props-table">
    <thead><tr><th>Property</th><th>Value</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Styles ──────────────────────────────────────────────────────────

function featureCollectionStyle(): string {
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
  .empty-state {
    font-size: 0.9em;
    opacity: 0.6;
    font-style: italic;
  }
  .description-text {
    font-size: 0.9em;
    line-height: 1.6;
  }
  .description-text h2 { font-size: 1.3em; margin: 16px 0 8px; }
  .description-text h3 { font-size: 1.1em; margin: 12px 0 6px; }
  .description-text h4 { font-size: 1em; margin: 10px 0 4px; }
  .description-text p { margin: 8px 0; }
  .description-text code {
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.9em;
  }
  .description-text pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 10px 12px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 8px 0;
  }
  .description-text pre code {
    background: none;
    padding: 0;
  }
  .table-scroll {
    overflow: auto;
    max-height: 100%;
  }
  .features-table, .columns-table, .props-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
  }
  .features-table th, .columns-table th, .props-table th {
    text-align: left;
    background: var(--vscode-list-hoverBackground);
    padding: 6px 10px;
    font-weight: 600;
    position: sticky;
    top: 0;
    white-space: nowrap;
  }
  .features-table td, .columns-table td, .props-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .features-table tbody tr:nth-child(even),
  .columns-table tbody tr:nth-child(even) {
    background: var(--vscode-list-hoverBackground);
  }
  .idx {
    font-weight: 500;
    opacity: 0.7;
    width: 60px;
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
    margin-right: 6px;
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
