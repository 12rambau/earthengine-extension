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
import { CommunityDatasetEntry } from '../../sidebar/dataset/communityClient.js';
import Handlebars from 'handlebars';
import template from './datasetPanel.hbs';
import bandsTableTemplate from './datasetPanelBandsTable.hbs';

const render = Handlebars.compile(template);
const renderBandsTable = Handlebars.compile(bandsTableTemplate);
import style from './datasetPanel.css';
import script from './datasetPanel.webview.js';

// ==================================================================
// PUBLIC API
// ==================================================================
/** Creates and displays a WebView panel for a single dataset collection. */
export function createDatasetPanel(
  collection: StacCollection,
  extensionUri: vscode.Uri,
  extraTabs?: { id: string; label: string; content: string }[],
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'earthengine.datasetDetail',
    collection.title || collection.id,
    vscode.ViewColumn.One,
    { enableScripts: true },
  );

  panel.webview.html = buildHtml(collection, panel.webview, extraTabs);

  // The webview posts the snippet text back so we can write it to the clipboard.
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === 'copy' && typeof msg.text === 'string') {
      vscode.env.clipboard.writeText(msg.text);
      vscode.window.showInformationMessage('Snippet copied to clipboard.');
    }
  });

  return panel;
}

/**
 * Creates and displays a WebView panel for a community catalog dataset.
 * Renders the raw markdown as the description tab and adds a Properties
 * tab with all structured fields from the catalog JSON entry.
 */
export function createCommunityDatasetPanel(
  entry: CommunityDatasetEntry,
  markdown: string,
  extensionUri: vscode.Uri,
): vscode.WebviewPanel {
  const collection: StacCollection = {
    type: 'Collection',
    id: entry.id,
    title: entry.title,
    description: markdown,
    keywords: [],
    'gee:type': entry.type,
    extent: {
      spatial: { bbox: [[-180, -90, 180, 90]] },
      temporal: { interval: [['', '']] },
    },
    providers: [],
    summaries: {},
    links: [
      { rel: 'alternate', href: entry.docs },
      ...(entry.thumbnail ? [{ rel: 'preview' as const, href: entry.thumbnail }] : []),
    ],
  };
  const propertiesTab = {
    id: 'properties',
    label: 'Properties',
    content: buildCommunityPropertiesHtml(entry),
  };
  return createDatasetPanel(collection, extensionUri, [propertiesTab]);
}

// ==================================================================
// HTML BUILDER
// ==================================================================
function buildHtml(
  c: StacCollection,
  webview: vscode.Webview,
  extraTabs?: { id: string; label: string; content: string }[],
): string {
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
  const alternateLinkHref = c.links?.find((l) => l.rel === 'alternate')?.href;
  const catalogUrl =
    alternateLinkHref ??
    `https://developers.google.com/earth-engine/datasets/catalog/${datasetSlug}`;

  const snippet =
    geeType === 'image_collection'
      ? `ee.ImageCollection("${c.id}")`
      : geeType === 'image'
        ? `ee.Image("${c.id}")`
        : `"${c.id}"`;

  const bandsTable =
    bands.length > 0
      ? renderBandsTable({
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
    ...(extraTabs ?? []),
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

  return render({
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
/** Builds a structured properties table for a community catalog entry. */
function buildCommunityPropertiesHtml(entry: CommunityDatasetEntry): string {
  const rows: [string, string][] = [
    ['Type', `<code>${escapeHtml(entry.type)}</code>`],
    ['Earth Engine ID', `<code>${escapeHtml(entry.id)}</code>`],
  ];
  if (entry.provider) {
    rows.push(['Provider', escapeHtml(entry.provider)]);
  }
  if (entry.license) {
    rows.push(['License', escapeHtml(entry.license)]);
  }
  if (entry.thematic_group) {
    rows.push(['Thematic Group', escapeHtml(entry.thematic_group)]);
  }
  if (entry.tags) {
    const pills = entry.tags
      .split(',')
      .map((t) => `<span class="tag">${escapeHtml(t.trim())}</span>`)
      .join(' ');
    rows.push(['Tags', pills]);
  }
  if (entry.sample_code) {
    rows.push([
      'Sample Code',
      `<a href="${escapeHtml(entry.sample_code)}">Open in Code Editor ↗</a>`,
    ]);
  }
  rows.push(['Documentation', `<a href="${escapeHtml(entry.docs)}">Community Catalog ↗</a>`]);
  return (
    `<table>` +
    rows.map(([k, v]) => `<tr><th style="width:140px">${k}</th><td>${v}</td></tr>`).join('') +
    `</table>`
  );
}

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
