<!-- ImageCollectionPreview: tabs, thumbnail, per-image open/delete actions -->
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
    { id: 'images', label: 'IMAGES' },
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
  let images = $state(data.images);
  let currentAssetId = $state(data.metadata.assetId);
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
    } else if (msg.type === 'imageDeleted') {
      images = images.filter((img) => img.name !== msg.name);
    } else if (msg.type === 'metadataSaved' && msg.metadata.assetId !== currentAssetId) {
      images = images.map((img) => ({
        ...img,
        name: img.name.startsWith(`${currentAssetId}/`)
          ? msg.metadata.assetId + img.name.slice(currentAssetId.length)
          : img.name,
      }));
      currentAssetId = msg.metadata.assetId;
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

  function openImage(name) {
    vscode.postMessage({ type: 'openImage', name });
  }

  function deleteImage(name) {
    vscode.postMessage({ type: 'deleteImage', name });
  }
</script>

<PreviewTitleBar title={metadata.title} suffix=" (ImageCollection)" bind:editing bind:activeTab bind:name {saving} />

<!-- LAYOUT -->
<PreviewFrame>
  {#snippet sidebar()}
    <PreviewThumbnail loading={thumbnailLoading} url={thumbnailUrl} onerror={handleThumbnailError} />

    <PreviewSystemMetadata {metadata} {editing} {saving} bind:startTime bind:endTime
      idLabel="ImageCollection ID" oncopy={copyAssetId} copyTitle="Copy image collection ID" copied={assetIdCopied}
      onviewmap={() => vscode.postMessage({ type: 'viewOnMap' })}
      fileSize={data.fileSize} countLabel="Number of Images" count={data.imageCount}
      lastModified={data.lastModified} />
  {/snippet}

    <PreviewTabs {tabs} {activeTab} onselect={(tab) => (activeTab = tab)} />

    <div class="tab-panel description-panel" class:active={activeTab === 'description'} id="panel-description" role="tabpanel" aria-labelledby="tab-description" tabindex="0">
      <AssetMetadataEditor bind:metadata bind:editing bind:name bind:startTime bind:endTime bind:properties bind:sharing bind:saving />
    </div>

    <div class="tab-panel" class:active={activeTab === 'images'} id="panel-images" role="tabpanel" aria-labelledby="tab-images" tabindex="0">
      {#if images.length > 0}
        <p class="note">Limited to the first {data.imagesPageSize} images.</p>
        <PreviewTable>
          <table class="images-table">
            <thead>
              <tr>
                <th>Image ID</th>
                <th>Last Modified</th>
                <th>Size</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Band Count</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each images as img}
                <tr>
                  <td class="img-id" title={img.name}>{img.shortId}</td>
                  <td>{img.lastModified}</td>
                  <td>{img.size}</td>
                  <td>{img.startDate}</td>
                  <td>{img.endDate}</td>
                  <td>{img.bandCount}</td>
                  <td class="actions-cell">
                    <span class="action-dots">
                      <span class="action-dot"
                        ><i class="codicon codicon-circle-small-filled"></i></span
                      >
                      <span class="action-dot"
                        ><i class="codicon codicon-circle-small-filled"></i></span
                      >
                      <span class="action-dot"
                        ><i class="codicon codicon-circle-small-filled"></i></span
                      >
                    </span>
                    <span class="action-btns">
                      <button class="action-btn" title="View on Map" aria-label="View on Map"
                        onclick={() => vscode.postMessage({ type: 'viewImageOnMap', name: img.name })}>
                        <i class="codicon codicon-map"></i>
                      </button>
                      <button
                        class="action-btn"
                        title="Open preview"
                        onclick={() => openImage(img.name)}
                      >
                        <i class="codicon codicon-open-preview"></i>
                      </button>
                      <button
                        class="action-btn danger"
                        title="Delete image"
                        onclick={() => deleteImage(img.name)}
                      >
                        <i class="codicon codicon-trash"></i>
                      </button>
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </PreviewTable>
      {:else}
        <p class="empty-state">No images found.</p>
      {/if}
    </div>

    <div class="tab-panel" class:active={activeTab === 'bands'} id="panel-bands" role="tabpanel" aria-labelledby="tab-bands" tabindex="0">
      <PreviewTable>{@html data.bandsHtml}</PreviewTable>
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
    .empty-state {
      font-size: var(--vscee-font-md);
      opacity: 0.6;
      font-style: italic;
    }
    .note {
      font-size: var(--vscee-font-sm);
      opacity: 0.6;
      margin-bottom: var(--vscee-space-lg);
    }

    /* ==================================================================
       DESCRIPTION
       ================================================================== */
    .description-text {
      font-size: var(--vscee-font-md);
      line-height: 1.6;

      ul,
      ol {
        margin: var(--vscee-space-md) 0;
        padding-left: 1.5em;
      }
      h2 {
        font-size: var(--vscee-font-xxl);
        margin: var(--vscee-space-xl) 0 var(--vscee-space-md);
      }
      h3 {
        font-size: var(--vscee-font-lg);
        margin: var(--vscee-space-lg) 0 var(--vscee-space-sm);
      }
      p {
        margin: var(--vscee-space-md) 0;
      }
      code {
        background: var(--vscee-color-code-background);
        padding: var(--vscee-space-xxs) var(--vscee-space-xs);
        border-radius: var(--vscee-radius-md);
        font-size: var(--vscee-font-md);
      }
      pre {
        background: var(--vscee-color-code-background);
        padding: var(--vscee-space-lg) var(--vscee-space-lg);
        border-radius: var(--vscee-radius-md);
        overflow-x: auto;
        margin: var(--vscee-space-md) 0;

        code {
          background: none;
          padding: 0;
        }
      }
    }

    /* ==================================================================
       TABLES
       ================================================================== */
    .images-table td {
      white-space: nowrap;
    }
    .img-id {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .idx {
      font-weight: 500;
      opacity: 0.7;
      width: 60px;
    }

    /* ==================================================================
       ROW ACTIONS
       ================================================================== */
    .actions-cell {
      white-space: nowrap;
      text-align: right;
    }
    .action-dots {
      display: inline-flex;
      align-items: center;
      height: 22px;
      opacity: 0.4;
    }
    .action-dot {
      padding: var(--vscee-space-xxs) var(--vscee-space-sm);
      display: inline-flex;
      align-items: center;
    }
    .action-btns {
      display: none;
      align-items: center;
      height: 22px;
    }
    tr {
      &:hover,
      &:focus-within {
        .action-dots {
          display: none;
        }
        .action-btns {
          display: inline-flex;
        }
      }
    }
    .action-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--vscee-space-xxs) var(--vscee-space-sm);
      border-radius: var(--vscee-radius-md);
      color: var(--vscee-color-foreground);
      opacity: 0.7;
      display: inline-flex;
      align-items: center;

      &:hover {
        opacity: 1;
        background: var(--vscee-color-list-hover);
      }
      &.danger {
        color: var(--vscee-color-error);
        &:hover {
          background: var(--vscee-color-validation-error-background);
        }
      }
    }

  }
</style>
