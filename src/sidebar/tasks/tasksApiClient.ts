/**
 * @module tasksApiClient
 * Earth Engine Operations (tasks) REST API client.
 *
 * Wraps the EE v1 operations endpoints for listing, cancelling, and
 * inspecting export/import tasks. Includes helpers for state display
 * and elapsed-time formatting.
 */

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { httpRequest } from '../../shared/httpClient.js';

dayjs.extend(duration);
dayjs.extend(relativeTime);

// ==================================================================
// CONSTANTS
// ==================================================================
const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

// ==================================================================
// INTERFACES
// ==================================================================
/** Metadata embedded in an Earth Engine operation. */
export interface OperationMetadata {
  '@type'?: string;
  state?: string;
  description?: string;
  createTime?: string;
  updateTime?: string;
  startTime?: string;
  endTime?: string;
  progress?: number;
  type?: string;
  destinationType?: string;
  destinationUris?: string[];
  attempt?: number;
  batchEecuUsageSeconds?: number;
  priority?: number;
}

/** A single Earth Engine long-running operation (task). */
export interface Operation {
  name: string;
  metadata?: OperationMetadata;
  done?: boolean;
  error?: { code?: number; message?: string };
}

/** Paginated list of operations from the REST API. */
export interface ListOperationsResponse {
  operations?: Operation[];
  nextPageToken?: string;
}

/** Enriched response that includes the resolved project identifier. */
export interface PaginatedOperations {
  operations: Operation[];
  nextPageToken?: string;
  project: string;
}

/** Display category for a task type returned by the Earth Engine API. */
export type TaskKind =
  | 'image-export'
  | 'map-export'
  | 'table-export'
  | 'video-export'
  | 'classifier-export'
  | 'export'
  | 'import'
  | 'unknown';

// ==================================================================
// API FUNCTIONS
// ==================================================================
/**
 * Fetches one page of operations, falling back to `earthengine-legacy`
 * if the user's project returns no results.
 */
export async function listOperationsPage(
  project: string,
  accessToken: string,
  pageSize = 100,
  pageToken?: string,
): Promise<PaginatedOperations> {
  const projectsToTry = [project];
  if (project !== 'earthengine-legacy') {
    projectsToTry.push('earthengine-legacy');
  }

  for (const proj of projectsToTry) {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    const url = `${EE_API_BASE}/projects/${proj}/operations?${params.toString()}`;
    try {
      const response = await httpRequest(url, 'GET', accessToken);
      const data = JSON.parse(response) as ListOperationsResponse;
      return {
        operations: data.operations || [],
        nextPageToken: data.nextPageToken,
        project: proj,
      };
    } catch (err) {
      if (proj === project) {
        throw err;
      }
    }
  }

  return { operations: [], project };
}

/** Sends a cancel request for a running operation. */
export async function cancelOperation(name: string, accessToken: string): Promise<void> {
  const url = `${EE_API_BASE}/${name}:cancel`;
  await httpRequest(url, 'POST', accessToken);
}

/** Fetches the current state of a single operation by its full name. */
export async function getOperation(name: string, accessToken: string): Promise<Operation> {
  const url = `${EE_API_BASE}/${name}`;
  const response = await httpRequest(url, 'GET', accessToken);
  return JSON.parse(response) as Operation;
}

// ==================================================================
// TASK HELPERS
// ==================================================================
/** Returns `true` if the operation is an export-type task. */
export function isExportTask(op: Operation): boolean {
  const type = (op.metadata?.type || '').toUpperCase();
  return type.startsWith('EXPORT') || type === '';
}

/** Returns `true` if the operation is an import/ingest-type task. */
export function isImportTask(op: Operation): boolean {
  const type = (op.metadata?.type || '').toUpperCase();
  return type.startsWith('INGEST') || type.startsWith('IMPORT');
}

/** Returns the display category for an Earth Engine operation. */
export function getTaskKind(op: Operation): TaskKind {
  switch ((op.metadata?.type || '').toUpperCase()) {
    case 'EXPORT_IMAGE':
      return 'image-export';
    case 'EXPORT_TILES':
      return 'map-export';
    case 'EXPORT_TABLE':
    case 'EXPORT_FEATURES':
      return 'table-export';
    case 'EXPORT_VIDEO':
      return 'video-export';
    case 'EXPORT_CLASSIFIER':
      return 'classifier-export';
    default:
      return isExportTask(op) ? 'export' : isImportTask(op) ? 'import' : 'unknown';
  }
}

/** Returns the asset name that can be opened in a preview panel, if any. */
export function getPreviewAssetName(op: Operation): string | undefined {
  const kind = getTaskKind(op);
  if (getTaskState(op) !== 'SUCCEEDED' || (kind !== 'image-export' && kind !== 'table-export')) {
    return undefined;
  }

  const uri = op.metadata?.destinationUris?.find((value) =>
    /(?:asset=|\/v1\/projects\/[^/]+\/assets\/)/.test(value),
  );
  if (!uri) {
    return undefined;
  }

  const match =
    uri.match(/asset=(projects\/[^&\s]+)/) || uri.match(/\/v1\/(projects\/[^/]+\/assets\/.+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Whether a completed task can be opened in an asset preview panel. */
export function canPreviewTask(op: Operation): boolean {
  return getPreviewAssetName(op) !== undefined;
}

/** Derives the display state from operation metadata. */
export function getTaskState(op: Operation): string {
  return op.metadata?.state || (op.done ? 'SUCCEEDED' : 'PENDING');
}

/** Computes a compact elapsed time string (e.g. "42s", "5 minutes", "2 hours"). */
export function getElapsedTime(op: Operation): string {
  if (getTaskState(op) === 'PENDING') {
    return '';
  }
  const start = op.metadata?.startTime;
  // Treat Unix epoch (1970-01-01T00:00:00.000Z) as sentinel for "not started yet"
  if (!start || start === '1970-01-01T00:00:00.000Z') {
    return '';
  }
  const ms = (op.metadata?.endTime ? dayjs(op.metadata.endTime) : dayjs()).diff(start);
  return ms < 60_000 ? `${Math.floor(ms / 1000)}s` : dayjs.duration(ms).humanize();
}

/** Formats a runtime string with duration and local start time (e.g. "42s (started 2026-07-22 10:49:00 +0200)"). */
export function formatRuntimeLine(op: Operation): string {
  if (getTaskState(op) === 'PENDING') {
    return '';
  }
  const startIso = op.metadata?.startTime;
  // Treat Unix epoch (1970-01-01T00:00:00.000Z) as sentinel for "not started yet"
  if (!startIso || startIso === '1970-01-01T00:00:00.000Z') {
    return '';
  }
  const ms = (op.metadata?.endTime ? dayjs(op.metadata.endTime) : dayjs()).diff(startIso);
  const dur = ms < 60_000 ? `${Math.floor(ms / 1000)}s` : dayjs.duration(ms).humanize();
  return `${dur} (started ${dayjs(startIso).format('YYYY-MM-DD HH:mm:ss ZZ')})`;
}
