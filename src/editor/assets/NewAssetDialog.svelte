<!-- NewAssetDialog: modal form to upload a local COG or Shapefile as a new asset -->
<script>
  let {
    kind,
    parent,
    buckets = [],
    defaultBucket = '',
    file = { path: '', suggestedName: '', bandCount: 1 },
    busy = false,
    progress = '',
    error = '',
    onpickfile,
    onsubmit,
    oncancel,
  } = $props();

  const PYRAMIDING = ['MEAN', 'MODE', 'SAMPLE', 'MIN', 'MAX'];

  let assetName = $state('');
  let bucket = $state('');
  let bandNames = $state(['b1']);
  let pyramidingPolicy = $state('MEAN');
  let description = $state('');
  let startTime = $state('');
  let endTime = $state('');
  let properties = $state([]);

  const isImage = $derived(kind === 'image');
  const title = $derived(isImage ? 'New image from COG' : 'New feature collection from Shapefile');
  const fileLabel = $derived(isImage ? 'GeoTIFF / COG file' : 'Shapefile (.shp)');
  const filePath = $derived(file.path);
  const assetId = $derived(`${parent}/${assetName.trim()}`);
  const canSubmit = $derived(!busy && !!filePath && !!bucket && /^[\w.-]+$/.test(assetName.trim()));
  let lastFilePath = $state('');
  let nameSeededFor = $state('');
  // Tracks whether a mousedown started on the backdrop, so a drag-to-select
  // that starts in a field and ends over the backdrop doesn't close the dialog.
  let backdropMouseDown = $state(false);

  // Seed the asset name once per newly picked file; later edits, including
  // clearing the field, are never overwritten.
  $effect(() => {
    if (file.path && file.path !== nameSeededFor) {
      nameSeededFor = file.path;
      assetName = file.suggestedName;
    }
  });

  // The bucket list arrives asynchronously; adopt the suggestion until edited.
  $effect(() => {
    if (defaultBucket && !bucket) {
      bucket = defaultBucket;
    }
  });

  // Re-seed band names as b1, b2, … whenever a new file is picked.
  $effect(() => {
    if (isImage && file.path && file.path !== lastFilePath) {
      lastFilePath = file.path;
      const count = Math.max(1, file.bandCount || 1);
      bandNames = Array.from({ length: count }, (_, i) => `b${i + 1}`);
    }
  });

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function addProperty() {
    properties = [...properties, { key: '', value: '' }];
  }

  function removeProperty(index) {
    properties = properties.filter((_, i) => i !== index);
  }

  function submit() {
    if (!canSubmit) {
      return;
    }
    onsubmit({
      kind,
      assetId,
      filePath,
      bucket,
      // Plain copy: $state array elements are proxies, not cloneable by postMessage.
      bandNames: isImage ? bandNames.map((name) => name.trim()).filter(Boolean) : [],
      pyramidingPolicy: isImage ? pyramidingPolicy : '',
      description,
      startTime: startTime ? new Date(startTime).toISOString() : '',
      endTime: endTime ? new Date(endTime).toISOString() : '',
      // Plain copies: $state proxies are not structured-cloneable by postMessage.
      properties: properties
        .filter((property) => property.key.trim())
        .map((property) => ({ key: property.key.trim(), value: property.value })),
    });
  }
</script>

<div
  class="overlay"
  role="presentation"
  onmousedown={(e) => {
    backdropMouseDown = e.target === e.currentTarget;
  }}
  onclick={(e) => {
    if (backdropMouseDown && e.target === e.currentTarget && !busy) {
      oncancel();
    }
  }}
