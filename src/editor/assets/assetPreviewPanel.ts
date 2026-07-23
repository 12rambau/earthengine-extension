/**
 * @module assetPreviewPanel
 * Dispatcher that routes an asset preview request to the appropriate
 * type-specific panel (Image, ImageCollection, FeatureCollection, or generic).
 */

import * as vscode from 'vscode';
import { EEAsset, getAsset } from '../../sidebar/assets/eeApiClient.js';
import {
  escapeHtml,
  formatBytes,
  formatDate,
  renderPropertiesTable,
  webviewBaseStyle,
} from '../../shared/webviewUtils.js';
import { openImagePreview } from '../imagePreview/index.js';
import { openImageCollectionPreview } from '../imageCollectionPreview/index.js';
import { openFeatureCollectionPreview } from '../featureCollectionPreview/index.js';

// ── Public API ──────────────────────────────────────────────────────

/** Fetches the asset then opens the appropriate type-specific preview panel. */
export async function openAssetPreview(assetName: string, accessToken: string): Promise<void> {
  const asset = await getAsset(assetName, accessToken);

  switch (asset.type) {
    case 'IMAGE':
      openImagePreview(asset, accessToken);
      break;
    case 'IMAGE_COLLECTION':
      await openImageCollectionPreview(asset, accessToken);
      break;
    case 'TABLE':
      await openFeatureCollectionPreview(asset, accessToken);
      break;
    default:
      openGenericPreview(asset);
  }
}

// ── Fallback ────────────────────────────────────────────────────────

function openGenericPreview(asset: EEAsset): void {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.assetPreview',
    asset.id || asset.name.split('/').pop() || 'Asset',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${webviewBaseStyle()}</style></head><body>
		<h1>${escapeHtml(asset.id || asset.name)}</h1>
		<span class="badge">${escapeHtml(asset.type)}</span>
		<div class="meta">
			<div class="meta-item"><strong>Last Updated</strong>${formatDate(asset.updateTime)}</div>
			<div class="meta-item"><strong>Size</strong>${formatBytes(asset.sizeBytes)}</div>
		</div>
		<h2>Properties</h2>
		${renderPropertiesTable(asset.properties)}
	</body></html>`;
}
