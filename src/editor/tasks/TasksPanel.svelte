<!-- TasksPanel: sortable/paginated task table with filter toggle and column picker -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';
  import Pagination from '../Pagination.svelte';
  import ColumnPicker from '../ColumnPicker.svelte';

  const saved = getInitData();

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

  let visibleCols = $state(new Set(saved.visibleCols || ALL_COLS.map(c => c.key)));
  ALL_COLS.filter(c => c.required).forEach(c => visibleCols.add(c.key));
  let pageSize = $state(saved.pageSize || 25);
  let currentFilter = $state(saved.filter || 'export');

  let allTasks = $state([]);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let currentPage = $state(0);
  let sortCol = $state('createTime');
  let sortDir = $state(-1);

  // Derived: filtered tasks
  let tasks = $derived.by(() => {
    return currentFilter === 'export'
      ? allTasks.filter(t => { const type = (t.type || '').toUpperCase(); return type.startsWith('EXPORT') || type === ''; })
      : allTasks.filter(t => { const type = (t.type || '').toUpperCase(); return type.startsWith('INGEST') || type.startsWith('IMPORT'); });
  });

  // Derived: sorted tasks
  let sorted = $derived.by(() => {
    return [...tasks].sort((a, b) => {
      const va = a[sortCol] ?? '';
      const vb = b[sortCol] ?? '';
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  });

  let totalPages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
  let pageItems = $derived(sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize));
  let rangeText = $derived.by(() => {
    if (sorted.length === 0) {return '0 tasks';}
    const start = currentPage * pageSize + 1;
    const end = Math.min((currentPage + 1) * pageSize, sorted.length);
    return `${start}–${end} of ${sorted.length} tasks`;
  });

  // Visible columns (excluding hidden ones)
  let visCols = $derived(ALL_COLS.filter(c => visibleCols.has(c.key)));

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function saveState() {
    vscode.postMessage({ type: 'savePrefs', visibleCols: [...visibleCols], pageSize });
  }

  function handleSort(key) {
    if (key === 'icon' || key === 'actions') {return;}
    if (sortCol === key) {
      sortDir *= -1;
    } else {
      sortCol = key;
      sortDir = key === 'createTime' ? -1 : 1;
    }
  }

  function changeFilter(f) {
    currentFilter = f;
    currentPage = 0;
    saveState();
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

  function formatTime(t) {
    if (!t) {return '';}
    return new Date(t).toLocaleString();
  }

  // Messages from host
  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'data') {
      allTasks = msg.tasks;
      isLoading = msg.loading;
      isRefreshing = false;
    } else if (msg.type === 'refreshStart') {
      isRefreshing = true;
    } else if (msg.type === 'loading') {
      isLoading = true;
    } else if (msg.type === 'cancelled') {
      allTasks = allTasks.map(t => t.name === msg.name ? { ...t, state: 'CANCELLING' } : t);
    } else if (msg.type === 'error') {
      isRefreshing = false;
      isLoading = false;
      alert(msg.message);
    }
  });
</script>

<!-- TOOLBAR -->
<div class="topbar">
  <div class="topbar-left">
    <!-- Filter toggle -->
    <div class="toggle-switch">
      <input type="radio" id="filter-export" name="filter" checked={currentFilter === 'export'} onchange={() => changeFilter('export')} />
      <label for="filter-export">Export</label>
      <input type="radio" id="filter-import" name="filter" checked={currentFilter === 'import'} onchange={() => changeFilter('import')} />
      <label for="filter-import">Import</label>
      <span class="slider" style:left={currentFilter === 'export' ? '0' : '50%'} style:width="50%"></span>
    </div>

    <!-- Refresh button -->
    <button class="btn-primary" class:loading={isRefreshing} disabled={isRefreshing} onclick={refresh}>
      <span class="refresh-icon">↻</span>
      {isRefreshing ? 'Refreshing…' : 'Refresh'}
    </button>
  </div>

  <!-- Column picker anchored to the right of the toolbar -->
  <ColumnPicker columns={ALL_COLS} bind:visibleCols onchange={saveState} />
</div>

