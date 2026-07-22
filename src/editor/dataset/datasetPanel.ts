/**
 * @module datasetPanel
 * Read-only WebView panel showing STAC dataset details.
 *
 * Renders a preview image, a metadata grid (availability, type, provider) with
 * keyword tags, a full-width EE snippet with a copy button, and a tabbed panel
 * holding the markdown description and band table for a STAC collection.
 */

import * as vscode from 'vscode';
import { marked } from 'marked';
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
    { enableScripts: true },
  );

  panel.webview.html = buildHtml(collection, panel.webview);

  // The webview posts the snippet text back so we can write it to the clipboard.
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === 'copy' && typeof msg.text === 'string') {
      vscode.env.clipboard.writeText(msg.text);
      vscode.window.showInformationMessage('Snippet copied to clipboard.');
    }
  });

  return panel;
}

// ── HTML Builder ────────────────────────────────────────────────────

function buildHtml(c: StacCollection, webview: vscode.Webview): string {
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

  const bandsTable =
    bands.length > 0
      ? `
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
			<strong>Tags</strong>
			<div class="pills">
				${keywords.map((k) => `<span class="tag">${escapeHtml(k)}</span>`).join('')}
			</div>
		</div>
	`
      : '';

  const providersHtml = providers
    .map((p) => (p.url ? `<a href="${p.url}">${escapeHtml(p.name)}</a>` : escapeHtml(p.name)))
    .join(', ');

  // Rendered by marked. Inline scripts/handlers in the output are inert thanks
  // to the strict CSP below (script-src is nonce-only).
  const description = marked.parse(c.description || '', { async: false });

  // Build the tab set from whichever sections actually have content.
  const tabs = [
    { id: 'description', label: 'Description', content: `<div class="md">${description}</div>` },
    { id: 'bands', label: 'Bands', content: bandsTable },
  ].filter((t) => t.content.trim());

  const tabButtons = tabs
    .map(
      (t, i) =>
        `<button class="tab${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`,
    )
    .join('');

  const tabPanels = tabs
    .map(
      (t, i) =>
        `<div class="tab-panel${i === 0 ? ' active' : ''}" id="panel-${t.id}">${t.content}</div>`,
    )
    .join('');

  const tabsHtml = tabs.length
    ? `<div class="tabs" role="tablist">${tabButtons}</div><div class="tab-panels">${tabPanels}</div>`
    : '';

  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `style-src 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
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
	.meta-item strong, .tags strong { display: block; font-size: 0.85em; opacity: 0.7; margin-bottom: 4px; }
	.snippet { display: flex; align-items: center; gap: 8px; background: var(--vscode-textCodeBlock-background); padding: 8px 12px; border-radius: 4px; overflow-x: auto; margin: 16px 0; }
	.snippet code { flex: 1; min-width: 0; background: none; padding: 0; font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; white-space: nowrap; }
	.copy-btn { flex: none; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 3px; padding: 3px 10px; font-size: 0.8em; font-family: var(--vscode-font-family, sans-serif); }
	.copy-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
	.pills { display: flex; flex-wrap: wrap; gap: 4px; }
	.tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 8px; border-radius: 12px; font-size: 0.8em; }
	table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 0.9em; }
	th { text-align: left; background: var(--vscode-list-hoverBackground); padding: 6px 10px; }
	td { padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
	code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
	pre { background: var(--vscode-textCodeBlock-background); padding: 10px 12px; border-radius: 4px; overflow-x: auto; }
	pre code { background: none; padding: 0; }
	a { color: var(--vscode-textLink-foreground); }
	.header { display: flex; gap: 20px; }
	.header-text { flex: 1; }
	.tags { margin: 12px 0; }
	.tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--vscode-panel-border); margin-top: 24px; }
	.tab { background: none; border: none; border-bottom: 2px solid transparent; color: var(--vscode-foreground); opacity: 0.65; cursor: pointer; padding: 8px 14px; font-size: 0.95em; font-family: inherit; }
	.tab:hover { opacity: 1; }
	.tab.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); font-weight: 600; }
	.tab-panel { display: none; padding-top: 16px; }
	.tab-panel.active { display: block; }
	.md > :first-child { margin-top: 0; }
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
					<code>${escapeHtml(geeType)}</code>
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
			${tagsHtml}
		</div>
	</div>

	<div class="snippet">
		<code id="snippet-code">${escapeHtml(snippet)}</code>
		<button id="copy-btn" class="copy-btn" title="Copy to clipboard">Copy</button>
	</div>

	${tabsHtml}

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const btn = document.getElementById('copy-btn');
		btn.addEventListener('click', () => {
			const text = document.getElementById('snippet-code').textContent;
			vscode.postMessage({ type: 'copy', text });
			const prev = btn.textContent;
			btn.textContent = 'Copied!';
			setTimeout(() => { btn.textContent = prev; }, 1200);
		});

		const tabButtons = document.querySelectorAll('.tab');
		tabButtons.forEach((tab) => {
			tab.addEventListener('click', () => {
				const id = tab.getAttribute('data-tab');
				tabButtons.forEach((t) => t.classList.toggle('active', t === tab));
				document.querySelectorAll('.tab-panel').forEach((p) => {
					p.classList.toggle('active', p.id === 'panel-' + id);
				});
			});
		});
	</script>
</body>
</html>`;
}

// ── Helpers ─────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
