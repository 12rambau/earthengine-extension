<!-- TasksPanel: sortable/paginated task table with filter toggle and column picker -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';
  import DataTable from '../components/DataTable.svelte';
  import TableButton from '../components/TableButton.svelte';
  import { createDataTable } from '../components/dataTable.svelte.ts';

  const saved = getInitData();

  // Filters must compare the same rounded figure the cell renders, or "equals" never matches.
  function computeUsageValue(task) {
    return task.computeUsage != null ? Math.round(task.computeUsage * 10) / 10 : null;
  }

  // Sort on the raw compute usage so distinct values that round to the same
  // figure (e.g. 1.24 vs 1.25) still order correctly.
  function computeUsageCompare(left, right, direction) {
    const a = left.computeUsage;
    const b = right.computeUsage;
    if (a === b) {
      return 0;
    }
    if (a == null) {
      return direction;
    }
    if (b == null) {
      return -direction;
    }
    return (a - b) * direction;
  }

  const ALL_COLS = [
    { key: 'selection', label: '', required: true },
    { key: 'icon', label: '', required: true },
    {
      key: 'state',
      label: 'Status',
      required: true,
      sortable: true,
      filter: {
        kind: 'enum',
        options: ['PENDING', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
      },
      accessor: (task) => task.state,
    },
    {
      key: 'description',
      label: 'Name',
      required: true,
      sortable: true,
      filter: { kind: 'text' },
      accessor: (task) => task.description,
    },
    {
      key: 'id',
      label: 'ID',
      sortable: true,
      filter: { kind: 'text' },
      accessor: (task) => task.id,
    },
    {
      key: 'createTime',
      label: 'Created',
      sortable: true,
      filter: { kind: 'date' },
      accessor: (task) => task.createTime,
    },
    {
      key: 'startTime',
      label: 'Start',
      sortable: true,
      filter: { kind: 'date' },
      accessor: (task) => task.startTime,
    },
    {
      key: 'elapsed',
      label: 'Duration',
      sortable: true,
      filter: { kind: 'duration' },
      accessor: (task) => task.elapsedMs,
    },
    {
      key: 'attempt',
      label: 'Attempts',
      sortable: true,
      filter: { kind: 'number' },
      accessor: (task) => task.attempt,
    },
    {
      key: 'priority',
      label: 'Priority',
      sortable: true,
      filter: { kind: 'number' },
      accessor: (task) => task.priority,
    },
    {
      key: 'computeUsage',
      label: 'Compute Usage',
      sortable: true,
      filter: { kind: 'number' },
      accessor: computeUsageValue,
      compare: computeUsageCompare,
    },
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
  let selectedNames = $state(new Set());
  let isCancelling = $state(false);
  let allPageSelected = $derived(
    table.pageRows.length > 0 && table.pageRows.every((task) => selectedNames.has(task.name)),
  );
  let selectedCount = $derived(table.pageRows.filter((task) => selectedNames.has(task.name)).length);

  $effect(() => {
    const visibleNames = new Set(table.pageRows.map((task) => task.name));
    const remaining = [...selectedNames].filter((name) => visibleNames.has(name));
    if (remaining.length !== selectedNames.size) {
      selectedNames = new Set(remaining);
    }
  });

  // Only these states can still be cancelled server-side; anything else is already terminal.
  function isCancelable(task) {
    return task.state === 'RUNNING' || task.state === 'PENDING';
  }

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function saveState(preferences = table.exportPreferences()) {
    preferencesByFilter = { ...preferencesByFilter, [currentFilter]: preferences };
    vscode.postMessage({ type: 'savePrefs', tablePreferences: preferencesByFilter });
  }

  function syncRows() {
    const rows =
      currentFilter === 'export'
        ? allTasks.filter((task) => {
            const type = (task.type || '').toUpperCase();
            return type.startsWith('EXPORT') || type === '';
          })
        : allTasks.filter((task) => {
            const type = (task.type || '').toUpperCase();
            return type.startsWith('INGEST') || type.startsWith('IMPORT');
          });
    table.setRows(rows);
    const visibleNames = new Set(rows.map((task) => task.name));
    selectedNames = new Set([...selectedNames].filter((name) => visibleNames.has(name)));
  }

  function toggleSelection(name) {
    const next = new Set(selectedNames);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    selectedNames = next;
  }

  function togglePageSelection() {
    const next = new Set(selectedNames);
    for (const task of table.pageRows) {
      if (allPageSelected) {
        next.delete(task.name);
      } else {
        next.add(task.name);
      }
    }
    selectedNames = next;
  }

  function changeFilter(filter) {
    if (currentFilter === filter) {
      return;
    }
    preferencesByFilter = { ...preferencesByFilter, [currentFilter]: table.exportPreferences() };
    currentFilter = filter;
    selectedNames = new Set();
    table.applyPreferences(preferencesByFilter[currentFilter]);
    syncRows();
    saveState();
  }

  function cancelTask(name) {
    vscode.postMessage({ type: 'cancel', name });
  }

  function cancelSelected() {
    if (isCancelling) {
      return;
    }
    const names = table.pageRows
      .filter((task) => selectedNames.has(task.name) && isCancelable(task))
      .map((task) => task.name);
    const skipped = selectedCount - names.length;
    if (!names.length) {
      alert('None of the selected tasks can be cancelled.');
      return;
    }
    const suffix = skipped > 0 ? ` (${skipped} already finished or cancelling will be skipped)` : '';
    if (!confirm(`Cancel ${names.length} selected tasks?${suffix}`)) {
      return;
    }
    isCancelling = true;
    vscode.postMessage({ type: 'cancelBulk', names });
  }

  function previewAsset(assetName) {
    vscode.postMessage({ type: 'preview', assetName });
  }

  function refresh() {
    vscode.postMessage({ type: 'refresh' });
  }

  function formatTime(t) {
    if (!t) {
      return '';
    }
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
      selectedNames = new Set();
    } else if (msg.type === 'cancelled') {
      allTasks = allTasks.map((t) => (t.name === msg.name ? { ...t, state: 'CANCELLING' } : t));
      syncRows();
    } else if (msg.type === 'bulkCancelDone') {
      isCancelling = false;
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
  showToolbarEndSeparator={selectedCount > 0}
  loading={isLoading}
  rowKey={(task) => task.name}
  onpreferenceschange={saveState}
>
  {#snippet headerContent(column)}
    {#if column.key === 'selection'}
      <input
        type="checkbox"
        aria-label={allPageSelected ? 'Deselect all visible tasks' : 'Select all visible tasks'}
        title={allPageSelected ? 'Deselect all visible tasks' : 'Select all visible tasks'}
        checked={allPageSelected}
        indeterminate={!allPageSelected && selectedCount > 0}
        disabled={isCancelling || isLoading || table.pageRows.length === 0}
        onchange={togglePageSelection}
      />
    {/if}
  {/snippet}
  {#snippet toolbar()}
    <!-- Filter toggle -->
    <div class="toggle-switch">
      <input
        type="radio"
        id="filter-export"
        name="filter"
        checked={currentFilter === 'export'}
        onchange={() => changeFilter('export')}
      />
      <label for="filter-export">Export</label>
      <input
        type="radio"
        id="filter-import"
        name="filter"
        checked={currentFilter === 'import'}
        onchange={() => changeFilter('import')}
      />
      <label for="filter-import">Import</label>
      <span class="slider" style:left={currentFilter === 'export' ? '0' : '50%'} style:width="50%"
      ></span>
    </div>

    <!-- Refresh button -->
    <TableButton
      variant="primary"
      class="btn-primary"
      loading={isRefreshing}
      disabled={isRefreshing}
      onclick={refresh}
    >
      <i class="codicon codicon-sync refresh-icon" aria-hidden="true"></i>
      {isRefreshing ? 'Refreshing…' : 'Refresh'}
    </TableButton>

  {/snippet}

  {#snippet toolbarEnd()}
    {#if selectedCount > 0}
      <div class="bulk-actions">
        <span class="selection-count">{selectedCount} {selectedCount === 1 ? 'task' : 'tasks'} selected</span>
        <TableButton danger disabled={isCancelling} onclick={cancelSelected}>
          <i class="codicon codicon-stop-circle" aria-hidden="true"></i> Cancel
        </TableButton>
      </div>
    {/if}
  {/snippet}

  {#snippet row(t, columns)}
    {@const visible = new Set(columns.map((column) => column.key))}
    {#if visible.has('selection')}
      <td class="selection-cell">
        <input
          type="checkbox"
          aria-label={`Select ${t.description}`}
          checked={selectedNames.has(t.name)}
          disabled={isCancelling || isLoading}
          onchange={() => toggleSelection(t.name)}
        />
      </td>
    {/if}
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
    {#if visible.has('state')}<td data-value={t.state}><span class="status">{t.state}</span></td
      >{/if}
    {#if visible.has('description')}
      <td data-value={t.description}>
        {t.description}
        {#if t.error}<br /><span class="error-text">{t.error}</span>{/if}
      </td>
    {/if}
    {#if visible.has('id')}<td class="id-cell" data-value={t.id} title={t.id}>{t.id}</td>{/if}
    {#if visible.has('createTime')}<td data-value={t.createTime}>{formatTime(t.createTime)}</td
      >{/if}
    {#if visible.has('startTime')}<td data-value={t.startTime}>{formatTime(t.startTime)}</td>{/if}
    {#if visible.has('elapsed')}<td class="elapsed" data-value={t.elapsedMs}>{t.elapsed}</td>{/if}
    {#if visible.has('attempt')}<td style="text-align:center" data-value={t.attempt}
        >{t.attempt ?? ''}</td
      >{/if}
    {#if visible.has('priority')}<td style="text-align:center" data-value={t.priority}
        >{t.priority ?? ''}</td
      >{/if}
    {#if visible.has('computeUsage')}<td class="compute" data-value={computeUsageValue(t)}
        >{computeUsageValue(t) != null ? computeUsageValue(t).toFixed(1) + ' EECU·s' : ''}</td
      >{/if}
    {#if visible.has('actions')}
      {@const hasCancel = t.state === 'RUNNING' || t.state === 'PENDING'}
      {@const hasPreview = Boolean(t.previewAssetName)}
      <td class="actions-cell">
        {#if hasCancel || hasPreview}
          <span class="action-dots">
            <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
            {#if hasCancel && hasPreview}
              <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
            {/if}
          </span>
          <span class="action-btns">
            {#if hasCancel}
              <TableButton
                class="action-btn danger"
                variant="ghost"
                size="compact"
                danger
                title="Cancel task"
                aria-label="Cancel task"
                onclick={() => cancelTask(t.name)}
              >
                <i class="codicon codicon-stop-circle"></i>
              </TableButton>
            {/if}
            {#if hasPreview}
              <TableButton
                class="action-btn"
                variant="ghost"
                size="compact"
                title="Preview asset"
                aria-label="Preview asset"
                onclick={() => previewAsset(t.previewAssetName)}
              >
                <i class="codicon codicon-open-preview"></i>
              </TableButton>
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
      font-family: var(--vscee-font-family, sans-serif);
      color: var(--vscee-color-foreground);
      background: var(--vscee-color-editor-background);
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

    .bulk-actions {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-md);
    }
    .selection-count {
      white-space: nowrap;
      font-size: var(--vscee-font-sm);
    }

    /* ==================================================================
       FILTER TOGGLE
       ================================================================== */
    .toggle-switch {
      display: inline-flex;
      border-radius: var(--vscee-radius-md);
      overflow: hidden;
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
      position: relative;
      flex-shrink: 0;

      input {
        display: none;
        &:checked + label {
          color: var(--vscee-color-button-foreground);
        }
      }
      label {
        padding: var(--vscee-space-xs) var(--vscee-space-lg);
        font-size: var(--vscee-font-sm);
        cursor: pointer;
        position: relative;
        z-index: 1;
        color: var(--vscee-color-button-secondary-foreground);
        transition: color 0.15s;
        user-select: none;
      }
      .slider {
        position: absolute;
        top: 0;
        bottom: 0;
        border-radius: var(--vscee-radius-md);
        background: var(--vscee-color-button-background);
        transition:
          left 0.2s,
          width 0.2s;
      }
    }

    /* ==================================================================
       BUTTONS
       ================================================================== */
    select {
      background: var(--vscee-color-button-secondary-background);
      color: var(--vscee-color-button-secondary-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      border-radius: var(--vscee-radius-md);
      cursor: pointer;
      font-size: var(--vscee-font-sm);
    }
    /* ==================================================================
       TABLE CELLS
       ================================================================== */
    td {
      padding: var(--vscee-space-sm) var(--vscee-space-md);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    }
    .icon-col {
      width: 24px;
      padding: var(--vscee-space-xs) var(--vscee-space-xs);
      text-align: center;
    }
    .selection-cell {
      width: 32px;
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

      &.succeeded {
        background: var(--vscee-color-testing-passed);
      }
      &.failed {
        background: var(--vscee-color-testing-failed);
      }
      &.cancelled {
        background: var(--vscee-color-disabled);
      }
      &.pending {
        background: var(--vscee-color-chart-yellow);
      }
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
      .refresh-icon {
        animation: spin 0.8s linear infinite;
      }
    }
    .spinner {
      width: 10px;
      height: 10px;
      border: var(--vscee-border-md) solid var(--vscee-color-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      display: inline-block;
      animation: spin 1.5s linear infinite;
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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 22px;
    }
    .action-btns {
      display: none;
      align-items: center;
      height: 22px;
    }
    tr {
      &:hover {
        background: var(--vscee-color-list-hover);
      }
      &:hover,
      &:focus-within {
        .action-dots {
          display: none;
        }
        .action-btns {
          display: inline-flex;
        }
      }
    }
    .action-btn {
      box-sizing: border-box;
      width: 30px;
      padding: 0;
      opacity: 0.7;
      &:hover {
        opacity: 1;
      }
    }

    /* ==================================================================
       TABLE CELLS
       ================================================================== */
    .error-text {
      color: var(--vscee-color-error);
    }
    .elapsed {
      opacity: 0.7;
    }
    .id-cell {
      font-family: var(--vscee-editor-font-family, monospace);
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
