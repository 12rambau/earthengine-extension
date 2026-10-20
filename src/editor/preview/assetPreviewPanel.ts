/**
 * @module assetPreviewPanel
 * Dispatcher that routes an asset preview request to the appropriate
 * type-specific panel (Image, ImageCollection, FeatureCollection, or generic).
 */

import * as vscode from 'vscode';
import {
  AssetSharingChanges,
  EEAsset,
  getAsset,
  saveAssetSharing,
} from '../../sidebar/assets/eeApiClient.js';
import { codiconsCss, designTokens, renderPropertiesTable } from '../../shared/index.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';
import { openImagePreview } from './imagePreview/imagePreviewPanel.js';
import { openImageCollectionPreview } from './imageCollectionPreview/imageCollectionPreviewPanel.js';
import { openFeatureCollectionPreview } from './featureCollectionPreview/featureCollectionPreviewPanel.js';
import { openFeatureViewPreview } from './featureViewPreview/featureViewPreviewPanel.js';
import { openClassifierPreview } from './classifierPreview/classifierPreviewPanel.js';
import script from './assetPreviewPanel.svelte';
import { loadPreviewSharing } from './previewMetadata.js';

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
    case 'FEATURE_VIEW':
      await openFeatureViewPreview(asset, accessToken);
      break;
    case 'CLASSIFIER':
      await openClassifierPreview(asset, accessToken);
      break;
    default:
      openGenericPreview(asset, accessToken);
  }
}

// ==================================================================
// TYPE-SPECIFIC PREVIEWS
// ==================================================================
// ==================================================================
// FALLBACK
// ==================================================================
function openGenericPreview(
  asset: EEAsset,
  accessToken: string,
  detailsTitle?: string,
  details?: Record<string, string>,
  sample?: string,
): void {
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
    detailsTitle,
    detailsTable: details && renderPropertiesTable(details),
    sample,
    assetName: asset.name,
  }).replace(/</g, '\\u003c');

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${codiconsCss}</style>
    <style>${designTokens}</style>
  </head>
  <body>
    <div id="app"></div>
    <script id="init-data" type="application/json" nonce="${nonce}">${initJson}</script>
    <script nonce="${nonce}">${script}</script>
  </body>
</html>`;

  panel.webview.onDidReceiveMessage(
    async (msg: { type: string; sharing?: AssetSharingChanges }) => {
      if (msg.type === 'ready') {
        loadPreviewSharing(asset, accessToken, panel);
      } else if (msg.type === 'saveSharing' && msg.sharing) {
        try {
          await saveAssetSharing(asset.name, accessToken, msg.sharing);
          panel.webview.postMessage({ type: 'sharingSaved' });
          loadPreviewSharing(asset, accessToken, panel);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          panel.webview.postMessage({ type: 'sharingSaveError', message });
        }
      }
    },
  );
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
