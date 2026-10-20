<!-- FeatureViewPreview: metadata, ingestion options, properties and sharing tabs -->
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
    { id: 'ingestion-options', label: 'INGESTION OPTIONS' },
    { id: 'properties', label: 'PROPERTIES' },
    { id: 'sharing', label: 'SHARING' },
  ];
  const featureViewAttributes = data.featureViewAttributes ?? [];

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
  let thumbnailTiles = $state([]);
  let thumbnailColumns = $state(1);
  let thumbnailLoading = $state(true);
  let thumbnailError = $state('Thumbnail not available for FeatureView.');

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  vscode.postMessage({ type: 'ready' });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'thumbnail') {
      thumbnailUrl = msg.url || '';
      thumbnailTiles = msg.tiles || [];
      thumbnailColumns = msg.columns || 1;
      thumbnailError = msg.error || 'Thumbnail not available for FeatureView.';
      thumbnailLoading = false;
    }
  });
</script>

<PreviewTitleBar title={metadata.title} bind:editing bind:activeTab bind:name {saving} />

<!-- LAYOUT -->
<PreviewFrame>
  {#snippet sidebar()}
    <PreviewThumbnail
      loading={thumbnailLoading}
      url={thumbnailUrl}
      tiles={thumbnailTiles}
      tileColumns={thumbnailColumns}
      error={thumbnailError}
      onerror={() => {
        thumbnailUrl = '';
        thumbnailTiles = [];
      }}
    />
    <PreviewSystemMetadata
      {metadata}
      {editing}
      {saving}
      bind:startTime
      bind:endTime
      idLabel="FeatureView ID"
      fileSize={data.fileSize}
      countLabel="Number of Features"
      count={data.featureCount}
      lastModified={data.lastModified}
    />
  {/snippet}

  <!-- TABS -->
  <PreviewTabs {tabs} {activeTab} onselect={(tab) => (activeTab = tab)} />

  <div class="tab-panel description-panel" class:active={activeTab === 'description'} id="panel-description" role="tabpanel" aria-labelledby="tab-description" tabindex="0">
    <AssetMetadataEditor bind:metadata bind:editing bind:name bind:startTime bind:endTime bind:properties bind:sharing bind:saving />
  </div>

  <div class="tab-panel options-panel" class:active={activeTab === 'ingestion-options'} id="panel-ingestion-options" role="tabpanel" aria-labelledby="tab-ingestion-options" tabindex="0">
    {#if featureViewAttributes.length}
      <PreviewTable keyColumn>
        <table>
          <thead><tr><th>Attribute</th><th>Type</th></tr></thead>
          <tbody>
            {#each featureViewAttributes as attribute}
              <tr><td>{attribute.name}</td><td>{attribute.type}</td></tr>
            {/each}
          </tbody>
        </table>
      </PreviewTable>
    {:else}
      <p class="empty-state">No FeatureView attributes available.</p>
    {/if}
  </div>

  <div class="tab-panel properties-panel" class:active={activeTab === 'properties'} id="panel-properties" role="tabpanel" aria-labelledby="tab-properties" tabindex="0">
    <AssetPropertiesEditor {metadata} bind:rows={properties} {editing} {saving} />
  </div>

  <div class="tab-panel" class:active={activeTab === 'sharing'} id="panel-sharing" role="tabpanel" aria-labelledby="tab-sharing" tabindex="0">
    <AssetSharingEditor {editing} {saving} bind:sharing />
  </div>
</PreviewFrame>

<style>
  :global {
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
    .tab-panel {
      display: none;
      padding: var(--vscee-space-xl);
      overflow: auto;
      flex: 1;
      min-height: 0;

      &.description-panel.active { display: flex; flex-direction: column; }
      &.description-panel > :first-child { flex: 1; min-height: 0; }
      &.properties-panel { padding-top: 0; }
      &.active { display: block; }
    }
    .empty-state {
      font-size: var(--vscee-font-md);
      opacity: 0.6;
      font-style: italic;
    }
  }
</style>