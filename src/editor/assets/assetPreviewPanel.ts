/**
 * @module assetPreviewPanel
 * Dispatcher that routes an asset preview request to the appropriate
 * type-specific panel (Image, ImageCollection, FeatureCollection, or generic).
 */

import * as vscode from 'vscode';
import { EEAsset, getAsset } from '../../sidebar/assets/eeApiClient.js';
import {
  formatBytes,
  formatDate,
  renderPropertiesTable,
  webviewBaseStyle,
} from '../../shared/webviewUtils.js';
import { openImagePreview } from '../imagePreview/index.js';
import { openImageCollectionPreview } from '../imageCollectionPreview/index.js';
import { openFeatureCollectionPreview } from '../featureCollectionPreview/index.js';
import { renderTemplate } from '../../shared/index.js';
import template from './assetPreviewPanel.hbs';

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

  panel.webview.html = renderTemplate(template, {
    baseStyle: webviewBaseStyle(),
    title: asset.id || asset.name,
    assetType: asset.type,
    updated: formatDate(asset.updateTime),
    size: formatBytes(asset.sizeBytes),
    propertiesTable: renderPropertiesTable(asset.properties),
  });
}