>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <i class="codicon {isImage ? 'codicon-file-media' : 'codicon-table'}"></i>
      <h2>{title}</h2>
      <button class="close" title="Close" disabled={busy} onclick={oncancel}>
        <i class="codicon codicon-close"></i>
      </button>
    </header>

    <div class="body">
      <div class="field">
        <span>{fileLabel}</span>
        <div class="file-row">
          <input type="text" readonly placeholder="No file selected" value={filePath} />
          <button disabled={busy} onclick={() => onpickfile(kind)}>Browse…</button>
        </div>
        {#if !isImage}
          <small>The .dbf, .shx and .prj siblings are uploaded automatically.</small>
        {/if}
      </div>

      <label class="field">
        <span>Asset name</span>
        <input type="text" bind:value={assetName} disabled={busy} placeholder="my_asset" />
        <small class="asset-id">{assetId}</small>
      </label>

      <label class="field">
        <span>Staging bucket</span>
        {#if buckets.length > 0}
          <select bind:value={bucket} disabled={busy}>
            {#each buckets as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
        {:else}
          <input type="text" bind:value={bucket} disabled={busy} placeholder="my-bucket" />
        {/if}
        <small>Files transit through this bucket and are removed once ingestion completes.</small>
      </label>

      {#if isImage}
        <div class="field">
          <span>Band names</span>
          <div class="band-list">
            {#each bandNames as _, index}
              <input
                type="text"
                bind:value={bandNames[index]}
                disabled={busy}
                placeholder={`b${index + 1}`}
              />
            {/each}
          </div>
          <small>Detected from the file metadata, in file order. Edit names as needed.</small>
        </div>

        <label class="field narrow">
          <span>Pyramiding</span>
          <select bind:value={pyramidingPolicy} disabled={busy}>
            {#each PYRAMIDING as policy}
              <option value={policy}>{policy}</option>
            {/each}
          </select>
        </label>
      {/if}

      <label class="field">
        <span>Description</span>
        <textarea rows="2" bind:value={description} disabled={busy}></textarea>
      </label>

      <div class="row">
        <label class="field">
          <span>Start time</span>
          <input type="datetime-local" bind:value={startTime} disabled={busy} />
        </label>
        <label class="field">
          <span>End time</span>
          <input type="datetime-local" bind:value={endTime} disabled={busy} />
        </label>
      </div>

      <div class="field">
        <span class="properties-header">
          Properties
          <button class="add-property" disabled={busy} onclick={addProperty}>
            <i class="codicon codicon-add"></i> Add
          </button>
        </span>
        {#each properties as property, index}
          <div class="property-row">
            <input type="text" placeholder="key" bind:value={property.key} disabled={busy} />
            <input type="text" placeholder="value" bind:value={property.value} disabled={busy} />
            <button class="remove" title="Remove" disabled={busy} onclick={() => removeProperty(index)}>
              <i class="codicon codicon-trash"></i>
            </button>
          </div>
        {/each}
        {#if properties.length > 0}
          <small>Numeric values are sent as numbers, everything else as text.</small>
        {/if}
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}
      {#if busy}
        <p class="progress">{progress || 'Working…'}</p>
      {/if}
    </div>

    <footer>
      <button disabled={busy} onclick={oncancel}>Cancel</button>
      <button class="btn-primary" disabled={!canSubmit} onclick={submit}>
        {busy ? 'Uploading…' : 'Upload and ingest'}
      </button>
    </footer>
  </div>
</div>

<style>
  /* ==================================================================
     OVERLAY & DIALOG SHELL
     ================================================================== */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--vscee-color-widget-shadow);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    width: min(620px, 92vw);
    max-height: 88vh;
    background: var(--vscee-color-editor-background);
    color: var(--vscee-color-foreground);
    border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    border-radius: var(--vscee-radius-lg);
    box-shadow: var(--vscee-shadow-xl);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--vscee-space-md);
    padding: var(--vscee-space-lg) var(--vscee-space-xl);

    h2 {
      flex: 1;
      margin: 0;
      font-size: var(--vscee-font-xl);
    }
    .close {
      background: none;
      border: none;
      padding: var(--vscee-space-xxs);
    }
  }
  .body {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 0 var(--vscee-space-xl) var(--vscee-space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-lg);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--vscee-space-md);
    padding: var(--vscee-space-lg) var(--vscee-space-xl);
  }

  /* ==================================================================
     FORM FIELDS
     ================================================================== */
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-xs);
    flex: 1;
    min-width: 0;

    > span {
      font-size: var(--vscee-font-sm);
      opacity: 0.85;
    }
    small {
      font-size: var(--vscee-font-xxs);
      color: var(--vscee-color-muted);
    }
    &.narrow {
      flex: 0 0 auto;
      width: 140px;
    }
  }
  .row {
    display: flex;
    gap: var(--vscee-space-lg);
  }
  .asset-id {
    font-family: var(--vscee-editor-font-family);
    word-break: break-all;
  }
  .file-row {
    display: flex;
    gap: var(--vscee-space-md);

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

    &:focus {
      outline: var(--vscee-border-sm) solid var(--vscee-color-focus);
    }
    &:disabled {
      opacity: 0.5;
    }
  }
  textarea {
    resize: vertical;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--vscee-space-xs);
    background: var(--vscee-color-button-secondary-background);
    color: var(--vscee-color-button-secondary-foreground);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
    border-radius: var(--vscee-radius-md);
    padding: var(--vscee-space-xs) var(--vscee-space-md);
    cursor: pointer;
    font-size: var(--vscee-font-sm);
    line-height: 1;

    &:hover:not(:disabled) {
      background: var(--vscee-color-button-secondary-hover);
    }
    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }
  .btn-primary {
    background: var(--vscee-color-button-background);
    color: var(--vscee-color-button-foreground);
    border-color: transparent;

    &:hover:not(:disabled) {
      background: var(--vscee-color-button-hover);
    }
  }
  footer button {
    padding: var(--vscee-space-sm) var(--vscee-space-lg);
  }

  /* ==================================================================
     BAND EDITOR
     ================================================================== */
  .band-list {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-xs);
    max-height: 180px;
    overflow-y: auto;
  }

  /* ==================================================================
     PROPERTY EDITOR
     ================================================================== */
  .properties-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--vscee-font-sm);
    opacity: 0.85;
  }
  .property-row {
    display: flex;
    gap: var(--vscee-space-md);

    input {
      flex: 1;
      min-width: 0;
    }
    .remove {
      flex: 0 0 auto;
    }
  }

  /* ==================================================================
     STATUS
     ================================================================== */
  .error {
    margin: 0;
    color: var(--vscee-color-error);
    font-size: var(--vscee-font-sm);
  }
  .progress {
    margin: 0;
    color: var(--vscee-color-muted);
    font-size: var(--vscee-font-sm);
  }
</style>
