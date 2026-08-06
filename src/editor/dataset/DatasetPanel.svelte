<!-- DatasetPanel: snippet copy + dynamic tab switching -->
<script>
  import { vscode, getInitData } from '../../webview/shared/vscode.ts';

  const data = getInitData();

  let activeTab = $state(data.tabs[0]?.id || '');
  let copyLabel = $state('Copy');

  function copySnippet() {
    vscode.postMessage({ type: 'copy', text: data.snippet });
    copyLabel = 'Copied!';
    setTimeout(() => { copyLabel = 'Copy'; }, 1200);
  }
</script>

<h1>{data.title}</h1>

<div class="header">
  {@html data.previewImgHtml}
  <div class="header-text">
    <div class="meta">
      <div class="meta-item">
        <strong>Dataset Availability</strong>
        {data.startDate} – {data.endDate}
      </div>
      <div class="meta-item">
        <strong>Type</strong>
        <code>{data.geeType}</code>
      </div>
      <div class="meta-item">
        <strong>Provider</strong>
        {@html data.providersHtml}
      </div>
      <div class="meta-item">
        <strong>Catalog Page</strong>
        <a href={data.catalogUrl}>Open in browser</a>
      </div>
    </div>
    {@html data.tagsHtml}
  </div>
</div>

<div class="snippet">
  <code id="snippet-code">{data.snippet}</code>
  <button class="copy-btn" title="Copy to clipboard" onclick={copySnippet}>
    {copyLabel}
  </button>
</div>

{#if data.tabs.length > 0}
  <div class="tabs" role="tablist">
    {#each data.tabs as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
      </button>
    {/each}
  </div>
  <div class="tab-panels">
    {#each data.tabs as tab}
      <div class="tab-panel" class:active={activeTab === tab.id}>
        {@html tab.content}
      </div>
    {/each}
  </div>
{/if}
