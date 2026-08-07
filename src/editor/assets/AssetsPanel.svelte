<!-- AssetsPanel: sortable/paginated asset table with breadcrumb, column picker, actions -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';
  import Pagination from '../Pagination.svelte';
  import ColumnPicker from '../ColumnPicker.svelte';

  const saved = getInitData();

  const ALL_COLS = [
    { key: 'icon', label: '', required: true },
    { key: 'shortName', label: 'Name', required: true },
    { key: 'type', label: 'Type' },
    { key: 'assetId', label: 'Asset ID' },
    { key: 'actions', label: 'Actions', required: true },
  ];

  const CONTAINER_TYPES = new Set(['FOLDER', 'IMAGE_COLLECTION']);

  let visibleCols = $state(new Set(saved.visibleCols || ALL_COLS.map(c => c.key)));
  ALL_COLS.filter(c => c.required).forEach(c => visibleCols.add(c.key));
  let pageSize = $state(saved.pageSize || 50);

  let assets = $state([]);
  let currentParent = $state('');
  let rootPath = $state('');
  let isLoading = $state(true);
  let currentPage = $state(0);
  let sortCol = $state('shortName');
  let sortDir = $state(1);
  let busyAssets = $state(new Map());

  // Derived
  let sorted = $derived.by(() => {
    return [...assets].sort((a, b) => {
      if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
      const va = (a[sortCol] || '').toLowerCase();
      const vb = (b[sortCol] || '').toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  });

  let totalPages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
  let pageItems = $derived(sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize));
  let rangeText = $derived.by(() => {
    if (sorted.length === 0) return '0 assets';
    const start = currentPage * pageSize + 1;
    const end = Math.min((currentPage + 1) * pageSize, sorted.length);
    return `${start}–${end} of ${sorted.length} assets`;
  });

  let visCols = $derived(ALL_COLS.filter(c => visibleCols.has(c.key)));

  let breadcrumbParts = $derived.by(() => {
    const parts = [{ label: rootPath.split('/')[1] || rootPath, path: rootPath }];
    if (currentParent !== rootPath && currentParent.includes('/assets/')) {
      const assetsIdx = currentParent.indexOf('/assets/');
      const relative = currentParent.substring(assetsIdx + '/assets/'.length);
      let accumulated = rootPath + '/assets';
      for (const part of relative.split('/')) {
        accumulated += '/' + part;
        parts.push({ label: part, path: accumulated });
      }
    }
    return parts;
  });

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function saveState() {
    vscode.postMessage({ type: 'savePrefs', visibleCols: [...visibleCols], pageSize });
  }

  function handleSort(key) {
    if (key === 'icon' || key === 'actions') return;
    if (sortCol === key) { sortDir *= -1; }
    else { sortCol = key; sortDir = 1; }
  }

  function navigate(path) {
    currentPage = 0;
    isLoading = true;
    vscode.postMessage({ type: 'navigate', path });
  }

  function goUp() {
    if (currentParent === rootPath) return;
    const parts = currentParent.split('/');
    navigate(parts.length <= 4 ? rootPath : parts.slice(0, -1).join('/'));
  }

  function refresh() {
    isLoading = true;
    vscode.postMessage({ type: 'refresh' });
  }

  function newFolder() {
    const parent = currentParent === rootPath ? rootPath + '/assets' : currentParent;
    vscode.postMessage({ type: 'action', action: 'createFolder', name: parent });
  }

  function preview(name) {
    vscode.postMessage({ type: 'preview', name });
  }

  function assetAction(action, name) {
    busyAssets.set(name, action);
    busyAssets = new Map(busyAssets);
    vscode.postMessage({ type: 'action', action, name });
  }

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------
  function formatType(t) {
    return (t || '').toLowerCase().replace(/_/g, ' ');
  }

  function isBusy(name) {
    return busyAssets.has(name);
  }

  // Messages from host
  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'data') {
      assets = msg.assets;
      currentParent = msg.parent;
      rootPath = msg.root;
      isLoading = msg.loading;
    } else if (msg.type === 'loading') {
      isLoading = true;
    } else if (msg.type === 'actionDone') {
      busyAssets.delete(msg.name);
      busyAssets = new Map(busyAssets);
    } else if (msg.type === 'error') {
      isLoading = false;
      alert(msg.message);
    }
  });
