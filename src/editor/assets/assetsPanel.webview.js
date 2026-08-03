/**
 * @module assetsPanel.webview
 * Browser-side script for the Asset Manager panel. Renders the sortable,
 * paginated asset table with column picker, breadcrumb and pagination, and
 * messages the extension host for navigation, preview and row actions.
 */

const vscode = acquireVsCodeApi();

const ALL_COLS = [
  { key: 'icon', label: '', required: true },
  { key: 'shortName', label: 'Name', required: true },
  { key: 'type', label: 'Type' },
  { key: 'assetId', label: 'Asset ID' },
  { key: 'actions', label: 'Actions', required: true },
];

// Restore persisted state (injected by extension host via globalState)
const saved = JSON.parse(document.getElementById('init-data').textContent);
let visibleCols = new Set(saved.visibleCols || ALL_COLS.map((c) => c.key));
ALL_COLS.filter((c) => c.required).forEach((c) => visibleCols.add(c.key)); // always enforce required
let pageSize = saved.pageSize || 50;

let assets = [];
let currentParent = '';
let rootPath = '';
let isLoading = true; // true until the last streamed page arrives
let currentPage = 0;
let sortCol = 'shortName';
let sortDir = 1;
const busyAssets = new Map();

const TYPE_ICONS = {
  FOLDER: '<i class="codicon codicon-folder"></i>',
  IMAGE_COLLECTION:
    '<i class="codicon codicon-layers" style="color:var(--vscode-charts-blue)"></i>',
  IMAGE: '<i class="codicon codicon-file-media" style="color:var(--vscode-charts-orange)"></i>',
  TABLE: '<i class="codicon codicon-table" style="color:var(--vscode-charts-green)"></i>',
};

const ACTION_ICONS = {
  preview: '<i class="codicon codicon-preview"></i>',
  copy: '<i class="codicon codicon-copy"></i>',
  move: '<i class="codicon codicon-move"></i>',
  del: '<i class="codicon codicon-trash"></i>',
  newFolder: '<i class="codicon codicon-new-folder"></i>',
  dot: '<i class="codicon codicon-circle-small-filled"></i>',
};

