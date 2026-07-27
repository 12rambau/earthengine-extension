/**
 * @module webviewUtils
 * HTML/WebView helpers shared across editor panels: HTML escaping, value
 * formatting (bytes, dates), a properties-table renderer, and the base stylesheet.
 */

import baseStyle from './webviewBase.css';

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
 * Sourced from `webviewBase.css` (bundled as text by esbuild).
 */
export function webviewBaseStyle(): string {
  return baseStyle;
}