</script>

<h1>Asset Manager</h1>

<div class="topbar">
  <div class="topbar-left">
    <button class="btn-primary" title="Create a new folder" onclick={newFolder}>+ New</button>
    <button class="btn-primary" class:loading={isLoading} disabled={isLoading} onclick={refresh}>
      <span class="refresh-icon">⟳</span>
      <span>{isLoading ? 'Refreshing…' : 'Refresh'}</span>
    </button>
    <button title="Go to parent" disabled={currentParent === rootPath} onclick={goUp}>↑</button>
    <div class="breadcrumb">
      {#each breadcrumbParts as part, i}
        {#if i > 0}<span class="sep"> / </span>{/if}
        <button onclick={() => navigate(part.path)}>{part.label}</button>
      {/each}
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:var(--vscee-space-sm);">
    <ColumnPicker columns={ALL_COLS} bind:visibleCols onchange={saveState} />
  </div>
</div>

<div class="table-wrap" class:loading={isLoading}>
  <table>
    <thead>
      <tr>
        {#each visCols as col}
          {#if col.key === 'icon'}
            <th></th>
          {:else if col.key === 'actions'}
            <th>Actions</th>
          {:else}
            <th class:sorted={sortCol === col.key} onclick={() => handleSort(col.key)}>
              {col.label}
              <span class="sort-arrow">{sortCol === col.key ? (sortDir === 1 ? '▲' : '▼') : '▲'}</span>
            </th>
          {/if}
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each pageItems as a (a.name)}
        <tr class:busy={isBusy(a.name)}>
          {#if visibleCols.has('icon')}
            <td class="icon-col">
              {#if a.type === 'FOLDER'}
                <i class="codicon codicon-folder"></i>
              {:else if a.type === 'IMAGE_COLLECTION'}
                <i class="codicon codicon-layers" style="color:var(--vscode-charts-blue)"></i>
              {:else if a.type === 'IMAGE'}
                <i class="codicon codicon-file-media" style="color:var(--vscode-charts-orange)"></i>
              {:else if a.type === 'TABLE'}
                <i class="codicon codicon-table" style="color:var(--vscode-charts-green)"></i>
              {/if}
            </td>
          {/if}
          {#if visibleCols.has('shortName')}
            <td>
              {#if a.isContainer}
                <button class="name-link" onclick={() => navigate(a.name)}>{a.shortName}</button>
              {:else}
                <span class="name-text">{a.shortName}</span>
              {/if}
            </td>
          {/if}
          {#if visibleCols.has('type')}<td>{formatType(a.type)}</td>{/if}
          {#if visibleCols.has('assetId')}<td class="id-cell" title={a.assetId}>{a.assetId}</td>{/if}
          {#if visibleCols.has('actions')}
            <td class="actions-cell">
              <span class="action-dots">
                <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
                <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
                <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
                <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
              </span>
              <span class="action-btns">
                {#if a.type === 'FOLDER'}
                  <button class="action-btn" title="New folder" disabled={isBusy(a.name)} onclick={() => assetAction('createFolder', a.name)}>
                    <i class="codicon codicon-new-folder"></i>
                  </button>
                {:else}
                  <button class="action-btn" title="Preview" disabled={isBusy(a.name)} onclick={() => preview(a.name)}>
                    <i class="codicon codicon-open-preview"></i>
                  </button>
                {/if}
                <button class="action-btn" title="Copy asset" disabled={isBusy(a.name)} onclick={() => assetAction('copy', a.name)}>
                  <i class="codicon codicon-copy"></i>
                </button>
                <button class="action-btn" title="Move asset" disabled={isBusy(a.name)} onclick={() => assetAction('move', a.name)}>
                  <i class="codicon codicon-clippy"></i>
                </button>
                <button class="action-btn danger" title="Delete asset" disabled={isBusy(a.name)} onclick={() => assetAction('delete', a.name)}>
                  <i class="codicon codicon-trash"></i>
                </button>
              </span>
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="bottom-bar">
  <span class="page-info">{rangeText}{#if isLoading} <span class="spinner-inline"></span>{/if}</span>
  <Pagination bind:currentPage {totalPages} bind:pageSize onPageSizeChange={saveState} />
</div>

<style>
  :global {
    /* ==================================================================
       RESET & BASE LAYOUT
       ================================================================== */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }
    html,
    body {
      height: 100%;
      margin: 0;
    }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: var(--vscee-space-lg) var(--vscee-space-xl) var(--vscee-space-md);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    /* Mount point must participate in body's flex column */
    #app {
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    h1 {
      font-size: var(--vscee-font-xxl);
      margin: 0 0 var(--vscee-space-md) 0;
      display: flex;
      align-items: center;
      gap: var(--vscee-space-md);
      flex-shrink: 0;
    }

    /* ==================================================================
       TOOLBAR
       ================================================================== */
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--vscee-space-md);
      margin-bottom: var(--vscee-space-sm);
      flex-shrink: 0;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-md);
      min-width: 0;
    }

    /* ==================================================================
       BREADCRUMB
       ================================================================== */
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-xs);
      font-size: var(--vscee-font-md);
      flex-wrap: wrap;
      min-width: 0;
    }
    .breadcrumb button {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
      font-size: var(--vscee-font-md);
    }
    .breadcrumb button:hover {
      text-decoration: underline;
    }
    .breadcrumb .sep {
      opacity: 0.5;
    }

    /* ==================================================================
       TABLE CONTAINER
       ================================================================== */
    .table-wrap {
      flex: 1 1 0;
      overflow-y: auto;
      min-height: 120px;
      border: var(--vscee-border-sm) solid var(--vscode-panel-border);
      border-radius: var(--vscee-radius-md);
    }

    /* ==================================================================
       BOTTOM BAR
       ================================================================== */
    .bottom-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: var(--vscee-space-xs);
      flex-shrink: 0;
    }

    /* ==================================================================
       PAGINATION
       ================================================================== */
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: var(--vscee-space-md);
      gap: var(--vscee-space-md);
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    .pager {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-xxs);
    }
    .nav-btn {
      background: transparent;
      border-color: transparent;
      font-weight: 500;
    }
    .nav-btn:not(:disabled):hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-input-border);
    }
    .page-btn {
      min-width: 28px;
      height: 28px;
      padding: 0 var(--vscee-space-xs);
      border-radius: 50%;
      background: transparent;
      border: var(--vscee-border-sm) solid transparent;
      font-size: var(--vscee-font-xs);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .page-btn:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-input-border);
    }
    .page-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;
      font-weight: 600;
    }
    .page-ellipsis {
      padding: 0 var(--vscee-space-xs);
      opacity: 0.5;
      font-size: var(--vscee-font-sm);
      user-select: none;
    }

    /* ==================================================================
       INLINE SPINNER
       ================================================================== */
    .spinner-inline {
      width: 9px;
      height: 9px;
      border: var(--vscee-border-md) solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      display: inline-block;
      animation: spin 0.8s linear infinite;
      opacity: 0.6;
      vertical-align: middle;
      margin-left: var(--vscee-space-sm);
    }

    /* ==================================================================
       BUTTONS
       ================================================================== */
    button,
    select {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: var(--vscee-border-sm) solid var(--vscode-input-border);
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      border-radius: var(--vscee-radius-md);
      cursor: pointer;
      font-size: var(--vscee-font-sm);
    }
    button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .page-info {
      font-size: var(--vscee-font-sm);
      opacity: 0.7;
    }

    /* ==================================================================
       TABLE
       ================================================================== */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--vscee-font-sm);
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 1;
      text-align: left;
      padding: var(--vscee-space-sm) var(--vscee-space-md);
      cursor: pointer;
      user-select: none;
      background: var(--vscode-editor-background);
      border-bottom: var(--vscee-border-md) solid var(--vscode-panel-border);
      white-space: nowrap;
    }
    thead th:hover {
      background: var(--vscode-list-hoverBackground);
    }
    th .sort-arrow {
      opacity: 0.5;
      margin-left: var(--vscee-space-xs);
    }
    th.sorted .sort-arrow {
      opacity: 1;
    }
    td {
      padding: var(--vscee-space-sm) var(--vscee-space-md);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
    }
    tr:hover {
      background: var(--vscode-list-hoverBackground);
    }

    /* ==================================================================
       LOADING STATES
       ================================================================== */
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .refresh-icon {
      display: inline-block;
    }
    .btn-primary.loading {
      opacity: 0.75;
      cursor: default;
    }
    .btn-primary.loading .refresh-icon {
      animation: spin 0.8s linear infinite;
    }
    .table-wrap.loading {
      opacity: 0.45;
      pointer-events: none;
      transition: opacity 0.15s;
    }

    /* ==================================================================
       ASSET NAME & ICONS
       ================================================================== */
    .name-link {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      padding: 0;
      font-size: inherit;
      text-align: left;
    }
    .name-link:hover {
      text-decoration: underline;
    }
    .name-text {
      padding: 0;
    }
    .icon {
      margin-right: var(--vscee-space-sm);
      vertical-align: middle;
    }
    .icon-col {
      width: 24px;
      padding: var(--vscee-space-xs) var(--vscee-space-xs);
      text-align: center;
    }
    .icon-col .codicon {
      display: block;
      margin: auto;
      font-size: var(--vscee-font-icon-md);
    }
    .id-cell {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscee-font-xxs);
      opacity: 0.75;
    }

    /* ==================================================================
       ROW ACTIONS
       ================================================================== */
    .actions-cell {
      white-space: nowrap;
      text-align: right;
    }
    /* Idle rows show one dot per available action; hovering the row reveals the
       buttons. Each dot has the exact same footprint as an action button so the
       column width does not shift on hover. */
    .action-dots {
      display: inline-flex;
      align-items: center;
      height: 22px;
      opacity: 0.4;
    }
    .action-dot {
      padding: var(--vscee-space-xxs) var(--vscee-space-sm);
      display: inline-flex;
      align-items: center;
    }
    .action-btns {
      display: none;
      align-items: center;
      height: 22px;
    }
    tr:hover .action-dots,
    tr:focus-within .action-dots,
    tr.busy .action-dots {
      display: none;
    }
    tr:hover .action-btns,
    tr:focus-within .action-btns,
    tr.busy .action-btns {
      display: inline-flex;
    }
    tr.busy .action-btn {
      opacity: 0.35;
      pointer-events: none;
    }
    tr.busy .action-btn.spinning {
      opacity: 1;
    }
    tr.busy .action-btn.spinning .codicon {
      display: none;
    }
    .action-btn .codicon {
      font-size: var(--vscee-font-icon-sm);
    }
    .action-dot .codicon {
      font-size: var(--vscee-font-icon-sm);
    }
    .action-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--vscee-space-xxs) var(--vscee-space-sm);
      border-radius: var(--vscee-radius-md);
      color: var(--vscode-foreground);
      opacity: 0.7;
      display: inline-flex;
      align-items: center;
    }
    .action-btn:hover {
      opacity: 1;
      background: var(--vscode-list-hoverBackground);
    }
    .action-btn.danger {
      color: var(--vscode-errorForeground);
    }
    .action-btn.danger:hover {
      background: var(--vscode-inputValidation-errorBackground);
    }
  }
</style>
