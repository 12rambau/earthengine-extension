/**
 * @module tasksApiClient
 * Earth Engine Operations (tasks) REST API client.
 *
 * Wraps the EE v1 operations endpoints for listing, cancelling, and
 * inspecting export/import tasks. Includes helpers for state display
 * and elapsed-time formatting.
 */

import { httpRequest } from '../../shared/httpClient.js';

// ── Constants ───────────────────────────────────────────────────────

const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

// ── Interfaces ──────────────────────────────────────────────────────

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

// ── API Functions ───────────────────────────────────────────────────

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

// ── Task Helpers ────────────────────────────────────────────────────

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

/** Computes a compact elapsed time string (e.g. "11s", "5m", "2h15m"). */
export function getElapsedTime(op: Operation): string {
  const start = op.metadata?.startTime || op.metadata?.createTime;
  if (!start) {
    return '';
  }
  const end = op.metadata?.endTime || new Date().toISOString();
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) {
    return '';
  }
  const secs = Math.floor(ms / 1000);
  if (secs < 60) {
    return `${secs}s`;
  }
  const minutes = Math.floor(secs / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
}

/** Returns a human-readable phase label (e.g. "Completed", "Failed"). */
export function getPhaseLabel(state: string): string {
  switch (state.toUpperCase()) {
    case 'SUCCEEDED':
      return 'Completed';
    case 'FAILED':
      return 'Failed';
    case 'RUNNING':
      return 'Running';
    case 'PENDING':
      return 'Pending';
    case 'CANCELLING':
      return 'Cancelling';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return state;
  }
}

/** Formats a runtime string with duration and local start time (e.g. "11s (started 2026-07-22 10:49:00 +0200)"). */
export function formatRuntimeLine(op: Operation): string {
  const startIso = op.metadata?.startTime;
  if (!startIso) {
    return '';
  }
  const endIso = op.metadata?.endTime || new Date().toISOString();
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) {
    return '';
  }

  const secs = Math.floor(ms / 1000);
  let duration: string;
  if (secs < 60) {
    duration = `${secs}s`;
  } else {
    const mins = Math.floor(secs / 60);
    if (mins < 60) {
      duration = `${mins}m`;
    } else {
      duration = `${Math.floor(mins / 60)}h${mins % 60}m`;
    }
  }

  const d = new Date(startIso);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const oh = Math.floor(Math.abs(offset) / 60)
    .toString()
    .padStart(2, '0');
  const om = (Math.abs(offset) % 60).toString().padStart(2, '0');
  const pad = (n: number) => n.toString().padStart(2, '0');
  const started =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${sign}${oh}${om}`;

  return `${duration} (started ${started})`;
}
