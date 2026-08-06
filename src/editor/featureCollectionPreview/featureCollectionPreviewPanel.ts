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
import { escapeHtml } from '../../shared/index.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';
import { ensureEe, getThumbUrlRest } from '../../shared/eeSession.js';
import style from './featureCollectionPreviewPanel.css';
import script from './featureCollectionPreviewPanel.webview.js';

// ==================================================================
// CONSTANTS
// ==================================================================
/** Number of features to display in the FEATURES tab. */
const FEATURES_PAGE_SIZE = 20;

// ==================================================================
// PUBLIC API
// ==================================================================
/** Opens a read-only WebView showing full metadata for a TABLE asset. */
export async function openFeatureCollectionPreview(
  asset: EEAsset,
  accessToken: string,
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.featureCollectionPreview',
    `Asset details: ${asset.id || asset.name.split('/').pop() || 'Table'}`,
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
      sendThumbnail(asset, panel);
    }
  });
}

// ==================================================================
// THUMBNAIL
// ==================================================================
async function sendThumbnail(asset: EEAsset, panel: vscode.WebviewPanel): Promise<void> {
  try {
    const thumbUrl = await getTableThumbnailUrl(asset);
    panel.webview.postMessage({ type: 'thumbnail', url: thumbUrl });
  } catch (err) {
    panel.webview.postMessage({ type: 'thumbnail', url: '' });
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load thumbnail: ${msg}`);
  }
}

/** Paints features with red fill and red border on an empty image, using the buffered bounds as region. */
async function getTableThumbnailUrl(asset: EEAsset): Promise<string> {
  const ee = await ensureEe();
  const fc = ee.FeatureCollection(asset.name);
  const painted = ee.Image(0).paint(fc, 1).paint(fc, 2, 1);
  const visualized = painted.visualize({
    palette: ['FFFFFF', 'FFCCCC', 'FF0000'],
    min: 0,
    max: 2,
  });
  return getThumbUrlRest(visualized, {
    format: 'PNG',
    grid: buildSquareGrid(asset.geometry),
  });
}

/** Builds a 256×256 square grid from the asset geometry, or a global fallback. */
function buildSquareGrid(geometry: unknown): Record<string, unknown> {
  const bbox = extractBbox(geometry);
  const cx = (bbox[0] + bbox[2]) / 2;
  const cy = (bbox[1] + bbox[3]) / 2;
  const half = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]) / 2;
  const x0 = cx - half;
  const y0 = cy + half;
  const span = half * 2;
  return {
    dimensions: { width: 256, height: 256 },
    affineTransform: {
      scaleX: span / 256,
      shearX: 0,
      translateX: x0,
      shearY: 0,
      scaleY: -span / 256,
      translateY: y0,
    },
    crsCode: 'EPSG:4326',
  };
}

/** Extracts [minX, minY, maxX, maxY] from a GeoJSON geometry, or returns a global fallback. */
function extractBbox(geometry: unknown): [number, number, number, number] {
  const fallback: [number, number, number, number] = [-89, -89, 89, 89];
  if (!geometry || typeof geometry !== 'object') {
    return fallback;
  }
  const coords = (geometry as Record<string, unknown>).coordinates;
  if (!coords) {
    return fallback;
  }
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  (function walk(c: unknown) {
    if (Array.isArray(c)) {
      if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
        if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
          return;
        }
        bbox[0] = Math.min(bbox[0], c[0]);
        bbox[1] = Math.min(bbox[1], c[1]);
        bbox[2] = Math.max(bbox[2], c[0]);
        bbox[3] = Math.max(bbox[3], c[1]);
      } else {
        c.forEach(walk);
      }
    }
  })(coords);
  return Number.isFinite(bbox[0]) ? bbox : fallback;
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
  _webview: vscode.Webview,
): string {
  const nonce = getNonce();
  const title = asset.id || asset.name.split('/').pop() || 'Table';
  const assetId = asset.name;
  const startDate = asset.startTime
    ? dayjs.utc(asset.startTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
    : 'N/A';
  const endDate = asset.endTime
    ? dayjs.utc(asset.endTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
    : 'N/A';
  const fileSize = asset.sizeBytes ? filesize(asset.sizeBytes) : 'N/A';
  const lastModified = asset.updateTime
    ? dayjs.utc(asset.updateTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
    : 'N/A';
  const featureCount = asset.featureCount
    ? parseInt(asset.featureCount, 10).toLocaleString()
    : 'N/A';

  // Description from properties
  const description = asset.properties?.['description']
    ? String(asset.properties['description'])
    : '';

  // Columns inferred from first feature
  const columns = inferColumns(features);

  // Build tab content HTML
  const featuresTableHtml = buildFeaturesTable(features, columns);
  const columnsTableHtml = buildColumnsTable(columns);
  const propsHtml = buildPropertiesRows(asset.properties);

  const initData = JSON.stringify({
    title,
    assetId,
    startDate,
    endDate,
    fileSize,
    featureCount,
    lastModified,
    descriptionHtml: description
      ? `<div class="description-text">${marked(description)}</div>`
      : '<p class="empty-state">No description.</p>',
    featuresTableHtml,
    columnsTableHtml,
    propsHtml,
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
    />
    <style nonce="${nonce}">${style}</style>
  </head>
  <body>
    <div id="app"></div>
    <script id="init-data" type="application/json" nonce="${nonce}">${initData}</script>
    <script nonce="${nonce}">${script}</script>
  </body>
</html>`;
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
// PROPERTIES HELPER
// ==================================================================
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
