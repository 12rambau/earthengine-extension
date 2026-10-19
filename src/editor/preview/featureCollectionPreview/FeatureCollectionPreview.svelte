<!-- FeatureCollectionPreview: tab switching + async thumbnail loading -->
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
    { id: 'features', label: 'FEATURES' },
    { id: 'columns', label: 'COLUMNS' },
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
  let thumbnailError = $state('Thumbnail not available.');

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  vscode.postMessage({ type: 'ready' });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'thumbnail') {
      thumbnailUrl = msg.url || '';
      thumbnailError = msg.error || 'Thumbnail not available.';
      thumbnailLoading = false;
    }
  });
</script>

<PreviewTitleBar title={metadata.title} bind:editing bind:activeTab bind:name {saving} />

<!-- LAYOUT -->
<PreviewFrame>
  {#snippet sidebar()}
    <PreviewThumbnail loading={thumbnailLoading} url={thumbnailUrl} error={thumbnailError} onerror={() => (thumbnailUrl = '')} />

    <PreviewSystemMetadata {metadata} {editing} {saving} bind:startTime bind:endTime
      idLabel="Table ID" fileSize={data.fileSize} countLabel="Number of Features"
      count={data.featureCount} lastModified={data.lastModified} />
  {/snippet}

    <!-- TABS -->
    <PreviewTabs {tabs} {activeTab} onselect={(tab) => (activeTab = tab)} />

    <section class="tab-panel description-panel" class:active={activeTab === 'description'}>
      <AssetMetadataEditor bind:metadata bind:editing bind:name bind:startTime bind:endTime bind:properties bind:sharing bind:saving />
    </section>

    <section class="tab-panel" class:active={activeTab === 'features'}>
      <PreviewTable>{@html data.featuresTableHtml}</PreviewTable>
    </section>

    <section class="tab-panel" class:active={activeTab === 'columns'}>
      <PreviewTable>{@html data.columnsTableHtml}</PreviewTable>
    </section>

    <section class="tab-panel properties-panel" class:active={activeTab === 'properties'}>
      <AssetPropertiesEditor {metadata} bind:rows={properties} {editing} {saving} />
    </section>

    <!-- TAB: sharing -->
    <section class="tab-panel" class:active={activeTab === 'sharing'}>
      <AssetSharingEditor {editing} {saving} bind:sharing />
    </section>
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
      h4 {
        font-size: 1em;
        margin: var(--vscee-space-lg) 0 var(--vscee-space-xs);
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
    .idx {
      font-weight: 500;
      opacity: 0.7;
      width: 60px;
    }

  }
</style>
