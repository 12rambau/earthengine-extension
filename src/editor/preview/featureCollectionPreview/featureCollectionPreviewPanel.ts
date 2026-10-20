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
import { AssetSharingChanges, EEAsset, listFeatures } from '../../../sidebar/assets/eeApiClient.js';
import { designTokens, codiconsCss, escapeHtml } from '../../../shared/index.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';
import { computeValue, ensureEe } from '../../../shared/eeSession.js';
import { getExtensionUri } from '../../../shared/extensionContext.js';

import script from './FeatureCollectionPreview.svelte';
import { loadPreviewSharing, previewMetadata, savePreviewMetadata } from '../previewMetadata.js';
import { getFeatureCollectionThumbnailUrl } from './featureCollectionThumbnail.js';

// ==================================================================
// CONSTANTS
// ==================================================================
/** Number of features to display in the FEATURES tab. */
const FEATURES_PAGE_SIZE = 20;

// ==================================================================
// PUBLIC API
// ==================================================================
/** Opens a WebView showing metadata for a TABLE asset. */
export async function openFeatureCollectionPreview(
  asset: EEAsset,
  accessToken: string,
): Promise<void> {
  const shortName = asset.name.split('/').pop() || 'Table';
  const panel = vscode.window.createWebviewPanel(
    'earthengine.featureCollectionPreview',
    shortName,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.iconPath = vscode.Uri.joinPath(
    getExtensionUri(),
    'resources',
    'icons',
    'table-multiple.svg',
  );

  // Fetch the first 20 features upfront (needed for FEATURES + COLUMNS tabs)
  const [resp, featureCount] = await Promise.all([
    listFeatures(asset.name, accessToken, FEATURES_PAGE_SIZE).catch(() => ({ features: [] })),
    getFeatureCollectionCount(asset.name).catch(() => undefined),
  ]);
  const features = resp.features ?? [];

  panel.webview.html = buildHtml(asset, features, featureCount, panel.webview);

  // Handle messages from the WebView (lazy thumbnail loading)
  panel.webview.onDidReceiveMessage(
    async (msg: {
      type: string;
      name?: string;
      startTime?: string;
      endTime?: string;
      description?: string;
      sharing?: AssetSharingChanges | null;
    }) => {
      if (msg.type === 'ready') {
        loadPreviewSharing(asset, accessToken, panel);
        sendThumbnail(asset, panel);
      } else if (msg.type === 'saveMetadata') {
        await savePreviewMetadata(msg, asset, accessToken, panel);
      }
    },
  );
}

/** Returns the number of features in a FeatureCollection, evaluated server-side. */
async function getFeatureCollectionCount(assetName: string): Promise<number> {
  const ee = await ensureEe();
  return computeValue<number>(ee.FeatureCollection(assetName).size());
}

// ==================================================================
// THUMBNAIL
// ==================================================================
async function sendThumbnail(asset: EEAsset, panel: vscode.WebviewPanel): Promise<void> {
  try {
    const thumbUrl = await getFeatureCollectionThumbnailUrl(asset);
    panel.webview.postMessage({ type: 'thumbnail', url: thumbUrl });
  } catch (err) {
    panel.webview.postMessage({ type: 'thumbnail', url: '' });
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load thumbnail: ${msg}`);
  }
}

// ==================================================================
// COLUMN TYPE INFERENCE
// ==================================================================
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

// ==================================================================
// HTML BUILDER
// ==================================================================
function buildHtml(
  asset: EEAsset,
  features: { properties?: Record<string, unknown> }[],
  featureCount: number | undefined,
  _webview: vscode.Webview,
): string {
  const nonce = getNonce();
  const fileSize = asset.sizeBytes ? filesize(asset.sizeBytes) : 'N/A';
  const lastModified = asset.updateTime
    ? dayjs.utc(asset.updateTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
    : 'N/A';
  const formattedFeatureCount = formatFeatureCount(featureCount ?? asset.featureCount);

  // Columns inferred from first feature
  const columns = inferColumns(features);

  // Build tab content HTML
  const featuresTableHtml = buildFeaturesTable(features, columns);
  const columnsTableHtml = buildColumnsTable(columns);

  const initData = JSON.stringify({
    fileSize,
    featureCount: formattedFeatureCount,
    lastModified,
    metadata: previewMetadata(asset),
    featuresTableHtml,
    columnsTableHtml,
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src https: data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; worker-src blob:;"
    />
    <style>${codiconsCss}</style>
    <style>${designTokens}</style>
  </head>
  <body>
    <div id="app"></div>
    <script id="init-data" type="application/json" nonce="${nonce}">${initData}</script>
    <script nonce="${nonce}">${script}</script>
  </body>
</html>`;
}

/** Formats a feature count from the API or an evaluated FeatureCollection size. */
export function formatFeatureCount(count: number | string | undefined): string {
  if (count === undefined || count === '') {
    return 'N/A';
  }
  const numericCount = typeof count === 'string' ? Number(count) : count;
  return Number.isFinite(numericCount) ? numericCount.toLocaleString() : 'N/A';
}

// ==================================================================
// FEATURES TABLE
// ==================================================================
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

// ==================================================================
// COLUMNS TABLE
// ==================================================================
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

// ==================================================================
// NONCE HELPER
// ==================================================================
function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
