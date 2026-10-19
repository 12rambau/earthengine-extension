<!-- PreviewFrame: shared sidebar and content layout for asset previews -->
<script>
  let { sidebar, children } = $props();
</script>

<div class="layout">
  <aside class="sidebar">{@render sidebar()}</aside>
  <main class="content">{@render children()}</main>
</div>

<style>
  .layout {
    display: flex;
    height: calc(100vh - 52px);
  }
  .sidebar {
    width: 280px;
    min-width: 280px;
    border-right: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    padding: var(--vscee-space-xl);
    overflow-y: auto;
  }
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>