<!-- ColumnPicker: toggleable dropdown for shared table column visibility -->
<script>
  let { columns, visibleCols, onchange } = $props();

  let open = $state(false);
  let wrap = $state(null);

  const options = $derived(columns.filter(column => column.label));

  function toggle(key) {
    const next = new Set(visibleCols);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onchange?.(next);
  }
</script>

<svelte:document onclick={(event) => { if (!wrap?.contains(event.target)) {open = false;} }} />

<div class="wrap" bind:this={wrap}>
  <button
    class="trigger"
    class:open
    title="Choose visible columns"
    onclick={(event) => { event.stopPropagation(); open = !open; }}
  >
    <i class="codicon codicon-list-filter"></i>
    Columns
    <i class="codicon codicon-chevron-down chevron" class:open></i>
  </button>

  {#if open}
    <div class="menu">
      {#each options as column}
        <label class="item" class:dimmed={column.required}>
          <input
            class="check"
            type="checkbox"
            checked={visibleCols.has(column.key)}
            disabled={column.required}
            onchange={() => toggle(column.key)}
          />
          {column.label}
        </label>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* ==================================================================
     COLUMN PICKER
     ================================================================== */
  .wrap {
    position: relative;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--vscee-space-sm);
    padding: var(--vscee-space-xs) var(--vscee-space-md);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: var(--vscee-border-sm) solid var(--vscode-input-border);
    border-radius: var(--vscee-radius-md);
    cursor: pointer;
    font-size: var(--vscee-font-sm);
    font-family: var(--vscode-font-family);
    line-height: 1;
    white-space: nowrap;

    &:hover { background: var(--vscode-button-secondaryHoverBackground); }
    &.open {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;
    }
  }

  .chevron {
    opacity: 0.7;
    transition: transform 0.15s;

    &.open { transform: rotate(180deg); }
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    min-width: 160px;
    background: var(--vscode-editorWidget-background);
    border: var(--vscee-border-sm) solid var(--vscode-widget-border);
    border-radius: var(--vscee-radius-md);
    padding: var(--vscee-space-xs);
    box-shadow: 0 2px 8px var(--vscode-widget-shadow);
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--vscee-space-md);
    padding: var(--vscee-space-sm) var(--vscee-space-lg);
    border-radius: var(--vscee-radius-md);
    cursor: pointer;
    font-size: var(--vscee-font-sm);
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    white-space: nowrap;
    user-select: none;

    &:hover { background: var(--vscode-list-hoverBackground); }
    &.dimmed {
      opacity: 0.45;
      cursor: default;

      .check { cursor: default; }
    }
  }

  .check {
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--vscode-button-background);
    flex-shrink: 0;
  }
</style>