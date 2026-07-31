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
import { escapeHtml } from '../../shared/index.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';
import { ensureEe, computeValue, getThumbUrlRest } from '../../shared/eeSession.js';
import Handlebars from 'handlebars';
import template from './imagePreviewPanel.hbs';

const render = Handlebars.compile(template);
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
  } catch (err) {
    panel.webview.postMessage({ type: 'thumbnail', url: '' });
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load thumbnail: ${msg}`);
  }
}

/** Visualizes the image's first band and requests a 256px thumbnail URL. */
async function getThumbnailUrl(asset: EEAsset): Promise<string> {
  const ee = await ensureEe();
  const firstBand = asset.bands?.[0]?.id;
  const image = ee.Image(asset.name);
  const visualized = image.visualize(firstBand ? { bands: [firstBand] } : {});
  return getThumbUrlRest(visualized, {
    dimensions: [256, 256],
    region: getRegion(ee, image, asset),
    format: 'PNG',
  });
}

// ==================================================================
// MIN/MAX
// ==================================================================
async function sendMinMax(asset: EEAsset, panel: vscode.WebviewPanel): Promise<void> {
  try {
    const minMax = await computeMinMax(asset);
    panel.webview.postMessage({ type: 'minmax', data: minMax });
  } catch (err) {
    panel.webview.postMessage({ type: 'minmax', data: null });
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to compute band min/max: ${msg}`);
  }
}

interface BandMinMax {
  [bandId: string]: { min: number | null; max: number | null };
}

/** Reduces the image over its footprint with ee.Reducer.minMax() and groups the result per band. */
async function computeMinMax(asset: EEAsset): Promise<BandMinMax> {
  const ee = await ensureEe();
  const image = ee.Image(asset.name);
  const region = getRegion(ee, image, asset);

  const reduced = image.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: region,
    bestEffort: true,
    maxPixels: 1e8,
  });
  const values = await computeValue<Record<string, number> | null>(reduced);

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
/** Returns false when any coordinate is non-finite (Infinity strings, NaN, etc.). */
function hasFiniteCoordinates(val: unknown): boolean {
  if (typeof val === 'number') {
    return Number.isFinite(val);
  }
  if (typeof val === 'string') {
    return false;
  }
  if (Array.isArray(val)) {
    return val.every(hasFiniteCoordinates);
  }
  if (val && typeof val === 'object') {
    return hasFiniteCoordinates((val as Record<string, unknown>).coordinates);
  }
  return false;
}

/** Returns an ee.Geometry rectangle for the image region. */
function getRegion(ee: any, image: any, asset: EEAsset): unknown {
  if (asset.geometry && hasFiniteCoordinates(asset.geometry)) {
    return image.geometry().bounds();
  }
  return ee.Geometry.BBox(...GLOBAL_BBOX);
}

// ==================================================================
// HTML BUILDER
// ==================================================================
function buildImageHtml(asset: EEAsset, webview: vscode.Webview): string {
  const bands = asset.bands || [];
  const nonce = getNonce();
  const title = asset.id || asset.name.split('/').pop() || 'Image';
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

  return render({
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
