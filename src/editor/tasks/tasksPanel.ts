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

  // Load initial data
  let allOps: Operation[] = [];
  let nextPageToken: string | undefined;
  let resolvedProject = profile.project;

  async function loadPage(): Promise<void> {
    const t = await authService.getToken();
    if (!t) {
      return;
    }
    const result = await listOperationsPage(resolvedProject, t, 50, nextPageToken);
    resolvedProject = result.project;
    allOps.push(...result.operations);
    nextPageToken = result.nextPageToken;
  }

  try {
    await loadPage();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load tasks: ${msg}`);
    return;
  }

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

  function sendData() {
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
    panel.webview.postMessage({ type: 'data', tasks: filtered });
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
      allOps = [];
      nextPageToken = undefined;
      try {
        await loadPage();
        sendData();
      } catch {
        /* ignore */
      }
    } else if (msg.type === 'savePrefs') {
      const prefs: TaskPrefs = { visibleCols: msg.visibleCols, pageSize: msg.pageSize };
      await context.globalState.update(PREFS_KEY, prefs);
    }
  });

  const savedPrefs = context.globalState.get<TaskPrefs>(PREFS_KEY) ?? {};
  panel.webview.html = getHtml(filter, savedPrefs);
  sendData();

  // Auto-refresh every 15s
  const interval = setInterval(async () => {
    if (panel.visible) {
      const t = await authService.getToken();
      if (!t) {
        return;
      }
      try {
        const result = await listOperationsPage(resolvedProject, t, allOps.length || 50);
        allOps = result.operations;
        nextPageToken = result.nextPageToken;
        sendData();
      } catch {
        /* ignore */
      }
    }
  }, 15_000);

  panel.onDidDispose(() => clearInterval(interval));
}

function getHtml(filter: TaskFilter, savedPrefs: TaskPrefs): string {
  const title = filter === 'export' ? 'Export Tasks' : 'Import Tasks';
  const initJson = JSON.stringify(savedPrefs);
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
.toolbar {
	display: flex; align-items: center; justify-content: space-between;
	padding-top: 6px; gap: 8px; flex-wrap: wrap; flex-shrink: 0;
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
.cancel-btn {
	background: none; border: none; color: var(--vscode-errorForeground);
	cursor: pointer; font-size: 0.85em; padding: 2px 6px; border-radius: 3px;
}
.cancel-btn:hover { background: var(--vscode-inputValidation-errorBackground); }
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
	<div class="col-picker-wrap">
		<button onclick="togglePicker(event)" id="colBtn">Columns ▾</button>
		<div id="col-picker" class="col-picker" style="display:none"></div>
	</div>
</div>
<div class="table-wrap">
<table>
<thead id="thead"><tr></tr></thead>
<tbody id="tbody"></tbody>
</table>
</div>
<div class="toolbar" id="toolbar-bottom">
	<span class="page-info" id="pageInfo"></span>
	<div style="display:flex;align-items:center;gap:8px;">
		<button onclick="prevPage()" id="prevBtn">◀ Prev</button>
		<button onclick="nextPage()" id="nextBtn">Next ▶</button>
		<label>Per page: <select id="pageSize" onchange="changePageSize(this.value)">
			<option value="10">10</option>
			<option value="25">25</option>
			<option value="50">50</option>
			<option value="100">100</option>
			<option value="500">500</option>
		</select></label>
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

let tasks = [];let currentPage = 0;
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
		const cancelBtn = (t.state === 'RUNNING' || t.state === 'PENDING')
			? '<button class="cancel-btn" onclick="cancelTask(\\''+t.name+'\\'">\u2715 Cancel</button>'
			: '';
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
			+ (vis('actions')      ? '<td>'+cancelBtn+'</td>' : '')
			+ '</tr>';
	}).join('');

	const info = sorted.length + ' tasks \u2014 page ' + (currentPage+1) + '/' + totalPages;
	document.getElementById('pageInfo').textContent = info;
	document.getElementById('prevBtn').disabled = currentPage === 0;
	document.getElementById('nextBtn').disabled = currentPage >= totalPages - 1;
	updateSortArrows();
}

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
		setLoading(false);
		render();
	} else if (msg.type === 'loading') {
		setLoading(true);
	} else if (msg.type === 'cancelled') {
		const t = tasks.find(t => t.name === msg.name);
		if (t) { t.state = 'CANCELLING'; }
		render();
	} else if (msg.type === 'error') {
		alert(msg.message);
	}
});

// ── Init ──────────────────────────────────────────────────────────────
buildPicker();
renderHeader();
// Restore pageSize selector
document.getElementById('pageSize').value = String(pageSize);
</script>
</body></html>`;
}
