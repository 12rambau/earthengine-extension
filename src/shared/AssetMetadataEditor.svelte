<!-- AssetMetadataEditor: edit asset name, UTC dates and Markdown description -->
<script>
  import { vscode } from './vscode.ts';
  import dayjs from 'dayjs';
  import utc from 'dayjs/plugin/utc.js';
  dayjs.extend(utc);

  let { metadata = $bindable(), editing = $bindable() } = $props();
  let name = $state('');
  let startTime = $state('');
  let endTime = $state('');
  let description = $state('');
  let saving = $state(false);
  let error = $state('');

  $effect(() => {
    if (editing) {
      name = metadata.name;
      startTime = metadata.startTime ? dayjs.utc(metadata.startTime).format('YYYY-MM-DDTHH:mm:ss') : '';
      endTime = metadata.endTime ? dayjs.utc(metadata.endTime).format('YYYY-MM-DDTHH:mm:ss') : '';
      description = metadata.description;
      error = '';
    }
  });

  window.addEventListener('message', (event) => {
    if (event.data.type === 'metadataSaved') {
      metadata = event.data.metadata;
      saving = false;
      editing = false;
    } else if (event.data.type === 'metadataError') {
      error = event.data.message;
      saving = false;
    }
  });

  function save(event) {
    event.preventDefault();
    if (saving) {
      return;
    }
    saving = true;
    error = '';
    vscode.postMessage({
      type: 'saveMetadata',
      name,
      startTime: startTime ? `${startTime}Z` : '',
      endTime: endTime ? `${endTime}Z` : '',
      description,
    });
  }
</script>

{#if editing}
  <form onsubmit={save}>
    <label>Asset name <input required pattern="[A-Za-z0-9_-]+" bind:value={name} /></label>
    <label>Start time (UTC) <input type="datetime-local" step="1" bind:value={startTime} /></label>
    <label>End time (UTC) <input type="datetime-local" step="1" bind:value={endTime} /></label>
    <label>Description (Markdown) <textarea rows="16" bind:value={description}></textarea></label>
    {#if error}<p role="alert">{error}</p>{/if}
    <div class="buttons">
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      <button type="button" disabled={saving} onclick={() => (editing = false)}>Cancel</button>
    </div>
  </form>
{:else}
  {@html metadata.descriptionHtml}
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-lg);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-xs);
  }
  input, textarea {
    font: inherit;
    color: var(--vscee-color-foreground);
    background: var(--vscee-color-editor-background);
    border: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    padding: var(--vscee-space-sm);
  }
  textarea {
    resize: vertical;
    font-family: var(--vscee-editor-font-family);
  }
  .buttons {
    display: flex;
    gap: var(--vscee-space-sm);
  }
  button {
    padding: var(--vscee-space-sm) var(--vscee-space-lg);
    color: var(--vscee-color-foreground);
    background: var(--vscee-color-list-hover);
    border: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    cursor: pointer;
  }
  p {
    color: var(--vscee-color-error);
  }
</style>
