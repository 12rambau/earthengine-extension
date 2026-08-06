/**
 * @module assetPreviewPanel
 * Dispatcher that routes an asset preview request to the appropriate
 * type-specific panel (Image, ImageCollection, FeatureCollection, or generic).
 */

import * as vscode from 'vscode';
import { EEAsset, getAsset } from '../../sidebar/assets/eeApiClient.js';
import { renderPropertiesTable, webviewBaseStyle } from '../../shared/index.js';
import { filesize } from 'filesize';
import dayjs from 'dayjs';
import { openImagePreview } from '../imagePreview/imagePreviewPanel.js';
import { openImageCollectionPreview } from '../imageCollectionPreview/imageCollectionPreviewPanel.js';
import { openFeatureCollectionPreview } from '../featureCollectionPreview/featureCollectionPreviewPanel.js';
import Handlebars from 'handlebars';
import template from './assetPreviewPanel.hbs';

const render = Handlebars.compile(template);

// ==================================================================
// PUBLIC API
// ==================================================================
/** Fetches the asset then opens the appropriate type-specific preview panel. */
export async function openAssetPreview(assetName: string, accessToken: string): Promise<void> {
  const asset = await getAsset(assetName, accessToken);

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
// FALLBACK
// ==================================================================
function openGenericPreview(asset: EEAsset): void {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.assetPreview',
    asset.id || asset.name.split('/').pop() || 'Asset',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  panel.webview.html = render({
    baseStyle: webviewBaseStyle(),
    title: asset.id || asset.name,
    assetType: asset.type,
    updated: asset.updateTime
      ? dayjs.utc(asset.updateTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
      : 'N/A',
    size: asset.sizeBytes ? filesize(asset.sizeBytes) : 'N/A',
    propertiesTable: renderPropertiesTable(asset.properties),
  });
}
