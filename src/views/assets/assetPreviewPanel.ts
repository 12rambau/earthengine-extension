import * as vscode from 'vscode';
import { EEAsset, EEBand, getAsset, listFeatures } from './eeApiClient.js';

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

function baseStyle(): string {
	return `
	body {
		font-family: var(--vscode-font-family, sans-serif);
		color: var(--vscode-foreground);
		background: var(--vscode-editor-background);
		padding: 20px; line-height: 1.5;
	}
	h1 { font-size: 1.4em; margin-bottom: 4px; }
	h2 { font-size: 1.1em; margin-top: 20px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
	.badge { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-right: 4px; }
	.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
	.meta-item strong { display: block; font-size: 0.8em; opacity: 0.7; }
	table { width: 100%; border-collapse: collapse; font-size: 0.9em; margin: 8px 0; }
	th { text-align: left; background: var(--vscode-list-hoverBackground); padding: 5px 8px; }
	td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
	code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
	.props-table td:first-child { font-weight: 600; width: 30%; }
	`;
}

function formatBytes(bytes?: string): string {
	if (!bytes) { return 'N/A'; }
	const n = parseInt(bytes, 10);
	if (n < 1024) { return n + ' B'; }
	if (n < 1024 * 1024) { return (n / 1024).toFixed(1) + ' KB'; }
	if (n < 1024 * 1024 * 1024) { return (n / (1024 * 1024)).toFixed(1) + ' MB'; }
	return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(d?: string): string {
	if (!d) { return 'N/A'; }
	return new Date(d).toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC');
}

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function propertiesTable(props?: Record<string, unknown>): string {
	if (!props || Object.keys(props).length === 0) { return '<p><em>No properties</em></p>'; }
	const rows = Object.entries(props)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `<tr><td>${esc(k)}</td><td><code>${esc(String(v))}</code></td></tr>`)
		.join('');
	return `<table class="props-table"><thead><tr><th>Property</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Image ──

function buildImageHtml(asset: EEAsset): string {
	const bands = asset.bands || [];
	const bandsHtml = bands.length > 0 ? `
		<h2>Bands (${bands.length})</h2>
		<table>
			<thead><tr><th>Name</th><th>Type</th><th>Dimensions</th><th>CRS</th><th>Scale</th></tr></thead>
			<tbody>${bands.map(bandRow).join('')}</tbody>
		</table>` : '';

	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${baseStyle()}</style></head><body>
		<h1>${esc(asset.id || asset.name)}</h1>
		<span class="badge">IMAGE</span>
		<div class="meta">
			<div class="meta-item"><strong>Size</strong>${formatBytes(asset.sizeBytes)}</div>
			<div class="meta-item"><strong>Last Updated</strong>${formatDate(asset.updateTime)}</div>
			<div class="meta-item"><strong>Start Time</strong>${formatDate(asset.startTime)}</div>
			<div class="meta-item"><strong>End Time</strong>${formatDate(asset.endTime)}</div>
		</div>
		${bandsHtml}
		<h2>Properties</h2>
		${propertiesTable(asset.properties)}
	</body></html>`;
}

function bandRow(b: EEBand): string {
	const dims = b.grid?.dimensions
		? `${b.grid.dimensions.width} × ${b.grid.dimensions.height}`
		: 'N/A';
	const crs = b.grid?.crsCode || 'N/A';
	const scale = b.grid?.affineTransform?.scaleX
		? `${Math.abs(b.grid.affineTransform.scaleX)}`
		: 'N/A';
	const dtype = b.dataType?.precision || 'N/A';
	return `<tr><td><code>${esc(b.id)}</code></td><td>${dtype}</td><td>${dims}</td><td>${crs}</td><td>${scale}</td></tr>`;
}

// ── ImageCollection ──

function buildImageCollectionHtml(asset: EEAsset): string {
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${baseStyle()}</style></head><body>
		<h1>${esc(asset.id || asset.name)}</h1>
		<span class="badge">IMAGE COLLECTION</span>
		<div class="meta">
			<div class="meta-item"><strong>Last Updated</strong>${formatDate(asset.updateTime)}</div>
			<div class="meta-item"><strong>Start Time</strong>${formatDate(asset.startTime)}</div>
			<div class="meta-item"><strong>End Time</strong>${formatDate(asset.endTime)}</div>
			<div class="meta-item"><strong>Size</strong>${formatBytes(asset.sizeBytes)}</div>
		</div>
		<h2>Properties</h2>
		${propertiesTable(asset.properties)}
	</body></html>`;
}

// ── Table / FeatureCollection ──

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
						`<tr><td><code>${esc(c)}</code></td><td>${esc(String(sampleFeature.properties![c] ?? ''))}</td></tr>`
					).join('')}</tbody>
				</table>`;
		}
	} catch {
		columnsHtml = '<p><em>Could not load column information</em></p>';
	}

	const featureCount = asset.featureCount ? parseInt(asset.featureCount, 10).toLocaleString() : 'N/A';

	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${baseStyle()}</style></head><body>
		<h1>${esc(asset.id || asset.name)}</h1>
		<span class="badge">TABLE</span>
		<div class="meta">
			<div class="meta-item"><strong>Features</strong>${featureCount}</div>
			<div class="meta-item"><strong>Size</strong>${formatBytes(asset.sizeBytes)}</div>
			<div class="meta-item"><strong>Last Updated</strong>${formatDate(asset.updateTime)}</div>
			<div class="meta-item"><strong>Start Time</strong>${formatDate(asset.startTime)}</div>
		</div>
		${columnsHtml}
		<h2>Properties</h2>
		${propertiesTable(asset.properties)}
	</body></html>`;
}

// ── Fallback ──

function buildGenericHtml(asset: EEAsset): string {
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${baseStyle()}</style></head><body>
		<h1>${esc(asset.id || asset.name)}</h1>
		<span class="badge">${esc(asset.type)}</span>
		<div class="meta">
			<div class="meta-item"><strong>Last Updated</strong>${formatDate(asset.updateTime)}</div>
			<div class="meta-item"><strong>Size</strong>${formatBytes(asset.sizeBytes)}</div>
		</div>
		<h2>Properties</h2>
		${propertiesTable(asset.properties)}
	</body></html>`;
}
