<!-- Pagination: page navigation and page-size selector for shared data tables -->
<script>
  import TableButton from './TableButton.svelte';

  let { currentPage, totalPages, pageSize, onpagechange, onpagesizechange } = $props();

  let openSize = $state(false);
  let sizeWrap = $state(null);

  const PAGE_SIZES = [25, 50, 100];

  function pages() {
    if (totalPages <= 1) {
      return [];
    }
    const shown = new Set([0, totalPages - 1]);
    for (
      let page = Math.max(0, currentPage - 1);
      page <= Math.min(totalPages - 1, currentPage + 1);
      page++
    ) {
      shown.add(page);
    }
    const sorted = [...shown].sort((left, right) => left - right);
    const result = [];
    let previous = -1;
    for (const page of sorted) {
      if (previous !== -1 && page > previous + 1) {
        result.push({ type: 'ellipsis' });
      }
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

<svelte:document
  onclick={(event) => {
    if (!sizeWrap?.contains(event.target)) {
      openSize = false;
    }
  }}
/>

<div class="pagination">
  <TableButton
    variant="page"
    aria-label="Previous page"
    title="Previous page"
    disabled={currentPage === 0}
    onclick={() => onpagechange?.(currentPage - 1)}
    ><i class="codicon codicon-triangle-left"></i></TableButton
  >
  <span class="page-nums">
    {#each pages() as item}
      {#if item.type === 'ellipsis'}
        <span class="page-ellipsis">...</span>
      {:else}
        <TableButton
          variant="page"
          active={item.value === currentPage}
          onclick={() => onpagechange?.(item.value)}
        >
          {item.value + 1}
        </TableButton>
      {/if}
    {/each}
  </span>
  <TableButton
    variant="page"
    aria-label="Next page"
    title="Next page"
    disabled={currentPage >= totalPages - 1}
    onclick={() => onpagechange?.(currentPage + 1)}
    ><i class="codicon codicon-triangle-right"></i></TableButton
  >

  <div class="size-wrap" bind:this={sizeWrap}>
    <TableButton
      active={openSize}
      onclick={(event) => {
        event.stopPropagation();
        openSize = !openSize;
      }}
    >
      {pageSize} / page
      <i class="codicon codicon-chevron-down size-chevron" class:open={openSize}></i>
    </TableButton>
    {#if openSize}
      <div class="size-menu">
        {#each PAGE_SIZES as size}
          <TableButton
            variant="menu"
            active={size === pageSize}
            onclick={() => setPageSize(size)}
          >
            {size}
          </TableButton>
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

  .page-ellipsis {
    padding: 0 var(--vscee-space-xs);
    opacity: 0.5;
    font-size: var(--vscee-font-sm);
    user-select: none;
  }

  .size-chevron {
    opacity: 0.7;
    transition: transform 0.15s;

    &.open {
      transform: rotate(180deg);
    }
  }

  .size-menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 4px);
    z-index: 20;
    min-width: 80px;
    background: var(--vscee-color-editor-widget-background);
    border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    border-radius: var(--vscee-radius-md);
    padding: var(--vscee-space-xs);
    box-shadow: 0 2px 8px var(--vscee-color-widget-shadow);
  }

</style>
