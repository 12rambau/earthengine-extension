<!-- ImageCollectionPreview: tabs, thumbnail, per-image open/delete actions -->
<script>
  import { vscode, getInitData } from '../../../shared/vscode.ts';

  const data = getInitData();

  const tabs = [
    { id: 'description', label: 'DESCRIPTION' },
    { id: 'images', label: 'IMAGES' },
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
  let images = $state(data.images);
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
        const errorMsg = msg.error || 'Thumbnail not available.';
        thumbnailHtml = `<span class="thumb-unavailable">${errorMsg}</span>`;
      }
    } else if (msg.type === 'imageDeleted') {
      images = images.filter(img => img.name !== msg.name);
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

  function openImage(name) {
    vscode.postMessage({ type: 'openImage', name });
  }

  function deleteImage(name) {
    vscode.postMessage({ type: 'deleteImage', name });
  }
</script>

<header class="title-bar">
  <h1>Asset details: {data.title} (ImageCollection)</h1>
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
        <span class="info-label">ImageCollection ID</span>
        <span class="info-value asset-id copyable-id" title={data.assetId}>
          <span class="copyable-id-value">{data.assetId}</span>
          <button class="copy-id-btn" title="Copy image collection ID" onclick={copyAssetId}>
            <i class="codicon" class:codicon-copy={!assetIdCopied} class:codicon-check={assetIdCopied}></i>
          </button>
        </span>
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
        <span class="info-label">Number of Images</span>
        <span class="info-value">{data.imageCount}</span>
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

    <section class="tab-panel" class:active={activeTab === 'images'}>
      {#if images.length > 0}
        <p class="note">Limited to the first {data.imagesPageSize} images.</p>
        <div class="table-scroll">
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
                      <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
                      <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
                    </span>
                    <span class="action-btns">
                      <button class="action-btn" title="Open preview" onclick={() => openImage(img.name)}>
                        <i class="codicon codicon-open-preview"></i>
                      </button>
                      <button class="action-btn danger" title="Delete image" onclick={() => deleteImage(img.name)}>
                        <i class="codicon codicon-trash"></i>
                      </button>
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="empty-state">No images found.</p>
      {/if}
    </section>

    <section class="tab-panel" class:active={activeTab === 'bands'}>
      {@html data.bandsHtml}
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

      h2 { font-size: var(--vscee-font-xxl); margin: var(--vscee-space-xl) 0 var(--vscee-space-md); }
      h3 { font-size: var(--vscee-font-lg); margin: var(--vscee-space-lg) 0 var(--vscee-space-sm); }
      p { margin: var(--vscee-space-md) 0; }
      code {
        background: var(--vscode-textCodeBlock-background);
        padding: var(--vscee-space-xxs) var(--vscee-space-xs);
        border-radius: var(--vscee-radius-md);
        font-size: var(--vscee-font-md);
      }
      pre {
        background: var(--vscode-textCodeBlock-background);
        padding: var(--vscee-space-lg) var(--vscee-space-lg);
        border-radius: var(--vscee-radius-md);
        overflow-x: auto;
        margin: var(--vscee-space-md) 0;

        code { background: none; padding: 0; }
      }
    }

    /* ==================================================================
       TABLES
       ================================================================== */
    .table-scroll {
      overflow: auto;
      max-height: 100%;
    }
    .images-table,
    .bands-table,
    .props-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--vscee-font-sm);
    }
    .images-table th,
    .bands-table th,
    .props-table th {
      text-align: left;
      background: var(--vscode-list-hoverBackground);
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      font-weight: 600;
      position: sticky;
      top: 0;
      white-space: nowrap;
    }
    .images-table td,
    .bands-table td,
    .props-table td {
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
      white-space: nowrap;
    }
    .images-table tbody tr:nth-child(even),
    .bands-table tbody tr:nth-child(even) {
      background: var(--vscode-list-hoverBackground);
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
    .props-table td:first-child {
      font-weight: 500;
      width: 30%;
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
      &:hover {
        .action-dots { display: none; }
        .action-btns { display: inline-flex; }
      }
      &:focus-within {
        .action-dots { display: none; }
        .action-btns { display: inline-flex; }
      }
    }
    .action-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--vscee-space-xxs) var(--vscee-space-sm);
      border-radius: var(--vscee-radius-md);
      color: var(--vscode-foreground);
      opacity: 0.7;
      display: inline-flex;
      align-items: center;

      &:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
      &.danger {
        color: var(--vscode-errorForeground);
        &:hover { background: var(--vscode-inputValidation-errorBackground); }
      }
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
      margin-right: var(--vscee-space-sm);
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  }
</style>
