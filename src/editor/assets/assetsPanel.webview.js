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

const TYPE_ICONS = {
  FOLDER:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4.5V6H5.58579C5.71839 6 5.84557 5.94732 5.93934 5.85355L7.29289 4.5L5.93934 3.14645C5.84557 3.05268 5.71839 3 5.58579 3H3.5C2.67157 3 2 3.67157 2 4.5ZM1 4.5C1 3.11929 2.11929 2 3.5 2H5.58579C5.98361 2 6.36514 2.15804 6.64645 2.43934L8.20711 4H12.5C13.8807 4 15 5.11929 15 6.5V11.5C15 12.8807 13.8807 14 12.5 14H3.5C2.11929 14 1 12.8807 1 11.5V4.5ZM2 7V11.5C2 12.3284 2.67157 13 3.5 13H12.5C13.3284 13 14 12.3284 14 11.5V6.5C14 5.67157 13.3284 5 12.5 5H8.20711L6.64645 6.56066C6.36514 6.84197 5.98361 7 5.58579 7H2Z"/></svg>',
  IMAGE_COLLECTION:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--vscode-charts-blue)"><path d="M8 8.99993C7.819 8.99993 7.643 8.95093 7.486 8.85793L2.486 5.85693C2.186 5.67793 2 5.34893 2 4.99993C2 4.65093 2.187 4.32093 2.486 4.14193L7.486 1.14293C7.789 0.95693 8.207 0.95493 8.517 1.14493L13.513 4.14293C13.813 4.32293 13.999 4.65093 13.999 4.99993C13.999 5.34893 13.812 5.67893 13.513 5.85793L8.513 8.85693C8.357 8.95093 8.181 8.99993 8 8.99993ZM8 1.99993L3 4.99993L8 7.99993L13 4.99993L8 1.99993Z"/><path d="M2.146 6.9873L8 10.5003L13.854 6.9873C13.946 7.1413 14 7.3173 14 7.5003C14 7.8493 13.814 8.1783 13.514 8.3583L8.514 11.3573C8.357 11.4513 8.181 11.5003 8 11.5003C7.819 11.5003 7.642 11.4513 7.486 11.3583L2.486 8.35731C2.187 8.17931 2 7.8503 2 7.5003C2 7.3163 2.054 7.1403 2.146 6.9873Z"/><path d="M2.146 9.4873L8 13.0003L13.854 9.4873C13.946 9.6413 14 9.8173 14 10.0003C14 10.3493 13.814 10.6783 13.514 10.8583L8.514 13.8573C8.357 13.9513 8.181 14.0003 8 14.0003C7.819 14.0003 7.642 13.9513 7.486 13.8583L2.486 10.8573C2.187 10.6793 2 10.3503 2 10.0003C2 9.8163 2.054 9.6403 2.146 9.4873Z"/></svg>',
  IMAGE:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--vscode-charts-orange)"><path d="M6 1C4.89543 1 4 1.89543 4 3V6H5V3C5 2.44772 5.44772 2 6 2H9V4.5C9 5.32843 9.67157 6 10.5 6H13V13C13 13.5523 12.5523 14 12 14H10.9646C10.9141 14.3531 10.8109 14.6891 10.6632 15H12C13.1046 15 14 14.1046 14 13V5.41421C14 5.01639 13.842 4.63486 13.5607 4.35355L10.6464 1.43934C10.3651 1.15804 9.98361 1 9.58579 1H6ZM12.7929 5H10.5C10.2239 5 10 4.77614 10 4.5V2.20711L12.7929 5ZM1 9.5C1 8.11929 2.11929 7 3.5 7H7.5C8.88071 7 10 8.11929 10 9.5V13.5C10 14.0095 9.84756 14.4835 9.5858 14.8787L6.56066 11.8536C5.97487 11.2678 5.02513 11.2678 4.43934 11.8536L1.4142 14.8787C1.15244 14.4835 1 14.0095 1 13.5V9.5ZM8 9.75C8 9.33579 7.66421 9 7.25 9C6.83579 9 6.5 9.33579 6.5 9.75C6.5 10.1642 6.83579 10.5 7.25 10.5C7.66421 10.5 8 10.1642 8 9.75ZM2.12131 15.5858C2.51652 15.8476 2.99046 16 3.5 16H7.5C8.00954 16 8.48348 15.8476 8.87869 15.5858L5.85355 12.5607C5.65829 12.3654 5.34171 12.3654 5.14645 12.5607L2.12131 15.5858Z"/></svg>',
  TABLE:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--vscode-charts-green)"><path d="M1 3.5C1 2.11929 2.11929 1 3.5 1H12.5C13.8807 1 15 2.11929 15 3.5V12.5C15 13.8807 13.8807 15 12.5 15H3.5C2.11929 15 1 13.8807 1 12.5V3.5ZM6 14H10V11L6 11V14ZM5 11H2V12.5C2 13.3284 2.67157 14 3.5 14H5V11ZM6 10L10 10V6L6 6V10ZM5 6H2V10H5V6ZM6 5L10 5V2H6V5ZM5 2H3.5C2.67157 2 2 2.67157 2 3.5V5H5V2ZM14 6H11V10H14V6ZM14 11H11V14H12.5C13.3284 14 14 13.3284 14 12.5V11ZM14 5V3.5C14 2.67157 13.3284 2 12.5 2H11V5H14Z"/></svg>',
};

