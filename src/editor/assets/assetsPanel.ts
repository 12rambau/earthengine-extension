/**
 * @module assetsPanel
 * Full-page Asset Manager WebView panel.
 *
 * Displays a sortable, paginated table of Earth Engine assets with
 * breadcrumb navigation, folder drill-down, inline preview and
 * delete / move / copy actions. Folder content is streamed page by
 * page from the API (folders can hold thousands of images) and
 * paginated client-side. Unlike tasks, assets are not a live
 * resource: data is only fetched on navigation or explicit refresh.
 */

import * as vscode from 'vscode';
import { listAssets, EEAsset } from '../../sidebar/assets/eeApiClient.js';
import { AuthService } from '../../auth/index.js';
import { openAssetPreview } from './assetPreviewPanel.js';

const CONTAINER_TYPES = new Set(['FOLDER', 'IMAGE_COLLECTION']);

/** Safety cap on the number of assets streamed for a single folder. */
const MAX_ASSETS = 10_000;

/** Number of assets fetched per API request while streaming. */
const API_PAGE_SIZE = 200;

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
  let currentParentPath = rootPath;
  let allAssets: EEAsset[] = [];
  // Incremented on every navigation so a superseded stream stops sending
  let generation = 0;
  const savedPrefs = context.globalState.get<AssetPrefs>(PREFS_KEY) ?? {};

  function sendData(loading: boolean) {
    const items = allAssets.map((a) => ({
      name: a.name,
      shortName: a.name.split('/').pop() || a.name,
      type: a.type,
      isContainer: CONTAINER_TYPES.has(a.type),
      assetId: a.name,
    }));
    panel.webview.postMessage({
      type: 'data',
      assets: items,
      parent: currentParentPath,
      root: rootPath,
      loading,
    });
  }

  /** Streams all pages of a folder's children, sending data after each page. */
  async function loadAndStream(parent: string): Promise<void> {
    const gen = ++generation;
    currentParentPath = parent;
    allAssets = [];
    let pageToken: string | undefined;
    do {
      const t = await authService.getToken();
      if (!t) {
        throw new Error('Not authenticated');
      }
      const response = await listAssets(parent, t, API_PAGE_SIZE, pageToken);
      if (gen !== generation) {
        return; // superseded by a newer navigation
      }
      allAssets.push(...(response.assets || []));
      pageToken = response.nextPageToken;
      sendData(!!(pageToken && allAssets.length < MAX_ASSETS));
    } while (pageToken && allAssets.length < MAX_ASSETS);
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === 'navigate') {
        await loadAndStream(msg.path);
      } else if (msg.type === 'refresh') {
        await loadAndStream(currentParentPath);
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
            await loadAndStream(currentParentPath);
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
    loadAndStream(rootPath).catch((err) => {
      const m = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: 'error', message: m });
    });
  });

  panel.onDidDispose(() => {
    generation++;
    authListener.dispose();
  });

  // Initial load
  panel.webview.html = getHtml(savedPrefs);
  try {
    await loadAndStream(rootPath);
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
.page-btn {
	min-width: 28px; height: 28px; padding: 0 4px; border-radius: 50%;
	background: transparent !important; border: 1px solid transparent !important;
	font-size: 0.82em; display: inline-flex; align-items: center; justify-content: center;
}
.page-btn:hover {
	background: var(--vscode-list-hoverBackground) !important;
	border-color: var(--vscode-input-border) !important;
}
.page-btn.active {
	background: var(--vscode-button-background) !important;
	color: var(--vscode-button-foreground) !important;
	border-color: transparent !important; font-weight: 600;
}
.page-ellipsis { padding: 0 4px; opacity: 0.5; font-size: 0.85em; user-select: none; }
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
.spinner-inline {
	width: 9px; height: 9px; border: 1.5px solid currentColor; border-top-color: transparent;
	border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;
	opacity: 0.6; vertical-align: middle; margin-left: 5px;
}
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
.icon-col { width: 24px; padding: 3px 4px; text-align: center; }
.icon-col svg { display: block; margin: auto; }
.id-cell { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.78em; opacity: 0.75; }
.actions-cell { white-space: nowrap; }
/* Idle rows show one dot per available action; hovering the row reveals the
   buttons. Each dot has the exact same footprint as an action button so the
   column width does not shift on hover. */
.action-dots { display: inline-flex; align-items: center; height: 22px; opacity: 0.4; }
.action-dot { padding: 2px 6px; display: inline-flex; align-items: center; }
.action-btns { display: none; align-items: center; height: 22px; }
tr:hover .action-dots, tr:focus-within .action-dots { display: none; }
tr:hover .action-btns, tr:focus-within .action-btns { display: inline-flex; }
.action-btn {
	background: none !important; border: none !important; cursor: pointer;
	padding: 2px 6px; border-radius: 3px;
	color: var(--vscode-foreground); opacity: 0.7;
	display: inline-flex; align-items: center;
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
		<span id="pageNums"></span>
		<button class="nav-btn" onclick="nextPage()" id="nextBtn">Next ▶</button>
	</div>
</div>
<script>
const vscode = acquireVsCodeApi();

const ALL_COLS = [    { key: 'icon',      label: '',         required: true },	{ key: 'shortName', label: 'Name',     required: true },
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
let isLoading = true; // true until the last streamed page arrives
let currentPage = 0;
let sortCol = 'shortName';
let sortDir = 1;

const TYPE_ICONS = {
	FOLDER:           '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4.5V6H5.58579C5.71839 6 5.84557 5.94732 5.93934 5.85355L7.29289 4.5L5.93934 3.14645C5.84557 3.05268 5.71839 3 5.58579 3H3.5C2.67157 3 2 3.67157 2 4.5ZM1 4.5C1 3.11929 2.11929 2 3.5 2H5.58579C5.98361 2 6.36514 2.15804 6.64645 2.43934L8.20711 4H12.5C13.8807 4 15 5.11929 15 6.5V11.5C15 12.8807 13.8807 14 12.5 14H3.5C2.11929 14 1 12.8807 1 11.5V4.5ZM2 7V11.5C2 12.3284 2.67157 13 3.5 13H12.5C13.3284 13 14 12.3284 14 11.5V6.5C14 5.67157 13.3284 5 12.5 5H8.20711L6.64645 6.56066C6.36514 6.84197 5.98361 7 5.58579 7H2Z"/></svg>',
	IMAGE_COLLECTION: '<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--vscode-charts-blue)"><path d="M8 8.99993C7.819 8.99993 7.643 8.95093 7.486 8.85793L2.486 5.85693C2.186 5.67793 2 5.34893 2 4.99993C2 4.65093 2.187 4.32093 2.486 4.14193L7.486 1.14293C7.789 0.95693 8.207 0.95493 8.517 1.14493L13.513 4.14293C13.813 4.32293 13.999 4.65093 13.999 4.99993C13.999 5.34893 13.812 5.67893 13.513 5.85793L8.513 8.85693C8.357 8.95093 8.181 8.99993 8 8.99993ZM8 1.99993L3 4.99993L8 7.99993L13 4.99993L8 1.99993Z"/><path d="M2.146 6.9873L8 10.5003L13.854 6.9873C13.946 7.1413 14 7.3173 14 7.5003C14 7.8493 13.814 8.1783 13.514 8.3583L8.514 11.3573C8.357 11.4513 8.181 11.5003 8 11.5003C7.819 11.5003 7.642 11.4513 7.486 11.3583L2.486 8.35731C2.187 8.17931 2 7.8503 2 7.5003C2 7.3163 2.054 7.1403 2.146 6.9873Z"/><path d="M2.146 9.4873L8 13.0003L13.854 9.4873C13.946 9.6413 14 9.8173 14 10.0003C14 10.3493 13.814 10.6783 13.514 10.8583L8.514 13.8573C8.357 13.9513 8.181 14.0003 8 14.0003C7.819 14.0003 7.642 13.9513 7.486 13.8583L2.486 10.8573C2.187 10.6793 2 10.3503 2 10.0003C2 9.8163 2.054 9.6403 2.146 9.4873Z"/></svg>',
	IMAGE:            '<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--vscode-charts-orange)"><path d="M6 1C4.89543 1 4 1.89543 4 3V6H5V3C5 2.44772 5.44772 2 6 2H9V4.5C9 5.32843 9.67157 6 10.5 6H13V13C13 13.5523 12.5523 14 12 14H10.9646C10.9141 14.3531 10.8109 14.6891 10.6632 15H12C13.1046 15 14 14.1046 14 13V5.41421C14 5.01639 13.842 4.63486 13.5607 4.35355L10.6464 1.43934C10.3651 1.15804 9.98361 1 9.58579 1H6ZM12.7929 5H10.5C10.2239 5 10 4.77614 10 4.5V2.20711L12.7929 5ZM1 9.5C1 8.11929 2.11929 7 3.5 7H7.5C8.88071 7 10 8.11929 10 9.5V13.5C10 14.0095 9.84756 14.4835 9.5858 14.8787L6.56066 11.8536C5.97487 11.2678 5.02513 11.2678 4.43934 11.8536L1.4142 14.8787C1.15244 14.4835 1 14.0095 1 13.5V9.5ZM8 9.75C8 9.33579 7.66421 9 7.25 9C6.83579 9 6.5 9.33579 6.5 9.75C6.5 10.1642 6.83579 10.5 7.25 10.5C7.66421 10.5 8 10.1642 8 9.75ZM2.12131 15.5858C2.51652 15.8476 2.99046 16 3.5 16H7.5C8.00954 16 8.48348 15.8476 8.87869 15.5858L5.85355 12.5607C5.65829 12.3654 5.34171 12.3654 5.14645 12.5607L2.12131 15.5858Z"/></svg>',
	TABLE:            '<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--vscode-charts-green)"><path d="M1 3.5C1 2.11929 2.11929 1 3.5 1H12.5C13.8807 1 15 2.11929 15 3.5V12.5C15 13.8807 13.8807 15 12.5 15H3.5C2.11929 15 1 13.8807 1 12.5V3.5ZM6 14H10V11L6 11V14ZM5 11H2V12.5C2 13.3284 2.67157 14 3.5 14H5V11ZM6 10L10 10V6L6 6V10ZM5 6H2V10H5V6ZM6 5L10 5V2H6V5ZM5 2H3.5C2.67157 2 2 2.67157 2 3.5V5H5V2ZM14 6H11V10H14V6ZM14 11H11V14H12.5C13.3284 14 14 13.3284 14 12.5V11ZM14 5V3.5C14 2.67157 13.3284 2 12.5 2H11V5H14Z"/></svg>',
};

const ACTION_ICONS = {
	preview: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.6 5.1 0 8c1.6 2.9 4.5 5 8 5s6.4-2.1 8-5c-1.6-2.9-4.5-5-8-5zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
	copy: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7z"/><path d="M3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>',
	move: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9.3 3.3l4.2 4.2v1L9.3 12.7l-.7-.7 3.3-3.3H2v-1h9.9L8.6 4l.7-.7z"/></svg>',
	del: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2h4v1h4v1h-1v10l-1 1H4l-1-1V4H2V3h4V2zm-2 2v10h8V4H4zm3 2h1v6H7V6zm2 0h1v6H9V6z"/></svg>',
	// codicon circle-small-filled
	dot: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z"/></svg>',
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
		if (c.key === 'icon') return '<th></th>';
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
	const dots = ('<span class="action-dot">' + ACTION_ICONS.dot + '</span>').repeat(btns.length);
	return '<span class="action-dots">' + dots + '</span>'
		+ '<span class="action-btns">' + btns.join('') + '</span>';
}

function render() {
	const sorted = [...assets].sort((a, b) => {
		if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
		const va = (a[sortCol] || '').toLowerCase();
		const vb = (b[sortCol] || '').toLowerCase();
		return va < vb ? -sortDir : va > vb ? sortDir : 0;
	});
	const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
	if (currentPage >= totalPages) currentPage = totalPages - 1;
	const start = currentPage * pageSize;
	const page = sorted.slice(start, start + pageSize);

	const vis = key => visibleCols.has(key);
	document.getElementById('tbody').innerHTML = page.map(a => {
		const icon = TYPE_ICONS[a.type] || '';
			const nameCell = a.isContainer
				? '<button class="name-link" onclick="navigate(\\'' + esc(a.name) + '\\')">' + esc(a.shortName) + '</button>'
				: '<span class="name-text">' + esc(a.shortName) + '</span>';
			return '<tr>'
				+ (vis('icon')      ? '<td class="icon-col">' + icon + '</td>' : '')
			+ (vis('shortName') ? '<td>' + nameCell + '</td>' : '')
			+ (vis('type')      ? '<td>' + formatType(a.type) + '</td>' : '')
			+ (vis('assetId')   ? '<td class="id-cell" title="' + esc(a.assetId) + '">' + esc(a.assetId) + '</td>' : '')
			+ (vis('actions')   ? '<td class="actions-cell">' + actionsHtml(a) + '</td>' : '')
			+ '</tr>';
	}).join('');

	const rangeStart = sorted.length > 0 ? start + 1 : 0;
	const rangeEnd = Math.min(start + pageSize, sorted.length);
	const countStr = sorted.length > 0 ? rangeStart + '–' + rangeEnd + ' of ' + sorted.length + ' assets' : '0 assets';
	document.getElementById('pageInfo').innerHTML = esc(countStr) + (isLoading ? ' <span class="spinner-inline"></span>' : '');
	document.getElementById('prevBtn').disabled = currentPage === 0;
	document.getElementById('nextBtn').disabled = currentPage >= totalPages - 1;
	document.getElementById('pageNums').innerHTML = pagerHtml(currentPage, totalPages);
	document.getElementById('upBtn').disabled = (currentParent === rootPath);
	updateSortArrows();
	renderBreadcrumb();
}

function pagerHtml(cur, total) {
	if (total <= 1) return '';
	const shown = new Set([0, total - 1]);
	for (let i = Math.max(0, cur - 1); i <= Math.min(total - 1, cur + 1); i++) shown.add(i);
	const pages = [...shown].sort((a, b) => a - b);
	const btns = [];
	let prev = -1;
	for (const p of pages) {
		if (prev !== -1 && p > prev + 1) btns.push('<span class="page-ellipsis">…</span>');
		const cls = 'page-btn' + (p === cur ? ' active' : '');
		btns.push('<button class="' + cls + '" onclick="goToPage(' + p + ')">' + (p + 1) + '</button>');
		prev = p;
	}
	return btns.join('');
}
function goToPage(p) { currentPage = p; render(); }

// ── Actions ───────────────────────────────────────────────────────────

function sortBy(col) {
	if (sortCol === col) { sortDir *= -1; } else { sortCol = col; sortDir = 1; }
	render();
}
function nextPage() {
	const totalPages = Math.ceil(assets.length / pageSize);
	if (currentPage < totalPages - 1) { currentPage++; render(); }
}
function prevPage() { if (currentPage > 0) { currentPage--; render(); } }
function changePageSize(v) {
	pageSize = parseInt(v);
	currentPage = 0;
	saveState();
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
function navigate(path) { currentPage = 0; setLoading(true); vscode.postMessage({ type: 'navigate', path }); }
function refresh() { setLoading(true); vscode.postMessage({ type: 'refresh' }); }
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
		isLoading = msg.loading;
		setLoading(false);
		render();
	} else if (msg.type === 'loading') {
		setLoading(true);
	} else if (msg.type === 'error') {
		isLoading = false;
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
