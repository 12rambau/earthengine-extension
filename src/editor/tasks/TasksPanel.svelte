<!-- TasksPanel: sortable/paginated task table with filter toggle and column picker -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';
  import DataTable from '../../shared/dataTable/DataTable.svelte';
  import { createDataTable } from '../../shared/dataTable/dataTable.svelte.ts';

  const saved = getInitData();

  const ALL_COLS = [
    { key: 'icon', label: '', required: true },
    { key: 'state', label: 'Status', required: true, sortable: true, filter: { kind: 'enum', options: ['PENDING', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] }, accessor: task => task.state },
    { key: 'description', label: 'Name', required: true, sortable: true, filter: { kind: 'text' }, accessor: task => task.description },
    { key: 'id', label: 'ID', sortable: true, filter: { kind: 'text' }, accessor: task => task.id },
    { key: 'createTime', label: 'Created', sortable: true, filter: { kind: 'date' }, accessor: task => task.createTime },
    { key: 'startTime', label: 'Start', sortable: true, filter: { kind: 'date' }, accessor: task => task.startTime },
    { key: 'elapsed', label: 'Duration', sortable: true, filter: { kind: 'number' }, accessor: task => task.elapsedMs },
    { key: 'attempt', label: 'Attempts', sortable: true, filter: { kind: 'number' }, accessor: task => task.attempt },
    { key: 'priority', label: 'Priority', sortable: true, filter: { kind: 'number' }, accessor: task => task.priority },
    { key: 'computeUsage', label: 'Compute Usage', sortable: true, filter: { kind: 'number' }, accessor: task => task.computeUsage },
    { key: 'actions', label: 'Actions', required: true },
  ];

  const initialFilter = saved.filter || 'export';
  const initialPreferencesByFilter = saved.tablePreferences || {};
  let currentFilter = $state(initialFilter);
  let preferencesByFilter = $state(initialPreferencesByFilter);
  let table = createDataTable({
    columns: ALL_COLS,
    defaultPageSize: 25,
    defaultSort: { column: 'createTime', direction: -1 },
    preferences: initialPreferencesByFilter[initialFilter],
  });

  let allTasks = $state([]);
  let isLoading = $state(true);
  let isRefreshing = $state(false);

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function saveState(preferences = table.exportPreferences()) {
    preferencesByFilter = { ...preferencesByFilter, [currentFilter]: preferences };
    vscode.postMessage({ type: 'savePrefs', tablePreferences: preferencesByFilter });
  }

  function syncRows() {
    const rows = currentFilter === 'export'
      ? allTasks.filter(task => { const type = (task.type || '').toUpperCase(); return type.startsWith('EXPORT') || type === ''; })
      : allTasks.filter(task => { const type = (task.type || '').toUpperCase(); return type.startsWith('INGEST') || type.startsWith('IMPORT'); });
    table.setRows(rows);
  }

  function changeFilter(filter) {
    if (currentFilter === filter) {return;}
    preferencesByFilter = { ...preferencesByFilter, [currentFilter]: table.exportPreferences() };
    currentFilter = filter;
    table.applyPreferences(preferencesByFilter[currentFilter]);
    syncRows();
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
      syncRows();
      isLoading = msg.loading;
      isRefreshing = false;
    } else if (msg.type === 'refreshStart') {
      isRefreshing = true;
    } else if (msg.type === 'loading') {
      isLoading = true;
    } else if (msg.type === 'cancelled') {
      allTasks = allTasks.map(t => t.name === msg.name ? { ...t, state: 'CANCELLING' } : t);
      syncRows();
    } else if (msg.type === 'error') {
      isRefreshing = false;
      isLoading = false;
      alert(msg.message);
    }
  });
</script>

<DataTable
  {table}
  itemLabel="tasks"
  loading={isLoading}
  rowKey={(task) => task.name}
  onpreferenceschange={saveState}
>
  {#snippet toolbar()}
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
  {/snippet}

  {#snippet row(t, columns)}
    {@const visible = new Set(columns.map(column => column.key))}
    {#if visible.has('icon')}
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
    {#if visible.has('state')}<td><span class="status">{t.state}</span></td>{/if}
    {#if visible.has('description')}
      <td>
        {t.description}
        {#if t.error}<br /><span class="error-text">{t.error}</span>{/if}
      </td>
    {/if}
    {#if visible.has('id')}<td class="id-cell" title={t.id}>{t.id}</td>{/if}
    {#if visible.has('createTime')}<td>{formatTime(t.createTime)}</td>{/if}
    {#if visible.has('startTime')}<td>{formatTime(t.startTime)}</td>{/if}
    {#if visible.has('elapsed')}<td class="elapsed">{t.elapsed}</td>{/if}
    {#if visible.has('attempt')}<td style="text-align:center">{t.attempt ?? ''}</td>{/if}
    {#if visible.has('priority')}<td style="text-align:center">{t.priority ?? ''}</td>{/if}
    {#if visible.has('computeUsage')}<td class="compute">{t.computeUsage != null ? t.computeUsage.toFixed(1) + ' EECU·s' : ''}</td>{/if}
    {#if visible.has('actions')}
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
  {/snippet}
</DataTable>

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
