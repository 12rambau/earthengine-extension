<!-- TasksPanel: sortable/paginated task table with filter toggle and column picker -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';
  import Pagination from '../../shared/Pagination.svelte';
  import ColumnPicker from '../../shared/ColumnPicker.svelte';

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
    if (sorted.length === 0) return '0 tasks';
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
    if (key === 'icon' || key === 'actions') return;
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

  function previewAsset(uri) {
    // EE returns ?asset=projects/... (code.earthengine.google.com) or /v1/projects/... (googleapis.com)
    const m = uri.match(/asset=(projects\/[^&\s]+)/) ||
              uri.match(/\/v1\/(projects\/[^/]+\/assets\/.+)/);
    if (m) vscode.postMessage({ type: 'preview', assetName: decodeURIComponent(m[1]) });
  }

  function refresh() {
    vscode.postMessage({ type: 'refresh' });
  }

  function formatTime(t) {
    if (!t) return '';
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
            {@const hasPreview = t.state === 'SUCCEEDED' && t.destinationUris?.length > 0}
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
                    <button class="action-btn" title="Preview asset" onclick={() => previewAsset(t.destinationUris[0])}>
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
      padding: 12px 16px 8px;
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
      font-size: 1.3em;
      margin: 0 0 8px 0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    /* ==================================================================
       TOOLBAR
       ================================================================== */
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
      flex-shrink: 0;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ==================================================================
       TABLE CONTAINER
       ================================================================== */
    .table-wrap {
      flex: 1 1 0;
      overflow-y: auto;
      min-height: 120px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
    }

    /* ==================================================================
       FOOTER
       ================================================================== */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 6px;
      gap: 8px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    /* Pagination sits inside the footer — remove its own justify-content */
    .footer .pagination {
      padding-top: 0;
    }

    /* ==================================================================
       PAGINATION
       ================================================================== */
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 8px;
      gap: 8px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    .pager {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .nav-btn {
      background: transparent !important;
      border-color: transparent !important;
      font-weight: 500;
    }
    .nav-btn:not(:disabled):hover {
      background: var(--vscode-list-hoverBackground) !important;
      border-color: var(--vscode-input-border) !important;
    }
    .page-btn {
      min-width: 28px;
      height: 28px;
      padding: 0 4px;
      border-radius: 50%;
      background: transparent !important;
      border: 1px solid transparent !important;
      font-size: 0.82em;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .page-btn:hover {
      background: var(--vscode-list-hoverBackground) !important;
      border-color: var(--vscode-input-border) !important;
    }
    .page-btn.active {
      background: var(--vscode-button-background) !important;
      color: var(--vscode-button-foreground) !important;
      border-color: transparent !important;
      font-weight: 600;
    }
    .page-ellipsis {
      padding: 0 4px;
      opacity: 0.5;
      font-size: 0.85em;
      user-select: none;
    }

    /* ==================================================================
       PAGE-SIZE SELECT
       ================================================================== */
    .per-page-select {
      appearance: none;
      -webkit-appearance: none;
      padding-right: 20px !important;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E") !important;
      background-repeat: no-repeat !important;
      background-position: right 6px center !important;
      background-color: var(--vscode-button-secondaryBackground) !important;
      border: 1px solid var(--vscode-input-border) !important;
      cursor: pointer;
    }
    .per-page-select:hover {
      background-color: var(--vscode-button-secondaryHoverBackground) !important;
    }

    /* ==================================================================
       FILTER TOGGLE
       ================================================================== */
    .toggle-switch {
      display: inline-flex;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--vscode-input-border);
      position: relative;
      flex-shrink: 0;
    }
    .toggle-switch input {
      display: none;
    }
    .toggle-switch label {
      padding: 4px 10px;
      font-size: 0.85em;
      cursor: pointer;
      position: relative;
      z-index: 1;
      color: var(--vscode-button-secondaryForeground);
      transition: color 0.15s;
      user-select: none;
    }
    .toggle-switch .slider {
      position: absolute;
      top: 0;
      bottom: 0;
      border-radius: 3px;
      background: var(--vscode-button-background);
      transition: left 0.2s, width 0.2s;
    }
    .toggle-switch input:checked + label {
      color: var(--vscode-button-foreground);
    }

    /* ==================================================================
       INLINE SPINNER
       ================================================================== */
    .spinner-inline {
      width: 9px;
      height: 9px;
      border: 1.5px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      display: inline-block;
      animation: spin 0.8s linear infinite;
      opacity: 0.6;
      vertical-align: middle;
      margin-left: 5px;
    }

    /* ==================================================================
       BUTTONS
       ================================================================== */
    button,
    select {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-input-border);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85em;
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
      font-size: 0.85em;
      opacity: 0.7;
    }

    /* ==================================================================
       COLUMN PICKER
       ================================================================== */
    .col-picker-wrap {
      position: relative;
    }
    .col-picker-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .col-picker-btn.active {
      background: var(--vscode-button-background) !important;
      color: var(--vscode-button-foreground) !important;
      border-color: transparent !important;
    }
    .col-picker-chevron {
      font-size: 0.75em;
      opacity: 0.7;
    }
    .col-picker {
      position: absolute;
      right: 0;
      top: calc(100% + 4px);
      z-index: 10;
      background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 6px 4px;
      min-width: 160px;
      box-shadow: 0 4px 12px var(--vscode-widget-shadow);
    }
    .col-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.85em;
      white-space: nowrap;
      user-select: none;
    }
    .col-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .col-item input[type='checkbox'] {
      cursor: pointer;
      margin: 0;
    }
    .col-item.required {
      opacity: 0.5;
      cursor: default;
    }

    /* ==================================================================
       TABLE
       ================================================================== */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85em;
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 1;
      text-align: left;
      padding: 6px 8px;
      cursor: pointer;
      user-select: none;
      background: var(--vscode-editor-background);
      border-bottom: 2px solid var(--vscode-panel-border);
      white-space: nowrap;
    }
    thead th:hover {
      background: var(--vscode-list-hoverBackground);
    }
    th .sort-arrow {
      opacity: 0.5;
      margin-left: 4px;
    }
    th.sorted .sort-arrow {
      opacity: 1;
    }
    td {
      padding: 5px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    tr:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .icon-col {
      width: 24px;
      padding: 3px 4px;
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
    }
    .dot.succeeded {
      background: var(--vscode-testing-iconPassed);
    }
    .dot.failed {
      background: var(--vscode-testing-iconFailed);
    }
    .dot.cancelled {
      background: var(--vscode-disabledForeground);
    }
    .dot.pending {
      background: var(--vscode-charts-yellow);
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
    .spinner {
      width: 10px;
      height: 10px;
      border: 2px solid var(--vscode-foreground);
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
      padding: 2px 6px;
      display: inline-flex;
      align-items: center;
    }
    .action-btns {
      display: none;
      align-items: center;
      height: 22px;
    }
    tr:hover .action-dots,
    tr:focus-within .action-dots {
      display: none;
    }
    tr:hover .action-btns,
    tr:focus-within .action-btns {
      display: inline-flex;
    }
    .action-btn {
      background: none !important;
      border: none !important;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      color: var(--vscode-foreground);
      opacity: 0.7;
      display: inline-flex;
      align-items: center;
    }
    .action-btn:hover {
      opacity: 1;
      background: var(--vscode-list-hoverBackground) !important;
    }
    .action-btn.danger {
      color: var(--vscode-errorForeground);
    }
    .action-btn.danger:hover {
      background: var(--vscode-inputValidation-errorBackground) !important;
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
      font-size: 0.78em;
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
