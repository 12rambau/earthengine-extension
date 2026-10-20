<!-- CollectionDialog: create an empty collection or ingest local COG, Zarr or VRT images -->
<script>
  import DatePicker from '../components/DatePicker.svelte';
  import TableButton from '../components/TableButton.svelte';

  let {
    parent,
    buckets = [],
    defaultBucket = '',
    selection = null,
    loadingSource = false,
    busy = false,
    progress = '',
    error = '',
    onpick,
    onclear,
    onsubmit,
    oncancel,
  } = $props();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let assetName = $state('');
  let bandNames = $state([]);
  let pyramidingPolicy = $state('MEAN');
  let description = $state('');
  let startTime = $state('');
  let endTime = $state('');
  let properties = $state([]);
  let bucket = $state('');
  let backdropMouseDown = $state(false);
  let lastSelection = $state(null);

  const PYRAMIDING = ['MEAN', 'MODE', 'SAMPLE', 'MIN', 'MAX'];

  // ----------------------------------------------------------------
  // DERIVED
  // ----------------------------------------------------------------
  let assetId = $derived(`${parent}/${assetName.trim()}`);
  let source = $derived(selection?.source ?? 'empty');
  let canSubmit = $derived(
    !busy && !loadingSource &&
      /^[A-Za-z0-9_-]+$/.test(assetName.trim()) &&
      (source === 'empty' ||
        (!!bucket.trim() && bandNames.length === selection.bandCount &&
          bandNames.every((name) => !!name.trim()))),
  );

  $effect(() => {
    if (selection && selection !== lastSelection) {
      lastSelection = selection;
      if (!assetName) {
        assetName = selection.path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_');
      }
      bandNames = Array.from({ length: selection.bandCount }, (_, index) => `b${index + 1}`);
      properties = selection.properties.map((property) => ({ ...property }));
    } else if (!selection && lastSelection) {
      lastSelection = null;
      bandNames = [];
      properties = [];
    }
  });

  $effect(() => {
    if (defaultBucket && !bucket) {
      bucket = defaultBucket;
    }
  });

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function addProperty() {
    properties = [...properties, { key: '', value: '' }];
  }

  function removeProperty(index) {
    properties = properties.filter((_, propertyIndex) => propertyIndex !== index);
  }

  function submit() {
    if (canSubmit) {
      onsubmit({
        assetId,
        description,
        startTime: startTime ? new Date(startTime).toISOString() : '',
        endTime: endTime ? new Date(endTime).toISOString() : '',
        properties: properties
          .filter((property) => property.key.trim())
          .map((property) => ({ key: property.key.trim(), value: property.value })),
        bandNames: bandNames.map((name) => name.trim()),
        pyramidingPolicy,
        source,
        bucket: source === 'empty' ? '' : bucket,
      });
    }
  }
</script>

<div
  class="collection-overlay"
  role="presentation"
  onmousedown={(e) => (backdropMouseDown = e.target === e.currentTarget)}
  onclick={(e) => {
    if (backdropMouseDown && e.target === e.currentTarget && !busy) {
      oncancel();
    }
  }}
