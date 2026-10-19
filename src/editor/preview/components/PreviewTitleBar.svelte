<!-- PreviewTitleBar: editable asset title and shared save action -->
<script>
  let { title, suffix = '', editing = $bindable(), activeTab = $bindable(), name = $bindable(), saving } = $props();

  function toggleEdit() {
    activeTab = 'description';
    if (editing) {
      document.getElementById('asset-metadata-form')?.requestSubmit();
    } else {
      editing = true;
    }
  }
</script>

<header class="title-bar">
  <h1>Asset details: {title.slice(0, title.lastIndexOf('/') + 1)}{#if editing}<input aria-label="Asset name" required pattern="[A-Za-z0-9_-]+" bind:value={name} disabled={saving} />{:else}{title.split('/').pop()}{/if}{suffix}</h1>
  <button class="edit-button" class:active={editing} aria-pressed={editing} type="button" disabled={saving} onclick={toggleEdit}>{saving ? 'Saving…' : 'Edit'}</button>
</header>

<style>
  .title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--vscee-space-lg);
    padding: var(--vscee-space-lg) var(--vscee-space-xxl);
    border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);

    h1 {
      font-size: var(--vscee-font-xl);
      font-weight: 500;
      min-width: 0;
      overflow-wrap: anywhere;

      input {
        width: min(22ch, 100%);
        font: inherit;
        padding: 0 var(--vscee-space-xs);
        color: var(--vscee-color-foreground);
        background: var(--vscee-color-input-background);
        border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
        border-radius: var(--vscee-radius-md);
      }
    }
    .edit-button {
      display: inline-flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      flex: none;
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      color: var(--vscee-color-button-secondary-foreground);
      background: var(--vscee-color-button-secondary-background);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
      border-radius: var(--vscee-radius-md);
      font-size: var(--vscee-font-sm);
      line-height: 1;
      cursor: pointer;

      &:hover { background: var(--vscee-color-button-secondary-hover); }
      &.active {
        color: var(--vscee-color-button-foreground);
        background: var(--vscee-color-button-background);
        border-color: transparent;
      }
      &:disabled { opacity: 0.5; cursor: default; }
    }
  }
</style>