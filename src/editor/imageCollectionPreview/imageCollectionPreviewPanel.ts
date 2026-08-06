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
import { escapeHtml } from '../../shared/index.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';
import { ensureEe, getThumbUrlRest } from '../../shared/eeSession.js';

import script from './ImageCollectionPreview.svelte';

// ==================================================================
// CONSTANTS
// ==================================================================
/** Max images fetched for the IMAGES tab. */
const IMAGES_PAGE_SIZE = 100;

/** Max images used in the thumbnail mosaic. */
const MOSAIC_LIMIT = 4;

/** Near-global extent for collections without a usable footprint. */
const GLOBAL_BBOX = [-180, -89, 180, 89];

// ==================================================================
// ACTION ICONS (INLINE SVG)
// ==================================================================
const ICON_PREVIEW =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 1H4.5C3.122 1 2 2.122 2 3.5V6.276C2.319 6.162 2.653 6.089 3 6.05V3.499C3 2.672 3.673 1.999 4.5 1.999H8.5V13.385L9.557 14.442C9.714 14.591 9.831 14.786 9.907 14.999H13.5C14.878 14.999 16 13.877 16 12.499V3.5C16 2.122 14.878 1 13.5 1ZM15 12.5C15 13.327 14.327 14 13.5 14H9.5V2H13.5C14.327 2 15 2.673 15 3.5V12.5ZM6.29 12.59C6.74 12.01 7 11.28 7 10.5C7 8.57 5.43 7 3.5 7C1.57 7 0 8.57 0 10.5C0 12.43 1.57 14 3.5 14C4.28 14 5.01 13.74 5.59 13.29L8.15 15.85C8.24 15.95 8.37 16 8.5 16C8.63 16 8.76 15.95 8.85 15.85C9.05 15.66 9.05 15.34 8.85 15.15L6.29 12.59ZM5.5 12C5.36 12.19 5.19 12.36 5 12.5C4.59 12.81 4.06 13 3.5 13C2.12 13 1 11.88 1 10.5C1 9.12 2.12 8 3.5 8C4.88 8 6 9.12 6 10.5C6 11.06 5.81 11.59 5.5 12Z"/></svg>';
const ICON_DELETE =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 2H10C10 .897 9.103 0 8 0 6.897 0 6 .897 6 2H2c-.276 0-.5.224-.5.5s.224.5.5.5h.54l.809 9.708C3.456 13.994 4.55 15 5.84 15h4.319c1.29 0 2.384-.993 2.491-2.292L13.459 3H14c.276 0 .5-.224.5-.5S14.276 2 14 2zM8 1c.551 0 1 .449 1 1H7c0-.551.449-1 1-1zm3.655 11.625C11.591 13.396 10.934 14 10.16 14H5.841c-.774 0-1.431-.604-1.495-1.375L3.544 3h8.914l-.803 9.625zM7 5.5v6c0 .276-.224.5-.5.5S6 11.776 6 11.5v-6c0-.276.224-.5.5-.5s.5.224.5.5zm3 0v6c0 .276-.224.5-.5.5S9 11.776 9 11.5v-6c0-.276.224-.5.5-.5s.5.224.5.5z"/></svg>';

// ==================================================================
// PUBLIC API
// ==================================================================
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
      sendThumbnail(asset, bands, childImages, panel);
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

