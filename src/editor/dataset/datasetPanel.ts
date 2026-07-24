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
import { renderTemplate } from '../../shared/index.js';
import template from './datasetPanel.hbs';
import bandsTableTemplate from './datasetPanelBandsTable.hbs';
import style from './datasetPanel.css';
import script from './datasetPanel.webview.js';

// ==================================================================
// PUBLIC API
// ==================================================================
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

// ==================================================================
// HTML BUILDER
// ==================================================================
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
      ? renderTemplate(bandsTableTemplate, {
          rows: bands
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
            .join(''),
        })
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

  return renderTemplate(template, {
    csp,
    style,
    script,
    title: c.title || c.id,
    previewImgHtml: previewImg ? `<div>${previewImg}</div>` : '',
    startDate,
    endDate,
    geeType,
    providersHtml,
    catalogUrl,
    tagsHtml,
    snippet,
    tabsHtml,
    nonce,
  });
}

// ==================================================================
// HELPERS
// ==================================================================
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
