/**
 * @module assetPreviewPanel
 * Dispatcher that routes an asset preview request to the appropriate
 * type-specific panel (Image, ImageCollection, FeatureCollection, or generic).
 */

import * as vscode from 'vscode';
import { EEAsset, getAsset } from '../../sidebar/assets/eeApiClient.js';
import { designTokens, renderPropertiesTable } from '../../shared/index.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';
import { openImagePreview } from './imagePreview/imagePreviewPanel.js';
import { openImageCollectionPreview } from './imageCollectionPreview/imageCollectionPreviewPanel.js';
import { openFeatureCollectionPreview } from './featureCollectionPreview/featureCollectionPreviewPanel.js';
import script from './assetPreviewPanel.svelte';

// ==================================================================
// PUBLIC API
// ==================================================================
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

// ==================================================================
// FALLBACK
// ==================================================================
function openGenericPreview(asset: EEAsset): void {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.assetPreview',
    asset.id || asset.name.split('/').pop() || 'Asset',
    vscode.ViewColumn.One,
    { enableScripts: true },
  );

  const nonce = getNonce();
  const initJson = JSON.stringify({
    title: asset.id || asset.name,
    assetType: asset.type,
    updated: asset.updateTime
      ? dayjs.utc(asset.updateTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
      : 'N/A',
    size: asset.sizeBytes ? filesize(asset.sizeBytes) : 'N/A',
    propertiesTable: renderPropertiesTable(asset.properties),
  }).replace(/</g, '\\u003c');

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${designTokens}</style>
  </head>
  <body>
    <div id="app"></div>
    <script id="init-data" type="application/json" nonce="${nonce}">${initJson}</script>
    <script nonce="${nonce}">${script}</script>
  </body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
