/**
 * @module imageCollectionPreviewPanel
 * WebView panel for previewing an Earth Engine ImageCollection asset.
 *
 * Renders a two-column layout mimicking the EE Code Editor asset details:
 * - Left sidebar: thumbnail, ImageCollection ID, dates, file size, image count, last modified.
 * - Right content: 4 tabs — DESCRIPTION, IMAGES, BANDS, PROPERTIES.
 *
 * The thumbnail is a mosaic of the first 10 images rendered via the EE
 * thumbnail API. The IMAGES tab lists child images with metadata and actions.
 * The BANDS tab shows band info from the first image in the collection.
 */

import * as vscode from 'vscode';
import { marked } from 'marked';
import { EEAsset, EEBand, listAssets, getAsset } from '../../sidebar/assets/eeApiClient.js';
import { httpRequest } from '../../shared/httpClient.js';
import { escapeHtml, formatBytes, formatDate } from '../../shared/webviewUtils.js';

// ── Constants ───────────────────────────────────────────────────────

const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

/** Max images fetched for the IMAGES tab. */
const IMAGES_PAGE_SIZE = 100;

/** Max images used in the thumbnail mosaic. */
const MOSAIC_LIMIT = 10;

// ── Action icons (inline SVG) ───────────────────────────────────────

const ICON_PREVIEW =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 1H4.5C3.122 1 2 2.122 2 3.5V6.276C2.319 6.162 2.653 6.089 3 6.05V3.499C3 2.672 3.673 1.999 4.5 1.999H8.5V13.385L9.557 14.442C9.714 14.591 9.831 14.786 9.907 14.999H13.5C14.878 14.999 16 13.877 16 12.499V3.5C16 2.122 14.878 1 13.5 1ZM15 12.5C15 13.327 14.327 14 13.5 14H9.5V2H13.5C14.327 2 15 2.673 15 3.5V12.5ZM6.29 12.59C6.74 12.01 7 11.28 7 10.5C7 8.57 5.43 7 3.5 7C1.57 7 0 8.57 0 10.5C0 12.43 1.57 14 3.5 14C4.28 14 5.01 13.74 5.59 13.29L8.15 15.85C8.24 15.95 8.37 16 8.5 16C8.63 16 8.76 15.95 8.85 15.85C9.05 15.66 9.05 15.34 8.85 15.15L6.29 12.59ZM5.5 12C5.36 12.19 5.19 12.36 5 12.5C4.59 12.81 4.06 13 3.5 13C2.12 13 1 11.88 1 10.5C1 9.12 2.12 8 3.5 8C4.88 8 6 9.12 6 10.5C6 11.06 5.81 11.59 5.5 12Z"/></svg>';
const ICON_DELETE =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 2H10C10 .897 9.103 0 8 0 6.897 0 6 .897 6 2H2c-.276 0-.5.224-.5.5s.224.5.5.5h.54l.809 9.708C3.456 13.994 4.55 15 5.84 15h4.319c1.29 0 2.384-.993 2.491-2.292L13.459 3H14c.276 0 .5-.224.5-.5S14.276 2 14 2zM8 1c.551 0 1 .449 1 1H7c0-.551.449-1 1-1zm3.655 11.625C11.591 13.396 10.934 14 10.16 14H5.841c-.774 0-1.431-.604-1.495-1.375L3.544 3h8.914l-.803 9.625zM7 5.5v6c0 .276-.224.5-.5.5S6 11.776 6 11.5v-6c0-.276.224-.5.5-.5s.5.224.5.5zm3 0v6c0 .276-.224.5-.5.5S9 11.776 9 11.5v-6c0-.276.224-.5.5-.5s.5.224.5.5z"/></svg>';
const ACTION_DOT =
  '<span class="action-dot"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z"/></svg></span>';

// ── Public API ──────────────────────────────────────────────────────

