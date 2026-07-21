/**
 * @module assetsPanel
 * Full-page Asset Manager WebView panel.
 *
 * Provides a sortable, paginated table of Earth Engine assets with
 * breadcrumb navigation, folder drill-down, and inline preview.
 * Communication between the extension and the WebView uses postMessage.
 */

import * as vscode from 'vscode';
import { listAssets, EEAsset } from '../../sidebar/assets/eeApiClient.js';
import { AuthService } from '../../auth/index.js';
import { openAssetPreview } from './assetPreviewPanel.js';

const CONTAINER_TYPES = new Set(['FOLDER', 'IMAGE_COLLECTION']);

// ── Public API ──────────────────────────────────────────────────────

/** Opens the Asset Manager WebView panel for the active profile's project. */
export async function openAssetsPanel(authService: AuthService): Promise<void> {
	const token = await authService.getToken();
	if (!token) {
		vscode.window.showErrorMessage('Not authenticated.');
		return;
	}

	const profile = authService.currentProfile!;
	const panel = vscode.window.createWebviewPanel(
		'earthengine.assetsPanel',
		'Asset Manager',
		vscode.ViewColumn.One,
		{ enableScripts: true, retainContextWhenHidden: true },
	);

	const rootPath = `projects/${profile.project}`;

	async function loadPage(parent: string, pageSize: number, pageToken?: string) {
		const t = await authService.getToken();
		if (!t) { throw new Error('Not authenticated'); }
		const response = await listAssets(parent, t, pageSize, pageToken);
		return { assets: response.assets || [], nextPageToken: response.nextPageToken };
	}

	// Page token history for back navigation
	let pageTokenHistory: (string | undefined)[] = [undefined];
	let currentPageIndex = 0;
	let currentParentPath = rootPath;
	let currentPageSize = 50;

	function sendPage(assets: EEAsset[], parent: string, pageIndex: number, hasNext: boolean, hasPrev: boolean) {
		const items = assets.map(a => ({
			name: a.name,
			shortName: a.name.split('/').pop() || a.name,
			type: a.type,
			isContainer: CONTAINER_TYPES.has(a.type),
			assetId: a.name,
		}));
		panel.webview.postMessage({
			type: 'data',
			assets: items,
			parent,
			root: rootPath,
			pageIndex,
			hasNext,
			hasPrev,
			pageSize: currentPageSize,
		});
	}

	async function navigateTo(parent: string, pageSize: number) {
		currentParentPath = parent;
		currentPageSize = pageSize;
		pageTokenHistory = [undefined];
		currentPageIndex = 0;
		const { assets, nextPageToken } = await loadPage(parent, pageSize);
		if (nextPageToken) {
			pageTokenHistory.push(nextPageToken);
		}
		sendPage(assets, parent, 0, !!nextPageToken, false);
	}

	async function goToPage(direction: 'next' | 'prev', pageSize: number) {
		currentPageSize = pageSize;
		if (direction === 'next') {
			const token = pageTokenHistory[currentPageIndex + 1];
			if (!token) { return; }
			currentPageIndex++;
			const { assets, nextPageToken } = await loadPage(currentParentPath, pageSize, token);
			if (nextPageToken && pageTokenHistory.length <= currentPageIndex + 1) {
				pageTokenHistory.push(nextPageToken);
			}
			sendPage(assets, currentParentPath, currentPageIndex, !!nextPageToken, true);
		} else {
			if (currentPageIndex <= 0) { return; }
			currentPageIndex--;
			const token = pageTokenHistory[currentPageIndex];
			const { assets, nextPageToken } = await loadPage(currentParentPath, pageSize, token);
			if (nextPageToken && pageTokenHistory.length <= currentPageIndex + 1) {
				pageTokenHistory[currentPageIndex + 1] = nextPageToken;
			}
			sendPage(assets, currentParentPath, currentPageIndex, true, currentPageIndex > 0);
		}
	}

	// Initial load
	try {
		panel.webview.html = getHtml(profile.project);
		await navigateTo(rootPath, currentPageSize);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`Failed to load assets: ${msg}`);
		return;
	}

	panel.webview.onDidReceiveMessage(async (msg) => {
		try {
			if (msg.type === 'navigate') {
				await navigateTo(msg.path, msg.pageSize || currentPageSize);
			} else if (msg.type === 'nextPage') {
				await goToPage('next', msg.pageSize || currentPageSize);
			} else if (msg.type === 'prevPage') {
				await goToPage('prev', msg.pageSize || currentPageSize);
			} else if (msg.type === 'changePageSize') {
				await navigateTo(currentParentPath, msg.pageSize);
			} else if (msg.type === 'preview') {
				const t = await authService.getToken();
				if (t) {
					await openAssetPreview(msg.name, t);
				}
			}
		} catch (err) {
			const m = err instanceof Error ? err.message : String(err);
			panel.webview.postMessage({ type: 'error', message: m });
		}
	});
}

