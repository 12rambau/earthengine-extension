/**
 * @module imagePreviewPanel
 * WebView panel for previewing an Earth Engine Image asset.
 *
 * Renders metadata, band table, and properties.
 */

import * as vscode from 'vscode';
import { EEAsset, EEBand } from '../../sidebar/assets/eeApiClient.js';
import {
  escapeHtml,
  formatBytes,
  formatDate,
  renderPropertiesTable,
  webviewBaseStyle,
} from '../../shared/webviewUtils.js';

// ── Public API ──────────────────────────────────────────────────────

/** Opens a read-only WebView showing full metadata for an IMAGE asset. */
export function openImagePreview(asset: EEAsset): void {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.imagePreview',
    asset.id || asset.name.split('/').pop() || 'Image',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  panel.webview.html = buildImageHtml(asset);
}

// ── HTML builder ────────────────────────────────────────────────────

/** Builds an HTML page showing image metadata and band table. */
function buildImageHtml(asset: EEAsset): string {
  const bands = asset.bands || [];
  const bandsHtml =
    bands.length > 0
      ? `
		<h2>Bands (${bands.length})</h2>
		<table>
			<thead><tr><th>Name</th><th>Type</th><th>Dimensions</th><th>CRS</th><th>Scale</th></tr></thead>
			<tbody>${bands.map(bandRow).join('')}</tbody>
		</table>`
      : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${webviewBaseStyle()}</style></head><body>
		<h1>${escapeHtml(asset.id || asset.name)}</h1>
		<span class="badge">IMAGE</span>
		<div class="meta">
			<div class="meta-item"><strong>Size</strong>${formatBytes(asset.sizeBytes)}</div>
			<div class="meta-item"><strong>Last Updated</strong>${formatDate(asset.updateTime)}</div>
			<div class="meta-item"><strong>Start Time</strong>${formatDate(asset.startTime)}</div>
			<div class="meta-item"><strong>End Time</strong>${formatDate(asset.endTime)}</div>
		</div>
		${bandsHtml}
		<h2>Properties</h2>
		${renderPropertiesTable(asset.properties)}
	</body></html>`;
}

/** Renders a single band row for the bands table. */
function bandRow(b: EEBand): string {
  const dims = b.grid?.dimensions
    ? `${b.grid.dimensions.width} × ${b.grid.dimensions.height}`
    : 'N/A';
  const crs = b.grid?.crsCode || 'N/A';
  const scale = b.grid?.affineTransform?.scaleX
    ? `${Math.abs(b.grid.affineTransform.scaleX)}`
    : 'N/A';
  const dtype = b.dataType?.precision || 'N/A';
  return `<tr><td><code>${escapeHtml(b.id)}</code></td><td>${dtype}</td><td>${dims}</td><td>${crs}</td><td>${scale}</td></tr>`;
}
