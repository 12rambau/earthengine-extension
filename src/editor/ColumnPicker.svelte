<!-- ColumnPicker: toggleable dropdown for column visibility -->
<script>
  let { columns, visibleCols = $bindable(), onchange } = $props();

  let open = $state(false);
  let wrap = $state(null);

  const opts = $derived(columns.filter(c => c.label));

  function toggle(key) {
    if (visibleCols.has(key)) {
      visibleCols.delete(key);
    } else {
      visibleCols.add(key);
    }
    visibleCols = new Set(visibleCols);
    onchange?.();
  }
</script>

<svelte:document onclick={(e) => { if (!wrap?.contains(e.target)) open = false; }} />

<div class="wrap" bind:this={wrap}>
  <button
    class="trigger"
    class:open
    onclick={(e) => { e.stopPropagation(); open = !open; }}
  >
    <i class="codicon codicon-list-filter"></i>
    Columns
    <i class="codicon codicon-chevron-down chevron" class:open></i>
  </button>

  {#if open}
    <div class="menu">
      {#each opts as col}
        <label class="item" class:dimmed={col.required}>
          <input
            class="check"
            type="checkbox"
            checked={visibleCols.has(col.key)}
            disabled={col.required}
            onchange={() => toggle(col.key)}
          />
          {col.label}
        </label>
      {/each}
    </div>
  {/if}
</div>

<style>
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
    font-family: var(--vscode-font-family, sans-serif);
    line-height: 1;
    white-space: nowrap;
  }

  .trigger:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .trigger.open {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: transparent;
  }

  .chevron {
    opacity: 0.7;
    transition: transform 0.15s;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    min-width: 160px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: var(--vscee-border-sm) solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: var(--vscee-radius-md);
    padding: var(--vscee-space-xs);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--vscee-space-md);
    padding: var(--vscee-space-sm) var(--vscee-space-lg);
    border-radius: var(--vscee-radius-md);
    cursor: pointer;
    font-size: var(--vscee-font-sm);
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground);
    white-space: nowrap;
    user-select: none;
  }

  .item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .item.dimmed {
    opacity: 0.45;
    cursor: default;
  }

  .check {
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--vscode-button-background);
    flex-shrink: 0;
  }

  .dimmed .check {
    cursor: default;
  }
</style>
