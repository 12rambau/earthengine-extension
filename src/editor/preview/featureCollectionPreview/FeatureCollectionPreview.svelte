<!-- FeatureCollectionPreview: tab switching + async thumbnail loading -->
<script>
  import { vscode, getInitData } from '../../../shared/vscode.ts';

  const data = getInitData();

  const tabs = [
    { id: 'description', label: 'DESCRIPTION' },
    { id: 'features', label: 'FEATURES' },
    { id: 'columns', label: 'COLUMNS' },
    { id: 'properties', label: 'PROPERTIES' },
  ];

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let activeTab = $state('description');
  let thumbnailHtml = $state(
    '<span class="thumb-loading"><span class="spinner"></span> Loading thumbnail...</span>'
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
  <h1>Asset details: {data.title}</h1>
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
        <span class="info-value asset-id" title={data.assetId}>{data.assetId}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date</span>
        <span class="info-value">Start date: {data.startDate}<br />End date: {data.endDate}</span>
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
          onclick={() => activeTab = tab.id}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <section class="tab-panel" class:active={activeTab === 'description'}>
      {@html data.descriptionHtml}
    </section>

    <section class="tab-panel" class:active={activeTab === 'features'}>
      {@html data.featuresTableHtml}
    </section>

    <section class="tab-panel" class:active={activeTab === 'columns'}>
      {@html data.columnsTableHtml}
    </section>

    <section class="tab-panel" class:active={activeTab === 'properties'}>
      {@html data.propsHtml}
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
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.5;
    }

    /* ==================================================================
       TITLE BAR
       ================================================================== */
    .title-bar {
      padding: 12px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .title-bar h1 {
      font-size: 1.2em;
      font-weight: 500;
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
      border-right: 1px solid var(--vscode-panel-border);
      padding: 16px;
      overflow-y: auto;
    }
    .thumbnail-container {
      width: 100%;
      aspect-ratio: 1;
      background: var(--vscode-list-hoverBackground);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .thumbnail-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .thumb-loading,
    .thumb-unavailable {
      font-size: 0.85em;
      opacity: 0.6;
      text-align: center;
      padding: 12px;
    }
    .sidebar-info {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .info-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .info-label {
      font-weight: 600;
      font-size: 0.85em;
    }
    .info-value {
      font-size: 0.85em;
      opacity: 0.85;
    }
    .asset-id {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.78em;
      word-break: break-all;
      background: var(--vscode-textCodeBlock-background);
      padding: 4px 6px;
      border-radius: 3px;
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
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 0 16px;
    }
    .tab {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      padding: 10px 16px;
      cursor: pointer;
      font-size: 0.85em;
      font-weight: 500;
      opacity: 0.7;
      border-bottom: 2px solid transparent;
      transition:
        opacity 0.15s,
        border-color 0.15s;
    }
    .tab:hover {
      opacity: 1;
    }
    .tab.active {
      opacity: 1;
      border-bottom-color: var(--vscode-focusBorder);
    }
    .tab-panel {
      display: none;
      padding: 16px;
      overflow: auto;
      flex: 1;
    }
    .tab-panel.active {
      display: block;
    }
    .empty-state {
      font-size: 0.9em;
      opacity: 0.6;
      font-style: italic;
    }

    /* ==================================================================
       DESCRIPTION
       ================================================================== */
    .description-text {
      font-size: 0.9em;
      line-height: 1.6;
    }
    .description-text h2 {
      font-size: 1.3em;
      margin: 16px 0 8px;
    }
    .description-text h3 {
      font-size: 1.1em;
      margin: 12px 0 6px;
    }
    .description-text h4 {
      font-size: 1em;
      margin: 10px 0 4px;
    }
    .description-text p {
      margin: 8px 0;
    }
    .description-text code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    .description-text pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .description-text pre code {
      background: none;
      padding: 0;
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
      font-size: 0.85em;
    }
    .features-table th,
    .columns-table th,
    .props-table th {
      text-align: left;
      background: var(--vscode-list-hoverBackground);
      padding: 6px 10px;
      font-weight: 600;
      position: sticky;
      top: 0;
      white-space: nowrap;
    }
    .features-table td,
    .columns-table td,
    .props-table td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      white-space: nowrap;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .features-table tbody tr:nth-child(even),
    .columns-table tbody tr:nth-child(even) {
      background: var(--vscode-list-hoverBackground);
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
      border: 2px solid var(--vscode-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      opacity: 0.5;
      vertical-align: middle;
      margin-right: 6px;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  }
</style>
