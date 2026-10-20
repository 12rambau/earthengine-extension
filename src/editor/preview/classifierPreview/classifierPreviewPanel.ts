/** @module classifierPreviewPanel — metadata preview for classifier model assets. */

import * as vscode from 'vscode';
import { AssetSharingChanges, EEAsset } from '../../../sidebar/assets/eeApiClient.js';
import { resolveTypeIcon } from '../../../sidebar/assets/assetTreeItem.js';
import { codiconsCss, designTokens, renderPropertiesTable } from '../../../shared/index.js';
import { computeValue, ensureEe } from '../../../shared/eeSession.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';

import script from './ClassifierPreview.svelte';
import {
  classifierDetails,
  loadPreviewSharing,
  previewMetadata,
  savePreviewMetadata,
} from '../previewMetadata.js';

// ==================================================================
// PUBLIC API
// ==================================================================
/** Opens the metadata, properties, and sharing preview for a classifier asset. */
export async function openClassifierPreview(asset: EEAsset, accessToken: string): Promise<void> {
  const shortName = asset.name.split('/').pop() || 'Classifier';
  const panel = vscode.window.createWebviewPanel(
    'earthengine.classifierPreview',
    shortName,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.iconPath = resolveTypeIcon(asset.type);

  const details = await getClassifierDetails(asset.name);
  panel.webview.html = buildHtml(asset, details);
  panel.webview.onDidReceiveMessage(
    async (msg: {
      type: string;
      name?: string;
      startTime?: string;
      endTime?: string;
      description?: string;
      sharing?: AssetSharingChanges | null;
    }) => {
      if (msg.type === 'ready') {
        loadPreviewSharing(asset, accessToken, panel);
      } else if (msg.type === 'saveMetadata') {
        await savePreviewMetadata(msg, asset, accessToken, panel);
      }
    },
  );
}

async function getClassifierDetails(assetName: string): Promise<Record<string, string>> {
  let mode: unknown;
  let schema: unknown;
  try {
    const ee = (await ensureEe()) as any;
    const classifier = ee.Classifier.load(assetName);
    const results = await Promise.allSettled([
      computeValue(classifier.mode()),
      computeValue(classifier.schema()),
    ]);
    mode = results[0].status === 'fulfilled' ? results[0].value : undefined;
    schema = results[1].status === 'fulfilled' ? results[1].value : undefined;
  } catch {
    // Asset metadata and sharing remain available when classifier evaluation fails.
  }
  return classifierDetails(mode, schema);
}

// ==================================================================
// HTML BUILDER
// ==================================================================
function buildHtml(asset: EEAsset, details: Record<string, string>): string {
  const nonce = getNonce();
  const initData = JSON.stringify({
    fileSize: asset.sizeBytes ? filesize(asset.sizeBytes) : 'N/A',
    lastModified: asset.updateTime
      ? dayjs.utc(asset.updateTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
      : 'N/A',
    metadata: previewMetadata(asset),
    detailsTable: renderPropertiesTable(details),
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
