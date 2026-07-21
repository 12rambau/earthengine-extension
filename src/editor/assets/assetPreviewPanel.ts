/**
 * @module assetPreviewPanel
 * Read-only WebView panel for previewing a single Earth Engine asset.
 *
 * Renders metadata, band tables, column samples, and properties for
 * IMAGE, IMAGE_COLLECTION, TABLE, and generic asset types.
 */

import * as vscode from 'vscode';
import { EEAsset, EEBand, getAsset, listFeatures } from '../../sidebar/assets/eeApiClient.js';
import { escapeHtml, formatBytes, formatDate, renderPropertiesTable, webviewBaseStyle } from '../../shared/webviewUtils.js';

// ── Public API ──────────────────────────────────────────────────────

/** Opens a read-only WebView showing full metadata for the given asset. */
export async function openAssetPreview(assetName: string, accessToken: string): Promise<void> {
	const asset = await getAsset(assetName, accessToken);

	const panel = vscode.window.createWebviewPanel(
		'earthengine.assetPreview',
		asset.id || asset.name.split('/').pop() || 'Asset',
		vscode.ViewColumn.One,
		{ enableScripts: false },
	);

	switch (asset.type) {
		case 'IMAGE':
			panel.webview.html = buildImageHtml(asset);
			break;
		case 'IMAGE_COLLECTION':
			panel.webview.html = buildImageCollectionHtml(asset);
			break;
		case 'TABLE':
			panel.webview.html = await buildTableHtml(asset, accessToken);
			break;
		default:
			panel.webview.html = buildGenericHtml(asset);
	}
}

// ── Image ───────────────────────────────────────────────────────────

/** Builds an HTML page showing image metadata and band table. */
function buildImageHtml(asset: EEAsset): string {
	const bands = asset.bands || [];
	const bandsHtml = bands.length > 0 ? `
		<h2>Bands (${bands.length})</h2>
		<table>
			<thead><tr><th>Name</th><th>Type</th><th>Dimensions</th><th>CRS</th><th>Scale</th></tr></thead>
			<tbody>${bands.map(bandRow).join('')}</tbody>
		</table>` : '';

	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${webviewBaseStyle()}</style></head><body>
		<h1>${escapeHtml(asset.id || asset.name)}</h1>
		<span class="badge">IMAGE</span>
		<div class="meta">
			<div class="meta-item"><strong>Size</strong>${formatBytes(asset.sizeBytes)}</div>
			<div class="meta-item"><strong>Last Updated</strong>${formatDate(asset.updateTime)}</div>
			<div class="meta-item"><strong>Start Time</strong>${formatDate(asset.startTime)}</div>
			<div class="meta-item"><strong>End Time</strong>${formatDate(asset.endTime)}</div>
		</div>
		${bandsHtml}
		<h2>Properties</h2>
		${renderPropertiesTable(asset.properties)}
	</body></html>`;
}

/** Renders a single band row for the bands table. */
function bandRow(b: EEBand): string {
	const dims = b.grid?.dimensions
		? `${b.grid.dimensions.width} × ${b.grid.dimensions.height}`
		: 'N/A';
	const crs = b.grid?.crsCode || 'N/A';
	const scale = b.grid?.affineTransform?.scaleX
		? `${Math.abs(b.grid.affineTransform.scaleX)}`
		: 'N/A';
	const dtype = b.dataType?.precision || 'N/A';
	return `<tr><td><code>${escapeHtml(b.id)}</code></td><td>${dtype}</td><td>${dims}</td><td>${crs}</td><td>${scale}</td></tr>`;
}

// ── ImageCollection ────────────────────────────────────────────────

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

// ── Table / FeatureCollection ──────────────────────────────────────

async function buildTableHtml(asset: EEAsset, accessToken: string): Promise<string> {
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
					<tbody>${columns.map(c =>
						`<tr><td><code>${escapeHtml(c)}</code></td><td>${escapeHtml(String(sampleFeature.properties![c] ?? ''))}</td></tr>`
					).join('')}</tbody>
				</table>`;
		}
	} catch {
		columnsHtml = '<p><em>Could not load column information</em></p>';
	}

	const featureCount = asset.featureCount ? parseInt(asset.featureCount, 10).toLocaleString() : 'N/A';

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

// ── Fallback ────────────────────────────────────────────────────────

function buildGenericHtml(asset: EEAsset): string {
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${webviewBaseStyle()}</style></head><body>
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
