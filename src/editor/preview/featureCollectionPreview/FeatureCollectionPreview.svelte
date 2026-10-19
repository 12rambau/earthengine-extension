<!-- FeatureCollectionPreview: tab switching + async thumbnail loading -->
<script>
  import { vscode, getInitData } from '../../../shared/vscode.ts';
  import AssetMetadataEditor from '../AssetMetadataEditor.svelte';
  import AssetPropertiesEditor from '../AssetPropertiesEditor.svelte';
  import AssetSharingEditor from '../AssetSharingEditor.svelte';
  import DatePicker from '../../components/DatePicker.svelte';

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
  let thumbnailHtml = $state(
    '<span class="thumb-loading"><span class="spinner"></span> Loading thumbnail...</span>',
  );

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  vscode.postMessage({ type: 'ready' });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'thumbnail') {
      if (msg.url) {
        thumbnailHtml = `<img src="${msg.url}" alt="Thumbnail" />`;
      } else {
        const errorMsg = msg.error || 'Thumbnail not available.';
        thumbnailHtml = `<span class="thumb-unavailable">${errorMsg}</span>`;
      }
    }
  });
</script>

<header class="title-bar">
  <h1>Asset details: {metadata.title.slice(0, metadata.title.lastIndexOf('/') + 1)}{#if editing}<input aria-label="Asset name" required pattern="[A-Za-z0-9_-]+" bind:value={name} disabled={saving} />{:else}{metadata.title.split('/').pop()}{/if}</h1>
  <button class="edit-button" class:active={editing} aria-pressed={editing} type="button" disabled={saving} onclick={() => { activeTab = 'description'; if (editing) { document.getElementById('asset-metadata-form')?.requestSubmit(); } else { editing = true; } }}>{saving ? 'Saving…' : 'Edit'}</button>
</header>

<!-- LAYOUT -->
<div class="layout">
  <!-- SIDEBAR -->
  <aside class="sidebar">
    <div class="thumbnail-container">
      <div class="thumbnail-placeholder" id="thumbnail">
        {@html thumbnailHtml}
      </div>
    </div>

    <div class="sidebar-info">
      <div class="info-row">
        <span class="info-label">Table ID</span>
        <span class="info-value asset-id" title={metadata.assetId}>{metadata.assetId}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date</span>
        <div class="info-value date-values">
          <div>Start date: {#if editing}<DatePicker mode="datetime" utc label="Start date (UTC)" bind:value={startTime} disabled={saving} />{:else}{metadata.startDate}{/if}</div>
          <div>End date: {#if editing}<DatePicker mode="datetime" utc label="End date (UTC)" bind:value={endTime} disabled={saving} />{:else}{metadata.endDate}{/if}</div>
        </div>
      </div>
      <div class="info-row">
        <span class="info-label">File Size</span>
        <span class="info-value">{data.fileSize}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Number of Features</span>
        <span class="info-value">{data.featureCount}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Last modified</span>
        <span class="info-value">{data.lastModified}</span>
      </div>
    </div>
  </aside>

  <main class="content">
    <!-- TABS -->
    <nav class="tabs">
      {#each tabs as tab}
        <button
          class="tab"
          class:active={activeTab === tab.id}
          onclick={() => (activeTab = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <section class="tab-panel description-panel" class:active={activeTab === 'description'}>
      <AssetMetadataEditor bind:metadata bind:editing bind:name bind:startTime bind:endTime bind:properties bind:sharing bind:saving />
    </section>

    <section class="tab-panel" class:active={activeTab === 'features'}>
      {@html data.featuresTableHtml}
    </section>

    <section class="tab-panel" class:active={activeTab === 'columns'}>
      {@html data.columnsTableHtml}
    </section>

    <section class="tab-panel properties-panel" class:active={activeTab === 'properties'}>
      <AssetPropertiesEditor {metadata} bind:rows={properties} {editing} {saving} />
    </section>

    <!-- TAB: sharing -->
    <section class="tab-panel" class:active={activeTab === 'sharing'}>
      <AssetSharingEditor {editing} {saving} bind:sharing />
    </section>
  </main>
</div>

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
       TITLE BAR
       ================================================================== */
    .title-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--vscee-space-lg);
      padding: var(--vscee-space-lg) var(--vscee-space-xxl);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);

      h1 {
        font-size: var(--vscee-font-xl);
        font-weight: 500;
        min-width: 0;
        overflow-wrap: anywhere;

        input {
          width: min(22ch, 100%);
          font: inherit;
          padding: 0 var(--vscee-space-xs);
          color: var(--vscee-color-foreground);
          background: var(--vscee-color-input-background);
          border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
          border-radius: var(--vscee-radius-md);
        }
      }
      .edit-button {
        display: inline-flex;
        align-items: center;
        gap: var(--vscee-space-sm);
        flex: none;
        padding: var(--vscee-space-xs) var(--vscee-space-md);
        color: var(--vscee-color-button-secondary-foreground);
        background: var(--vscee-color-button-secondary-background);
        border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
        border-radius: var(--vscee-radius-md);
        font-size: var(--vscee-font-sm);
        line-height: 1;
        cursor: pointer;

        &:hover { background: var(--vscee-color-button-secondary-hover); }
        &.active {
          color: var(--vscee-color-button-foreground);
          background: var(--vscee-color-button-background);
          border-color: transparent;
        }
        &:disabled { opacity: 0.5; cursor: default; }
      }
    }

    /* ==================================================================
       LAYOUT
       ================================================================== */
    .layout {
      display: flex;
      height: calc(100vh - 52px);
    }

    /* ==================================================================
       SIDEBAR
       ================================================================== */
    .sidebar {
      width: 280px;
      min-width: 280px;
      border-right: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
      padding: var(--vscee-space-xl);
      overflow-y: auto;
    }
    .thumbnail-container {
      width: 100%;
      aspect-ratio: 1;
      background: var(--vscee-color-list-hover);
      border-radius: var(--vscee-radius-lg);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: var(--vscee-space-xl);
      overflow: hidden;

      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
    }
    .thumb-loading,
    .thumb-unavailable {
      font-size: var(--vscee-font-sm);
      opacity: 0.6;
      text-align: center;
      padding: var(--vscee-space-lg);
    }
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

    /* ==================================================================
       CONTENT & TABS
       ================================================================== */
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .tabs {
      display: flex;
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
      padding: 0 var(--vscee-space-xl);
    }
    .tab {
      background: none;
      border: none;
      color: var(--vscee-color-foreground);
      padding: var(--vscee-space-lg) var(--vscee-space-xl);
      cursor: pointer;
      font-size: var(--vscee-font-sm);
      font-weight: 500;
      opacity: 0.7;
      border-bottom: var(--vscee-border-md) solid transparent;
      transition:
        opacity 0.15s,
        border-color 0.15s;

      &:hover {
        opacity: 1;
      }
      &.active {
        opacity: 1;
        border-bottom-color: var(--vscee-color-focus);
      }
    }
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
    .table-scroll {
      overflow: auto;
      max-height: 100%;
    }
    .features-table,
    .columns-table,
    .props-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--vscee-font-sm);
    }
    .features-table th,
    .columns-table th,
    .props-table th {
      text-align: left;
      background: var(--vscee-color-list-hover);
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      font-weight: 600;
      position: sticky;
      top: 0;
      white-space: nowrap;
    }
    .props-table th {
      background: var(--vscee-color-editor-background);
      z-index: 1;
    }
    .features-table td,
    .columns-table td,
    .props-table td {
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
      white-space: nowrap;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .features-table tbody tr:nth-child(even),
    .columns-table tbody tr:nth-child(even) {
      background: var(--vscee-color-list-hover);
    }
    .idx {
      font-weight: 500;
      opacity: 0.7;
      width: 60px;
    }
    .props-table td:first-child {
      font-weight: 500;
      width: 30%;
    }

    /* ==================================================================
       SPINNER
       ================================================================== */
    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: var(--vscee-border-md) solid var(--vscee-color-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      opacity: 0.5;
      vertical-align: middle;
      margin-right: var(--vscee-space-sm);
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  }
</style>
