<!-- DataTable: shared table shell with sortable headers, filters, columns, and pagination -->
<script>
  import ColumnFilter from './ColumnFilter.svelte';
  import ColumnPicker from './ColumnPicker.svelte';
  import Pagination from './Pagination.svelte';

  let {
    table,
    itemLabel = 'items',
    loading = false,
    rowKey,
    rowClass = () => '',
    toolbar,
    row,
    onpreferenceschange,
  } = $props();

  let openFilterKey = $state(null);

  function savePreferences() {
    onpreferenceschange?.(table.exportPreferences());
  }

  function setVisibleCols(columns) {
    table.setVisibleCols(columns);
    savePreferences();
  }

  function setFilter(key, filter) {
    table.setFilter(key, filter);
    savePreferences();
  }

  function setFilterOpen(key, open) {
    openFilterKey = open ? key : null;
  }

  function toggleSort(key) {
    table.toggleSort(key);
    savePreferences();
  }

  function sortIcon(column) {
    if (table.sort?.column !== column.key) {
      return 'codicon-arrow-swap sort-neutral';
    }
    return table.sort.direction === 1 ? 'codicon-arrow-up' : 'codicon-arrow-down';
  }

  function clearFilters() {
    table.clearFilters();
    savePreferences();
  }

  function setPageSize(pageSize) {
    table.setPageSize(pageSize);
    savePreferences();
  }

  const firstFilterColumnKey = $derived(table.visibleColumns.find(column => column.filter)?.key);
</script>

<div class="topbar">
  <div class="topbar-left">
    {#if toolbar}{@render toolbar()}{/if}
  </div>
  <div class="topbar-right">
    {#if table.activeFilterCount > 0}
      <button class="reset-filters" title="Clear all active filters" onclick={clearFilters}>
        <i class="codicon codicon-clear-all"></i>
        Clear filters ({table.activeFilterCount})
      </button>
    {/if}
    <ColumnPicker columns={table.columns} visibleCols={table.visibleCols} onchange={setVisibleCols} />
  </div>
</div>

<div class="table-wrap" class:loading={loading && table.sortedRows.length === 0}>
  <table>
    <thead>
      <tr>
        {#each table.visibleColumns as column}
          <th class:sorted={table.sort?.column === column.key}>
            <span class="header-content">
              <span class="header-label">{column.label}</span>
              <span class="header-actions">
                {#if column.sortable}
                  <button
                    class="header-action"
                    class:active={table.sort?.column === column.key}
                    aria-label={`Sort ${column.label}`}
                    title={`Sort ${column.label}`}
                    onclick={() => toggleSort(column.key)}
                  >
                    <i class={`codicon ${sortIcon(column)}`}></i>
                  </button>
                {/if}
                {#if column.filter}
                  <ColumnFilter
                    {column}
                    filter={table.filters[column.key]}
                    open={openFilterKey === column.key}
                    align={column.key === firstFilterColumnKey ? 'start' : 'end'}
                    onopenchange={(open) => setFilterOpen(column.key, open)}
                    onchange={(filter) => setFilter(column.key, filter)}
                  />
                {/if}
              </span>
            </span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each table.pageRows as item (rowKey(item))}
        <tr class={rowClass(item)}>{@render row(item, table.visibleColumns)}</tr>
      {:else}
        <tr><td class="empty-cell" colspan={Math.max(table.visibleColumns.length, 1)}>{loading ? 'Loading...' : `No ${itemLabel} found`}</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="footer">
  <span class="page-info">{table.rangeText.replace('items', itemLabel)}{#if loading} <span class="spinner-inline"></span>{/if}</span>
  <Pagination
    currentPage={table.currentPage}
    totalPages={table.page.totalPages}
    pageSize={table.pageSize}
    onpagechange={(page) => table.currentPage = page}
    onpagesizechange={setPageSize}
  />
</div>

<style>
  /* ==================================================================
     TABLE TOOLBAR
     ================================================================== */
  .topbar,
  .topbar-left,
  .topbar-right,
  .footer {
    display: flex;
    align-items: center;
  }

  .topbar,
  .footer {
    justify-content: space-between;
    gap: var(--vscee-space-md);
    flex-shrink: 0;
  }

  .topbar {
    margin-bottom: var(--vscee-space-sm);
  }

  .topbar-left,
  .topbar-right {
    gap: var(--vscee-space-md);
    min-width: 0;
  }

  .topbar-right { margin-left: auto; }

  .reset-filters {
    display: inline-flex;
    align-items: center;
    gap: var(--vscee-space-sm);
    padding: var(--vscee-space-xs) var(--vscee-space-md);
    background: transparent;
    color: var(--vscode-textLink-foreground);
    border: var(--vscee-border-sm) solid var(--vscode-input-border);
    border-radius: var(--vscee-radius-md);
    cursor: pointer;
    font: inherit;
    font-size: var(--vscee-font-sm);

    &:hover { background: var(--vscode-list-hoverBackground); }
  }

  /* ==================================================================
     TABLE
     ================================================================== */
  .table-wrap {
    flex: 1 1 0;
    min-height: 120px;
    overflow: auto;
    border: var(--vscee-border-sm) solid var(--vscode-panel-border);
    border-radius: var(--vscee-radius-md);

    &.loading {
      opacity: 0.45;
      pointer-events: none;
      transition: opacity 0.15s;
    }
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--vscee-font-sm);
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: var(--vscee-space-sm) var(--vscee-space-md);
    text-align: left;
    background: var(--vscode-editor-background);
    border-bottom: var(--vscee-border-md) solid var(--vscode-panel-border);
    white-space: nowrap;

  }

  .header-content,
  .header-actions {
    display: inline-flex;
    align-items: center;
  }

  .header-content {
    gap: var(--vscee-space-xs);
  }

  .header-actions {
    gap: var(--vscee-space-xxs);
  }

  .header-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    color: var(--vscode-foreground);
    border: none;
    border-radius: var(--vscee-radius-sm);
    cursor: pointer;
    font: inherit;
    font-size: var(--vscee-font-xs);
    opacity: 0.55;

    &:hover,
    &.active {
      background: var(--vscode-list-hoverBackground);
      opacity: 1;
    }
    &.active { color: var(--vscode-button-background); }
  }

  .sort-neutral {
    transform: rotate(90deg);
  }

  .empty-cell {
    padding: var(--vscee-space-xl);
    color: var(--vscode-descriptionForeground);
    text-align: center;
  }

  /* ==================================================================
     FOOTER
     ================================================================== */
  .footer {
    padding-top: var(--vscee-space-sm);
    flex-wrap: wrap;
  }

  .page-info {
    color: var(--vscode-descriptionForeground);
    font-size: var(--vscee-font-sm);
  }

  .spinner-inline {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-left: var(--vscee-space-sm);
    border: var(--vscee-border-md) solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    opacity: 0.6;
    vertical-align: middle;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>