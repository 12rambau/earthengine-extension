const vscode = acquireVsCodeApi();

const ALL_COLS = [
  { key: 'icon', label: '', required: true },
  { key: 'state', label: 'Status', required: true },
  { key: 'description', label: 'Name', required: true },
  { key: 'id', label: 'ID' },
  { key: 'createTime', label: 'Created' },
  { key: 'startTime', label: 'Start' },
  { key: 'elapsed', label: 'Duration' },
  { key: 'attempt', label: 'Attempts' },
  { key: 'priority', label: 'Priority' },
  { key: 'computeUsage', label: 'Compute Usage' },
  { key: 'actions', label: 'Actions', required: true },
];

// Restore persisted state (injected by extension host via globalState)
const saved = JSON.parse(document.getElementById('init-data').textContent);
let visibleCols = new Set(saved.visibleCols || ALL_COLS.map((c) => c.key));
ALL_COLS.filter((c) => c.required).forEach((c) => visibleCols.add(c.key)); // always enforce required
let pageSize = saved.pageSize || 25;
let currentFilter = saved.filter || 'export';

let allTasks = [];
let tasks = [];
let isLoading = true; // true until first data message arrives
let currentPage = 0;
let sortCol = 'createTime';
let sortDir = -1; // -1 = desc

// ── Filter ──────────────────────────────────────────────────────────

function isExportTask(t) {
  const type = (t.type || '').toUpperCase();
  return type.startsWith('EXPORT') || type === '';
}

function isImportTask(t) {
  const type = (t.type || '').toUpperCase();
  return type.startsWith('INGEST') || type.startsWith('IMPORT');
}

function applyFilter() {
  tasks =
    currentFilter === 'export' ? allTasks.filter(isExportTask) : allTasks.filter(isImportTask);
}

function changeFilter(f) {
  currentFilter = f;
  currentPage = 0;
  applyFilter();
  updateSlider();
  saveState();
  render();
}

// ── Persistence ─────────────────────────────────────────────────────

function saveState() {
  vscode.postMessage({ type: 'savePrefs', visibleCols: [...visibleCols], pageSize });
}

// ── Column picker ────────────────────────────────────────────────────

function buildPicker() {
  const picker = document.getElementById('col-picker');
  picker.innerHTML = ALL_COLS.filter((c) => c.label)
    .map((c) => {
      const checked = visibleCols.has(c.key) ? 'checked' : '';
      const disabled = c.required ? 'disabled' : '';
      const cls = c.required ? 'col-item required' : 'col-item';
      return (
        '<label class="' +
        cls +
        '">' +
        '<input type="checkbox" ' +
        checked +
        ' ' +
        disabled +
        (c.required ? '' : ' onchange="toggleCol(\'' + c.key + '\')">') +
        '>' +
        esc(c.label) +
        '</label>'
      );
    })
    .join('');
}

function toggleCol(key) {
  if (visibleCols.has(key)) {
    visibleCols.delete(key);
  } else {
    visibleCols.add(key);
  }
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
  tr.innerHTML = ALL_COLS.filter((c) => visibleCols.has(c.key))
    .map((c) => {
      if (c.key === 'icon') return '<th class="icon-col"></th>';
      if (c.key === 'actions') return '<th>Actions</th>';
      return (
        '<th onclick="sortBy(\'' +
        c.key +
        '\')">' +
        esc(c.label) +
        ' <span class="sort-arrow">▲</span></th>'
      );
    })
    .join('');
  updateSortArrows();
}

