/**
 * @module tasksPanel
 * Full-page Tasks WebView panel for export or import operations.
 *
 * Displays a sortable, paginated table of Earth Engine tasks with
 * live status indicators, cancel buttons, and 15 s auto-refresh.
 */

import * as vscode from 'vscode';
import {
  listOperationsPage,
  Operation,
  getTaskState,
  getElapsedTime,
  cancelOperation,
} from '../../sidebar/tasks/tasksApiClient.js';
import { AuthService } from '../../auth/index.js';

type TaskFilter = 'export' | 'import';

// ── Public API ──────────────────────────────────────────────────────

/** Opens a WebView panel listing tasks of the given filter type. */
const PREFS_KEY = 'earthengine.tasks.prefs';

interface TaskPrefs {
  visibleCols?: string[];
  pageSize?: number;
}

export async function openTasksPanel(
  authService: AuthService,
  filter: TaskFilter,
  context: vscode.ExtensionContext,
): Promise<void> {
  const token = await authService.getToken();
  if (!token) {
    vscode.window.showErrorMessage('Not authenticated.');
    return;
  }

  const profile = authService.currentProfile!;
  const panel = vscode.window.createWebviewPanel(
    `earthengine.tasks.${filter}Panel`,
    `${filter === 'export' ? 'Export' : 'Import'} Tasks`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  let allOps: Operation[] = [];
  let resolvedProject = profile.project;

  const filterFn =
    filter === 'export'
      ? (op: Operation) => {
          const t = (op.metadata?.type || '').toUpperCase();
          return t.startsWith('EXPORT') || t === '';
        }
      : (op: Operation) => {
          const t = (op.metadata?.type || '').toUpperCase();
          return t.startsWith('INGEST') || t.startsWith('IMPORT');
        };

  function sendData(loading = false, silent = false) {
    const filtered = allOps.filter(filterFn).map((op) => ({
      name: op.name,
      id: op.name.split('/').pop() || '',
      description: op.metadata?.description || op.name.split('/').pop() || '',
      state: getTaskState(op),
      type: op.metadata?.type || '',
      createTime: op.metadata?.createTime || '',
      startTime: op.metadata?.startTime || '',
      endTime: op.metadata?.endTime || '',
      updateTime: op.metadata?.updateTime || '',
      elapsed: getElapsedTime(op),
      progress: op.metadata?.progress,
      attempt: op.metadata?.attempt ?? null,
      priority: op.metadata?.priority ?? null,
      computeUsage: op.metadata?.batchEecuUsageSeconds ?? null,
      error: op.error?.message || '',
    }));
    panel.webview.postMessage({ type: 'data', tasks: filtered, loading, silent });
  }

  /** Streams all pages of operations, calling sendData after each page. */
  async function loadAndStream(silent = false): Promise<void> {
    const t = await authService.getToken();
    if (!t) {
      return;
    }
    allOps = [];
    let pageToken: string | undefined;
    do {
      const result = await listOperationsPage(resolvedProject, t, 100, pageToken);
      resolvedProject = result.project;
      allOps.push(...result.operations);
      pageToken = result.nextPageToken;
      sendData(!!(pageToken && allOps.length < 1_000), silent);
    } while (pageToken && allOps.length < 1_000);
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'cancel') {
      try {
        const t = await authService.getToken();
        if (t) {
          await cancelOperation(msg.name, t);
          panel.webview.postMessage({ type: 'cancelled', name: msg.name });
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        panel.webview.postMessage({ type: 'error', message: m });
      }
    } else if (msg.type === 'refresh') {
      loadAndStream(true).catch((err) => {
        const m = err instanceof Error ? err.message : String(err);
        panel.webview.postMessage({ type: 'error', message: m });
      });
    } else if (msg.type === 'savePrefs') {
      const prefs: TaskPrefs = { visibleCols: msg.visibleCols, pageSize: msg.pageSize };
      await context.globalState.update(PREFS_KEY, prefs);
    }
  });

  const savedPrefs = context.globalState.get<TaskPrefs>(PREFS_KEY) ?? {};
  panel.webview.html = getHtml(filter, savedPrefs);

  loadAndStream(false).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load tasks: ${msg}`);
  });

  // Auto-refresh every 15s (silent)
  const interval = setInterval(() => {
    if (panel.visible) {
      loadAndStream(true).catch(() => {
        sendData(false, true);
      });
    }
  }, 15_000);

  // Reload when the active profile changes
  const authListener = authService.onDidChangeAuth((profile) => {
    if (!profile) {
      panel.dispose();
      return;
    }
    resolvedProject = profile.project;
    allOps = [];
    panel.webview.postMessage({ type: 'loading' });
    loadAndStream(false).catch((err) => {
      const m = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: 'error', message: m });
    });
  });

  panel.onDidDispose(() => {
    clearInterval(interval);
    authListener.dispose();
  });
}

function getHtml(filter: TaskFilter, savedPrefs: TaskPrefs): string {
  const title = filter === 'export' ? 'Export Tasks' : 'Import Tasks';
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
.topbar-left { display: flex; align-items: center; gap: 8px; }
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
.status { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.succeeded { background: var(--vscode-testing-iconPassed); }
.dot.failed { background: var(--vscode-testing-iconFailed); }
.dot.cancelled { background: var(--vscode-disabledForeground); }
.dot.pending { background: var(--vscode-charts-yellow); }
@keyframes spin { to { transform: rotate(360deg); } }
.refresh-icon { display: inline-block; }
.btn-primary.loading { opacity: 0.75; cursor: default; }
.btn-primary.loading .refresh-icon { animation: spin 0.8s linear infinite; }
.table-wrap.loading { opacity: 0.45; pointer-events: none; transition: opacity 0.15s; }
.spinner { width: 10px; height: 10px; border: 2px solid var(--vscode-foreground); border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 1s linear infinite; }
.actions-cell { white-space: nowrap; text-align: right; }
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
.error-text { color: var(--vscode-errorForeground); }
.elapsed { opacity: 0.7; }
.id-cell { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.78em; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compute { opacity: 0.85; white-space: nowrap; }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="topbar">
	<div class="topbar-left">
		<button id="refreshBtn" onclick="refresh()" class="btn-primary"><span class="refresh-icon">⟳</span> <span id="refreshLabel">Refresh</span></button>
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
<div class="pagination" id="toolbar-bottom">
	<span class="page-info" id="pageInfo"></span>
	<div class="pager" style="margin-left:auto;flex-shrink:0;">
		<button class="nav-btn" onclick="prevPage()" id="prevBtn">◀ Prev</button>
		<span id="pageNums"></span>
		<button class="nav-btn" onclick="nextPage()" id="nextBtn">Next ▶</button>
	</div>
</div>
</div>
<script>
const vscode = acquireVsCodeApi();

const ALL_COLS = [
	{ key: 'state',        label: 'Status',        required: true },
	{ key: 'description',  label: 'Name',           required: true },
	{ key: 'id',           label: 'ID' },
	{ key: 'createTime',   label: 'Created' },
	{ key: 'startTime',    label: 'Start' },
	{ key: 'elapsed',      label: 'Duration' },
	{ key: 'attempt',      label: 'Attempts' },
	{ key: 'priority',     label: 'Priority' },
	{ key: 'computeUsage', label: 'Compute Usage' },
	{ key: 'actions',      label: 'Actions',        required: true },
];

// Restore persisted state (injected by extension host via globalState)
const saved = ${initJson};
let visibleCols = new Set(saved.visibleCols || ALL_COLS.map(c => c.key));
ALL_COLS.filter(c => c.required).forEach(c => visibleCols.add(c.key)); // always enforce required
let pageSize = saved.pageSize || 25;

let tasks = [];
let isLoading = true; // true until first data message arrives
let currentPage = 0;
let sortCol = 'createTime';
let sortDir = -1; // -1 = desc

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
		return '<th onclick="sortBy(\\''+c.key+'\\')">'+esc(c.label)+' <span class="sort-arrow">\u25b2</span></th>';
	}).join('');
	updateSortArrows();
}

function updateSortArrows() {
	document.querySelectorAll('thead th').forEach(th => {
		th.classList.remove('sorted');
		const arrow = th.querySelector('.sort-arrow');
		if (arrow) arrow.textContent = '\u25b2';
	});
	const visCols = ALL_COLS.filter(c => visibleCols.has(c.key) && c.key !== 'actions');
	const idx = visCols.findIndex(c => c.key === sortCol);
	if (idx >= 0) {
		const th = document.querySelectorAll('thead th')[idx];
		if (th) {
			th.classList.add('sorted');
			const arrow = th.querySelector('.sort-arrow');
			if (arrow) arrow.textContent = sortDir === 1 ? '\u25b2' : '\u25bc';
		}
	}
}

// ── Helpers ───────────────────────────────────────────────────────────

function statusHtml(state) {
	if (state === 'RUNNING' || state === 'CANCELLING') return '<span class="spinner"></span>';
	if (state === 'SUCCEEDED') return '<span class="dot succeeded"></span>';
	if (state === 'FAILED') return '<span class="dot failed"></span>';
	if (state === 'CANCELLED') return '<span class="dot cancelled"></span>';
	if (state === 'PENDING') return '<span class="dot pending"></span>';
	return '';
}

function formatTime(t) {
	if (!t) return '';
	return new Date(t).toLocaleString();
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const ACTION_ICONS = {
	cancel: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm3.15-8.85a.5.5 0 0 1 0 .7L8.71 8.29l2.44 2.44a.5.5 0 0 1-.7.7L8 9l-2.44 2.44a.5.5 0 0 1-.7-.7L7.29 8.29 4.85 5.85a.5.5 0 1 1 .7-.7L8 7.59l2.44-2.44a.5.5 0 0 1 .7 0z"/></svg>',
	dot: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z"/></svg>',
};

function actionsHtml(t) {
	if (t.state !== 'RUNNING' && t.state !== 'PENDING') return '';
	const btn = '<button class="action-btn danger" title="Cancel task" onclick="cancelTask(\\'' + t.name + '\\')">' + ACTION_ICONS.cancel + '</button>';
	const dots = '<span class="action-dot">' + ACTION_ICONS.dot + '</span>';
	return '<span class="action-dots">' + dots + '</span>'
		+ '<span class="action-btns">' + btn + '</span>';
}

// ── Render ────────────────────────────────────────────────────────────

function render() {
	const sorted = [...tasks].sort((a, b) => {
		const va = a[sortCol] ?? '';
		const vb = b[sortCol] ?? '';
		return va < vb ? -sortDir : va > vb ? sortDir : 0;
	});
	const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
	if (currentPage >= totalPages) currentPage = totalPages - 1;
	const start = currentPage * pageSize;
	const page = sorted.slice(start, start + pageSize);

	const vis = key => visibleCols.has(key);
	const tbody = document.getElementById('tbody');
	tbody.innerHTML = page.map(t => {
		const errorSpan = t.error ? '<br><span class="error-text">' + esc(t.error) + '</span>' : '';
		const computeStr = t.computeUsage != null ? t.computeUsage.toFixed(1) + '\u202fEECU\u00b7s' : '';
		return '<tr>'
			+ (vis('state')        ? '<td><span class="status">'+statusHtml(t.state)+' '+t.state+'</span></td>' : '')
			+ (vis('description')  ? '<td>'+esc(t.description)+errorSpan+'</td>' : '')
			+ (vis('id')           ? '<td class="id-cell" title="'+esc(t.id)+'">'+esc(t.id)+'</td>' : '')
			+ (vis('createTime')   ? '<td>'+formatTime(t.createTime)+'</td>' : '')
			+ (vis('startTime')    ? '<td>'+formatTime(t.startTime)+'</td>' : '')
			+ (vis('elapsed')      ? '<td class="elapsed">'+t.elapsed+'</td>' : '')
			+ (vis('attempt')      ? '<td style="text-align:center">'+(t.attempt != null ? t.attempt : '')+'</td>' : '')
			+ (vis('priority')     ? '<td style="text-align:center">'+(t.priority != null ? t.priority : '')+'</td>' : '')
			+ (vis('computeUsage') ? '<td class="compute">'+computeStr+'</td>' : '')
			+ (vis('actions')      ? '<td class="actions-cell">' + actionsHtml(t) + '</td>' : '')
			+ '</tr>';
	}).join('');

	const rangeStart = sorted.length > 0 ? start + 1 : 0;
	const rangeEnd = Math.min(start + pageSize, sorted.length);
	const countStr = sorted.length > 0 ? rangeStart + '\u2013' + rangeEnd + ' of ' + sorted.length + ' tasks' : '0 tasks';
	document.getElementById('pageInfo').innerHTML = esc(countStr) + (isLoading ? ' <span class="spinner-inline"></span>' : '');
	document.getElementById('prevBtn').disabled = currentPage === 0;
	document.getElementById('nextBtn').disabled = currentPage >= totalPages - 1;
	document.getElementById('pageNums').innerHTML = pagerHtml(currentPage, totalPages);
	updateSortArrows();
}

function pagerHtml(cur, total) {
	if (total <= 1) return '';
	const shown = new Set([0, total - 1]);
	for (let i = Math.max(0, cur - 1); i <= Math.min(total - 1, cur + 1); i++) shown.add(i);
	const pages = [...shown].sort((a, b) => a - b);
	const btns = [];
	let prev = -1;
	for (const p of pages) {
		if (prev !== -1 && p > prev + 1) btns.push('<span class="page-ellipsis">\u2026</span>');
		const cls = 'page-btn' + (p === cur ? ' active' : '');
		btns.push('<button class="' + cls + '" onclick="goToPage(' + p + ')">' + (p + 1) + '</button>');
		prev = p;
	}
	return btns.join('');
}
function goToPage(p) { currentPage = p; render(); }

function sortBy(col) {
	if (sortCol === col) { sortDir *= -1; }
	else { sortCol = col; sortDir = col === 'createTime' ? -1 : 1; }
	render();
}
function nextPage() {
	const totalPages = Math.ceil(tasks.length / pageSize);
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
function cancelTask(name) { vscode.postMessage({ type: 'cancel', name }); }
function refresh() { setLoading(true); vscode.postMessage({ type: 'refresh' }); }

window.addEventListener('message', e => {
	const msg = e.data;
	if (msg.type === 'data') {
		tasks = msg.tasks;
		isLoading = msg.loading;
		setLoading(false);
		if (msg.silent && isLoading) {
			// Silent refresh: accumulate without touching the UI
			document.getElementById('pageInfo').innerHTML = '<span class="spinner-inline"></span>';
		} else {
			render();
		}
	} else if (msg.type === 'loading') {
		setLoading(true);
	} else if (msg.type === 'cancelled') {
		const t = tasks.find(t => t.name === msg.name);
		if (t) { t.state = 'CANCELLING'; }
		render();
	} else if (msg.type === 'error') {
		setLoading(false);
		alert(msg.message);
	}
});

// ── Init ──────────────────────────────────────────────────────────────
buildPicker();
renderHeader();
document.getElementById('pageSize').value = String(pageSize);
render();
</script>
</body></html>`;
}