// ==================================================================
// THUMBNAIL
// ==================================================================
async function sendThumbnail(
  asset: EEAsset,
  bands: EEBand[],
  childImages: EEAsset[],
  panel: vscode.WebviewPanel,
): Promise<void> {
  try {
    const thumbUrl = await getCollectionThumbnailUrl(asset, bands, childImages);
    panel.webview.postMessage({ type: 'thumbnail', url: thumbUrl });
  } catch (err) {
    panel.webview.postMessage({ type: 'thumbnail', url: '', error: 'Thumbnail not available.' });
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load collection thumbnail: ${msg}`);
  }
}

/** Mosaics the first N images of the collection and requests a 256px thumbnail URL. */
async function getCollectionThumbnailUrl(
  asset: EEAsset,
  bands: EEBand[],
  childImages: EEAsset[],
): Promise<string> {
  const ee = await ensureEe();
  const mosaicImages = childImages.slice(0, MOSAIC_LIMIT);
  const collection =
    mosaicImages.length > 0
      ? ee.ImageCollection(mosaicImages.map((img) => ee.Image(img.name)))
      : ee.ImageCollection(asset.name).limit(MOSAIC_LIMIT);
  const mosaic = collection.mosaic();
  const firstBand = bands[0]?.id;
  const visualized = mosaic.visualize(firstBand ? { bands: [firstBand] } : {});

  const globalParams = {
    format: 'PNG',
    grid: {
      dimensions: { width: 256, height: 256 },
      affineTransform: {
        scaleX: 360 / 256,
        shearX: 0,
        translateX: -180,
        shearY: 0,
        scaleY: -178 / 256,
        translateY: 89,
      },
      crsCode: 'EPSG:4326',
    },
  };

  const isGlobal = !asset.geometry || !hasFiniteCoordinates(asset.geometry);
  if (isGlobal) {
    return getThumbUrlRest(visualized, globalParams);
  }
  try {
    return await getThumbUrlRest(visualized, {
      dimensions: [256, 256],
      region: getRegion(ee, mosaic, asset),
      format: 'PNG',
    });
  } catch {
    return getThumbUrlRest(visualized, globalParams);
  }
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
    return val.length > 0 && val.every(hasFiniteCoordinates);
  }
  if (val && typeof val === 'object') {
    return hasFiniteCoordinates((val as Record<string, unknown>).coordinates);
  }
  return false;
}

/** Returns a square ee.Geometry region for the thumbnail. */
function getRegion(ee: any, image: any, asset: EEAsset): unknown {
  if (asset.geometry && hasFiniteCoordinates(asset.geometry)) {
    const bounds = image.geometry().bounds();
    const radius = bounds.perimeter(1).divide(4);
    return bounds.centroid(1).buffer(radius).bounds();
  }
  return ee.Geometry.BBox(...GLOBAL_BBOX);
}

// ==================================================================
// HTML BUILDER
// ==================================================================
function buildHtml(asset: EEAsset, childImages: EEAsset[], bands: EEBand[]): string {
  const nonce = getNonce();
  const title = asset.id || asset.name.split('/').pop() || 'ImageCollection';
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
  const imageCount = childImages.length;

  const description = asset.properties?.['description']
    ? String(asset.properties['description'])
    : '';

  // Structured image data for the Svelte {#each}
  const imagesData = childImages.map((img) => ({
    name: img.name,
    shortId: (img.id || img.name).split('/').pop() || '',
    lastModified: img.updateTime
      ? dayjs.utc(img.updateTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
      : 'N/A',
    size: img.sizeBytes ? filesize(img.sizeBytes) : 'N/A',
    startDate: img.startTime ? dayjs.utc(img.startTime).format('YYYY-MM-DD HH:mm:ss [UTC]') : 'N/A',
    endDate: img.endTime ? dayjs.utc(img.endTime).format('YYYY-MM-DD HH:mm:ss [UTC]') : 'N/A',
    bandCount: img.bands?.length ?? '\u2014',
  }));

  const bandsHtml = buildBandsTable(bands);
  const propsHtml = buildPropertiesRows(asset.properties);

  const initData = JSON.stringify({
    title,
    assetId,
    startDate,
    endDate,
    fileSize,
    imageCount: String(imageCount),
    lastModified,
    descriptionHtml: description
      ? `<div class="description-text">${marked(description)}</div>`
      : '<p class="empty-state">No description.</p>',
    images: imagesData,
    imagesPageSize: IMAGES_PAGE_SIZE,
    bandsHtml:
      (bands.length > 0
        ? '<p class="note">Bands from the first image in the collection.</p>'
        : '') + bandsHtml,
    propsHtml,
    previewIconSvg: ICON_PREVIEW,
    deleteIconSvg: ICON_DELETE,
    actionDotSvg:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z"/></svg>',
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />

  </head>
  <body>
    <div id="app"></div>
    <script id="init-data" type="application/json" nonce="${nonce}">${initData}</script>
    <script nonce="${nonce}">${script}</script>
  </body>
</html>`;
}

// ==================================================================
// BANDS TABLE
// ==================================================================
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

  return `<table class="bands-table"><thead><tr><th>Index</th><th>Name</th><th>Type</th><th>Dimensions</th><th>CRS</th><th>Nominal Scale</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ==================================================================
// PROPERTIES HELPER
// ==================================================================
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
