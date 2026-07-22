/**
 * @module datasetPanel
 * Read-only WebView panel showing STAC dataset details.
 *
 * Renders a preview image, metadata grid (availability, type, provider),
 * EE snippet, keyword tags, description, and band table for a given
 * STAC collection.
 */

import * as vscode from 'vscode';
import { StacCollection } from '../../sidebar/dataset/stacClient.js';

// ── Public API ──────────────────────────────────────────────────────

/** Creates and displays a WebView panel for a single dataset collection. */
export function createDatasetPanel(
  collection: StacCollection,
  extensionUri: vscode.Uri,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.datasetDetail',
    collection.title || collection.id,
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  panel.webview.html = buildHtml(collection);
  return panel;
}

// ── HTML Builder ────────────────────────────────────────────────────

function buildHtml(c: StacCollection): string {
  const temporal = c.extent?.temporal?.interval?.[0];
  const startDate = temporal?.[0] || 'N/A';
  const endDate = temporal?.[1] || 'Ongoing';

  const bands = c.summaries?.['eo:bands'] || [];
  const keywords = c.keywords || [];
  const providers = c.providers || [];
  const geeType = c['gee:type'] || 'unknown';

  const previewLink = c.links?.find((l) => l.rel === 'preview');
  const previewImg = previewLink
    ? `<img src="${previewLink.href}" alt="preview" style="max-width:280px; border-radius:4px; margin-bottom:16px;" />`
    : '';

  const datasetSlug = c.id.replace(/\//g, '_');
  const catalogUrl = `https://developers.google.com/earth-engine/datasets/catalog/${datasetSlug}`;

  const snippet =
    geeType === 'image_collection'
      ? `ee.ImageCollection("${c.id}")`
      : geeType === 'image'
        ? `ee.Image("${c.id}")`
        : `"${c.id}"`;

  const bandsHtml =
    bands.length > 0
      ? `
		<h2>Bands</h2>
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>Description</th>
					<th>Wavelength</th>
					<th>GSD</th>
				</tr>
			</thead>
			<tbody>
				${bands
          .map(
            (b) => `
					<tr>
						<td><code>${b.name}</code></td>
						<td>${b.description || ''}</td>
						<td>${b['gee:wavelength'] || ''}</td>
						<td>${b.gsd ? b.gsd + 'm' : ''}</td>
					</tr>
				`,
          )
          .join('')}
			</tbody>
		</table>
	`
      : '';

  const tagsHtml =
    keywords.length > 0
      ? `
		<div class="tags">
			<strong>Tags:</strong>
			${keywords.map((k) => `<span class="tag">${escapeHtml(k)}</span>`).join(' ')}
		</div>
	`
      : '';

  const providersHtml = providers
    .map((p) => (p.url ? `<a href="${p.url}">${escapeHtml(p.name)}</a>` : escapeHtml(p.name)))
    .join(', ');

  // Sanitize description: it may contain markdown-style formatting
  const description = escapeHtml(c.description || '').replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
	body {
		font-family: var(--vscode-font-family, sans-serif);
		color: var(--vscode-foreground);
		background: var(--vscode-editor-background);
		padding: 20px;
		line-height: 1.5;
	}
	h1 { font-size: 1.5em; margin-bottom: 4px; }
	h2 { font-size: 1.15em; margin-top: 24px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
	.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
	.meta-item strong { display: block; font-size: 0.85em; opacity: 0.7; margin-bottom: 2px; }
	.snippet { background: var(--vscode-textCodeBlock-background); padding: 8px 12px; border-radius: 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; margin: 12px 0; }
	.tags { margin: 12px 0; }
	.tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin: 2px; }
	table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 0.9em; }
	th { text-align: left; background: var(--vscode-list-hoverBackground); padding: 6px 10px; }
	td { padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
	code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
	a { color: var(--vscode-textLink-foreground); }
	.header { display: flex; gap: 20px; }
	.header-text { flex: 1; }
</style>
</head>
<body>
	<h1>${escapeHtml(c.title || c.id)}</h1>
	<div class="header">
		${previewImg ? `<div>${previewImg}</div>` : ''}
		<div class="header-text">
			<div class="meta">
				<div class="meta-item">
					<strong>Dataset Availability</strong>
					${escapeHtml(startDate)} – ${escapeHtml(endDate)}
				</div>
				<div class="meta-item">
					<strong>Type</strong>
					${escapeHtml(geeType)}
				</div>
				<div class="meta-item">
					<strong>Provider</strong>
					${providersHtml}
				</div>
				<div class="meta-item">
					<strong>Catalog Page</strong>
					<a href="${catalogUrl}">Open in browser</a>
				</div>
			</div>
			<div class="snippet">${escapeHtml(snippet)}</div>
			${tagsHtml}
		</div>
	</div>

	<h2>Description</h2>
	<div>${description}</div>

	${bandsHtml}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
