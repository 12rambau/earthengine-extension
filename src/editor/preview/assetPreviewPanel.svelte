<!-- AssetPreviewPanel: generic asset properties and sharing preview -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';
  import AssetSharingEditor from './AssetSharingEditor.svelte';

  const { title, assetType, updated, size, propertiesTable } = getInitData();
  let activeTab = $state('properties');
  let editing = $state(false);
  let saving = $state(false);
  let sharing = $state(null);
  let error = $state('');

  window.addEventListener('message', (event) => {
    if (event.data.type === 'sharingSaved') {
      editing = false;
      saving = false;
      sharing = null;
    } else if (event.data.type === 'sharingSaveError') {
      error = event.data.message;
      saving = false;
    }
  });
  vscode.postMessage({ type: 'ready' });

  function toggleEdit() {
    if (!editing) {
      editing = true;
    } else if (sharing) {
      saving = true;
      error = '';
      // $state proxies are not structured-cloneable, so postMessage would throw.
      vscode.postMessage({ type: 'saveSharing', sharing: $state.snapshot(sharing) });
    } else {
      editing = false;
    }
  }
</script>

<header><h1>{title}</h1><button type="button" aria-pressed={editing} disabled={saving} onclick={toggleEdit}>{saving ? 'Saving…' : 'Edit'}</button></header>
<span class="badge">{assetType}</span>
<div class="meta">
  <div class="meta-item"><strong>Last Updated</strong>{updated}</div>
  <div class="meta-item"><strong>Size</strong>{size}</div>
</div>
<nav class="tabs"><button class:active={activeTab === 'properties'} onclick={() => (activeTab = 'properties')}>PROPERTIES</button><button class:active={activeTab === 'sharing'} onclick={() => (activeTab = 'sharing')}>SHARING</button></nav>
<div hidden={activeTab !== 'properties'}>{@html propertiesTable}</div>
<div hidden={activeTab !== 'sharing'}><AssetSharingEditor {editing} {saving} bind:sharing /></div>
{#if error}<p role="alert">{error}</p>{/if}

<style>
  :global {
    body {
      font-family: var(--vscee-font-family, sans-serif);
      color: var(--vscee-color-foreground);
      background: var(--vscee-color-editor-background);
      padding: var(--vscee-space-xxl);
      line-height: 1.5;
    }
    h1 {
      font-size: var(--vscee-font-3xl);
      margin-bottom: var(--vscee-space-xs);
    }
    h2 {
      font-size: var(--vscee-font-lg);
      margin-top: var(--vscee-space-xxl);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
      padding-bottom: var(--vscee-space-xs);
    }
    header { display: flex; justify-content: space-between; align-items: center; gap: var(--vscee-space-lg); }
    header button, .tabs button {
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      color: var(--vscee-color-foreground);
      background: var(--vscee-color-button-secondary-background);
      border: none;
      cursor: pointer;
    }
    .tabs {
      display: flex;
      gap: var(--vscee-space-lg);
      margin-top: var(--vscee-space-xl);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    }
    .tabs button { background: none; }
    .tabs button.active { border-bottom: var(--vscee-border-md) solid var(--vscee-color-focus); }
    p[role="alert"] { color: var(--vscee-color-error); }
    .badge {
      display: inline-block;
      background: var(--vscee-color-badge-background);
      color: var(--vscee-color-badge-foreground);
      padding: var(--vscee-space-xxs) var(--vscee-space-md);
      border-radius: var(--vscee-radius-xl);
      font-size: var(--vscee-font-xs);
      margin-right: var(--vscee-space-xs);
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--vscee-space-md);
      margin: var(--vscee-space-lg) 0;
    }
    .meta-item {
      strong {
        display: block;
        font-size: var(--vscee-font-xs);
        opacity: 0.7;
      }
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--vscee-font-md);
      margin: var(--vscee-space-md) 0;
    }
    th {
      text-align: left;
      background: var(--vscee-color-list-hover);
      padding: var(--vscee-space-sm) var(--vscee-space-md);
    }
    td {
      padding: var(--vscee-space-sm) var(--vscee-space-md);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    }
    code {
      background: var(--vscee-color-code-background);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
      border-radius: var(--vscee-radius-md);
      font-size: var(--vscee-font-md);
    }
    .props-table {
      td:first-child {
        font-weight: 600;
        width: 30%;
      }
    }
    a {
      color: var(--vscee-color-link);
    }
  }
</style>
