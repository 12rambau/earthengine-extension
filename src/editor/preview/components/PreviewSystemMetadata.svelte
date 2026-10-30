<!-- PreviewSystemMetadata: asset ID, dates, size and counts in preview sidebars -->
<script>
  import DatePicker from '../../components/DatePicker.svelte';

  let {
    metadata, editing, saving, startTime = $bindable(), endTime = $bindable(),
    idLabel, oncopy, copyTitle, copied = false, onviewmap, parentCollection, onopenparent,
    fileSize, countLabel, count, lastModified,
  } = $props();
</script>

<div class="sidebar-info">
  <div class="info-row">
    <span class="info-label">{idLabel}</span>
    <span class="info-value asset-id" class:copyable-id={oncopy} title={metadata.assetId}>
      {#if oncopy}
        <span class="copyable-id-value">{metadata.assetId}</span>
        <span class="id-actions">
          <button class="copy-id-btn" title={copyTitle} onclick={oncopy}>
            <i class="codicon" class:codicon-copy={!copied} class:codicon-check={copied}></i>
          </button>
          {#if onviewmap}
            <button class="copy-id-btn" title="View on Map" aria-label="View on Map" onclick={onviewmap}>
              <i class="codicon codicon-map"></i>
            </button>
          {/if}
        </span>
      {:else}
        {metadata.assetId}
      {/if}
    </span>
  </div>
  {#if parentCollection}
    <div class="info-row parent-collection-row">
      <span class="info-label">Parent collection</span>
      <span class="info-value asset-id parent-collection">
        <span class="parent-collection-name" title={parentCollection.name}>{parentCollection.name}</span>
        <span class="id-actions">
          <button class="parent-preview-btn" title="Open parent collection preview" onclick={onopenparent}>
            <i class="codicon codicon-open-preview"></i>
          </button>
        </span>
      </span>
    </div>
  {/if}
  <div class="info-row">
    <span class="info-label">Date</span>
    <div class="info-value date-values">
      <div>Start date: {#if editing}<DatePicker mode="datetime" utc label="Start date (UTC)" bind:value={startTime} disabled={saving} />{:else}{metadata.startDate}{/if}</div>
      <div>End date: {#if editing}<DatePicker mode="datetime" utc label="End date (UTC)" bind:value={endTime} disabled={saving} />{:else}{metadata.endDate}{/if}</div>
    </div>
  </div>
  <div class="info-row">
    <span class="info-label">File Size</span>
    <span class="info-value">{fileSize}</span>
  </div>
  {#if countLabel}
    <div class="info-row">
      <span class="info-label">{countLabel}</span>
      <span class="info-value">{count}</span>
    </div>
  {/if}
  <div class="info-row">
    <span class="info-label">Last modified</span>
    <span class="info-value">{lastModified}</span>
  </div>
</div>

<style>
  .sidebar-info {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-lg);
  }
  .info-row {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-xxs);
  }
  .info-label {
    font-weight: 600;
    font-size: var(--vscee-font-sm);
  }
  .info-value {
    font-size: var(--vscee-font-sm);
    opacity: 0.85;
  }
  .date-values {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-xs);
    width: 100%;
    opacity: 1;
  }
  .asset-id {
    position: relative;
    --id-background: linear-gradient(var(--vscee-color-code-background), var(--vscee-color-code-background)), var(--vscee-color-editor-background);
    font-family: var(--vscee-editor-font-family, monospace);
    font-size: var(--vscee-font-xxs);
    word-break: break-all;
    background: var(--id-background);
    padding: var(--vscee-space-xs) var(--vscee-space-sm);
    border-radius: var(--vscee-radius-md);
    opacity: 1;
  }
  .copyable-id,
  .parent-collection {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .copyable-id-value,
  .parent-collection-name {
    flex: 1 1 auto;
    min-width: 0;
    word-break: break-all;
  }
  .id-actions {
    position: absolute;
    inset: 0 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--vscee-space-xxs);
    padding: 0 var(--vscee-space-sm);
    background: var(--id-background);
    border-radius: var(--vscee-radius-md);
    opacity: 0;
    pointer-events: none;

    &::before {
      content: '';
      position: absolute;
      inset: 0 100% 0 auto;
      width: var(--vscee-space-lg);
      background: var(--id-background);
      backdrop-filter: blur(3px);
      mask-image: linear-gradient(to right, transparent, black);
      pointer-events: none;
    }
  }
  .copy-id-btn,
  .parent-preview-btn {
    display: inline-flex;
    align-items: center;
    padding: var(--vscee-space-xxs) var(--vscee-space-sm);
    border: none;
    border-radius: var(--vscee-radius-md);
    background: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;

    &:hover {
      background: none;
      color: var(--vscode-textLink-foreground);
    }
  }
  .copy-id-btn {
    padding-inline: var(--vscee-space-xs);
  }
  .copyable-id:hover .id-actions,
  .copyable-id:focus-within .id-actions,
  .parent-collection:hover .id-actions,
  .parent-collection:focus-within .id-actions {
    opacity: 1;
    pointer-events: auto;
  }
</style>