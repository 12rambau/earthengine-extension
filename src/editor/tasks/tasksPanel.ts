/**
 * @module tasksPanel
 * Full-page Tasks WebView panel for export or import operations.
 *
 * Displays a sortable, paginated table of Earth Engine tasks with
 * live status indicators, cancel buttons, and 15 s auto-refresh.
 */

import * as vscode from 'vscode';
import { listOperationsPage, Operation, getTaskState, getElapsedTime, cancelOperation } from '../../sidebar/tasks/tasksApiClient.js';
import { AuthService } from '../../auth/index.js';

type TaskFilter = 'export' | 'import';

// ── Public API ──────────────────────────────────────────────────────

/** Opens a WebView panel listing tasks of the given filter type. */
export async function openTasksPanel(
	authService: AuthService,
	filter: TaskFilter,
	extensionUri: vscode.Uri,
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
		if (!t) { return; }
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

	const filterFn = filter === 'export'
		? (op: Operation) => { const t = (op.metadata?.type || '').toUpperCase(); return t.startsWith('EXPORT') || t === ''; }
		: (op: Operation) => { const t = (op.metadata?.type || '').toUpperCase(); return t.startsWith('INGEST') || t.startsWith('IMPORT'); };

	function sendData() {
		const filtered = allOps.filter(filterFn).map(op => ({
			name: op.name,
			description: op.metadata?.description || op.name.split('/').pop() || '',
			state: getTaskState(op),
			type: op.metadata?.type || '',
			createTime: op.metadata?.createTime || '',
			startTime: op.metadata?.startTime || '',
			endTime: op.metadata?.endTime || '',
			updateTime: op.metadata?.updateTime || '',
			elapsed: getElapsedTime(op),
			progress: op.metadata?.progress,
			error: op.error?.message || '',
		}));
		panel.webview.postMessage({ type: 'data', tasks: filtered, hasMore: !!nextPageToken });
	}

	panel.webview.onDidReceiveMessage(async (msg) => {
		if (msg.type === 'loadMore') {
			try {
				await loadPage();
				sendData();
			} catch { /* ignore */ }
		} else if (msg.type === 'cancel') {
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
			} catch { /* ignore */ }
		}
	});

	panel.webview.html = getHtml(filter);
	sendData();

	// Auto-refresh every 15s
	const interval = setInterval(async () => {
		if (panel.visible) {
			const t = await authService.getToken();
			if (!t) { return; }
			try {
				const result = await listOperationsPage(resolvedProject, t, allOps.length || 50);
				allOps = result.operations;
				nextPageToken = result.nextPageToken;
				sendData();
			} catch { /* ignore */ }
		}
	}, 15_000);

	panel.onDidDispose(() => clearInterval(interval));
}

