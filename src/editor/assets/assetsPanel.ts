/**
 * @module assetsPanel
 * Full-page Asset Manager WebView panel.
 *
 * Displays a sortable, paginated table of Earth Engine assets with
 * breadcrumb navigation, folder drill-down, inline preview and
 * delete / move / copy actions. Unlike tasks, assets are not a
 * streaming resource: data is only fetched on navigation or when
 * the refresh button is pressed.
 */

import * as vscode from 'vscode';
import { listAssets, EEAsset } from '../../sidebar/assets/eeApiClient.js';
import { AuthService } from '../../auth/index.js';
import { openAssetPreview } from './assetPreviewPanel.js';

const CONTAINER_TYPES = new Set(['FOLDER', 'IMAGE_COLLECTION']);

const PREFS_KEY = 'earthengine.assets.prefs';

interface AssetPrefs {
  visibleCols?: string[];
  pageSize?: number;
}

/** Commands invoked by the row action buttons in the WebView. */
const ACTION_COMMANDS: Record<string, string> = {
  delete: 'earthengine.deleteAsset',
  move: 'earthengine.moveAsset',
  copy: 'earthengine.copyAsset',
};

// ── Public API ──────────────────────────────────────────────────────

/** Opens the Asset Manager WebView panel for the active profile's project. */
export async function openAssetsPanel(
  authService: AuthService,
  context: vscode.ExtensionContext,
): Promise<void> {
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

  let rootPath = `projects/${profile.project}`;

  async function loadPage(parent: string, pageSize: number, pageToken?: string) {
    const t = await authService.getToken();
    if (!t) {
      throw new Error('Not authenticated');
    }
    const response = await listAssets(parent, t, pageSize, pageToken);
    return { assets: response.assets || [], nextPageToken: response.nextPageToken };
  }

  // Page token history for back navigation
  let pageTokenHistory: (string | undefined)[] = [undefined];
  let currentPageIndex = 0;
  let currentParentPath = rootPath;
  const savedPrefs = context.globalState.get<AssetPrefs>(PREFS_KEY) ?? {};
  let currentPageSize = savedPrefs.pageSize || 50;

  function sendPage(
    assets: EEAsset[],
    parent: string,
    pageIndex: number,
    hasNext: boolean,
    hasPrev: boolean,
  ) {
    const items = assets.map((a) => ({
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
      if (!token) {
        return;
      }
      currentPageIndex++;
      const { assets, nextPageToken } = await loadPage(currentParentPath, pageSize, token);
      if (nextPageToken && pageTokenHistory.length <= currentPageIndex + 1) {
        pageTokenHistory.push(nextPageToken);
      }
      sendPage(assets, currentParentPath, currentPageIndex, !!nextPageToken, true);
    } else {
      if (currentPageIndex <= 0) {
        return;
      }
      currentPageIndex--;
      const token = pageTokenHistory[currentPageIndex];
      const { assets, nextPageToken } = await loadPage(currentParentPath, pageSize, token);
      if (nextPageToken && pageTokenHistory.length <= currentPageIndex + 1) {
        pageTokenHistory[currentPageIndex + 1] = nextPageToken;
      }
      sendPage(assets, currentParentPath, currentPageIndex, true, currentPageIndex > 0);
    }
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === 'navigate') {
        await navigateTo(msg.path, msg.pageSize || currentPageSize);
      } else if (msg.type === 'refresh') {
        await navigateTo(currentParentPath, msg.pageSize || currentPageSize);
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
      } else if (msg.type === 'action') {
        const command = ACTION_COMMANDS[msg.action];
        if (command) {
          const done = await vscode.commands.executeCommand<boolean>(command, msg.name);
          if (done) {
            await navigateTo(currentParentPath, currentPageSize);
          }
        }
      } else if (msg.type === 'savePrefs') {
        const prefs: AssetPrefs = { visibleCols: msg.visibleCols, pageSize: msg.pageSize };
        await context.globalState.update(PREFS_KEY, prefs);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: 'error', message: m });
    }
  });

  // Reload when the active profile changes
  const authListener = authService.onDidChangeAuth((newProfile) => {
    if (!newProfile) {
      panel.dispose();
      return;
    }
    rootPath = `projects/${newProfile.project}`;
    panel.webview.postMessage({ type: 'loading' });
    navigateTo(rootPath, currentPageSize).catch((err) => {
      const m = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: 'error', message: m });
    });
  });

  panel.onDidDispose(() => {
    authListener.dispose();
  });

  // Initial load
  panel.webview.html = getHtml(savedPrefs);
  try {
    await navigateTo(rootPath, currentPageSize);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load assets: ${msg}`);
  }
}

function getHtml(savedPrefs: AssetPrefs): string {
  const initJson = JSON.stringify(savedPrefs).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body {
	height: 100%; margin: 0;
}
body {
	font-family: var(--vscode-font-family, sans-serif);
	color: var(--vscode-foreground);
	background: var(--vscode-editor-background);
	padding: 12px 16px 8px;
	display: flex; flex-direction: column; overflow: hidden;
}
h1 { font-size: 1.3em; margin: 0 0 8px 0; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.topbar {
	display: flex; align-items: center; justify-content: space-between;
	gap: 8px; margin-bottom: 6px; flex-shrink: 0;
}
.topbar-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.breadcrumb {
	display: flex; align-items: center; gap: 4px;
	font-size: 0.9em; flex-wrap: wrap; min-width: 0;
}
.breadcrumb button {
	background: none !important; border: none !important; color: var(--vscode-textLink-foreground);
	cursor: pointer; padding: 2px 4px; font-size: 0.9em;
}
.breadcrumb button:hover { text-decoration: underline; }
.breadcrumb .sep { opacity: 0.5; }
.table-wrap {
	flex: 1 1 0; overflow-y: auto; min-height: 120px;
	border: 1px solid var(--vscode-panel-border); border-radius: 3px;
}
.pagination {
	display: flex; align-items: center; justify-content: space-between;
	padding-top: 8px; gap: 8px; flex-wrap: wrap; flex-shrink: 0;
}
.pager { display: flex; align-items: center; gap: 2px; }
.nav-btn {
	background: transparent !important; border-color: transparent !important; font-weight: 500;
}
.nav-btn:not(:disabled):hover {
	background: var(--vscode-list-hoverBackground) !important;
	border-color: var(--vscode-input-border) !important;
}
.page-num { padding: 0 6px; opacity: 0.7; font-size: 0.85em; user-select: none; }
.per-page-select {
	appearance: none; -webkit-appearance: none;
	padding-right: 20px !important;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E") !important;
	background-repeat: no-repeat !important;
	background-position: right 6px center !important;
	background-color: var(--vscode-button-secondaryBackground) !important;
	border: 1px solid var(--vscode-input-border) !important;
	cursor: pointer;
}
.per-page-select:hover { background-color: var(--vscode-button-secondaryHoverBackground) !important; }
button, select {
	background: var(--vscode-button-secondaryBackground);
	color: var(--vscode-button-secondaryForeground);
	border: 1px solid var(--vscode-input-border);
	padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.85em;
}
button:hover { background: var(--vscode-button-secondaryHoverBackground); }
button:disabled { opacity: 0.4; cursor: default; }
.btn-primary {
	background: var(--vscode-button-background);
	color: var(--vscode-button-foreground); border-color: transparent;
}
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.page-info { font-size: 0.85em; opacity: 0.7; }
/* Column picker */
.col-picker-wrap { position: relative; }
.col-picker {
	position: absolute; right: 0; top: calc(100% + 4px); z-index: 10;
	background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
	border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
	border-radius: 4px; padding: 6px 4px; min-width: 160px;
	box-shadow: 0 4px 12px rgba(0,0,0,0.25);
}
.col-item {
	display: flex; align-items: center; gap: 6px;
	padding: 4px 8px; border-radius: 3px; cursor: pointer;
	font-size: 0.85em; white-space: nowrap; user-select: none;
}
.col-item:hover { background: var(--vscode-list-hoverBackground); }
.col-item input[type=checkbox] { cursor: pointer; margin: 0; }
.col-item.required { opacity: 0.5; cursor: default; }
/* Table */
table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
thead th {
	position: sticky; top: 0; z-index: 1;
	text-align: left; padding: 6px 8px; cursor: pointer; user-select: none;
	background: var(--vscode-editor-background);
	border-bottom: 2px solid var(--vscode-panel-border);
	white-space: nowrap;
}
thead th:hover { background: var(--vscode-list-hoverBackground); }
th .sort-arrow { opacity: 0.5; margin-left: 4px; }
th.sorted .sort-arrow { opacity: 1; }
td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
tr:hover { background: var(--vscode-list-hoverBackground); }
@keyframes spin { to { transform: rotate(360deg); } }
.refresh-icon { display: inline-block; }
.btn-primary.loading { opacity: 0.75; cursor: default; }
.btn-primary.loading .refresh-icon { animation: spin 0.8s linear infinite; }
.table-wrap.loading { opacity: 0.45; pointer-events: none; transition: opacity 0.15s; }
.name-link {
	background: none !important; border: none !important; color: var(--vscode-textLink-foreground);
	cursor: pointer; padding: 0; font-size: inherit; text-align: left;
}
.name-link:hover { text-decoration: underline; }
.name-text { padding: 0; }
.icon { margin-right: 6px; vertical-align: middle; }
.id-cell { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.78em; opacity: 0.75; }
.actions-cell { white-space: nowrap; }
.action-btn {
	background: none !important; border: none !important; cursor: pointer;
	padding: 2px 6px; border-radius: 3px;
	color: var(--vscode-foreground); opacity: 0.7;
}
.action-btn:hover { opacity: 1; background: var(--vscode-list-hoverBackground) !important; }
.action-btn.danger { color: var(--vscode-errorForeground); }
.action-btn.danger:hover { background: var(--vscode-inputValidation-errorBackground) !important; }
</style>
</head>
<body>
<h1>Asset Manager</h1>
<div class="topbar">
	<div class="topbar-left">
		<button id="refreshBtn" onclick="refresh()" class="btn-primary"><span class="refresh-icon">⟳</span> <span id="refreshLabel">Refresh</span></button>
		<button onclick="goUp()" id="upBtn" title="Go to parent">↑</button>
		<div class="breadcrumb" id="breadcrumb"></div>
	</div>
	<div style="display:flex;align-items:center;gap:6px;">
		<select id="pageSize" class="per-page-select" onchange="changePageSize(this.value)" title="Items per page">
			<option value="10">10</option>
			<option value="25">25</option>
			<option value="50">50</option>
			<option value="100">100</option>
			<option value="500">500</option>
		</select>
		<div class="col-picker-wrap">
			<button onclick="togglePicker(event)" id="colBtn">Columns ▾</button>
			<div id="col-picker" class="col-picker" style="display:none"></div>
		</div>
	</div>
</div>
<div class="table-wrap">
<table>
<thead id="thead"><tr></tr></thead>
<tbody id="tbody"></tbody>
</table>
</div>
<div class="pagination">
	<span class="page-info" id="pageInfo"></span>
	<div class="pager" style="margin-left:auto;flex-shrink:0;">
		<button class="nav-btn" onclick="prevPage()" id="prevBtn">◀ Prev</button>
		<span class="page-num" id="pageNum"></span>
		<button class="nav-btn" onclick="nextPage()" id="nextBtn">Next ▶</button>
	</div>
</div>
<script>
const vscode = acquireVsCodeApi();

const ALL_COLS = [
	{ key: 'shortName', label: 'Name',     required: true },
	{ key: 'type',      label: 'Type' },
	{ key: 'assetId',   label: 'Asset ID' },
	{ key: 'actions',   label: 'Actions',  required: true },
];

// Restore persisted state (injected by extension host via globalState)
const saved = ${initJson};
let visibleCols = new Set(saved.visibleCols || ALL_COLS.map(c => c.key));
ALL_COLS.filter(c => c.required).forEach(c => visibleCols.add(c.key)); // always enforce required
let pageSize = saved.pageSize || 50;

let assets = [];
let currentParent = '';
let rootPath = '';
let pageIndex = 0;
let hasNext = false;
let hasPrev = false;
let sortCol = 'shortName';
let sortDir = 1;

const TYPE_ICONS = {
	FOLDER: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 3H7.71l-.85-.85L6.51 2H1.5l-.5.5v11l.5.5h13l.5-.5v-10L14.5 3zm-.51 8.49V13H2V3h4.29l.85.85.36.15H14v7.49z"/></svg>',
	IMAGE_COLLECTION: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 4h14v1H1V4zm1-2h12v1H2V2zm1 4h10v8H3V6zm1 1v6h8V7H4z"/></svg>',
	IMAGE: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 2H2v12h12V2zm-1 1v7.09l-2.5-2.5L7 11.09 5.5 9.59 3 12.09V3h10zM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>',
	TABLE: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1H2L1 2v12l1 1h12l1-1V2l-1-1zM2 2h5v4H2V2zm0 5h5v4H2V7zm0 5h5v2H2v-2zm12 2H8v-2h6v2zm0-3H8V7h6v4zm0-5H8V2h6v4z"/></svg>',
};

const ACTION_ICONS = {
	preview: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.6 5.1 0 8c1.6 2.9 4.5 5 8 5s6.4-2.1 8-5c-1.6-2.9-4.5-5-8-5zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
	copy: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7z"/><path d="M3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>',
	move: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9.3 3.3l4.2 4.2v1L9.3 12.7l-.7-.7 3.3-3.3H2v-1h9.9L8.6 4l.7-.7z"/></svg>',
	del: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2h4v1h4v1h-1v10l-1 1H4l-1-1V4H2V3h4V2zm-2 2v10h8V4H4zm3 2h1v6H7V6zm2 0h1v6H9V6z"/></svg>',
};

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Persistence ─────────────────────────────────────────────────────

function saveState() {
	vscode.postMessage({ type: 'savePrefs', visibleCols: [...visibleCols], pageSize });
}

// ── Column picker ────────────────────────────────────────────────────

function buildPicker() {
	const picker = document.getElementById('col-picker');
	picker.innerHTML = ALL_COLS.map(c => {
		const checked = visibleCols.has(c.key) ? 'checked' : '';
		const disabled = c.required ? 'disabled' : '';
		const cls = c.required ? 'col-item required' : 'col-item';
		return '<label class="' + cls + '">'
			+ '<input type="checkbox" ' + checked + ' ' + disabled
			+ (c.required ? '' : ' onchange="toggleCol(\\''+c.key+'\\')">') + '>'
			+ esc(c.label) + '</label>';
	}).join('');
}

function toggleCol(key) {
	if (visibleCols.has(key)) { visibleCols.delete(key); }
	else { visibleCols.add(key); }
	saveState();
	renderHeader();
	render();
}

function togglePicker(e) {
	e.stopPropagation();
	const p = document.getElementById('col-picker');
	p.style.display = p.style.display === 'none' ? '' : 'none';
}

document.getElementById('col-picker').addEventListener('click', (e) => e.stopPropagation());

document.addEventListener('click', () => {
	document.getElementById('col-picker').style.display = 'none';
});

// ── Table header ─────────────────────────────────────────────────────

function renderHeader() {
	const tr = document.querySelector('#thead tr');
	tr.innerHTML = ALL_COLS.filter(c => visibleCols.has(c.key)).map(c => {
		if (c.key === 'actions') return '<th>Actions</th>';
		return '<th onclick="sortBy(\\''+c.key+'\\')">'+esc(c.label)+' <span class="sort-arrow">▲</span></th>';
	}).join('');
	updateSortArrows();
}

function updateSortArrows() {
	document.querySelectorAll('thead th').forEach(th => {
		th.classList.remove('sorted');
		const arrow = th.querySelector('.sort-arrow');
		if (arrow) arrow.textContent = '▲';
	});
	const visCols = ALL_COLS.filter(c => visibleCols.has(c.key) && c.key !== 'actions');
	const idx = visCols.findIndex(c => c.key === sortCol);
	if (idx >= 0) {
		const th = document.querySelectorAll('thead th')[idx];
		if (th) {
			th.classList.add('sorted');
			const arrow = th.querySelector('.sort-arrow');
			if (arrow) arrow.textContent = sortDir === 1 ? '▲' : '▼';
		}
	}
}

// ── Breadcrumb ───────────────────────────────────────────────────────

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

// ── Render ────────────────────────────────────────────────────────────

function formatType(t) { return (t || '').toLowerCase().replace(/_/g, ' '); }

function actionsHtml(a) {
	const btns = [];
	if (a.type !== 'FOLDER') {
		btns.push('<button class="action-btn" title="Preview" onclick="preview(\\'' + esc(a.name) + '\\')">' + ACTION_ICONS.preview + '</button>');
	}
	btns.push('<button class="action-btn" title="Copy asset" onclick="assetAction(\\'copy\\',\\'' + esc(a.name) + '\\')">' + ACTION_ICONS.copy + '</button>');
	btns.push('<button class="action-btn" title="Move asset" onclick="assetAction(\\'move\\',\\'' + esc(a.name) + '\\')">' + ACTION_ICONS.move + '</button>');
	btns.push('<button class="action-btn danger" title="Delete asset" onclick="assetAction(\\'delete\\',\\'' + esc(a.name) + '\\')">' + ACTION_ICONS.del + '</button>');
	return btns.join('');
}

function render() {
	const sorted = [...assets].sort((a, b) => {
		if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
		const va = (a[sortCol] || '').toLowerCase();
		const vb = (b[sortCol] || '').toLowerCase();
		return va < vb ? -sortDir : va > vb ? sortDir : 0;
	});

	const vis = key => visibleCols.has(key);
	document.getElementById('tbody').innerHTML = sorted.map(a => {
		const icon = TYPE_ICONS[a.type] || '';
		const nameCell = a.isContainer
			? '<button class="name-link" onclick="navigate(\\'' + esc(a.name) + '\\')">' + icon + esc(a.shortName) + '</button>'
			: '<span class="name-text">' + icon + esc(a.shortName) + '</span>';
		return '<tr>'
			+ (vis('shortName') ? '<td>' + nameCell + '</td>' : '')
			+ (vis('type')      ? '<td>' + formatType(a.type) + '</td>' : '')
			+ (vis('assetId')   ? '<td class="id-cell" title="' + esc(a.assetId) + '">' + esc(a.assetId) + '</td>' : '')
			+ (vis('actions')   ? '<td class="actions-cell">' + actionsHtml(a) + '</td>' : '')
			+ '</tr>';
	}).join('');

	const countStr = assets.length === 1 ? '1 item' : assets.length + ' items';
	document.getElementById('pageInfo').textContent = countStr;
	document.getElementById('pageNum').textContent = 'page ' + (pageIndex + 1);
	document.getElementById('prevBtn').disabled = !hasPrev;
	document.getElementById('nextBtn').disabled = !hasNext;
	document.getElementById('upBtn').disabled = (currentParent === rootPath);
	updateSortArrows();
	renderBreadcrumb();
}

// ── Actions ───────────────────────────────────────────────────────────

function sortBy(col) {
	if (sortCol === col) { sortDir *= -1; } else { sortCol = col; sortDir = 1; }
	render();
}
function setLoading(on) {
	const btn = document.getElementById('refreshBtn');
	const wrap = document.querySelector('.table-wrap');
	if (on) {
		btn.disabled = true;
		btn.classList.add('loading');
		document.getElementById('refreshLabel').textContent = 'Refreshing…';
		wrap.classList.add('loading');
	} else {
		btn.disabled = false;
		btn.classList.remove('loading');
		document.getElementById('refreshLabel').textContent = 'Refresh';
		wrap.classList.remove('loading');
	}
}
function request(msg) { setLoading(true); vscode.postMessage(msg); }
function navigate(path) { request({ type: 'navigate', path, pageSize }); }
function refresh() { request({ type: 'refresh', pageSize }); }
function nextPage() { request({ type: 'nextPage', pageSize }); }
function prevPage() { request({ type: 'prevPage', pageSize }); }
function changePageSize(v) {
	pageSize = parseInt(v);
	saveState();
	request({ type: 'changePageSize', pageSize });
}
function goUp() {
	if (currentParent === rootPath) return;
	// Go to parent: remove last path segment, or back to root when at depth 1
	const parts = currentParent.split('/');
	if (parts.length <= 4) { navigate(rootPath); return; }
	navigate(parts.slice(0, -1).join('/'));
}
function preview(name) { vscode.postMessage({ type: 'preview', name }); }
function assetAction(action, name) { vscode.postMessage({ type: 'action', action, name }); }

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
			document.getElementById('pageSize').value = String(pageSize);
		}
		setLoading(false);
		render();
	} else if (msg.type === 'loading') {
		setLoading(true);
	} else if (msg.type === 'error') {
		setLoading(false);
		alert(msg.message);
	}
});

// ── Init ──────────────────────────────────────────────────────────────
buildPicker();
renderHeader();
document.getElementById('pageSize').value = String(pageSize);
setLoading(true); // until the first data message arrives
</script>
</body></html>`;
}
