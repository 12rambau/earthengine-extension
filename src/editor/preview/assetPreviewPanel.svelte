<!-- AssetPreviewPanel: static generic asset preview for unsupported asset types -->
<script>
  import { getInitData } from '../../shared/vscode.ts';

  const { title, assetType, updated, size, propertiesTable } = getInitData();
</script>

<h1>{title}</h1>
<span class="badge">{assetType}</span>
<div class="meta">
  <div class="meta-item"><strong>Last Updated</strong>{updated}</div>
  <div class="meta-item"><strong>Size</strong>{size}</div>
</div>
<h2>Properties</h2>
{@html propertiesTable}

<style>
  :global {
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: var(--vscee-space-xxl);
      line-height: 1.5;
    }
    h1 {
      font-size: 1.4em;
      margin-bottom: var(--vscee-space-xs);
    }
    h2 {
      font-size: 1.1em;
      margin-top: var(--vscee-space-xxl);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
      padding-bottom: var(--vscee-space-xs);
    }
    .badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: var(--vscee-space-xxs) var(--vscee-space-md);
      border-radius: var(--vscee-radius-xl);
      font-size: 0.8em;
      margin-right: var(--vscee-space-xs);
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--vscee-space-md);
      margin: var(--vscee-space-lg) 0;
    }
    .meta-item strong {
      display: block;
      font-size: 0.8em;
      opacity: 0.7;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
      margin: var(--vscee-space-md) 0;
    }
    th {
      text-align: left;
      background: var(--vscode-list-hoverBackground);
      padding: var(--vscee-space-sm) var(--vscee-space-md);
    }
    td {
      padding: var(--vscee-space-sm) var(--vscee-space-md);
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
      border-radius: var(--vscee-radius-md);
      font-size: 0.9em;
    }
    .props-table td:first-child {
      font-weight: 600;
      width: 30%;
    }
    a {
      color: var(--vscode-textLink-foreground);
    }
  }
</style>