/** Opens a read-only WebView showing full metadata for an IMAGE_COLLECTION asset. */
export async function openImageCollectionPreview(
  asset: EEAsset,
  accessToken: string,
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.imageCollectionPreview',
    `Asset details: ${asset.id || asset.name.split('/').pop() || 'ImageCollection'} (ImageCollection)`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  // Fetch child images for the IMAGES tab (first page)
  let childImages: EEAsset[] = [];
  try {
    const resp = await listAssets(asset.name, accessToken, IMAGES_PAGE_SIZE);
    childImages = resp.assets ?? [];
  } catch {
    // Will show empty table
  }

  // Fetch bands from the first child image
  let bands: EEBand[] = [];
  if (childImages.length > 0) {
    try {
      const firstImage = await getAsset(childImages[0].name, accessToken);
      bands = firstImage.bands ?? [];
    } catch {
      // Will show empty table
    }
  }

  panel.webview.html = buildHtml(asset, childImages, bands);

  // Handle messages from the WebView
  panel.webview.onDidReceiveMessage(async (msg: { type: string; name?: string }) => {
    if (msg.type === 'ready') {
      sendThumbnail(asset, accessToken, panel);
    } else if (msg.type === 'openImage' && msg.name) {
      const token = await getTokenSafe(accessToken);
      try {
        const { openAssetPreview } = await import('../assets/assetPreviewPanel.js');
        await openAssetPreview(msg.name, token);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to open image: ${errMsg}`);
      }
    } else if (msg.type === 'deleteImage' && msg.name) {
      const confirm = await vscode.window.showWarningMessage(
        `Delete image "${msg.name}"?`,
        { modal: true, detail: 'This action cannot be undone.' },
        'Delete',
      );
      if (confirm === 'Delete') {
        try {
          const { deleteAsset } = await import('../../sidebar/assets/eeApiClient.js');
          await deleteAsset(msg.name, accessToken);
          vscode.window.showInformationMessage(`Image "${msg.name}" deleted.`);
          panel.webview.postMessage({ type: 'imageDeleted', name: msg.name });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to delete: ${errMsg}`);
        }
      }
    }
  });
}

/** Returns accessToken (placeholder for token refresh). */
function getTokenSafe(accessToken: string): Promise<string> {
  return Promise.resolve(accessToken);
}

// ── Thumbnail ───────────────────────────────────────────────────────

async function sendThumbnail(
  asset: EEAsset,
  accessToken: string,
  panel: vscode.WebviewPanel,
): Promise<void> {
  try {
    const thumbUrl = await getCollectionThumbnailUrl(asset, accessToken);
    panel.webview.postMessage({ type: 'thumbnail', url: thumbUrl });
  } catch {
    panel.webview.postMessage({ type: 'thumbnail', url: '', error: 'Thumbnail not available.' });
  }
}

async function getCollectionThumbnailUrl(asset: EEAsset, accessToken: string): Promise<string> {
  const expression = {
    result: '0',
    values: {
      '0': {
        functionInvocationValue: {
          functionName: 'Image.visualize',
          arguments: {
            image: {
              functionInvocationValue: {
                functionName: 'ImageCollection.mosaic',
                arguments: {
                  collection: {
                    functionInvocationValue: {
                      functionName: 'Collection.limit',
                      arguments: {
                        collection: {
                          functionInvocationValue: {
                            functionName: 'ImageCollection.load',
                            arguments: { id: { constantValue: asset.name } },
                          },
                        },
                        limit: { constantValue: MOSAIC_LIMIT },
                      },
                    },
                  },
                },
              },
            },
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

// ── HTML builder ────────────────────────────────────────────────────

function buildHtml(asset: EEAsset, childImages: EEAsset[], bands: EEBand[]): string {
  const nonce = getNonce();
  const title = asset.id || asset.name.split('/').pop() || 'ImageCollection';
  const assetId = asset.name;
  const startDate = formatDate(asset.startTime);
  const endDate = formatDate(asset.endTime);
  const fileSize = formatBytes(asset.sizeBytes);
  const lastModified = formatDate(asset.updateTime);
  const imageCount = childImages.length;

  const description = asset.properties?.['description']
    ? String(asset.properties['description'])
    : '';

  const imagesTableHtml = buildImagesTable(childImages);
  const bandsTableHtml = buildBandsTable(bands);
  const propsHtml = buildPropertiesRows(asset.properties);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
${imageCollectionStyle()}
</style>
</head>
<body>
<header class="title-bar">
  <h1>Asset details: ${escapeHtml(title)} (ImageCollection)</h1>
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
        <span class="info-label">ImageCollection ID</span>
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
        <span class="info-label">Number of Images</span>
        <span class="info-value">${imageCount}</span>
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
      <button class="tab" data-tab="images">IMAGES</button>
      <button class="tab" data-tab="bands">BANDS</button>
      <button class="tab" data-tab="properties">PROPERTIES</button>
    </nav>

    <section class="tab-panel active" id="tab-description">
      ${description ? `<div class="description-text">${marked(description)}</div>` : '<p class="empty-state">No description.</p>'}
    </section>

    <section class="tab-panel" id="tab-images">
      ${childImages.length > 0 ? `<p class="note">Limited to the first ${IMAGES_PAGE_SIZE} images.</p>` : ''}
      ${imagesTableHtml}
    </section>

    <section class="tab-panel" id="tab-bands">
      ${bands.length > 0 ? '<p class="note">Bands from the first image in the collection.</p>' : ''}
      ${bandsTableHtml}
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
    } else if (msg.type === 'imageDeleted') {
      const row = document.querySelector('tr[data-name="' + CSS.escape(msg.name) + '"]');
      if (row) row.remove();
    }
  });

  // Action button delegation (CSP-safe: no inline onclick)
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const name = btn.dataset.name;
    if (!name) return;
    if (action === 'open') {
      vscode.postMessage({ type: 'openImage', name: name });
    } else if (action === 'delete') {
      vscode.postMessage({ type: 'deleteImage', name: name });
    }
  });
})();
</script>
</body>
</html>`;
}

// ── Images table ────────────────────────────────────────────────────

function buildImagesTable(images: EEAsset[]): string {
  if (images.length === 0) {
    return '<p class="empty-state">No images found.</p>';
  }

  const rows = images
    .map((img) => {
      const shortId = (img.id || img.name).split('/').pop() || '';
      const lastMod = formatDate(img.updateTime);
      const size = formatBytes(img.sizeBytes);
      const start = formatDate(img.startTime);
      const end = formatDate(img.endTime);
      const bandCount = img.bands?.length ?? '\u2014';
      const fullName = escapeHtml(img.name);
      const dots = `<span class="action-dots">${ACTION_DOT}${ACTION_DOT}</span>`;
      const btns =
        `<span class="action-btns">` +
        `<button class="action-btn" title="Open preview" data-action="open" data-name="${fullName}">${ICON_PREVIEW}</button>` +
        `<button class="action-btn danger" title="Delete image" data-action="delete" data-name="${fullName}">${ICON_DELETE}</button>` +
        `</span>`;
      return `<tr data-name="${fullName}">
        <td class="img-id" title="${fullName}">${escapeHtml(shortId)}</td>
        <td>${lastMod}</td>
        <td>${size}</td>
        <td>${start}</td>
        <td>${end}</td>
        <td>${bandCount}</td>
        <td class="actions-cell">${dots}${btns}</td>
      </tr>`;
    })
    .join('');

  return `<div class="table-scroll">
    <table class="images-table">
      <thead>
        <tr>
          <th>Image ID</th>
          <th>Last Modified</th>
          <th>Size</th>
          <th>Start Date</th>
          <th>End Date</th>
          <th>Band Count</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Bands table ─────────────────────────────────────────────────────

