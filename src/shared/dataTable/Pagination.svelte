<!-- Pagination: page navigation and page-size selector for shared data tables -->
<script>
  let { currentPage, totalPages, pageSize, onpagechange, onpagesizechange } = $props();

  let openSize = $state(false);
  let sizeWrap = $state(null);

  const PAGE_SIZES = [25, 50, 100];

  function pages() {
    if (totalPages <= 1) {return [];}
    const shown = new Set([0, totalPages - 1]);
    for (let page = Math.max(0, currentPage - 1); page <= Math.min(totalPages - 1, currentPage + 1); page++) {
      shown.add(page);
    }
    const sorted = [...shown].sort((left, right) => left - right);
    const result = [];
    let previous = -1;
    for (const page of sorted) {
      if (previous !== -1 && page > previous + 1) {result.push({ type: 'ellipsis' });}
      result.push({ type: 'page', value: page });
      previous = page;
    }
    return result;
  }

  function setPageSize(size) {
    openSize = false;
    onpagesizechange?.(size);
  }
</script>

<svelte:document onclick={(event) => { if (!sizeWrap?.contains(event.target)) {openSize = false;} }} />

<div class="pagination">
  <button class="page-nav" aria-label="Previous page" title="Previous page" disabled={currentPage === 0} onclick={() => onpagechange?.(currentPage - 1)}><i class="codicon codicon-triangle-left"></i></button>
  <span class="page-nums">
    {#each pages() as item}
      {#if item.type === 'ellipsis'}
        <span class="page-ellipsis">...</span>
      {:else}
        <button
          class="page-btn"
          class:active={item.value === currentPage}
          onclick={() => onpagechange?.(item.value)}
        >
          {item.value + 1}
        </button>
      {/if}
    {/each}
  </span>
  <button class="page-nav" aria-label="Next page" title="Next page" disabled={currentPage >= totalPages - 1} onclick={() => onpagechange?.(currentPage + 1)}><i class="codicon codicon-triangle-right"></i></button>

  <div class="size-wrap" bind:this={sizeWrap}>
    <button
      class="size-trigger"
      class:open={openSize}
      onclick={(event) => { event.stopPropagation(); openSize = !openSize; }}
    >
      {pageSize} / page
      <i class="codicon codicon-chevron-down size-chevron" class:open={openSize}></i>
    </button>
    {#if openSize}
      <div class="size-menu">
        {#each PAGE_SIZES as size}
          <button class="size-item" class:active={size === pageSize} onclick={() => setPageSize(size)}>
            {size}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ==================================================================
     PAGINATION
     ================================================================== */
  .pagination,
  .page-nums {
    display: inline-flex;
    align-items: center;
    gap: var(--vscee-space-xxs);
  }

  .size-wrap {
    position: relative;
    margin-left: var(--vscee-space-sm);
  }

  button {
    border: var(--vscee-border-sm) solid transparent;
    cursor: pointer;
    font-family: var(--vscode-font-family);

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  .page-nav,
  .page-btn {
    min-width: 28px;
    height: 28px;
    padding: 0 var(--vscee-space-xs);
    color: var(--vscode-foreground);
    background: transparent;
    border-radius: var(--vscee-radius-md);

    &:not(:disabled):hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-input-border);
    }
  }

  .page-btn {
    font-size: var(--vscee-font-xs);

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

  .size-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--vscee-space-sm);
    padding: var(--vscee-space-xs) var(--vscee-space-md);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: var(--vscee-border-sm) solid var(--vscode-input-border);
    border-radius: var(--vscee-radius-md);
    font-size: var(--vscee-font-sm);
    line-height: 1;
    white-space: nowrap;

    &:hover { background: var(--vscode-button-secondaryHoverBackground); }
    &.open {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;
    }
  }

  .size-chevron {
    opacity: 0.7;
    transition: transform 0.15s;

    &.open { transform: rotate(180deg); }
  }

  .size-menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 4px);
    z-index: 20;
    min-width: 80px;
    background: var(--vscode-editorWidget-background);
    border: var(--vscee-border-sm) solid var(--vscode-widget-border);
    border-radius: var(--vscee-radius-md);
    padding: var(--vscee-space-xs);
    box-shadow: 0 2px 8px var(--vscode-widget-shadow);
  }

  .size-item {
    display: block;
    width: 100%;
    padding: var(--vscee-space-sm) var(--vscee-space-lg);
    border-radius: var(--vscee-radius-md);
    background: transparent;
    color: var(--vscode-foreground);
    font-size: var(--vscee-font-sm);
    text-align: left;
    white-space: nowrap;

    &:hover { background: var(--vscode-list-hoverBackground); }
    &.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
  }
</style>