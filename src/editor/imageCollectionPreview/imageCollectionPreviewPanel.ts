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
import { escapeHtml, formatBytes, formatDate } from '../../shared/webviewUtils.js';
import { renderTemplate } from '../../shared/index.js';
import { ensureEe, getThumbUrl } from '../../shared/eeSession.js';
import template from './imageCollectionPreviewPanel.hbs';
import imagesTableTemplate from './imagesTable.hbs';
import bandsTableTemplate from './bandsTable.hbs';
import style from './imageCollectionPreviewPanel.css';
import script from './imageCollectionPreviewPanel.webview.js';

// ==================================================================
// CONSTANTS
// ==================================================================
/** Max images fetched for the IMAGES tab. */
const IMAGES_PAGE_SIZE = 100;

/** Max images used in the thumbnail mosaic. */
const MOSAIC_LIMIT = 10;

// ==================================================================
// ACTION ICONS (INLINE SVG)
// ==================================================================
const ICON_PREVIEW =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 1H4.5C3.122 1 2 2.122 2 3.5V6.276C2.319 6.162 2.653 6.089 3 6.05V3.499C3 2.672 3.673 1.999 4.5 1.999H8.5V13.385L9.557 14.442C9.714 14.591 9.831 14.786 9.907 14.999H13.5C14.878 14.999 16 13.877 16 12.499V3.5C16 2.122 14.878 1 13.5 1ZM15 12.5C15 13.327 14.327 14 13.5 14H9.5V2H13.5C14.327 2 15 2.673 15 3.5V12.5ZM6.29 12.59C6.74 12.01 7 11.28 7 10.5C7 8.57 5.43 7 3.5 7C1.57 7 0 8.57 0 10.5C0 12.43 1.57 14 3.5 14C4.28 14 5.01 13.74 5.59 13.29L8.15 15.85C8.24 15.95 8.37 16 8.5 16C8.63 16 8.76 15.95 8.85 15.85C9.05 15.66 9.05 15.34 8.85 15.15L6.29 12.59ZM5.5 12C5.36 12.19 5.19 12.36 5 12.5C4.59 12.81 4.06 13 3.5 13C2.12 13 1 11.88 1 10.5C1 9.12 2.12 8 3.5 8C4.88 8 6 9.12 6 10.5C6 11.06 5.81 11.59 5.5 12Z"/></svg>';
const ICON_DELETE =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 2H10C10 .897 9.103 0 8 0 6.897 0 6 .897 6 2H2c-.276 0-.5.224-.5.5s.224.5.5.5h.54l.809 9.708C3.456 13.994 4.55 15 5.84 15h4.319c1.29 0 2.384-.993 2.491-2.292L13.459 3H14c.276 0 .5-.224.5-.5S14.276 2 14 2zM8 1c.551 0 1 .449 1 1H7c0-.551.449-1 1-1zm3.655 11.625C11.591 13.396 10.934 14 10.16 14H5.841c-.774 0-1.431-.604-1.495-1.375L3.544 3h8.914l-.803 9.625zM7 5.5v6c0 .276-.224.5-.5.5S6 11.776 6 11.5v-6c0-.276.224-.5.5-.5s.5.224.5.5zm3 0v6c0 .276-.224.5-.5.5S9 11.776 9 11.5v-6c0-.276.224-.5.5-.5s.5.224.5.5z"/></svg>';
const ACTION_DOT =
  '<span class="action-dot"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z"/></svg></span>';

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
      sendThumbnail(asset, panel);
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
async function sendThumbnail(asset: EEAsset, panel: vscode.WebviewPanel): Promise<void> {
  try {
    const thumbUrl = await getCollectionThumbnailUrl(asset);
    panel.webview.postMessage({ type: 'thumbnail', url: thumbUrl });
  } catch {
    panel.webview.postMessage({ type: 'thumbnail', url: '', error: 'Thumbnail not available.' });
  }
}

/** Mosaics the first N images of the collection and requests a 256px thumbnail URL. */
async function getCollectionThumbnailUrl(asset: EEAsset): Promise<string> {
  const ee = await ensureEe();
  const mosaic = ee.ImageCollection(asset.name).limit(MOSAIC_LIMIT).mosaic().visualize({});
  return getThumbUrl(mosaic, { dimensions: 256, format: 'png' });
}

// ==================================================================
// HTML BUILDER
// ==================================================================
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

  return renderTemplate(template, {
    nonce,
    style,
    script,
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
    imagesNote:
      childImages.length > 0
        ? `<p class="note">Limited to the first ${IMAGES_PAGE_SIZE} images.</p>`
        : '',
    imagesTable: imagesTableHtml,
    bandsNote:
      bands.length > 0 ? '<p class="note">Bands from the first image in the collection.</p>' : '',
    bandsTable: bandsTableHtml,
    propsHtml,
  });
}

// ==================================================================
// IMAGES TABLE
// ==================================================================
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

  return renderTemplate(imagesTableTemplate, { rows });
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

  return renderTemplate(bandsTableTemplate, { rows });
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
