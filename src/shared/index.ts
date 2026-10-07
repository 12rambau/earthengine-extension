/**
 * @module shared
 * Barrel for shared utilities: HTTP client helpers and WebView/HTML helpers.
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);

export {
  getRequest,
  httpRequest,
  httpRequestRaw,
  postForm,
  postJson,
  fetchJson,
  fetchHtml,
} from './httpClient.js';
export type { HttpResponse } from './httpClient.js';
export {
  deleteObject,
  ensureLifecycleRule,
  listBuckets,
  listObjects,
  uploadFile,
} from './gcsClient.js';
export type { GcsObject } from './gcsClient.js';
export {
  designTokens,
  codiconsCss,
  leafletCss,
  escapeHtml,
  renderPropertiesTable,
} from './webviewUtils.js';
