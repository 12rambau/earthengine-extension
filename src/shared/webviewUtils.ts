/**
 * Escape HTML special characters for safe rendering in WebViews.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format bytes into human-readable size.
 */
export function formatBytes(bytes?: string): string {
  if (!bytes) {
    return 'N/A';
  }
  const n = parseInt(bytes, 10);
  if (n < 1024) {
    return n + ' B';
  }
  if (n < 1024 * 1024) {
    return (n / 1024).toFixed(1) + ' KB';
  }
  if (n < 1024 * 1024 * 1024) {
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Format ISO date string into readable form.
 */
export function formatDate(d?: string): string {
  if (!d) {
    return 'N/A';
  }
  return new Date(d)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z/, ' UTC');
}

/**
 * Format an EE asset type string for display (e.g. "IMAGE_COLLECTION" → "image collection").
 */
export function formatAssetType(type: string): string {
  return (type || '').toLowerCase().replace(/_/g, ' ');
}

/**
 * Render a key/value properties object as an HTML table.
 */
export function renderPropertiesTable(props?: Record<string, unknown>): string {
  if (!props || Object.keys(props).length === 0) {
    return '<p><em>No properties</em></p>';
  }
  const rows = Object.entries(props)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([k, v]) =>
        `<tr><td>${escapeHtml(k)}</td><td><code>${escapeHtml(String(v))}</code></td></tr>`,
    )
    .join('');
  return `<table class="props-table"><thead><tr><th>Property</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Base CSS for WebView panels using VS Code theme variables.
 */
export function webviewBaseStyle(): string {
  return `
	body {
		font-family: var(--vscode-font-family, sans-serif);
		color: var(--vscode-foreground);
		background: var(--vscode-editor-background);
		padding: 20px; line-height: 1.5;
	}
	h1 { font-size: 1.4em; margin-bottom: 4px; }
	h2 { font-size: 1.1em; margin-top: 20px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
	.badge { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-right: 4px; }
	.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
	.meta-item strong { display: block; font-size: 0.8em; opacity: 0.7; }
	table { width: 100%; border-collapse: collapse; font-size: 0.9em; margin: 8px 0; }
	th { text-align: left; background: var(--vscode-list-hoverBackground); padding: 5px 8px; }
	td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
	code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
	.props-table td:first-child { font-weight: 600; width: 30%; }
	a { color: var(--vscode-textLink-foreground); }
	`;
}

/**
 * SVG icons matching the VS Code codicons used in tree views.
 */
export const SVG_ICONS = {
  folder:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 3H7.71l-.85-.85L6.51 2H1.5l-.5.5v11l.5.5h13l.5-.5v-10L14.5 3zm-.51 8.49V13H2V3h4.29l.85.85.36.15H14v7.49z"/></svg>',
  layers:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 4h14v1H1V4zm1-2h12v1H2V2zm1 4h10v8H3V6zm1 1v6h8V7H4z"/></svg>',
  image:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 2H2v12h12V2zm-1 1v7.09l-2.5-2.5L7 11.09 5.5 9.59 3 12.09V3h10zM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>',
  table:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1H2L1 2v12l1 1h12l1-1V2l-1-1zM2 2h5v4H2V2zm0 5h5v4H2V7zm0 5h5v2H2v-2zm12 2H8v-2h6v2zm0-3H8V7h6v4zm0-5H8V2h6v4z"/></svg>',
  eye: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.6 5.1 0 8c1.6 2.9 4.5 5 8 5s6.4-2.1 8-5c-1.6-2.9-4.5-5-8-5zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
} as const;

/**
 * Map of EE asset types to SVG icon HTML.
 */
export function assetTypeIcon(type: string): string {
  const map: Record<string, string> = {
    FOLDER: SVG_ICONS.folder,
    IMAGE_COLLECTION: SVG_ICONS.layers,
    IMAGE: SVG_ICONS.image,
    TABLE: SVG_ICONS.table,
  };
  return map[type] || '';
}
