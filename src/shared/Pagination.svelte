<!-- Pagination: page buttons with ellipsis, prev/next, page size selector -->
<script>
  let { currentPage = $bindable(), totalPages, pageSize = $bindable(), onPageSizeChange } = $props();

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

  function handlePageSize(e) {
    pageSize = parseInt(e.target.value);
    currentPage = 0;
    onPageSizeChange?.();
  }
</script>

<!-- CONTROLS -->
<div class="pagination">
  <button class="page-nav" disabled={currentPage === 0} onclick={() => currentPage--}>◀</button>
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
  <button class="page-nav" disabled={currentPage >= totalPages - 1} onclick={() => currentPage++}>▶</button>
  <select class="page-size" value={pageSize} onchange={handlePageSize}>
    <option value={25}>25</option>
    <option value={50}>50</option>
    <option value={100}>100</option>
  </select>
</div>