function getHtml(project: string): string {
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
	padding: 16px; margin: 0;
}
h1 { font-size: 1.3em; margin: 0 0 8px 0; }
.breadcrumb {
	display: flex; align-items: center; gap: 4px;
	margin-bottom: 12px; font-size: 0.9em; flex-wrap: wrap;
}
.breadcrumb button {
	background: none; border: none; color: var(--vscode-textLink-foreground);
	cursor: pointer; padding: 2px 4px; font-size: 0.9em;
}
.breadcrumb button:hover { text-decoration: underline; }
.breadcrumb .sep { opacity: 0.5; }
.pager {
	display: flex; align-items: center; justify-content: space-between;
	margin: 8px 0; font-size: 0.85em;
}
.pager select, .pager button {
	background: var(--vscode-button-secondaryBackground);
	color: var(--vscode-button-secondaryForeground);
	border: 1px solid var(--vscode-input-border);
	padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.85em;
}
.pager button:hover { background: var(--vscode-button-secondaryHoverBackground); }
.pager button:disabled { opacity: 0.4; cursor: default; }
.pager .btn-primary {
	background: var(--vscode-button-background);
	color: var(--vscode-button-foreground);
}
.pager .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.page-info { font-size: 0.85em; opacity: 0.7; }
table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
th {
	text-align: left; padding: 6px 8px; cursor: pointer; user-select: none;
	background: var(--vscode-list-hoverBackground);
	border-bottom: 2px solid var(--vscode-panel-border);
	white-space: nowrap;
}
th:hover { background: var(--vscode-list-activeSelectionBackground); }
th .sort-arrow { opacity: 0.5; margin-left: 4px; }
th.sorted .sort-arrow { opacity: 1; }
td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
tr:hover { background: var(--vscode-list-hoverBackground); }
.name-link {
	background: none; border: none; color: var(--vscode-textLink-foreground);
	cursor: pointer; padding: 0; font-size: inherit; text-align: left;
}
.name-link:hover { text-decoration: underline; }
.name-text { padding: 0; }
.icon { margin-right: 6px; vertical-align: middle; }
.action-btn {
	background: none; border: none; cursor: pointer; padding: 2px 6px; border-radius: 3px;
	color: var(--vscode-foreground); opacity: 0.7;
}
.action-btn:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
.nav-bar {
	display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
}
.nav-bar .up-btn {
	background: var(--vscode-button-secondaryBackground);
	color: var(--vscode-button-secondaryForeground);
	border: 1px solid var(--vscode-input-border);
	padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.85em;
}
.nav-bar .up-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.nav-bar .up-btn:disabled { opacity: 0.4; cursor: default; }
</style>
</head>
<body>
<h1>Asset Manager</h1>
<div class="nav-bar">
	<button class="up-btn" id="upBtn" onclick="goUp()" title="Go to parent">↑</button>
	<button class="up-btn" onclick="refresh()" title="Refresh">⟳</button>
	<div class="breadcrumb" id="breadcrumb"></div>
