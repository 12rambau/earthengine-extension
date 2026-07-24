/**
 * @module shared
 * Barrel for shared utilities: HTTP client helpers and WebView/HTML helpers.
 */

export { getRequest, httpRequest, postForm, postJson, fetchJson, fetchHtml } from './httpClient.js';
export {
  renderTemplate,
  escapeHtml,
  formatBytes,
  formatDate,
  formatAssetType,
  renderPropertiesTable,
  webviewBaseStyle,
  SVG_ICONS,
  assetTypeIcon,
} from './webviewUtils.js';
