<!-- ImageCollectionPreview: tabs, thumbnail, per-image open/delete actions -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';

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
                      <span class="action-dot">{@html data.actionDotSvg}</span>
                      <span class="action-dot">{@html data.actionDotSvg}</span>
                    </span>
                    <span class="action-btns">
                      <button class="action-btn" title="Open preview" onclick={() => openImage(img.name)}>
                        {@html data.previewIconSvg}
                      </button>
                      <button class="action-btn danger" title="Delete image" onclick={() => deleteImage(img.name)}>
                        {@html data.deleteIconSvg}
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
    .note {
      font-size: 0.85em;
      opacity: 0.6;
      margin-bottom: 12px;
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
    .images-table,
    .bands-table,
    .props-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85em;
    }
    .images-table th,
    .bands-table th,
    .props-table th {
      text-align: left;
      background: var(--vscode-list-hoverBackground);
      padding: 6px 10px;
      font-weight: 600;
      position: sticky;
      top: 0;
      white-space: nowrap;
    }
    .images-table td,
    .bands-table td,
    .props-table td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
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
      padding: 2px 6px;
      display: inline-flex;
      align-items: center;
    }
    .action-btns {
      display: none;
      align-items: center;
      height: 22px;
    }
    tr:hover .action-dots,
    tr:focus-within .action-dots {
      display: none;
    }
    tr:hover .action-btns,
    tr:focus-within .action-btns {
      display: inline-flex;
    }
    .action-btn {
      background: none !important;
      border: none !important;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      color: var(--vscode-foreground);
      opacity: 0.7;
      display: inline-flex;
      align-items: center;
    }
    .action-btn:hover {
      opacity: 1;
      background: var(--vscode-list-hoverBackground) !important;
    }
    .action-btn.danger {
      color: var(--vscode-errorForeground);
    }
    .action-btn.danger:hover {
      background: var(--vscode-inputValidation-errorBackground) !important;
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