</div>
<div class="pager" id="pager-top">
	<div></div>
	<div style="display:flex;align-items:center;gap:8px;">
		<button onclick="prevPage()" id="prevTop">◀ Prev</button>
		<button onclick="nextPage()" id="nextTop">Next ▶</button>
		<label>Per page: <select id="pageSizeTop" onchange="changePageSize(this.value)">
			<option value="25">25</option>
			<option value="50" selected>50</option>
			<option value="100">100</option>
			<option value="500">500</option>
		</select></label>
	</div>
</div>
<table>
<thead><tr>
	<th onclick="sortBy('shortName')">Name <span class="sort-arrow">▲</span></th>
	<th onclick="sortBy('type')">Type <span class="sort-arrow">▲</span></th>
	<th onclick="sortBy('assetId')">Asset ID <span class="sort-arrow">▲</span></th>
	<th>Actions</th>
</tr></thead>
<tbody id="tbody"></tbody>
</table>
<div class="pager" id="pager-bottom">
	<span class="page-info" id="pageInfoBottom"></span>
	<div style="display:flex;align-items:center;gap:8px;">
		<button onclick="prevPage()" id="prevBottom">◀ Prev</button>
		<button onclick="nextPage()" id="nextBottom">Next ▶</button>
		<label>Per page: <select id="pageSizeBottom" onchange="changePageSize(this.value)">
			<option value="25">25</option>
			<option value="50" selected>50</option>
			<option value="100">100</option>
			<option value="500">500</option>
		</select></label>
	</div>
</div>
<script>
const vscode = acquireVsCodeApi();
let assets = [];
let currentParent = '';
let rootPath = '';
let pageIndex = 0;
let hasNext = false;
let hasPrev = false;
let pageSize = 50;
let sortCol = 'shortName';
let sortDir = 1;

const TYPE_ICONS = {
	FOLDER: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 3H7.71l-.85-.85L6.51 2H1.5l-.5.5v11l.5.5h13l.5-.5v-10L14.5 3zm-.51 8.49V13H2V3h4.29l.85.85.36.15H14v7.49z"/></svg>',
	IMAGE_COLLECTION: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 4h14v1H1V4zm1-2h12v1H2V2zm1 4h10v8H3V6zm1 1v6h8V7H4z"/></svg>',
	IMAGE: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 2H2v12h12V2zm-1 1v7.09l-2.5-2.5L7 11.09 5.5 9.59 3 12.09V3h10zM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>',
	TABLE: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1H2L1 2v12l1 1h12l1-1V2l-1-1zM2 2h5v4H2V2zm0 5h5v4H2V7zm0 5h5v2H2v-2zm12 2H8v-2h6v2zm0-3H8V7h6v4zm0-5H8V2h6v4z"/></svg>',
};

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderBreadcrumb() {
	const bc = document.getElementById('breadcrumb');
	bc.innerHTML = '';

	// Always show the project root
	const projectName = rootPath.split('/')[1] || rootPath;
	const rootBtn = document.createElement('button');
	rootBtn.textContent = projectName;
	rootBtn.onclick = () => navigate(rootPath);
	bc.appendChild(rootBtn);

	// If we're deeper than root, show path segments
	if (currentParent !== rootPath && currentParent.includes('/assets/')) {
		const assetsIdx = currentParent.indexOf('/assets/');
		const relative = currentParent.substring(assetsIdx + '/assets/'.length);
		const parts = relative.split('/');
		let accumulated = rootPath + '/assets';
		for (const part of parts) {
			accumulated += '/' + part;
			const sep = document.createElement('span');
			sep.className = 'sep';
			sep.textContent = ' / ';
			bc.appendChild(sep);
			const btn = document.createElement('button');
			btn.textContent = part;
			const navPath = accumulated;
			btn.onclick = () => navigate(navPath);
			bc.appendChild(btn);
		}
	}
}