<!-- TABLE -->
<div class="table-wrap" class:loading={isLoading && allTasks.length === 0}>
  <table>
    <thead>
      <tr>
        {#each visCols as col}
          {#if col.key === 'icon'}
            <th class="icon-col"></th>
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
      {#each pageItems as t (t.name)}
        <tr>
          {#if visibleCols.has('icon')}
            <td class="icon-col">
              {#if t.state === 'RUNNING' || t.state === 'CANCELLING'}
                <span class="spinner"></span>
              {:else if t.state === 'SUCCEEDED'}
                <span class="dot succeeded"></span>
              {:else if t.state === 'FAILED'}
                <span class="dot failed"></span>
              {:else if t.state === 'CANCELLED'}
                <span class="dot cancelled"></span>
              {:else if t.state === 'PENDING'}
                <span class="dot pending"></span>
              {/if}
            </td>
          {/if}
          {#if visibleCols.has('state')}<td><span class="status">{t.state}</span></td>{/if}
          {#if visibleCols.has('description')}
            <td>
              {t.description}
              {#if t.error}<br /><span class="error-text">{t.error}</span>{/if}
            </td>
          {/if}
          {#if visibleCols.has('id')}<td class="id-cell" title={t.id}>{t.id}</td>{/if}
          {#if visibleCols.has('createTime')}<td>{formatTime(t.createTime)}</td>{/if}
          {#if visibleCols.has('startTime')}<td>{formatTime(t.startTime)}</td>{/if}
          {#if visibleCols.has('elapsed')}<td class="elapsed">{t.elapsed}</td>{/if}
          {#if visibleCols.has('attempt')}<td style="text-align:center">{t.attempt ?? ''}</td>{/if}
          {#if visibleCols.has('priority')}<td style="text-align:center">{t.priority ?? ''}</td>{/if}
          {#if visibleCols.has('computeUsage')}<td class="compute">{t.computeUsage != null ? t.computeUsage.toFixed(1) + ' EECU·s' : ''}</td>{/if}
          {#if visibleCols.has('actions')}
            {@const hasCancel = t.state === 'RUNNING' || t.state === 'PENDING'}
            {@const hasPreview = Boolean(t.previewAssetName)}
            <td class="actions-cell">
              {#if hasCancel || hasPreview}
                <span class="action-dots">
                  <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
                </span>
                <span class="action-btns">
                  {#if hasCancel}
                    <button class="action-btn danger" title="Cancel task" onclick={() => cancelTask(t.name)}>
                      <i class="codicon codicon-stop-circle"></i>
                    </button>
                  {/if}
                  {#if hasPreview}
                    <button class="action-btn" title="Preview asset" onclick={() => previewAsset(t.previewAssetName)}>
                      <i class="codicon codicon-open-preview"></i>
                    </button>
                  {/if}
                </span>
              {/if}
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<!-- FOOTER: count left, pagination right -->
<div class="footer">
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
    #app {
      flex: 1 1 0;
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
       FOOTER
       ================================================================== */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: var(--vscee-space-sm);
      gap: var(--vscee-space-md);
      flex-shrink: 0;
      flex-wrap: wrap;

      /* Pagination sits inside the footer — remove its own justify-content */
      .pagination { padding-top: 0; }
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

      &:not(:disabled):hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-input-border);
      }
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

      &:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-input-border);
      }
      &.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-color: transparent;
        font-weight: 600;
      }
    }
    .page-ellipsis {
      padding: 0 var(--vscee-space-xs);
      opacity: 0.5;
      font-size: var(--vscee-font-sm);
      user-select: none;
    }

    /* ==================================================================
       FILTER TOGGLE
       ================================================================== */
    .toggle-switch {
      display: inline-flex;
      border-radius: var(--vscee-radius-md);
      overflow: hidden;
      border: var(--vscee-border-sm) solid var(--vscode-input-border);
      position: relative;
      flex-shrink: 0;

      input {
        display: none;
        &:checked + label { color: var(--vscode-button-foreground); }
      }
      label {
        padding: var(--vscee-space-xs) var(--vscee-space-lg);
        font-size: var(--vscee-font-sm);
        cursor: pointer;
        position: relative;
        z-index: 1;
        color: var(--vscode-button-secondaryForeground);
        transition: color 0.15s;
        user-select: none;
      }
      .slider {
        position: absolute;
        top: 0;
        bottom: 0;
        border-radius: var(--vscee-radius-md);
        background: var(--vscode-button-background);
        transition: left 0.2s, width 0.2s;
      }
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
    button {
      &:hover { background: var(--vscode-button-secondaryHoverBackground); }
      &:disabled { opacity: 0.4; cursor: default; }
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;

      &:hover { background: var(--vscode-button-hoverBackground); }
      &.loading {
        opacity: 0.75;
        cursor: default;

        .refresh-icon { animation: spin 0.8s linear infinite; }
      }
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
    thead {
      th {
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

        &:hover { background: var(--vscode-list-hoverBackground); }
      }
    }
    th {
      .sort-arrow {
        opacity: 0.5;
        margin-left: var(--vscee-space-xs);
      }
      &.sorted .sort-arrow { opacity: 1; }
    }
    td {
      padding: var(--vscee-space-sm) var(--vscee-space-md);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
    }
    .icon-col {
      width: 24px;
      padding: var(--vscee-space-xs) var(--vscee-space-xs);
      text-align: center;
    }
    .status {
      white-space: nowrap;
    }

    /* ==================================================================
       STATUS INDICATORS
       ================================================================== */
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;

      &.succeeded { background: var(--vscode-testing-iconPassed); }
      &.failed { background: var(--vscode-testing-iconFailed); }
      &.cancelled { background: var(--vscode-disabledForeground); }
      &.pending { background: var(--vscode-charts-yellow); }
    }

    /* ==================================================================
       LOADING STATES
       ================================================================== */
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .refresh-icon { display: inline-block; }
    .btn-primary.loading {
      opacity: 0.75;
      cursor: default;

      .refresh-icon { animation: spin 0.8s linear infinite; }
    }
    .table-wrap.loading {
      opacity: 0.45;
      pointer-events: none;
      transition: opacity 0.15s;
    }
    .spinner {
      width: 10px;
      height: 10px;
      border: var(--vscee-border-md) solid var(--vscode-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      display: inline-block;
      animation: spin 1s linear infinite;
    }
    /* ==================================================================
       ROW ACTIONS
       ================================================================== */
    .actions-cell {
      white-space: nowrap;
      text-align: right;
    }
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
    tr {
      &:hover {
        background: var(--vscode-list-hoverBackground);
        .action-dots { display: none; }
        .action-btns { display: inline-flex; }
      }
      &:focus-within {
        .action-dots { display: none; }
        .action-btns { display: inline-flex; }
      }
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

      &:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
      &.danger {
        color: var(--vscode-errorForeground);
        &:hover { background: var(--vscode-inputValidation-errorBackground); }
      }
    }

    /* ==================================================================
       TABLE CELLS
       ================================================================== */
    .error-text {
      color: var(--vscode-errorForeground);
    }
    .elapsed {
      opacity: 0.7;
    }
    .id-cell {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscee-font-xxs);
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .compute {
      opacity: 0.85;
      white-space: nowrap;
    }
  }
</style>
