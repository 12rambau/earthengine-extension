<!-- Pagination: page buttons with ellipsis, prev/next, page size selector -->
<script>
  let { currentPage = $bindable(), totalPages, pageSize = $bindable(), onPageSizeChange } = $props();

  let openSize = $state(false);
  let sizeWrap = $state(null);

  const PAGE_SIZES = [25, 50, 100];

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------
  // Builds a sparse page list: always includes first, last, and neighbours of current.
  function pages() {
    if (totalPages <= 1) return [];
    const shown = new Set([0, totalPages - 1]);
    for (let i = Math.max(0, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      shown.add(i);
    }
    const sorted = [...shown].sort((a, b) => a - b);
    const result = [];
    let prev = -1;
    for (const p of sorted) {
      if (prev !== -1 && p > prev + 1) result.push({ type: 'ellipsis' });
      result.push({ type: 'page', value: p });
      prev = p;
    }
    return result;
  }

  function setPageSize(size) {
    pageSize = size;
    currentPage = 0;
    openSize = false;
    onPageSizeChange?.();
  }
</script>

<svelte:document onclick={(e) => { if (!sizeWrap?.contains(e.target)) openSize = false; }} />

<!-- CONTROLS -->
<div class="pagination">
  <button class="page-nav" disabled={currentPage === 0} onclick={() => currentPage--}><i class="codicon codicon-triangle-left"></i></button>
  <span class="page-nums">
    {#each pages() as item}
      {#if item.type === 'ellipsis'}
        <span class="page-ellipsis">…</span>
      {:else}
        <button
          class="page-btn"
          class:active={item.value === currentPage}
          onclick={() => currentPage = item.value}
        >
          {item.value + 1}
        </button>
      {/if}
    {/each}
  </span>
  <button class="page-nav" disabled={currentPage >= totalPages - 1} onclick={() => currentPage++}><i class="codicon codicon-triangle-right"></i></button>

  <div class="size-wrap" bind:this={sizeWrap}>
    <button
      class="size-trigger"
      class:open={openSize}
      onclick={(e) => { e.stopPropagation(); openSize = !openSize; }}
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
  .size-wrap {
    position: relative;
  }

  .size-trigger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    font-family: var(--vscode-font-family, sans-serif);
    line-height: 1;
    white-space: nowrap;
  }

  .size-trigger:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .size-trigger.open {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: transparent;
  }

  .size-chevron {
    opacity: 0.7;
    transition: transform 0.15s;
  }

  .size-chevron.open {
    transform: rotate(180deg);
  }

  .size-menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 4px);
    z-index: 20;
    min-width: 80px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 4px;
    padding: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .size-item {
    display: block;
    width: 100%;
    padding: 6px 10px;
    border-radius: 3px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85em;
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground);
    text-align: left;
    white-space: nowrap;
  }

  .size-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .size-item.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
</style>
