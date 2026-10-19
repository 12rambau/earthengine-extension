<!-- PreviewTable: common table presentation for preview data, including injected HTML -->
<script>
  let { children, keyColumn = false } = $props();
</script>

<div class="preview-table" class:key-column={keyColumn}>
  {@render children()}
</div>

<style>
  .preview-table {
    max-height: 100%;
    overflow: auto;

    :global(table) {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--vscee-font-sm);
    }
    :global(th) {
      text-align: left;
      background: var(--vscee-color-editor-background);
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1;
      white-space: nowrap;
    }
    :global(td) {
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    }
    :global(tbody tr:hover) {
      background: var(--vscee-color-list-hover);
    }
    &.key-column :global(td:first-child) {
      font-weight: 500;
      width: 30%;
    }
  }
</style>