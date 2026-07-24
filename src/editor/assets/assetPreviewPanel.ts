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
import { getAssetInfo } from '../../shared/eeSession.js';
import template from './assetPreviewPanel.hbs';

// ==================================================================
// PUBLIC API
// ==================================================================
/** Fetches the asset then opens the appropriate type-specific preview panel. */
export async function openAssetPreview(assetName: string, accessToken: string): Promise<void> {
  const asset = await getAsset(assetName, accessToken);

  // TEMP PROBE — remove after the ee.data.* transport investigation.
  // Calls ee.data.getAsset (EE JS client) for the same asset. Watch the Debug
  // Console: a failure means the EE transport is broken in this environment
  // (toggle `http.proxySupport` in settings to test the proxy-agent theory);
  // success logs the field keys so we can compare shapes.
  void probeEeGetAsset(assetName, asset);

  switch (asset.type) {
    case 'IMAGE':
      openImagePreview(asset);
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
// TEMP PROBE (ee.data.* transport investigation)
// ==================================================================
/**
 * Diagnostic: calls `ee.data.getAsset` via the EE JS client for the same asset
 * the REST client just fetched, and logs the outcome to the Debug Console of
 * the window that launched the Extension Development Host.
 *
 * Use it to test the `http.proxySupport` theory: toggle that setting in the
 * dev-host window, reopen a preview, and compare. Remove once resolved.
 */
async function probeEeGetAsset(name: string, rest: EEAsset): Promise<void> {
  try {
    const viaClient = await getAssetInfo(name);
    const restKeys = Object.keys(rest as object).sort();
    const clientKeys = Object.keys((viaClient ?? {}) as object).sort();
    console.log('[EE-PROBE] ✅ ee.data.getAsset succeeded for', name);
    console.log('[EE-PROBE] REST   keys:', restKeys.join(', '));
    console.log('[EE-PROBE] client keys:', clientKeys.join(', '));
    console.log(
      '[EE-PROBE] missing in client:',
      restKeys.filter((k) => !clientKeys.includes(k)).join(', ') || '(none)',
    );
  } catch (err) {
    console.log(
      '[EE-PROBE] ❌ ee.data.getAsset failed:',
      err instanceof Error ? err.message : String(err),
    );
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
