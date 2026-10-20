<!-- CollectionDialog: create an empty image collection or ingest Zarr/COG rasters into one -->
<script>
  import TableButton from '../components/TableButton.svelte';

  let {
    parent,
    buckets = [],
    defaultBucket = '',
    files = [],
    busy = false,
    progress = '',
    error = '',
    onpick,
    onsubmit,
    oncancel,
  } = $props();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let source = $state('empty');
  let assetName = $state('');
  let title = $state('');
  let description = $state('');
  let bucket = $state('');
  let backdropMouseDown = $state(false);

  // ----------------------------------------------------------------
  // DERIVED
  // ----------------------------------------------------------------
  let assetId = $derived(`${parent}/${assetName.trim()}`);
  let canSubmit = $derived(
    !busy &&
      /^[A-Za-z0-9_-]+$/.test(assetName.trim()) &&
      (source === 'empty' || (files.length > 0 && !!bucket.trim())),
  );

  $effect(() => {
    if (defaultBucket && !bucket) {
      bucket = defaultBucket;
    }
  });

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function submit() {
    if (canSubmit) {
      onsubmit({
        assetId,
        title,
        description,
        source,
        bucket: source === 'empty' ? '' : bucket,
      });
    }
  }
</script>

<div
  class="overlay"
  role="presentation"
  onmousedown={(e) => (backdropMouseDown = e.target === e.currentTarget)}
  onclick={(e) => {
    if (backdropMouseDown && e.target === e.currentTarget && !busy) {
      oncancel();
    }
  }}
>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="New image collection">
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
    <div class="body">
      <label class="field">
        <span>Asset name</span>
        <input type="text" bind:value={assetName} disabled={busy} placeholder="my_collection" />
        <small>{assetId}</small>
      </label>
      <label class="field">
        <span>Title</span>
        <input type="text" bind:value={title} disabled={busy} />
      </label>
      <label class="field">
        <span>Description</span>
        <textarea rows="2" bind:value={description} disabled={busy}></textarea>
      </label>
      <label class="field">
        <span>Images</span>
        <select bind:value={source} disabled={busy} onchange={() => onpick(null)}>
          <option value="empty">Empty (add images later)</option>
          <option value="zarr">Local Zarr raster</option>
          <option value="cogs">Local Cloud Optimized GeoTIFF files</option>
        </select>
      </label>
      {#if source !== 'empty'}
        <div class="field">
          <span>{source === 'zarr' ? 'Zarr directory' : 'COG files'}</span>
          <div class="file-row">
            <input
              type="text"
              readonly
              value={files.map((file) => file.split(/[\\/]/).pop()).join(', ')}
              placeholder="No source selected"
            />
            <TableButton disabled={busy} onclick={() => onpick(source)}>Browse…</TableButton>
          </div>
          {#if source === 'zarr'}
            <small
              >GDAL must expose this Zarr store as a georeferenced 2D raster. It is converted to a
              COG for ingestion.</small
            >
          {:else}
            <small>Each file becomes a separate image and ingestion task.</small>
          {/if}
        </div>
        <label class="field">
          <span>Staging bucket</span>
          {#if buckets.length}
            <select bind:value={bucket} disabled={busy}>
              {#each buckets as name}<option value={name}>{name}</option>{/each}
            </select>
          {:else}
            <input type="text" bind:value={bucket} disabled={busy} placeholder="my-bucket" />
          {/if}
          <small>COGs are removed from Cloud Storage after ingestion finishes.</small>
        </label>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
      {#if busy}<p class="progress">{progress || 'Working…'}</p>{/if}
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
      .body {
        overflow-y: auto;
        padding: 0 var(--vscee-space-xl) var(--vscee-space-lg);
        display: flex;
        flex-direction: column;
        gap: var(--vscee-space-lg);
      }
      .field {
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
        &:disabled {
          opacity: 0.5;
        }
      }
      textarea {
        resize: vertical;
      }
      .error {
        color: var(--vscee-color-error);
      }
      .progress {
        color: var(--vscee-color-muted);
      }
    }
  }
</style>
