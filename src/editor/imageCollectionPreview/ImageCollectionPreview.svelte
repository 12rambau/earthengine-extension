<!-- ImageCollectionPreview: tabs, thumbnail, per-image open/delete actions -->
<script>
  import { vscode, getInitData } from '../../webview/shared/vscode.ts';

  const data = getInitData();

  let activeTab = $state('description');
  let thumbnailHtml = $state(
    '<span class="thumb-loading"><span class="spinner"></span> Loading thumbnail...</span>'
  );
  let images = $state(data.images);

  const tabs = [
    { id: 'description', label: 'DESCRIPTION' },
    { id: 'images', label: 'IMAGES' },
    { id: 'bands', label: 'BANDS' },
    { id: 'properties', label: 'PROPERTIES' },
  ];

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

<div class="layout">
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
