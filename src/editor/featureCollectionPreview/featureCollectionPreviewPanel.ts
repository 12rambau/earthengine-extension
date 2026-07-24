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
import { renderTemplate } from '../../shared/index.js';
import template from './featureCollectionPreviewPanel.hbs';
import style from './featureCollectionPreviewPanel.css';
import script from './featureCollectionPreviewPanel.webview.js';

// ==================================================================
// CONSTANTS
// ==================================================================
const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

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

// ==================================================================
// THUMBNAIL
// ==================================================================
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

  return renderTemplate(template, {
    nonce,
    style,
    script,
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
