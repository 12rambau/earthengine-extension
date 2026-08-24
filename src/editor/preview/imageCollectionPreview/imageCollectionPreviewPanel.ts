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
import { EEAsset, EEBand, listAssets, getAsset } from '../../../sidebar/assets/eeApiClient.js';
import { designTokens, codiconsCss, escapeHtml } from '../../../shared/index.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';
import { ensureEe, getThumbUrlRest } from '../../../shared/eeSession.js';
import { getExtensionUri } from '../../../shared/extensionContext.js';

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
/** Opens a read-only WebView showing full metadata for an IMAGE_COLLECTION asset. */
export async function openImageCollectionPreview(
  asset: EEAsset,
  accessToken: string,
): Promise<void> {
  const shortName = asset.name.split('/').pop() || 'ImageCollection';
  const panel = vscode.window.createWebviewPanel(
    'earthengine.imageCollectionPreview',
    shortName,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.iconPath = vscode.Uri.joinPath(
    getExtensionUri(),
    'resources',
    'icons',
    'image-multiple.svg',
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

  panel.webview.html = buildHtml(asset, childImages, bands, panel.webview);

  // Handle messages from the WebView
  panel.webview.onDidReceiveMessage(async (msg: { type: string; name?: string }) => {
    if (msg.type === 'ready') {
      sendThumbnail(asset, bands, childImages, panel);
    } else if (msg.type === 'openImage' && msg.name) {
      const token = await getTokenSafe(accessToken);
      try {
        const { openAssetPreview } = await import('../assetPreviewPanel.js');
        await openAssetPreview(msg.name, token);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to open image: ${errMsg}`);
      }
    } else if (msg.type === 'deleteImage' && msg.name) {
      const confirm = await vscode.window.showWarningMessage(
        `Delete "${msg.name.split('/').pop()}"? This action cannot be undone.`,
        'Delete',
      );
      if (confirm === 'Delete') {
        try {
          const { deleteAsset } = await import('../../../sidebar/assets/eeApiClient.js');
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
function buildHtml(
  asset: EEAsset,
  childImages: EEAsset[],
  bands: EEBand[],
  webview: vscode.Webview,
): string {
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
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src https: data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
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
