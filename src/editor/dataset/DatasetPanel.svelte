<!-- DatasetPanel: snippet copy + dynamic tab switching -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';

  const data = getInitData();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let activeTab = $state(data.tabs[0]?.id || '');
  let snippetCopied = $state(false);
  let snippetResetTimer;

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function copySnippet() {
    vscode.postMessage({ type: 'copy', text: data.snippet });
    snippetCopied = true;
    clearTimeout(snippetResetTimer);
    snippetResetTimer = setTimeout(() => (snippetCopied = false), 5000);
  }

  function addToMap() {
    vscode.postMessage({ type: 'addToMap' });
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
  <span class="snippet-actions">
    <button title="Copy snippet" aria-label="Copy snippet" onclick={copySnippet}>
      <i class="codicon" class:codicon-copy={!snippetCopied} class:codicon-check={snippetCopied}></i>
    </button>
    {#if data.canAddToMap}
      <button title="View on Map" aria-label="View on Map" onclick={addToMap}>
        <i class="codicon codicon-map"></i>
      </button>
    {/if}
  </span>
</div>

{#if data.tabs.length > 0}
  <div class="tabs" role="tablist">
    {#each data.tabs as tab}
      <button class="tab" class:active={activeTab === tab.id} onclick={() => (activeTab = tab.id)}>
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
      font-family: var(--vscee-font-family, sans-serif);
      color: var(--vscee-color-foreground);
      background: var(--vscee-color-editor-background);
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
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
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
      position: relative;
      --id-background: linear-gradient(var(--vscee-color-code-background), var(--vscee-color-code-background)), var(--vscee-color-editor-background);
      display: flex;
      align-items: center;
      background: var(--id-background);
      padding: var(--vscee-space-md) var(--vscee-space-lg);
      border-radius: var(--vscee-radius-md);
      margin: var(--vscee-space-xl) 0;

      code {
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        background: none;
        padding: 0;
        font-family: var(--vscee-editor-font-family, monospace);
        font-size: var(--vscee-font-md);
        white-space: nowrap;
      }
    }
    .snippet-actions {
      position: absolute;
      inset: 0 0 0 auto;
      display: flex;
      align-items: center;
      gap: var(--vscee-space-xxs);
      padding: 0 var(--vscee-space-sm);
      background: var(--id-background);
      border-radius: var(--vscee-radius-md);
      opacity: 0;
      pointer-events: none;

      &::before {
        content: '';
        position: absolute;
        inset: 0 100% 0 auto;
        width: var(--vscee-space-lg);
        background: var(--id-background);
        backdrop-filter: blur(3px);
        mask-image: linear-gradient(to right, transparent, black);
        pointer-events: none;
      }

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--vscee-space-xs);
        border: none;
        border-radius: var(--vscee-radius-md);
        background: none;
        color: var(--vscode-descriptionForeground);
        cursor: pointer;

        &:hover {
          background: none;
          color: var(--vscode-textLink-foreground);
        }
      }
    }
    .snippet:hover .snippet-actions,
    .snippet:focus-within .snippet-actions {
      opacity: 1;
      pointer-events: auto;
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
      background: var(--vscee-color-badge-background);
      color: var(--vscee-color-badge-foreground);
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
      background: var(--vscee-color-list-hover);
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
    }
    td {
      padding: var(--vscee-space-sm) var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    }
    code {
      background: var(--vscee-color-code-background);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
      border-radius: var(--vscee-radius-md);
    }
    pre {
      background: var(--vscee-color-code-background);
      padding: var(--vscee-space-lg) var(--vscee-space-lg);
      border-radius: var(--vscee-radius-md);
      overflow-x: auto;

      code {
        background: none;
        padding: 0;
      }
    }
    a {
      color: var(--vscee-color-link);
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
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
      margin-top: var(--vscee-space-xxl);
    }
    .tab {
      background: none;
      border: none;
      border-bottom: var(--vscee-border-md) solid transparent;
      color: var(--vscee-color-foreground);
      opacity: 0.65;
      cursor: pointer;
      padding: var(--vscee-space-md) var(--vscee-space-lg);
      font-size: var(--vscee-font-md);
      font-family: inherit;

      &:hover {
        opacity: 1;
      }
      &.active {
        opacity: 1;
        border-bottom-color: var(--vscee-color-focus);
        font-weight: 600;
      }
    }
    .tab-panel {
      display: none;
      padding-top: var(--vscee-space-xl);

      &.active {
        display: block;
      }
    }

    /* ==================================================================
       MARKDOWN
       ================================================================== */
    .md > :first-child {
      margin-top: 0;
    }
  }
</style>
