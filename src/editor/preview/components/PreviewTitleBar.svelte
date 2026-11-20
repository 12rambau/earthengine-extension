<!-- PreviewTitleBar: editable asset title and shared save action -->
<script>
  import { vscode } from '../../../shared/vscode.ts';

  let { title, suffix = '', editing = $bindable(), activeTab = $bindable(), name = $bindable(), saving } = $props();
  let reloading = $state(false);

  window.addEventListener('message', (event) => {
    if (event.data.type === 'refreshFailed') {
      reloading = false;
    }
  });

  function toggleEdit() {
    activeTab = 'description';
    if (editing) {
      document.getElementById('asset-metadata-form')?.requestSubmit();
    } else {
      editing = true;
    }
  }

  function reload() {
    if (editing || saving || reloading) {
      return;
    }
    reloading = true;
    vscode.postMessage({ type: 'refresh' });
  }
</script>

<header class="title-bar">
  <h1>Asset details: {title.slice(0, title.lastIndexOf('/') + 1)}{#if editing}<input aria-label="Asset name" required pattern="[A-Za-z0-9_-]+" bind:value={name} disabled={saving} />{:else}{title.split('/').pop()}{/if}{suffix}</h1>
  <div class="title-actions">
    <button class="reload-button" type="button" disabled={editing || saving || reloading} onclick={reload}>Reload</button>
    <button class="edit-button" class:active={editing} aria-pressed={editing} type="button" disabled={saving || reloading} onclick={toggleEdit}>{saving ? 'Saving…' : 'Edit'}</button>
  </div>
</header>

<style>
  .title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--vscee-space-lg);
    padding: var(--vscee-space-lg) var(--vscee-space-xxl);
    border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);

    .title-actions {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      flex: none;
    }

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
    .reload-button,
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
      &:disabled { opacity: 0.5; cursor: default; }
      &.active {
        color: var(--vscee-color-button-foreground);
        background: var(--vscee-color-button-background);
        border-color: transparent;
      }
    }
  }
</style>