function updateSortArrows() {
  document.querySelectorAll('thead th').forEach((th) => {
    th.classList.remove('sorted');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = '▲';
  });
  const visCols = ALL_COLS.filter(
    (c) => visibleCols.has(c.key) && c.key !== 'actions' && c.key !== 'icon',
  );
  const idx = visCols.findIndex((c) => c.key === sortCol);
  if (idx >= 0) {
    const th = document.querySelectorAll('thead th')[idx];
    if (th) {
      th.classList.add('sorted');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = sortDir === 1 ? '▲' : '▼';
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

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ACTION_ICONS = {
  cancel:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm3.15-8.85a.5.5 0 0 1 0 .7L8.71 8.29l2.44 2.44a.5.5 0 0 1-.7.7L8 9l-2.44 2.44a.5.5 0 0 1-.7-.7L7.29 8.29 4.85 5.85a.5.5 0 1 1 .7-.7L8 7.59l2.44-2.44a.5.5 0 0 1 .7 0z"/></svg>',
  preview:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 1H4.5C3.122 1 2 2.122 2 3.5V6.276C2.319 6.162 2.653 6.089 3 6.05V3.499C3 2.672 3.673 1.999 4.5 1.999H8.5V13.385L9.557 14.442C9.714 14.591 9.831 14.786 9.907 14.999H13.5C14.878 14.999 16 13.877 16 12.499V3.5C16 2.122 14.878 1 13.5 1ZM15 12.5C15 13.327 14.327 14 13.5 14H9.5V2H13.5C14.327 2 15 2.673 15 3.5V12.5ZM6.29 12.59C6.74 12.01 7 11.28 7 10.5C7 8.57 5.43 7 3.5 7C1.57 7 0 8.57 0 10.5C0 12.43 1.57 14 3.5 14C4.28 14 5.01 13.74 5.59 13.29L8.15 15.85C8.24 15.95 8.37 16 8.5 16C8.63 16 8.76 15.95 8.85 15.85C9.05 15.66 9.05 15.34 8.85 15.15L6.29 12.59ZM5.5 12C5.36 12.19 5.19 12.36 5 12.5C4.59 12.81 4.06 13 3.5 13C2.12 13 1 11.88 1 10.5C1 9.12 2.12 8 3.5 8C4.88 8 6 9.12 6 10.5C6 11.06 5.81 11.59 5.5 12Z"/></svg>',
  dot: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z"/></svg>',
};

/** Extracts an EE asset name from a destinationUri. */
function assetNameFromUri(uri) {
  const m = uri.match(/\/v1\/(projects\/[^/]+\/assets\/.+)/);
  return m ? m[1] : null;
}

function actionsHtml(t) {
  const btns = [];
  if (t.state === 'RUNNING' || t.state === 'PENDING') {
    btns.push(
      '<button class="action-btn danger" title="Cancel task" onclick="cancelTask(\'' +
        t.name +
        '\')">' +
        ACTION_ICONS.cancel +
        '</button>',
    );
  }
  if (t.state === 'SUCCEEDED' && t.destinationUris && t.destinationUris.length > 0) {
    const assetName = assetNameFromUri(t.destinationUris[0]);
    if (assetName) {
      btns.push(
        '<button class="action-btn" title="Preview asset" onclick="previewAsset(\'' +
          esc(assetName) +
          '\')">' +
          ACTION_ICONS.preview +
          '</button>',
      );
    }
  }
  if (btns.length === 0) return '';
  const dots = ('<span class="action-dot">' + ACTION_ICONS.dot + '</span>').repeat(btns.length);
  return (
    '<span class="action-dots">' +
    dots +
    '</span>' +
    '<span class="action-btns">' +
    btns.join('') +
    '</span>'
  );
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

  const vis = (key) => visibleCols.has(key);
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = page
    .map((t) => {
      const errorSpan = t.error ? '<br><span class="error-text">' + esc(t.error) + '</span>' : '';
      const computeStr = t.computeUsage != null ? t.computeUsage.toFixed(1) + ' EECU·s' : '';
      return (
        '<tr>' +
        (vis('icon') ? '<td class="icon-col">' + statusHtml(t.state) + '</td>' : '') +
        (vis('state') ? '<td><span class="status">' + t.state + '</span></td>' : '') +
        (vis('description') ? '<td>' + esc(t.description) + errorSpan + '</td>' : '') +
        (vis('id') ? '<td class="id-cell" title="' + esc(t.id) + '">' + esc(t.id) + '</td>' : '') +
        (vis('createTime') ? '<td>' + formatTime(t.createTime) + '</td>' : '') +
        (vis('startTime') ? '<td>' + formatTime(t.startTime) + '</td>' : '') +
        (vis('elapsed') ? '<td class="elapsed">' + t.elapsed + '</td>' : '') +
        (vis('attempt')
          ? '<td style="text-align:center">' + (t.attempt != null ? t.attempt : '') + '</td>'
          : '') +
        (vis('priority')
          ? '<td style="text-align:center">' + (t.priority != null ? t.priority : '') + '</td>'
          : '') +
        (vis('computeUsage') ? '<td class="compute">' + computeStr + '</td>' : '') +
        (vis('actions') ? '<td class="actions-cell">' + actionsHtml(t) + '</td>' : '') +
        '</tr>'
      );
    })
    .join('');

  const rangeStart = sorted.length > 0 ? start + 1 : 0;
  const rangeEnd = Math.min(start + pageSize, sorted.length);
  const countStr =
    sorted.length > 0 ? rangeStart + '–' + rangeEnd + ' of ' + sorted.length + ' tasks' : '0 tasks';
  document.getElementById('pageInfo').textContent = countStr;
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
    if (prev !== -1 && p > prev + 1) btns.push('<span class="page-ellipsis">…</span>');
    const cls = 'page-btn' + (p === cur ? ' active' : '');
    btns.push('<button class="' + cls + '" onclick="goToPage(' + p + ')">' + (p + 1) + '</button>');
    prev = p;
  }
  return btns.join('');
}
function goToPage(p) {
  currentPage = p;
  render();
}

function sortBy(col) {
  if (sortCol === col) {
    sortDir *= -1;
  } else {
    sortCol = col;
    sortDir = col === 'createTime' ? -1 : 1;
  }
  render();
}
function nextPage() {
  const totalPages = Math.ceil(tasks.length / pageSize);
  if (currentPage < totalPages - 1) {
    currentPage++;
    render();
  }
}
function prevPage() {
  if (currentPage > 0) {
    currentPage--;
    render();
  }
}
function changePageSize(v) {
  pageSize = parseInt(v);
  currentPage = 0;
  saveState();
  render();
}
function setButtonLoading(on) {
  const btn = document.getElementById('refreshBtn');
  if (on) {
    btn.disabled = true;
    btn.classList.add('loading');
    document.getElementById('refreshLabel').textContent = 'Refreshing…';
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
    document.getElementById('refreshLabel').textContent = 'Refresh';
  }
}
function setLoading(on) {
  setButtonLoading(on);
  const wrap = document.querySelector('.table-wrap');
  if (on) {
    wrap.classList.add('loading');
  } else {
    wrap.classList.remove('loading');
  }
}
function cancelTask(name) {
  vscode.postMessage({ type: 'cancel', name });
}
function previewAsset(assetName) {
  vscode.postMessage({ type: 'preview', assetName });
}
function refresh() {
  vscode.postMessage({ type: 'refresh' });
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'data') {
    allTasks = msg.tasks;
    isLoading = msg.loading;
    applyFilter();
    if (msg.silent) {
      setButtonLoading(false);
      render();
    } else if (!isLoading) {
      setLoading(false);
      render();
    } else {
      render();
    }
  } else if (msg.type === 'refreshStart') {
    setButtonLoading(true);
  } else if (msg.type === 'loading') {
    setLoading(true);
  } else if (msg.type === 'cancelled') {
    const t = allTasks.find((t) => t.name === msg.name);
    if (t) {
      t.state = 'CANCELLING';
    }
    applyFilter();
    render();
  } else if (msg.type === 'error') {
    setButtonLoading(false);
    setLoading(false);
    alert(msg.message);
  }
});

// ── Init ──────────────────────────────────────────────────────────────
buildPicker();
renderHeader();
document.getElementById('pageSize').value = String(pageSize);
document.getElementById(currentFilter === 'export' ? 'filterExport' : 'filterImport').checked =
  true;
updateSlider();
render();

function updateSlider() {
  const toggle = document.getElementById('filterToggle');
  const labels = toggle.querySelectorAll('label');
  const activeLabel = currentFilter === 'export' ? labels[0] : labels[1];
  const slider = document.getElementById('toggleSlider');
  slider.style.left = activeLabel.offsetLeft + 'px';
  slider.style.width = activeLabel.offsetWidth + 'px';
}
