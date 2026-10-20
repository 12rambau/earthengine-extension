<!-- PreviewSystemMetadata: asset ID, dates, size and counts in preview sidebars -->
<script>
  import DatePicker from '../../components/DatePicker.svelte';

  let {
    metadata, editing, saving, startTime = $bindable(), endTime = $bindable(),
    idLabel, oncopy, copyTitle, copied = false, parentCollection, onopenparent,
    fileSize, countLabel, count, lastModified,
  } = $props();
</script>

<div class="sidebar-info">
  <div class="info-row">
    <span class="info-label">{idLabel}</span>
    <span class="info-value asset-id" class:copyable-id={oncopy} title={metadata.assetId}>
      {#if oncopy}
        <span class="copyable-id-value">{metadata.assetId}</span>
        <button class="copy-id-btn" title={copyTitle} onclick={oncopy}>
          <i class="codicon" class:codicon-copy={!copied} class:codicon-check={copied}></i>
        </button>
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
        <button class="parent-preview-btn" title="Open parent collection preview" onclick={onopenparent}>
          <i class="codicon codicon-open-preview"></i>
        </button>
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
  }
  .asset-id {
    font-family: var(--vscee-editor-font-family, monospace);
    font-size: var(--vscee-font-xxs);
    word-break: break-all;
    background: var(--vscee-color-code-background);
    padding: var(--vscee-space-xs) var(--vscee-space-sm);
    border-radius: var(--vscee-radius-md);
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
  }
  .copyable-id-value { word-break: break-all; }
  .parent-collection-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .copy-id-btn,
  .parent-preview-btn {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    margin-left: var(--vscee-space-xs);
    padding: var(--vscee-space-xxs) var(--vscee-space-sm);
    border: none;
    border-radius: var(--vscee-radius-md);
    background: none;
    color: var(--vscee-color-foreground);
    cursor: pointer;
    opacity: 0;

    &:hover {
      background: var(--vscee-color-list-hover);
      opacity: 1;
    }
  }
  .copyable-id:hover .copy-id-btn,
  .copyable-id:focus-within .copy-id-btn,
  .parent-collection-row:hover .parent-preview-btn,
  .parent-collection-row:focus-within .parent-preview-btn {
    opacity: 0.7;
  }
</style>