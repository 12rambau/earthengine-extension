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
import { escapeHtml, formatBytes, formatDate } from '../../shared/webviewUtils.js';
import { renderTemplate } from '../../shared/index.js';
import { ensureEe, evaluate, getThumbUrl } from '../../shared/eeSession.js';
import template from './imagePreviewPanel.hbs';
import style from './imagePreviewPanel.css';
import script from './imagePreviewPanel.webview.js';

// ==================================================================
// CONSTANTS
// ==================================================================
/** Near-global bbox in EPSG:4326, shrunk a few degrees to avoid antimeridian issues. */
const GLOBAL_BBOX = [-175, -85, 175, 85];

// ==================================================================
// PUBLIC API
// ==================================================================
/** Opens a read-only WebView showing full metadata for an IMAGE asset. */
export function openImagePreview(asset: EEAsset): void {
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
      sendThumbnail(asset, panel);
      sendMinMax(asset, panel);
    }
  });
}

// ==================================================================
// THUMBNAIL
// ==================================================================
async function sendThumbnail(asset: EEAsset, panel: vscode.WebviewPanel): Promise<void> {
  try {
    const thumbUrl = await getThumbnailUrl(asset);
    panel.webview.postMessage({ type: 'thumbnail', url: thumbUrl });
  } catch {
    panel.webview.postMessage({ type: 'thumbnail', url: '' });
  }
}

/** Visualizes the image's first band and requests a 256px thumbnail URL. */
async function getThumbnailUrl(asset: EEAsset): Promise<string> {
  const ee = await ensureEe();
  const firstBand = asset.bands?.[0]?.id;
  const visualized = ee.Image(asset.name).visualize(firstBand ? { bands: [firstBand] } : {});
  return getThumbUrl(visualized, {
    dimensions: 256,
    region: getFootprintOrGlobal(asset),
    format: 'png',
  });
}

// ==================================================================
// MIN/MAX
// ==================================================================
async function sendMinMax(asset: EEAsset, panel: vscode.WebviewPanel): Promise<void> {
  try {
    const minMax = await computeMinMax(asset);
    panel.webview.postMessage({ type: 'minmax', data: minMax });
  } catch {
    panel.webview.postMessage({ type: 'minmax', data: null });
  }
}

interface BandMinMax {
  [bandId: string]: { min: number | null; max: number | null };
}

/** Reduces the image over its footprint with ee.Reducer.minMax() and groups the result per band. */
async function computeMinMax(asset: EEAsset): Promise<BandMinMax> {
  const ee = await ensureEe();
  const reduced = ee.Image(asset.name).reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: getFootprintOrGlobal(asset),
    bestEffort: true,
    maxPixels: 1e8,
  });
  const values = await evaluate<Record<string, number> | null>(reduced);

  const result: BandMinMax = {};
  if (values) {
    for (const [key, val] of Object.entries(values)) {
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

// ==================================================================
// GEOMETRY HELPER
// ==================================================================
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

// ==================================================================
// HTML BUILDER
// ==================================================================
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

  return renderTemplate(template, {
    nonce,
    style,
    script,
    title,
    assetId,
    startDate,
    endDate,
    fileSize,
    bandCount: String(bandCount),
    lastModified,
    descriptionHtml: description
      ? `<div class="description-text">${marked(description)}</div>`
      : '<p class="description-text">No description.</p>',
    bandsRows: bandsRowsHtml,
    propsRows: propsHtml,
  });
}

// ==================================================================
// PROPERTIES HELPER
// ==================================================================
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
