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

/** Derives the display state from operation metadata. */
export function getTaskState(op: Operation): string {
  return op.metadata?.state || (op.done ? 'SUCCEEDED' : 'PENDING');
}

/** Computes a compact elapsed time string (e.g. "42s", "5 minutes", "2 hours"). */
export function getElapsedTime(op: Operation): string {
  const start = op.metadata?.startTime || op.metadata?.createTime;
  if (!start) {
    return '';
  }
  const end = op.metadata?.endTime ? dayjs(op.metadata.endTime) : dayjs();
  const ms = end.diff(start);
  if (ms < 0) {
    return '';
  }
  if (ms < 60_000) {
    return `${Math.floor(ms / 1000)}s`;
  }
  return dayjs.duration(ms).humanize();
}

/** Formats a runtime string with duration and local start time (e.g. "42s (started 2026-07-22 10:49:00 +0200)"). */
export function formatRuntimeLine(op: Operation): string {
  const startIso = op.metadata?.startTime;
  if (!startIso) {
    return '';
  }
  const start = dayjs(startIso);
  const end = op.metadata?.endTime ? dayjs(op.metadata.endTime) : dayjs();
  const ms = end.diff(start);
  if (ms < 0) {
    return '';
  }
  const dur = ms < 60_000 ? `${Math.floor(ms / 1000)}s` : dayjs.duration(ms).humanize();
  return `${dur} (started ${start.format('YYYY-MM-DD HH:mm:ss ZZ')})`;
}
