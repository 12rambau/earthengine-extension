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
      padding: 20px;
      line-height: 1.5;
    }
    h1 {
      font-size: 1.5em;
      margin-bottom: 4px;
    }
    h2 {
      font-size: 1.15em;
      margin-top: 24px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 4px;
    }

    /* ==================================================================
       METADATA GRID
       ================================================================== */
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 16px 0;
    }
    .meta-item strong,
    .tags strong {
      display: block;
      font-size: 0.85em;
      opacity: 0.7;
      margin-bottom: 4px;
    }

    /* ==================================================================
       SNIPPET
       ================================================================== */
    .snippet {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--vscode-textCodeBlock-background);
      padding: 8px 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 16px 0;
    }
    .snippet code {
      flex: 1;
      min-width: 0;
      background: none;
      padding: 0;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      white-space: nowrap;
    }
    .copy-btn {
      flex: none;
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 3px;
      padding: 3px 10px;
      font-size: 0.8em;
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
      gap: 4px;
    }
    .tag {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.8em;
    }

    /* ==================================================================
       CONTENT: TABLES, CODE, LINKS
       ================================================================== */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 0.9em;
    }
    th {
      text-align: left;
      background: var(--vscode-list-hoverBackground);
      padding: 6px 10px;
    }
    td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px 12px;
      border-radius: 4px;
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
      gap: 20px;
    }
    .header-text {
      flex: 1;
    }
    .tags {
      margin: 12px 0;
    }

    /* ==================================================================
       TABS
       ================================================================== */
    .tabs {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-top: 24px;
    }
    .tab {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--vscode-foreground);
      opacity: 0.65;
      cursor: pointer;
      padding: 8px 14px;
      font-size: 0.95em;
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
      padding-top: 16px;
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
