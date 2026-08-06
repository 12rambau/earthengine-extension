<!-- ImagePreview: tabs, async thumbnail + per-band min/max -->
<script>
  import { vscode, getInitData } from '../../webview/shared/vscode.ts';

  const data = getInitData();

  let activeTab = $state('description');
  let thumbnailHtml = $state(
    '<span class="thumb-loading"><span class="spinner"></span> Loading thumbnail...</span>'
  );
  let minMaxData = $state(null);

  const tabs = [
    { id: 'description', label: 'DESCRIPTION' },
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
        thumbnailHtml = '<span class="thumb-unavailable">Thumbnail not available.</span>';
      }
    } else if (msg.type === 'minmax') {
      minMaxData = msg.data;
    }
  });

  function formatNum(n) {
    if (n === null || n === undefined) return '—';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(4);
  }

  function getMin(bandId) {
    if (!minMaxData || !minMaxData[bandId]) return null;
    return minMaxData[bandId].min;
  }

  function getMax(bandId) {
    if (!minMaxData || !minMaxData[bandId]) return null;
    return minMaxData[bandId].max;
  }
</script>

<header class="title-bar">
  <h1>Asset details: {data.title}</h1>
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
        <span class="info-label">Image ID</span>
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
