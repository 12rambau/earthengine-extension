<!-- DatasetPanel: snippet copy + dynamic tab switching -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';

  const data = getInitData();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let activeTab = $state(data.tabs[0]?.id || '');
  let copyLabel = $state('Copy');

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
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

<style>
  :global {
    /* ==================================================================
       BASE LAYOUT
       ================================================================== */
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: var(--vscee-space-xxl);
      line-height: 1.5;
    }
    h1 {
      font-size: var(--vscee-font-3xl);
      margin-bottom: var(--vscee-space-xs);
    }
    h2 {
      font-size: var(--vscee-font-lg);
      margin-top: var(--vscee-space-xxl);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
      padding-bottom: var(--vscee-space-xs);
    }

    /* ==================================================================
       METADATA GRID
       ================================================================== */
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--vscee-space-lg);
      margin: var(--vscee-space-xl) 0;
    }
    .meta-item strong,
    .tags strong {
      display: block;
      font-size: var(--vscee-font-sm);
      opacity: 0.7;
      margin-bottom: var(--vscee-space-xs);
    }

    /* ==================================================================
       SNIPPET
       ================================================================== */
    .snippet {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-md);
      background: var(--vscode-textCodeBlock-background);
      padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-radius: var(--vscee-radius-md);
      overflow-x: auto;
      margin: var(--vscee-space-xl) 0;
    }
    .snippet code {
      flex: 1;
      min-width: 0;
      background: none;
      padding: 0;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscee-font-md);
      white-space: nowrap;
    }
    .copy-btn {
      flex: none;
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: var(--vscee-radius-md);
      padding: var(--vscee-space-xs) var(--vscee-space-lg);
      font-size: var(--vscee-font-xs);
      font-family: var(--vscode-font-family, sans-serif);
    }
    .copy-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    /* ==================================================================
       TAGS
       ================================================================== */
    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: var(--vscee-space-xs);
    }
    .tag {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: var(--vscee-space-xxs) var(--vscee-space-md);
      border-radius: var(--vscee-radius-xl);
      font-size: var(--vscee-font-xs);
    }

    /* ==================================================================
       CONTENT: TABLES, CODE, LINKS
       ================================================================== */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: var(--vscee-space-md) 0;
      font-size: var(--vscee-font-md);
    }
    th {
      text-align: left;
      background: var(--vscode-list-hoverBackground);
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
    }
    td {
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
      border-radius: var(--vscee-radius-md);
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: var(--vscee-space-lg) var(--vscee-space-lg);
      border-radius: var(--vscee-radius-md);
      overflow-x: auto;
    }
    pre code {
      background: none;
      padding: 0;
    }
    a {
      color: var(--vscode-textLink-foreground);
    }

    /* ==================================================================
       HEADER LAYOUT
       ================================================================== */
    .header {
      display: flex;
      gap: var(--vscee-space-xxl);
    }
    .header-text {
      flex: 1;
    }
    .tags {
      margin: var(--vscee-space-lg) 0;
    }

    /* ==================================================================
       TABS
       ================================================================== */
    .tabs {
      display: flex;
      gap: var(--vscee-space-xs);
      flex-wrap: wrap;
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
      margin-top: var(--vscee-space-xxl);
    }
    .tab {
      background: none;
      border: none;
      border-bottom: var(--vscee-border-md) solid transparent;
      color: var(--vscode-foreground);
      opacity: 0.65;
      cursor: pointer;
      padding: var(--vscee-space-md) var(--vscee-space-lg);
      font-size: var(--vscee-font-md);
      font-family: inherit;
    }
    .tab:hover {
      opacity: 1;
    }
    .tab.active {
      opacity: 1;
      border-bottom-color: var(--vscode-focusBorder);
      font-weight: 600;
    }
    .tab-panel {
      display: none;
      padding-top: var(--vscee-space-xl);
    }
    .tab-panel.active {
      display: block;
    }

    /* ==================================================================
       MARKDOWN
       ================================================================== */
    .md > :first-child {
      margin-top: 0;
    }
  }
</style>
