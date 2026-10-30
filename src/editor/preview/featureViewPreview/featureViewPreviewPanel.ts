/**
 * @module featureViewPreviewPanel
 * WebView panel for previewing an Earth Engine FeatureView asset.
 */

import * as vscode from 'vscode';
import { AssetSharingChanges, EEAsset } from '../../../sidebar/assets/eeApiClient.js';
import { codiconsCss, designTokens } from '../../../shared/index.js';
import { getExtensionUri } from '../../../shared/extensionContext.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';
import { getFeatureViewThumbnail } from './featureViewThumbnail.js';

import script from './FeatureViewPreview.svelte';
import {
  featureViewDetails,
  handleClipboardReadRequest,
  loadPreviewSharing,
  previewMetadata,
  savePreviewMetadata,
} from '../previewMetadata.js';

// ==================================================================
// PUBLIC API
// ==================================================================
/** Opens a WebView showing metadata and ingestion options for a FeatureView. */
export async function openFeatureViewPreview(asset: EEAsset, accessToken: string): Promise<void> {
  const shortName = asset.name.split('/').pop() || 'FeatureView';
  const panel = vscode.window.createWebviewPanel(
    'earthengine.featureViewPreview',
    shortName,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.iconPath = vscode.Uri.joinPath(getExtensionUri(), 'resources', 'icons', 'image-marker.svg');

  panel.webview.html = buildHtml(asset);

  panel.webview.onDidReceiveMessage(
    async (msg: {
      type: string;
      name?: string;
      startTime?: string;
      endTime?: string;
      description?: string;
      sharing?: AssetSharingChanges | null;
    }) => {
      if (await handleClipboardReadRequest(msg, panel)) {
        return;
      }
      if (msg.type === 'ready') {
        loadPreviewSharing(asset, accessToken, panel);
        sendThumbnail(asset, panel);
      } else if (msg.type === 'saveMetadata') {
        await savePreviewMetadata(msg, asset, accessToken, panel);
      }
    },
  );
}

async function sendThumbnail(asset: EEAsset, panel: vscode.WebviewPanel): Promise<void> {
  try {
    const thumbnail = await getFeatureViewThumbnail(asset);
    panel.webview.postMessage({ type: 'thumbnail', ...thumbnail });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    panel.webview.postMessage({
      type: 'thumbnail',
      tiles: [],
      columns: 1,
      error: `FeatureView thumbnail unavailable: ${message}`,
    });
  }
}

// ==================================================================
// HTML BUILDER
// ==================================================================
function buildHtml(asset: EEAsset): string {
  const nonce = getNonce();
  const assetOptions = asset.featureViewAssetLocation?.assetOptions;
  const initData = JSON.stringify({
    fileSize: asset.sizeBytes ? filesize(asset.sizeBytes) : 'N/A',
    featureCount: featureViewDetails(asset)['Number of Features'],
    lastModified: asset.updateTime
      ? dayjs.utc(asset.updateTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
      : 'N/A',
    featureViewAttributes: assetOptions?.featureViewAttributes ?? [],
    metadata: previewMetadata(asset),
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src https: data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; worker-src blob:;"
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

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