function buildBandsTable(bands: EEBand[]): string {
  if (bands.length === 0) {
    return '<p class="empty-state">No band information available.</p>';
  }

  const rows = bands
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
        <td class="idx">${i}</td>
        <td>${escapeHtml(b.id)}</td>
        <td>${dtype}</td>
        <td>${dims}</td>
        <td>${crs}</td>
        <td>${scale}</td>
      </tr>`;
    })
    .join('');

  return `<table class="bands-table">
    <thead>
      <tr>
        <th>Index</th>
        <th>Name</th>
        <th>Type</th>
        <th>Dimensions</th>
        <th>CRS</th>
        <th>Nominal Scale</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Properties helper ───────────────────────────────────────────────

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

function imageCollectionStyle(): string {
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
  .note {
    font-size: 0.85em;
    opacity: 0.6;
    margin-bottom: 12px;
  }
  .description-text {
    font-size: 0.9em;
    line-height: 1.6;
  }
  .description-text h2 { font-size: 1.3em; margin: 16px 0 8px; }
  .description-text h3 { font-size: 1.1em; margin: 12px 0 6px; }
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
  .images-table, .bands-table, .props-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
  }
  .images-table th, .bands-table th, .props-table th {
    text-align: left;
    background: var(--vscode-list-hoverBackground);
    padding: 6px 10px;
    font-weight: 600;
    position: sticky;
    top: 0;
    white-space: nowrap;
  }
  .images-table td, .bands-table td, .props-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
    white-space: nowrap;
  }
  .images-table tbody tr:nth-child(even),
  .bands-table tbody tr:nth-child(even) {
    background: var(--vscode-list-hoverBackground);
  }
  .img-id {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
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
  .actions-cell { white-space: nowrap; text-align: right; }
  .action-dots { display: inline-flex; align-items: center; height: 22px; opacity: 0.4; }
  .action-dot { padding: 2px 6px; display: inline-flex; align-items: center; }
  .action-btns { display: none; align-items: center; height: 22px; }
  tr:hover .action-dots, tr:focus-within .action-dots { display: none; }
  tr:hover .action-btns, tr:focus-within .action-btns { display: inline-flex; }
  .action-btn {
    background: none !important; border: none !important; cursor: pointer;
    padding: 2px 6px; border-radius: 3px;
    color: var(--vscode-foreground); opacity: 0.7;
    display: inline-flex; align-items: center;
  }
  .action-btn:hover { opacity: 1; background: var(--vscode-list-hoverBackground) !important; }
  .action-btn.danger { color: var(--vscode-errorForeground); }
  .action-btn.danger:hover { background: var(--vscode-inputValidation-errorBackground) !important; }
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