function render() {
	const sorted = [...assets].sort((a, b) => {
		if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
		const va = (a[sortCol] || '').toLowerCase();
		const vb = (b[sortCol] || '').toLowerCase();
		return va < vb ? -sortDir : va > vb ? sortDir : 0;
	});

	document.getElementById('tbody').innerHTML = sorted.map(a => {
		const icon = TYPE_ICONS[a.type] || '';
		const nameCell = a.isContainer
			? '<button class="name-link" onclick="navigate(\\'' + esc(a.name) + '\\')">' + icon + esc(a.shortName) + '</button>'
			: '<span class="name-text">' + icon + esc(a.shortName) + '</span>';
		const previewBtn = '<button class="action-btn" title="Preview" onclick="preview(\\'' + esc(a.name) + '\\')"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.6 5.1 0 8c1.6 2.9 4.5 5 8 5s6.4-2.1 8-5c-1.6-2.9-4.5-5-8-5zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg></button>';
		return '<tr>'
			+ '<td>' + nameCell + '</td>'
			+ '<td>' + formatType(a.type) + '</td>'
			+ '<td style="opacity:0.7;font-size:0.9em">' + esc(a.assetId) + '</td>'
			+ '<td>' + previewBtn + '</td>'
			+ '</tr>';
	}).join('');

	const info = assets.length + ' items — page ' + (pageIndex + 1);
	document.getElementById('pageInfoBottom').textContent = info;
	document.getElementById('prevTop').disabled = !hasPrev;
	document.getElementById('prevBottom').disabled = !hasPrev;
	document.getElementById('nextTop').disabled = !hasNext;
	document.getElementById('nextBottom').disabled = !hasNext;

	document.querySelectorAll('th').forEach(th => { th.classList.remove('sorted'); th.querySelector('.sort-arrow').textContent = '▲'; });
	const idx = ['shortName','type','assetId'].indexOf(sortCol);
	if (idx >= 0) {
		const th = document.querySelectorAll('th')[idx];
		th.classList.add('sorted');
		th.querySelector('.sort-arrow').textContent = sortDir === 1 ? '▲' : '▼';
	}

	renderBreadcrumb();
	document.getElementById('upBtn').disabled = (currentParent === rootPath);
}

function formatType(t) { return (t || '').toLowerCase().replace(/_/g, ' '); }
function goUp() {
	if (currentParent === rootPath) return;
	// Go to parent: remove last path segment
	const parts = currentParent.split('/');
	// If ends with /assets/X, go to projects/P (root)
	// Otherwise remove last segment
	if (parts.length <= 3) { navigate(rootPath); return; }
	const parentPath = parts.slice(0, -1).join('/');
	navigate(parentPath);
}
function sortBy(col) {
	if (sortCol === col) { sortDir *= -1; } else { sortCol = col; sortDir = 1; }
	render();
}
function nextPage() { vscode.postMessage({ type: 'nextPage', pageSize }); }
function prevPage() { vscode.postMessage({ type: 'prevPage', pageSize }); }
function changePageSize(v) {
	pageSize = parseInt(v);
	document.getElementById('pageSizeTop').value = v;
	document.getElementById('pageSizeBottom').value = v;
	vscode.postMessage({ type: 'changePageSize', pageSize });
}
function navigate(path) { vscode.postMessage({ type: 'navigate', path, pageSize }); }
function preview(name) { vscode.postMessage({ type: 'preview', name }); }
function refresh() { vscode.postMessage({ type: 'navigate', path: currentParent, pageSize }); }

window.addEventListener('message', e => {
	const msg = e.data;
	if (msg.type === 'data') {
		assets = msg.assets;
		currentParent = msg.parent;
		rootPath = msg.root;
		pageIndex = msg.pageIndex;
		hasNext = msg.hasNext;
		hasPrev = msg.hasPrev;
		if (msg.pageSize) {
			pageSize = msg.pageSize;
			document.getElementById('pageSizeTop').value = String(pageSize);
			document.getElementById('pageSizeBottom').value = String(pageSize);
		}
		render();
	} else if (msg.type === 'error') {
		alert(msg.message);
	}
});
</script>
</body></html>`;
}