function getHtml(filter: TaskFilter): string {
	const title = filter === 'export' ? 'Export Tasks' : 'Import Tasks';
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
h1 { font-size: 1.3em; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px; }
.toolbar {
	display: flex; align-items: center; justify-content: space-between;
	margin-bottom: 8px; gap: 8px; flex-wrap: wrap;
}
.toolbar select, .toolbar button {
	background: var(--vscode-button-secondaryBackground);
	color: var(--vscode-button-secondaryForeground);
	border: 1px solid var(--vscode-input-border);
	padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.85em;
}
.toolbar button:hover { background: var(--vscode-button-secondaryHoverBackground); }
.toolbar .btn-primary {
	background: var(--vscode-button-background);
	color: var(--vscode-button-foreground);
}
.toolbar .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
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
.status { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.succeeded { background: var(--vscode-testing-iconPassed); }
.dot.failed { background: var(--vscode-testing-iconFailed); }
.dot.cancelled { background: var(--vscode-disabledForeground); }
.dot.pending { background: var(--vscode-charts-yellow); }
@keyframes spin { to { transform: rotate(360deg); } }
.spinner { width: 10px; height: 10px; border: 2px solid var(--vscode-foreground); border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 1s linear infinite; }
.cancel-btn {
	background: none; border: none; color: var(--vscode-errorForeground);
	cursor: pointer; font-size: 0.85em; padding: 2px 6px; border-radius: 3px;
}
.cancel-btn:hover { background: var(--vscode-inputValidation-errorBackground); }
.error-text { color: var(--vscode-errorForeground); }
.elapsed { opacity: 0.7; }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="toolbar" id="toolbar-top">
	<div>
		<button onclick="refresh()" class="btn-primary">⟳ Refresh</button>
		<button onclick="loadMore()" id="loadMoreBtn" style="display:none">Load more</button>
	</div>
	<div style="display:flex;align-items:center;gap:8px;">
		<span class="page-info" id="pageInfoTop"></span>
		<button onclick="prevPage()" id="prevTop">◀ Prev</button>
		<button onclick="nextPage()" id="nextTop">Next ▶</button>
		<label>Per page: <select id="pageSizeTop" onchange="changePageSize(this.value)">
			<option value="10">10</option>
			<option value="25" selected>25</option>
			<option value="50">50</option>
			<option value="100">100</option>
			<option value="500">500</option>
		</select></label>
	</div>
</div>
<table>
<thead><tr>
	<th onclick="sortBy('description')">Description <span class="sort-arrow">▲</span></th>
	<th onclick="sortBy('state')">Status <span class="sort-arrow">▲</span></th>
	<th onclick="sortBy('type')">Type <span class="sort-arrow">▲</span></th>
	<th onclick="sortBy('createTime')">Created <span class="sort-arrow">▲</span></th>
	<th onclick="sortBy('elapsed')">Duration <span class="sort-arrow">▲</span></th>
	<th>Actions</th>
</tr></thead>
<tbody id="tbody"></tbody>
</table>
<div class="toolbar" id="toolbar-bottom" style="margin-top:8px;">
	<div></div>
	<div style="display:flex;align-items:center;gap:8px;">
		<span class="page-info" id="pageInfoBottom"></span>
		<button onclick="prevPage()" id="prevBottom">◀ Prev</button>
		<button onclick="nextPage()" id="nextBottom">Next ▶</button>
		<label>Per page: <select id="pageSizeBottom" onchange="changePageSize(this.value)">
			<option value="10">10</option>
			<option value="25" selected>25</option>
			<option value="50">50</option>
			<option value="100">100</option>
			<option value="500">500</option>
		</select></label>
	</div>
</div>
<script>
const vscode = acquireVsCodeApi();
let tasks = [];
let hasMore = false;
let currentPage = 0;
let pageSize = 25;
let sortCol = 'createTime';
let sortDir = -1; // -1 = desc

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
	const d = new Date(t);
	return d.toLocaleString();
}

function render() {
	const sorted = [...tasks].sort((a, b) => {
		const va = a[sortCol] || '';
		const vb = b[sortCol] || '';
		return va < vb ? -sortDir : va > vb ? sortDir : 0;
	});
	const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
	if (currentPage >= totalPages) currentPage = totalPages - 1;
	const start = currentPage * pageSize;
	const page = sorted.slice(start, start + pageSize);

	const tbody = document.getElementById('tbody');
	tbody.innerHTML = page.map(t => {
		const cancelBtn = (t.state === 'RUNNING' || t.state === 'PENDING')
			? '<button class="cancel-btn" onclick="cancelTask(\\''+t.name+'\\')">✕ Cancel</button>'
			: '';
		const errorTd = t.error ? '<br><span class="error-text">' + esc(t.error) + '</span>' : '';
		return '<tr>'
			+ '<td>' + esc(t.description) + errorTd + '</td>'
			+ '<td><span class="status">' + statusHtml(t.state) + ' ' + t.state + '</span></td>'
			+ '<td>' + esc(t.type) + '</td>'
			+ '<td>' + formatTime(t.createTime) + '</td>'
			+ '<td class="elapsed">' + t.elapsed + '</td>'
			+ '<td>' + cancelBtn + '</td>'
			+ '</tr>';
	}).join('');

	// Update page info
	const info = sorted.length + ' tasks — page ' + (currentPage+1) + '/' + totalPages;
	document.getElementById('pageInfoTop').textContent = info;
	document.getElementById('pageInfoBottom').textContent = info;

	document.getElementById('prevTop').disabled = currentPage === 0;
	document.getElementById('prevBottom').disabled = currentPage === 0;
	document.getElementById('nextTop').disabled = currentPage >= totalPages - 1 && !hasMore;
	document.getElementById('nextBottom').disabled = currentPage >= totalPages - 1 && !hasMore;
	document.getElementById('loadMoreBtn').style.display = hasMore ? '' : 'none';

	// Update sort arrows
	document.querySelectorAll('th').forEach(th => {
		th.classList.remove('sorted');
		th.querySelector('.sort-arrow').textContent = '▲';
	});
	const idx = ['description','state','type','createTime','elapsed'].indexOf(sortCol);
	if (idx >= 0) {
		const th = document.querySelectorAll('th')[idx];
		th.classList.add('sorted');
		th.querySelector('.sort-arrow').textContent = sortDir === 1 ? '▲' : '▼';
	}
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function sortBy(col) {
	if (sortCol === col) { sortDir *= -1; }
	else { sortCol = col; sortDir = col === 'createTime' ? -1 : 1; }
	render();
}
function nextPage() {
	const totalPages = Math.ceil(tasks.length / pageSize);
	if (currentPage < totalPages - 1) { currentPage++; render(); }
	else if (hasMore) { loadMore(); }
}
function prevPage() { if (currentPage > 0) { currentPage--; render(); } }
function changePageSize(v) {
	pageSize = parseInt(v);
	currentPage = 0;
	document.getElementById('pageSizeTop').value = v;
	document.getElementById('pageSizeBottom').value = v;
	render();
}
function cancelTask(name) { vscode.postMessage({ type: 'cancel', name }); }
function loadMore() { vscode.postMessage({ type: 'loadMore' }); }
function refresh() { vscode.postMessage({ type: 'refresh' }); }

window.addEventListener('message', e => {
	const msg = e.data;
	if (msg.type === 'data') {
		tasks = msg.tasks;
		hasMore = msg.hasMore;
		render();
	} else if (msg.type === 'cancelled') {
		const t = tasks.find(t => t.name === msg.name);
		if (t) { t.state = 'CANCELLING'; }
		render();
	} else if (msg.type === 'error') {
		alert(msg.message);
	}
});
</script>
</body></html>`;
}