const ACTION_ICONS = {
  preview:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 1H4.5C3.122 1 2 2.122 2 3.5V6.276C2.319 6.162 2.653 6.089 3 6.05V3.499C3 2.672 3.673 1.999 4.5 1.999H8.5V13.385L9.557 14.442C9.714 14.591 9.831 14.786 9.907 14.999H13.5C14.878 14.999 16 13.877 16 12.499V3.5C16 2.122 14.878 1 13.5 1ZM15 12.5C15 13.327 14.327 14 13.5 14H9.5V2H13.5C14.327 2 15 2.673 15 3.5V12.5ZM6.29 12.59C6.74 12.01 7 11.28 7 10.5C7 8.57 5.43 7 3.5 7C1.57 7 0 8.57 0 10.5C0 12.43 1.57 14 3.5 14C4.28 14 5.01 13.74 5.59 13.29L8.15 15.85C8.24 15.95 8.37 16 8.5 16C8.63 16 8.76 15.95 8.85 15.85C9.05 15.66 9.05 15.34 8.85 15.15L6.29 12.59ZM5.5 12C5.36 12.19 5.19 12.36 5 12.5C4.59 12.81 4.06 13 3.5 13C2.12 13 1 11.88 1 10.5C1 9.12 2.12 8 3.5 8C4.88 8 6 9.12 6 10.5C6 11.06 5.81 11.59 5.5 12Z"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.085 2C5.291 1.418 5.847 1 6.5 1H9.5C10.153 1 10.709 1.418 10.915 2H11.5C12.328 2 13 2.672 13 3.5V8.1C12.919 8.129 12.84 8.165 12.765 8.207C12.46 8.378 12.225 8.65 12.1 8.976L12 8.876V3.5C12 3.224 11.776 3 11.5 3H10.915C10.709 3.583 10.153 4 9.5 4H6.5C5.847 4 5.291 3.583 5.085 3H4.5C4.224 3 4 3.224 4 3.5V13.5C4 13.776 4.224 14 4.5 14H8V14.5C8 14.672 8.033 14.841 8.091 15H4.5C3.672 15 3 14.328 3 13.5V3.5C3 2.672 3.672 2 4.5 2H5.085ZM6.5 2C6.224 2 6 2.224 6 2.5C6 2.776 6.224 3 6.5 3H9.5C9.776 3 10 2.776 10 2.5C10 2.224 9.776 2 9.5 2H6.5Z"/><path d="M11.916 10.778C11.971 10.696 12 10.599 12 10.5C12 10.368 11.947 10.24 11.854 10.147L9.854 8.147C9.761 8.053 9.634 8 9.5 8C9.368 8 9.241 8.053 9.147 8.146L7.147 10.146C7.054 10.239 7 10.367 7 10.5C7 10.633 7.053 10.761 7.147 10.854C7.24 10.948 7.368 11 7.5 11C7.633 11 7.76 10.948 7.854 10.855L9 9.708V14.5C9 14.776 9.224 15 9.5 15C9.776 15 10 14.776 10 14.5V9.708L11.146 10.854C11.24 10.948 11.368 11 11.5 11C11.633 11 11.759 10.948 11.853 10.855C11.916 10.778 11.916 10.778 11.916 10.778Z"/><path d="M11.084 13.222C11.029 13.304 11 13.401 11 13.5C11 13.633 11.053 13.76 11.146 13.853L13.146 15.853C13.24 15.947 13.368 16 13.5 16C13.632 16 13.759 15.948 13.853 15.854L15.853 13.854C15.947 13.761 16 13.634 16 13.5C16 13.368 15.947 13.241 15.854 13.147C15.76 13.054 15.633 13 15.5 13C15.368 13 15.241 13.053 15.147 13.146L14 14.292V9.5C14 9.224 13.776 9 13.5 9C13.224 9 13 9.224 13 9.5V14.292L11.854 13.146C11.761 13.053 11.634 13 11.5 13C11.368 13 11.241 13.053 11.147 13.146C11.107 13.186 11.084 13.222 11.084 13.222Z"/></svg>',
  move: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.586 1C8.984 1 9.366 1.159 9.647 1.44L12.56 4.354C12.841 4.635 13 5.017 13 5.415V13C13 14.105 12.105 15 11 15H5C3.896 15 3 14.105 3 13V6H4V13C4 13.552 4.448 14 5 14H11C11.552 14 12 13.552 12 13V6H9.5C8.672 6 8 5.328 8 4.5V2H7.973C7.988 1.977 7.982 1.953 7.973 1.929C7.897 1.747 7.787 1.581 7.647 1.442L7.206 1H8.586ZM9 4.5C9 4.776 9.224 5 9.5 5H11.793L9 2.207V4.5Z"/><path d="M4.5 0C4.633 0 4.76 0.053 4.854 0.147L6.854 2.147C6.947 2.241 7 2.368 7 2.5C7 2.633 6.947 2.76 6.854 2.854C6.76 2.947 6.633 3 6.5 3C6.368 3 6.24 2.948 6.147 2.855L5 1.707V4.5C5 4.633 4.947 4.76 4.854 4.854C4.76 4.947 4.633 5 4.5 5C4.368 5 4.24 4.948 4.147 4.855C4.053 4.761 4 4.634 4 4.5V1.707L2.854 2.855C2.761 2.948 2.634 3 2.5 3C2.368 3 2.24 2.948 2.147 2.854C2.053 2.761 2 2.634 2 2.5C2 2.368 2.053 2.241 2.147 2.147L4.147 0.147C4.24 0.053 4.367 0 4.5 0Z"/></svg>',
  del: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 5 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 10 5.5Z"/></svg>',
  dot: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z"/></svg>',
};

