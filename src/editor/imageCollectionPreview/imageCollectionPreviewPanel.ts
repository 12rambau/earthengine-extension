/**
 * @module imageCollectionPreviewPanel
 * WebView panel for previewing an Earth Engine ImageCollection asset.
 *
 * Renders metadata and properties.
 */

import * as vscode from 'vscode';
import { EEAsset } from '../../sidebar/assets/eeApiClient.js';
import {
  escapeHtml,
  formatBytes,
  formatDate,
  renderPropertiesTable,
  webviewBaseStyle,
} from '../../shared/webviewUtils.js';

// ── Public API ──────────────────────────────────────────────────────

/** Opens a read-only WebView showing full metadata for an IMAGE_COLLECTION asset. */
export function openImageCollectionPreview(asset: EEAsset): void {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.imageCollectionPreview',
    asset.id || asset.name.split('/').pop() || 'Image Collection',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  panel.webview.html = buildImageCollectionHtml(asset);
}

// ── HTML builder ────────────────────────────────────────────────────

/** Builds an HTML page showing image collection metadata and properties. */
function buildImageCollectionHtml(asset: EEAsset): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${webviewBaseStyle()}</style></head><body>
		<h1>${escapeHtml(asset.id || asset.name)}</h1>
		<span class="badge">IMAGE COLLECTION</span>
		<div class="meta">
			<div class="meta-item"><strong>Last Updated</strong>${formatDate(asset.updateTime)}</div>
			<div class="meta-item"><strong>Start Time</strong>${formatDate(asset.startTime)}</div>
			<div class="meta-item"><strong>End Time</strong>${formatDate(asset.endTime)}</div>
			<div class="meta-item"><strong>Size</strong>${formatBytes(asset.sizeBytes)}</div>
		</div>
		<h2>Properties</h2>
		${renderPropertiesTable(asset.properties)}
	</body></html>`;
}
