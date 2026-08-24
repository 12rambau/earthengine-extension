<!-- ImagePreview: tabs, async thumbnail + per-band min/max -->
<script>
  import { vscode, getInitData } from '../../../shared/vscode.ts';

  const data = getInitData();

  const tabs = [
    { id: 'description', label: 'DESCRIPTION' },
    { id: 'bands', label: 'BANDS' },
    { id: 'properties', label: 'PROPERTIES' },
  ];

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let activeTab = $state('description');
  let thumbnailHtml = $state(
    '<span class="thumb-loading"><span class="spinner"></span> Loading thumbnail...</span>'
  );
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
      if (msg.url) {
        thumbnailHtml = `<img src="${msg.url}" alt="Thumbnail" />`;
      } else {
        thumbnailHtml = '<span class="thumb-unavailable">Thumbnail not available.</span>';
      }
    } else if (msg.type === 'minmax') {
      minMaxData = msg.data;
    } else if (msg.type === 'parentCollection') {
      parentCollection = msg;
    }
  });

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function copyAssetId() {
    vscode.postMessage({ type: 'copyAssetId' });
    assetIdCopied = true;
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => assetIdCopied = false, 5000);
  }

  function formatNum(n) {
    if (n === null || n === undefined) {return '—';}
    if (Number.isInteger(n)) {return String(n);}
    return n.toFixed(4);
  }

  function getMin(bandId) {
    if (!minMaxData || !minMaxData[bandId]) {return null;}
    return minMaxData[bandId].min;
  }

  function getMax(bandId) {
    if (!minMaxData || !minMaxData[bandId]) {return null;}
    return minMaxData[bandId].max;
  }

  function openParentCollection() {
    vscode.postMessage({ type: 'openParentCollection' });
  }
</script>

<header class="title-bar">
  <h1>Asset details: {data.title}</h1>
</header>

<!-- LAYOUT -->
<div class="layout">
  <!-- SIDEBAR -->
  <aside class="sidebar">
    <div class="thumbnail-container">
      <div class="thumbnail-placeholder">
        {@html thumbnailHtml}
      </div>
    </div>

    <div class="sidebar-info">
      <div class="info-row">
        <span class="info-label">Image ID</span>
        <span class="info-value asset-id copyable-id" title={data.assetId}>
          <span class="copyable-id-value">{data.assetId}</span>
          <button class="copy-id-btn" title="Copy image ID" onclick={copyAssetId}>
            <i class="codicon" class:codicon-copy={!assetIdCopied} class:codicon-check={assetIdCopied}></i>
          </button>
        </span>
      </div>
      {#if parentCollection}
        <div class="info-row parent-collection-row">
          <span class="info-label">Parent collection</span>
          <span class="info-value asset-id parent-collection">
            <span class="parent-collection-name" title={parentCollection.name}>{parentCollection.name}</span>
            <button class="parent-preview-btn" title="Open parent collection preview" onclick={openParentCollection}>
              <i class="codicon codicon-open-preview"></i>
            </button>
          </span>
        </div>
      {/if}
      <div class="info-row">
        <span class="info-label">Date</span>
        <span class="info-value">Start date: {data.startDate}<br />End date: {data.endDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">File Size</span>
        <span class="info-value">{data.fileSize}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Number of Bands</span>
        <span class="info-value">{data.bandCount}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Last modified</span>
        <span class="info-value">{data.lastModified}</span>
      </div>
    </div>
  </aside>

  <main class="content">
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

    <section class="tab-panel" class:active={activeTab === 'bands'}>
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
      padding: var(--vscee-space-lg) var(--vscee-space-xxl);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);

      h1 { font-size: var(--vscee-font-xl); font-weight: 500; }
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
      border-right: var(--vscee-border-sm) solid var(--vscode-panel-border);
      padding: var(--vscee-space-xl);
      overflow-y: auto;
    }
    .thumbnail-container {
      width: 100%;
      aspect-ratio: 1;
      background: var(--vscode-list-hoverBackground);
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
    .asset-id {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscee-font-xxs);
      word-break: break-all;
      background: var(--vscode-textCodeBlock-background);
      padding: var(--vscee-space-xs) var(--vscee-space-sm);
      border-radius: var(--vscee-radius-md);
    }
    .copyable-id {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .copyable-id-value {
      flex: 1 1 auto;
      min-width: 0;
      word-break: break-all;
    }
    .copy-id-btn {
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      margin-left: var(--vscee-space-xs);
      padding: var(--vscee-space-xxs) var(--vscee-space-sm);
      border: none;
      border-radius: var(--vscee-radius-md);
      background: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      opacity: 0;

      &:hover { background: var(--vscode-list-hoverBackground); opacity: 1; }
    }
    .copyable-id {
      &:hover .copy-id-btn,
      &:focus-within .copy-id-btn { opacity: 0.7; }
    }
    .parent-collection {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .parent-collection-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .parent-preview-btn {
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      margin-left: var(--vscee-space-xs);
      padding: var(--vscee-space-xxs) var(--vscee-space-sm);
      border: none;
      border-radius: var(--vscee-radius-md);
      background: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      opacity: 0;

      &:hover { background: var(--vscode-list-hoverBackground); opacity: 1; }
    }
    .parent-collection-row {
      &:hover .parent-preview-btn,
      &:focus-within .parent-preview-btn { opacity: 0.7; }
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
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
      padding: 0 var(--vscee-space-xl);
    }
    .tab {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      padding: var(--vscee-space-lg) var(--vscee-space-xl);
      cursor: pointer;
      font-size: var(--vscee-font-sm);
      font-weight: 500;
      opacity: 0.7;
      border-bottom: var(--vscee-border-md) solid transparent;
      transition:
        opacity 0.15s,
        border-color 0.15s;

      &:hover { opacity: 1; }
      &.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); }
    }
    .tab-panel {
      display: none;
      padding: var(--vscee-space-xl);
      overflow: auto;
      flex: 1;

      &.active { display: block; }
    }

    /* ==================================================================
       DESCRIPTION
       ================================================================== */
    .description-text {
      font-size: var(--vscee-font-md);
      white-space: pre-wrap;
      opacity: 0.85;
    }

    /* ==================================================================
       TABLES
       ================================================================== */
    .bands-table,
    .props-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--vscee-font-sm);
    }
    .bands-table th,
    .props-table th {
      text-align: left;
      background: var(--vscode-list-hoverBackground);
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      font-weight: 600;
      position: sticky;
      top: 0;
    }
    .bands-table td,
    .props-table td {
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
    }
    .bands-table tbody tr:nth-child(even) {
      background: var(--vscode-list-hoverBackground);
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
      border: var(--vscee-border-md) solid var(--vscode-foreground);
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
