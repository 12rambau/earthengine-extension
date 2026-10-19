<!-- ImagePreview: tabs, async thumbnail + per-band min/max -->
<script>
  import { vscode, getInitData } from '../../../shared/vscode.ts';
  import AssetMetadataEditor from '../components/AssetMetadataEditor.svelte';
  import AssetPropertiesEditor from '../components/AssetPropertiesEditor.svelte';
  import AssetSharingEditor from '../components/AssetSharingEditor.svelte';
  import PreviewFrame from '../components/PreviewFrame.svelte';
  import PreviewSystemMetadata from '../components/PreviewSystemMetadata.svelte';
  import PreviewTable from '../components/PreviewTable.svelte';
  import PreviewTabs from '../components/PreviewTabs.svelte';
  import PreviewThumbnail from '../components/PreviewThumbnail.svelte';
  import PreviewTitleBar from '../components/PreviewTitleBar.svelte';

  const data = getInitData();

  const tabs = [
    { id: 'description', label: 'DESCRIPTION' },
    { id: 'bands', label: 'BANDS' },
    { id: 'properties', label: 'PROPERTIES' },
    { id: 'sharing', label: 'SHARING' },
  ];

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let activeTab = $state('description');
  let metadata = $state(data.metadata);
  let editing = $state(false);
  let name = $state('');
  let startTime = $state('');
  let endTime = $state('');
  let properties = $state([]);
  let sharing = $state(null);
  let saving = $state(false);
  let thumbnailUrl = $state('');
  let thumbnailLoading = $state(true);
  let thumbnailPreset = $state(false);
  let fallbackRequested = $state(false);
  // null = still loading; object = received (may have no entry for a band)
  let minMaxData = $state(null);
  let parentCollection = $state(null);
  let assetIdCopied = $state(false);
  let copyResetTimer;

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  vscode.postMessage({ type: 'ready' });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'thumbnail') {
      thumbnailUrl = msg.url || '';
      thumbnailPreset = Boolean(msg.preset);
      thumbnailLoading = false;
    } else if (msg.type === 'minmax') {
      minMaxData = msg.data;
    } else if (msg.type === 'parentCollection') {
      parentCollection = msg;
    }
  });

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function handleThumbnailError() {
    thumbnailUrl = '';
    if (thumbnailPreset && !fallbackRequested) {
      fallbackRequested = true;
      thumbnailLoading = true;
      vscode.postMessage({ type: 'thumbnailFallback' });
    }
  }

  function copyAssetId() {
    vscode.postMessage({ type: 'copyAssetId' });
    assetIdCopied = true;
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => (assetIdCopied = false), 5000);
  }

  function formatNum(n) {
    if (n === null || n === undefined) {
      return '—';
    }
    if (Number.isInteger(n)) {
      return String(n);
    }
    return n.toFixed(4);
  }

  function getMin(bandId) {
    if (!minMaxData || !minMaxData[bandId]) {
      return null;
    }
    return minMaxData[bandId].min;
  }

  function getMax(bandId) {
    if (!minMaxData || !minMaxData[bandId]) {
      return null;
    }
    return minMaxData[bandId].max;
  }

  function openParentCollection() {
    vscode.postMessage({ type: 'openParentCollection' });
  }
</script>

<PreviewTitleBar title={metadata.title} bind:editing bind:activeTab bind:name {saving} />

<!-- LAYOUT -->
<PreviewFrame>
  {#snippet sidebar()}
    <PreviewThumbnail loading={thumbnailLoading} url={thumbnailUrl} onerror={handleThumbnailError} />

    <PreviewSystemMetadata {metadata} {editing} {saving} bind:startTime bind:endTime
      idLabel="Image ID" oncopy={copyAssetId} copyTitle="Copy image ID" copied={assetIdCopied}
      {parentCollection} onopenparent={openParentCollection}
      fileSize={data.fileSize} countLabel="Number of Bands" count={data.bandCount}
      lastModified={data.lastModified} />
  {/snippet}

    <PreviewTabs {tabs} {activeTab} onselect={(tab) => (activeTab = tab)} />

    <div class="tab-panel description-panel" class:active={activeTab === 'description'} id="panel-description" role="tabpanel" aria-labelledby="tab-description" tabindex="0">
      <AssetMetadataEditor bind:metadata bind:editing bind:name bind:startTime bind:endTime bind:properties bind:sharing bind:saving />
    </div>

    <div class="tab-panel" class:active={activeTab === 'bands'} id="panel-bands" role="tabpanel" aria-labelledby="tab-bands" tabindex="0">
      <PreviewTable>
        <table class="bands-table">
          <thead>
            <tr>
              <th>Index</th>
              <th>Name</th>
              <th>Type</th>
              <th>Dimensions</th>
              <th>CRS</th>
              <th>Nominal Scale</th>
              <th>Min</th>
              <th>Max</th>
            </tr>
          </thead>
          <tbody>
            {#each data.bands as band, i}
              <tr>
                <td>{i}</td>
                <td>{band.id}</td>
                <td>{band.dtype}</td>
                <td>{band.dims}</td>
                <td>{band.crs}</td>
                <td>{band.scale}</td>
                <td class="minmax">
                  {#if minMaxData === null}
                    <span class="spinner"></span>
                  {:else}
                    {formatNum(getMin(band.id))}
                  {/if}
                </td>
                <td class="minmax">
                  {#if minMaxData === null}
                    <span class="spinner"></span>
                  {:else}
                    {formatNum(getMax(band.id))}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </PreviewTable>
    </div>

    <div class="tab-panel properties-panel" class:active={activeTab === 'properties'} id="panel-properties" role="tabpanel" aria-labelledby="tab-properties" tabindex="0">
      <AssetPropertiesEditor {metadata} bind:rows={properties} {editing} {saving} />
    </div>

    <!-- TAB: sharing -->
    <div class="tab-panel" class:active={activeTab === 'sharing'} id="panel-sharing" role="tabpanel" aria-labelledby="tab-sharing" tabindex="0">
      <AssetSharingEditor {editing} {saving} bind:sharing />
    </div>
</PreviewFrame>

<style>
  :global {
    /* ==================================================================
       RESET & BASE LAYOUT
       ================================================================== */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: var(--vscee-font-family, sans-serif);
      color: var(--vscee-color-foreground);
      background: var(--vscee-color-editor-background);
      line-height: 1.5;
    }

    /* ==================================================================
       CONTENT & TABS
       ================================================================== */
    .tab-panel {
      display: none;
      padding: var(--vscee-space-xl);
      overflow: auto;
      flex: 1;
      min-height: 0;

      &.description-panel.active { display: flex; flex-direction: column; }
      &.description-panel > :first-child { flex: 1; min-height: 0; }

      &.properties-panel {
        padding-top: 0;
      }

      &.active {
        display: block;
      }
    }

    /* ==================================================================
       DESCRIPTION
       ================================================================== */
    .description-text {
      font-size: var(--vscee-font-md);
      white-space: pre-wrap;
      opacity: 0.85;

      ul,
      ol {
        margin: var(--vscee-space-md) 0;
        padding-left: 1.5em;
      }
    }

    /* ==================================================================
       SPINNER
       ================================================================== */
    .minmax .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: var(--vscee-border-md) solid var(--vscee-color-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      opacity: 0.5;
      vertical-align: middle;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  }
</style>
