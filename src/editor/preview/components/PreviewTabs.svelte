<!-- PreviewTabs: asset preview navigation with a selectable active tab -->
<script>
  let { tabs, activeTab, onselect } = $props();
</script>

<nav class="tabs">
  {#each tabs as tab}
    <button class="tab" class:active={activeTab === tab.id} onclick={() => onselect(tab.id)}>
      {tab.label}
    </button>
  {/each}
</nav>

<style>
  .tabs {
    display: flex;
    border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    padding: 0 var(--vscee-space-xl);
  }
  .tab {
    background: none;
    border: none;
    color: var(--vscee-color-foreground);
    padding: var(--vscee-space-lg) var(--vscee-space-xl);
    cursor: pointer;
    font-size: var(--vscee-font-sm);
    font-weight: 500;
    opacity: 0.7;
    border-bottom: var(--vscee-border-md) solid transparent;
    transition:
      opacity 0.15s,
      border-color 0.15s;

    &:hover {
      opacity: 1;
    }
    &.active {
      opacity: 1;
      border-bottom-color: var(--vscee-color-focus);
    }
  }
</style>