>
  <div class="collection-dialog" role="dialog" aria-modal="true" aria-label="New image collection">
    <header>
      <i class="codicon codicon-layers"></i>
      <h2>New image collection</h2>
      <TableButton
        variant="ghost"
        size="icon"
        title="Close"
        aria-label="Close"
        disabled={busy}
        onclick={oncancel}
      >
        <i class="codicon codicon-close"></i>
      </TableButton>
    </header>
    <div class="collection-body">
      <div class="collection-field">
        <span>Images</span>
        <div class="collection-file-row">
          <input type="text" readonly value={selection?.path ?? ''} placeholder="No source selected" />
          <TableButton disabled={busy || loadingSource} onclick={onpick}>Browse…</TableButton>
          {#if selection}
            <TableButton variant="ghost" size="icon" title="Clear source" aria-label="Clear source" disabled={busy || loadingSource} onclick={onclear}>
              <i class="codicon codicon-close"></i>
            </TableButton>
          {/if}
        </div>
        {#if loadingSource}<small>Reading images…</small>{/if}
        {#if selection}<small>{selection.count} image(s) from {source === 'cogs' ? 'COG folder' : source.toUpperCase()}</small>{/if}
      </div>
      <label class="collection-field">
        <span>Asset name</span>
        <input type="text" bind:value={assetName} disabled={busy} placeholder="my_collection" />
        <small>{assetId}</small>
      </label>
      {#if selection}
        <label class="collection-field">
          <span>Staging bucket</span>
          {#if buckets.length}
            <select bind:value={bucket} disabled={busy}>
              {#each buckets as name}<option value={name}>{name}</option>{/each}
            </select>
          {:else}
            <input type="text" bind:value={bucket} disabled={busy} placeholder="my-bucket" />
          {/if}
          <small>Staged files are removed from Cloud Storage after ingestion finishes.</small>
        </label>
        <div class="collection-field">
          <span>Band names</span>
          {#each bandNames as _, index}
            <input type="text" bind:value={bandNames[index]} disabled={busy} placeholder={`b${index + 1}`} />
          {/each}
        </div>
        <label class="collection-field">
          <span>Pyramiding</span>
          <select bind:value={pyramidingPolicy} disabled={busy}>
            {#each PYRAMIDING as policy}<option value={policy}>{policy}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="collection-field">
        <span>Description</span>
        <textarea rows="2" bind:value={description} disabled={busy}></textarea>
      </label>
      <div class="collection-date-row">
        <div class="collection-field">
          <span>Start time</span>
          <DatePicker mode="datetime" label="Start time" bind:value={startTime} disabled={busy} />
        </div>
        <div class="collection-field">
          <span>End time</span>
          <DatePicker mode="datetime" label="End time" bind:value={endTime} disabled={busy} />
        </div>
      </div>
      <div class="collection-field">
        <span class="collection-properties-header">
          Properties
          <TableButton disabled={busy} onclick={addProperty}>
            <i class="codicon codicon-add"></i> Add
          </TableButton>
        </span>
        {#each properties as property, index}
          <div class="collection-property-row">
            <input type="text" placeholder="key" bind:value={property.key} disabled={busy} />
            <input type="text" placeholder="value" bind:value={property.value} disabled={busy} />
            <TableButton
              variant="ghost"
              size="icon"
              danger
              title="Remove"
              aria-label="Remove property"
              disabled={busy}
              onclick={() => removeProperty(index)}
            >
              <i class="codicon codicon-trash"></i>
            </TableButton>
          </div>
        {/each}
        {#if properties.length > 0}
          <small>Numeric values are sent as numbers, everything else as text.</small>
        {/if}
      </div>
      {#if error}<p class="collection-error">{error}</p>{/if}
      {#if busy}<p class="collection-progress">{progress || 'Working…'}</p>{/if}
    </div>
    <footer>
      <TableButton disabled={busy} onclick={oncancel}>Cancel</TableButton>
      <TableButton variant="primary" disabled={!canSubmit} onclick={submit}>
        {busy ? 'Creating…' : source === 'empty' ? 'Create collection' : 'Create and ingest'}
      </TableButton>
    </footer>
  </div>
</div>

<style>
  :global {
    /* ==================================================================
       COLLECTION DIALOG
       ================================================================== */
    .collection-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vscee-color-widget-shadow);
    }
    .collection-dialog {
      display: flex;
      flex-direction: column;
      width: min(620px, 92vw);
      max-height: 88vh;
      background: var(--vscee-color-editor-background);
      color: var(--vscee-color-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-lg);
      box-shadow: var(--vscee-shadow-xl);

      header,
      footer {
        display: flex;
        align-items: center;
        gap: var(--vscee-space-md);
        padding: var(--vscee-space-lg) var(--vscee-space-xl);
      }
      header h2 {
        flex: 1;
        margin: 0;
        font-size: var(--vscee-font-xl);
      }
      footer {
        justify-content: flex-end;
      }
      .collection-body {
        overflow-y: auto;
        padding: 0 var(--vscee-space-xl) var(--vscee-space-lg);
        display: flex;
        flex-direction: column;
        gap: var(--vscee-space-lg);
      }
      .collection-field {
        display: flex;
        flex-direction: column;
        gap: var(--vscee-space-xs);
        min-width: 0;
        span {
          font-size: var(--vscee-font-sm);
        }
        small {
          color: var(--vscee-color-muted);
          word-break: break-all;
        }
      }
      .collection-file-row {
        display: flex;
        gap: var(--vscee-space-md);
        input {
          flex: 1;
          min-width: 0;
        }
      }
      .collection-date-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--vscee-space-lg);
      }
      .collection-properties-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .collection-property-row {
        display: flex;
        gap: var(--vscee-space-sm);
        input {
          flex: 1;
          min-width: 0;
        }
      }
      input,
      select,
      textarea {
        background: var(--vscee-color-input-background);
        color: var(--vscee-color-input-foreground);
        border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
        border-radius: var(--vscee-radius-md);
        padding: var(--vscee-space-xs) var(--vscee-space-sm);
        font-family: inherit;
        font-size: var(--vscee-font-sm);
        &:disabled {
          opacity: 0.5;
        }
      }
      textarea {
        resize: vertical;
      }
      .collection-error {
        color: var(--vscee-color-error);
      }
      .collection-progress {
        color: var(--vscee-color-muted);
      }
      @media (max-width: 480px) {
        .collection-date-row {
          grid-template-columns: 1fr;
        }
      }
    }
  }
</style>
