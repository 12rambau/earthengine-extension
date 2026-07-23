/**
 * @module featureCollectionPreviewPanel
 * WebView panel for previewing an Earth Engine FeatureCollection (Table) asset.
 *
 * Renders metadata, column samples (fetched from the API), and properties.
 */

import * as vscode from 'vscode';
import { EEAsset, listFeatures } from '../../sidebar/assets/eeApiClient.js';
import {
  escapeHtml,
  formatBytes,
  formatDate,
  renderPropertiesTable,
  webviewBaseStyle,
} from '../../shared/webviewUtils.js';

// ── Public API ──────────────────────────────────────────────────────

/** Opens a read-only WebView showing full metadata for a TABLE asset. */
export async function openFeatureCollectionPreview(
  asset: EEAsset,
  accessToken: string,
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.featureCollectionPreview',
    asset.id || asset.name.split('/').pop() || 'Feature Collection',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  panel.webview.html = await buildFeatureCollectionHtml(asset, accessToken);
}

// ── HTML builder ────────────────────────────────────────────────────

/** Builds an HTML page showing feature collection metadata, columns, and properties. */
async function buildFeatureCollectionHtml(asset: EEAsset, accessToken: string): Promise<string> {
  let columnsHtml = '';
  try {
    const featResp = await listFeatures(asset.name, accessToken, 1);
    const sampleFeature = featResp.features?.[0];
    if (sampleFeature?.properties) {
      const columns = Object.keys(sampleFeature.properties).sort();
      columnsHtml = `
				<h2>Columns (${columns.length})</h2>
				<table>
					<thead><tr><th>Column</th><th>Sample Value</th></tr></thead>
					<tbody>${columns
            .map(
              (c) =>
                `<tr><td><code>${escapeHtml(c)}</code></td><td>${escapeHtml(String(sampleFeature.properties![c] ?? ''))}</td></tr>`,
            )
            .join('')}</tbody>
				</table>`;
    }
  } catch {
    columnsHtml = '<p><em>Could not load column information</em></p>';
  }

  const featureCount = asset.featureCount
    ? parseInt(asset.featureCount, 10).toLocaleString()
    : 'N/A';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${webviewBaseStyle()}</style></head><body>
		<h1>${escapeHtml(asset.id || asset.name)}</h1>
		<span class="badge">TABLE</span>
		<div class="meta">
			<div class="meta-item"><strong>Features</strong>${featureCount}</div>
			<div class="meta-item"><strong>Size</strong>${formatBytes(asset.sizeBytes)}</div>
			<div class="meta-item"><strong>Last Updated</strong>${formatDate(asset.updateTime)}</div>
			<div class="meta-item"><strong>Start Time</strong>${formatDate(asset.startTime)}</div>
		</div>
		${columnsHtml}
		<h2>Properties</h2>
		${renderPropertiesTable(asset.properties)}
	</body></html>`;
}
