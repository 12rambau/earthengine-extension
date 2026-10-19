<!-- PreviewTabs: asset preview navigation with a selectable active tab -->
<script>
  let { tabs, activeTab, onselect } = $props();

  function handleKeydown(event) {
    if (event.target.getAttribute('role') !== 'tab') return;

    const index = tabs.findIndex((tab) => `tab-${tab.id}` === event.target.id);
    let nextIndex;
    switch (event.key) {
      case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break;
      case 'ArrowLeft': nextIndex = (index - 1 + tabs.length) % tabs.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    onselect(tabs[nextIndex].id);
    event.currentTarget.querySelectorAll('[role="tab"]')[nextIndex].focus();
  }
</script>

<div class="tabs" role="tablist" tabindex="-1" onkeydown={handleKeydown}>
  {#each tabs as tab}
    <button class="tab" class:active={activeTab === tab.id} id="tab-{tab.id}"
      role="tab" aria-selected={activeTab === tab.id} aria-controls="panel-{tab.id}"
      tabindex={activeTab === tab.id ? 0 : -1} onclick={() => onselect(tab.id)}>
      {tab.label}
    </button>
  {/each}
</div>

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