function esc(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Persistence ─────────────────────────────────────────────────────

function saveState() {
  vscode.postMessage({ type: 'savePrefs', visibleCols: [...visibleCols], pageSize });
}

// ── Column picker ────────────────────────────────────────────────────

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

// ── Table header ─────────────────────────────────────────────────────

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

function formatType(t) {
  return (t || '').toLowerCase().replace(/_/g, ' ');
}

function actionsHtml(a) {
  const btns = [];
  if (a.type !== 'FOLDER') {
    btns.push(
      '<button class="action-btn" title="Preview" onclick="preview(\'' +
        esc(a.name) +
        '\')">' +
        ACTION_ICONS.preview +
        '</button>',
    );
  }
  btns.push(
    '<button class="action-btn" title="Copy asset" onclick="assetAction(\'copy\',\'' +
      esc(a.name) +
      '\')">' +
      ACTION_ICONS.copy +
      '</button>',
  );
  btns.push(
    '<button class="action-btn" title="Move asset" onclick="assetAction(\'move\',\'' +
      esc(a.name) +
      '\')">' +
      ACTION_ICONS.move +
      '</button>',
  );
  btns.push(
    '<button class="action-btn danger" title="Delete asset" onclick="assetAction(\'delete\',\'' +
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
        '<tr>' +
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

// ── Actions ───────────────────────────────────────────────────────────

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
  vscode.postMessage({ type: 'action', action, name });
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
