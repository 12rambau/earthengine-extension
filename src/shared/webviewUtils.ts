/**
 * @module webviewUtils
 * HTML/WebView helpers shared across editor panels: HTML escaping,
 * a properties-table renderer, and shared design tokens.
 */

import designTokensCss from './webview.css';
import codiconsCssRaw from '@vscode/codicons/dist/codicon.css';

export const designTokens: string = designTokensCss;
export const codiconsCss: string = codiconsCssRaw;

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
