/**
 * @module shared
 * Barrel for shared utilities: HTTP client helpers and WebView/HTML helpers.
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);

export { getRequest, httpRequest, postForm, postJson, fetchJson, fetchHtml } from './httpClient.js';
export { escapeHtml, renderPropertiesTable } from './webviewUtils.js';