function esc(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==================================================================
// PERSISTENCE
// ==================================================================
function saveState() {
  vscode.postMessage({ type: 'savePrefs', visibleCols: [...visibleCols], pageSize });
}

// ==================================================================
// COLUMN PICKER
// ==================================================================
function buildPicker() {
  const picker = document.getElementById('col-picker');
  picker.innerHTML = ALL_COLS.map((c) => {
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
  }).join('');
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

// ==================================================================
// TABLE HEADER
// ==================================================================
function renderHeader() {
  const tr = document.querySelector('#thead tr');
  tr.innerHTML = ALL_COLS.filter((c) => visibleCols.has(c.key))
    .map((c) => {
      if (c.key === 'icon') {
        return '<th></th>';
      }
      if (c.key === 'actions') {
        return '<th>Actions</th>';
      }
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
    if (arrow) {
      arrow.textContent = '▲';
    }
  });
  const visCols = ALL_COLS.filter((c) => visibleCols.has(c.key) && c.key !== 'actions');
  const idx = visCols.findIndex((c) => c.key === sortCol);
  if (idx >= 0) {
    const th = document.querySelectorAll('thead th')[idx];
    if (th) {
      th.classList.add('sorted');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) {
        arrow.textContent = sortDir === 1 ? '▲' : '▼';
      }
    }
  }
}

// ==================================================================
// BREADCRUMB
// ==================================================================
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

// ==================================================================
// RENDER
// ==================================================================
function formatType(t) {
  return (t || '').toLowerCase().replace(/_/g, ' ');
}

function actionsHtml(a) {
  const btns = [];
  if (a.type === 'FOLDER') {
    btns.push(
      '<button class="action-btn" data-action="createFolder" title="New folder" onclick="assetAction(\'createFolder\',\'' +
        esc(a.name) +
        '\')">' +
        ACTION_ICONS.newFolder +
        '</button>',
    );
  } else {
    btns.push(
      '<button class="action-btn" title="Preview" onclick="preview(\'' +
        esc(a.name) +
        '\')">' +
        ACTION_ICONS.preview +
        '</button>',
    );
  }
  btns.push(
    '<button class="action-btn" data-action="copy" title="Copy asset" onclick="assetAction(\'copy\',\'' +
      esc(a.name) +
      '\')">' +
      ACTION_ICONS.copy +
      '</button>',
  );
  btns.push(
    '<button class="action-btn" data-action="move" title="Move asset" onclick="assetAction(\'move\',\'' +
      esc(a.name) +
      '\')">' +
      ACTION_ICONS.move +
      '</button>',
  );
  btns.push(
    '<button class="action-btn danger" data-action="delete" title="Delete asset" onclick="assetAction(\'delete\',\'' +
      esc(a.name) +
      '\')">' +
      ACTION_ICONS.del +
      '</button>',
  );
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

function render() {
  const sorted = [...assets].sort((a, b) => {
    if (a.isContainer !== b.isContainer) {
      return a.isContainer ? -1 : 1;
    }
    const va = (a[sortCol] || '').toLowerCase();
    const vb = (b[sortCol] || '').toLowerCase();
    return va < vb ? -sortDir : va > vb ? sortDir : 0;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  if (currentPage >= totalPages) {
    currentPage = totalPages - 1;
  }
  const start = currentPage * pageSize;
  const page = sorted.slice(start, start + pageSize);

  const vis = (key) => visibleCols.has(key);
  document.getElementById('tbody').innerHTML = page
    .map((a) => {
      const icon = TYPE_ICONS[a.type] || '';
      const nameCell = a.isContainer
        ? '<button class="name-link" onclick="navigate(\'' +
          esc(a.name) +
          '\')">' +
          esc(a.shortName) +
          '</button>'
        : '<span class="name-text">' + esc(a.shortName) + '</span>';
      return (
        '<tr data-asset="' +
        esc(a.name) +
        '">' +
        (vis('icon') ? '<td class="icon-col">' + icon + '</td>' : '') +
        (vis('shortName') ? '<td>' + nameCell + '</td>' : '') +
        (vis('type') ? '<td>' + formatType(a.type) + '</td>' : '') +
        (vis('assetId')
          ? '<td class="id-cell" title="' + esc(a.assetId) + '">' + esc(a.assetId) + '</td>'
          : '') +
        (vis('actions') ? '<td class="actions-cell">' + actionsHtml(a) + '</td>' : '') +
        '</tr>'
      );
    })
    .join('');

  const rangeStart = sorted.length > 0 ? start + 1 : 0;
  const rangeEnd = Math.min(start + pageSize, sorted.length);
  const countStr =
    sorted.length > 0
      ? rangeStart + '–' + rangeEnd + ' of ' + sorted.length + ' assets'
      : '0 assets';
  document.getElementById('pageInfo').innerHTML =
    esc(countStr) + (isLoading ? ' <span class="spinner-inline"></span>' : '');
  // Re-apply busy states after re-render
  for (var entry of busyAssets) {
    applyBusyState(entry[0], entry[1]);
  }
  document.getElementById('prevBtn').disabled = currentPage === 0;
  document.getElementById('nextBtn').disabled = currentPage >= totalPages - 1;
  document.getElementById('pageNums').innerHTML = pagerHtml(currentPage, totalPages);
  document.getElementById('upBtn').disabled = currentParent === rootPath;
  updateSortArrows();
  renderBreadcrumb();
}

function pagerHtml(cur, total) {
  if (total <= 1) {
    return '';
  }
  const shown = new Set([0, total - 1]);
  for (let i = Math.max(0, cur - 1); i <= Math.min(total - 1, cur + 1); i++) {
    shown.add(i);
  }
  const pages = [...shown].sort((a, b) => a - b);
  const btns = [];
  let prev = -1;
  for (const p of pages) {
    if (prev !== -1 && p > prev + 1) {
      btns.push('<span class="page-ellipsis">…</span>');
    }
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

// ==================================================================
// ACTIONS
// ==================================================================
function sortBy(col) {
  if (sortCol === col) {
    sortDir *= -1;
  } else {
    sortCol = col;
    sortDir = 1;
  }
  render();
}
function nextPage() {
  const totalPages = Math.ceil(assets.length / pageSize);
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
function navigate(path) {
  currentPage = 0;
  setLoading(true);
  vscode.postMessage({ type: 'navigate', path });
}
function refresh() {
  setLoading(true);
  vscode.postMessage({ type: 'refresh' });
}
function newFolder() {
  // At the project root, the assets subtree lives under rootPath + '/assets'
  var parent = currentParent === rootPath ? rootPath + '/assets' : currentParent;
  vscode.postMessage({ type: 'action', action: 'createFolder', name: parent });
}
function goUp() {
  if (currentParent === rootPath) {
    return;
  }
  // Go to parent: remove last path segment, or back to root when at depth 1
  const parts = currentParent.split('/');
  if (parts.length <= 4) {
    navigate(rootPath);
    return;
  }
  navigate(parts.slice(0, -1).join('/'));
}
function preview(name) {
  vscode.postMessage({ type: 'preview', name });
}
function assetAction(action, name) {
  busyAssets.set(name, action);
  applyBusyState(name, action);
  vscode.postMessage({ type: 'action', action, name });
}
function applyBusyState(name, action) {
  var row = document.querySelector('tr[data-asset="' + CSS.escape(name) + '"]');
  if (!row) {
    return;
  }
  row.classList.add('busy');
  row.querySelectorAll('.action-btn').forEach(function (b) {
    b.disabled = true;
  });
  var btn = row.querySelector('.action-btn[data-action="' + action + '"]');
  if (btn) {
    btn.classList.add('spinning');
    btn.insertAdjacentHTML('beforeend', '<span class="spinner-inline"></span>');
  }
}
function clearBusyState(name) {
  busyAssets.delete(name);
  var row = document.querySelector('tr[data-asset="' + CSS.escape(name) + '"]');
  if (!row) {
    return;
  }
  row.classList.remove('busy');
  row.querySelectorAll('.action-btn').forEach(function (b) {
    b.disabled = false;
    b.classList.remove('spinning');
    var sp = b.querySelector('.spinner-inline');
    if (sp) {
      sp.remove();
    }
  });
}

window.addEventListener('message', (e) => {
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
  } else if (msg.type === 'actionDone') {
    clearBusyState(msg.name);
  } else if (msg.type === 'error') {
    isLoading = false;
    setLoading(false);
    alert(msg.message);
  }
});

// ==================================================================
// INIT
// ==================================================================
// Expose functions to inline onclick/onchange handlers (script is bundled as IIFE)
window.refresh = refresh;
window.newFolder = newFolder;
window.goUp = goUp;
window.changePageSize = changePageSize;
window.togglePicker = togglePicker;
window.toggleCol = toggleCol;
window.sortBy = sortBy;
window.navigate = navigate;
window.nextPage = nextPage;
window.prevPage = prevPage;
window.goToPage = goToPage;
window.preview = preview;
window.assetAction = assetAction;
window.applyBusyState = applyBusyState;
window.clearBusyState = clearBusyState;

buildPicker();
renderHeader();
document.getElementById('pageSize').value = String(pageSize);
setLoading(true); // until the first data message arrives
