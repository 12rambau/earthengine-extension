/**
 * @module gcsClient
 * Google Cloud Storage JSON API client used to stage local files.
 *
 * Earth Engine ingestion only reads from Cloud Storage, so uploading a local
 * COG or Shapefile is a two step process: push the bytes to a bucket the user
 * owns, then point an ingestion manifest at the resulting `gs://` URI. This
 * module covers the first step plus the lifecycle rule that expires staged
 * objects without any client-side bookkeeping.
 *
 * The OAuth scopes requested in `auth/oauth.ts` already include
 * `devstorage.full_control`, so the profile's access token is sufficient.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getRequest, httpRequest, httpRequestRaw } from './httpClient.js';

// ==================================================================
// CONSTANTS
// ==================================================================
const GCS_API = 'https://storage.googleapis.com/storage/v1';
const GCS_UPLOAD_API = 'https://storage.googleapis.com/upload/storage/v1';

/** Resumable upload chunk size. Must be a multiple of 256 KiB. */
const CHUNK_SIZE = 8 * 1024 * 1024;

/** Status returned by a resumable session that expects more chunks. */
const RESUME_INCOMPLETE = 308;

// ==================================================================
// INTERFACES
// ==================================================================
/** A single object listed under a bucket prefix. */
export interface GcsObject {
  name: string;
  size: number;
  updated: string;
}

/** One rule of a bucket's object lifecycle configuration. */
interface LifecycleRule {
  action?: { type?: string };
  condition?: { age?: number; matchesPrefix?: string[] };
}

// ==================================================================
// BUCKETS
// ==================================================================
/** Lists the Cloud Storage buckets readable by the token in a project. */
export async function listBuckets(project: string, accessToken: string): Promise<string[]> {
  const buckets: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ project, fields: 'items(name),nextPageToken' });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    const response = await getRequest(`${GCS_API}/b?${params.toString()}`, accessToken);
    const page = JSON.parse(response) as { items?: { name: string }[]; nextPageToken?: string };
    buckets.push(...(page.items ?? []).map((item) => item.name));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return buckets.sort((left, right) => left.localeCompare(right));
}

/**
 * Adds a "delete after N days" lifecycle rule scoped to the staging prefix,
 * unless an equivalent rule already exists.
 *
 * This is what keeps the staging area clean: expiry is evaluated server-side,
 * so it still happens when VS Code is closed while an ingestion is running.
 *
 * @returns `true` when a rule was added, `false` when one was already present.
 */
export async function ensureLifecycleRule(
  bucket: string,
  prefix: string,
  ageDays: number,
  accessToken: string,
): Promise<boolean> {
  const response = await getRequest(
    `${GCS_API}/b/${encodeURIComponent(bucket)}?fields=lifecycle`,
    accessToken,
  );
  const rules = (JSON.parse(response) as { lifecycle?: { rule?: LifecycleRule[] } }).lifecycle
    ?.rule ?? [];

  const covered = rules.some(
    (rule) =>
      rule.action?.type === 'Delete' &&
      typeof rule.condition?.age === 'number' &&
      (rule.condition.matchesPrefix ?? []).some((candidate) => prefix.startsWith(candidate)),
  );
  if (covered) {
    return false;
  }

  const merged: LifecycleRule[] = [
    ...rules,
    { action: { type: 'Delete' }, condition: { age: ageDays, matchesPrefix: [prefix] } },
  ];
  await httpRequest(
    `${GCS_API}/b/${encodeURIComponent(bucket)}`,
    'PATCH',
    accessToken,
    JSON.stringify({ lifecycle: { rule: merged } }),
  );
  return true;
}

// ==================================================================
// OBJECTS
// ==================================================================
/** Lists every object under a prefix. */
export async function listObjects(
  bucket: string,
  prefix: string,
  accessToken: string,
): Promise<GcsObject[]> {
  const objects: GcsObject[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      prefix,
      fields: 'items(name,size,updated),nextPageToken',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    const response = await getRequest(
      `${GCS_API}/b/${encodeURIComponent(bucket)}/o?${params.toString()}`,
      accessToken,
    );
    const page = JSON.parse(response) as {
      items?: { name: string; size?: string; updated?: string }[];
      nextPageToken?: string;
    };
    for (const item of page.items ?? []) {
      objects.push({
        name: item.name,
        size: Number(item.size ?? 0),
        updated: item.updated ?? '',
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return objects;
}

/** Deletes an object, treating "already gone" as success. */
export async function deleteObject(
  bucket: string,
  objectName: string,
  accessToken: string,
): Promise<void> {
  const url = `${GCS_API}/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
  const response = await httpRequestRaw(url, 'DELETE', {
    Authorization: `Bearer ${accessToken}`,
  });
  if (response.status >= 400 && response.status !== 404) {
    throw new Error(`HTTP ${response.status}: ${response.body}`);
  }
}

/**
 * Uploads a local file with a resumable session and returns its `gs://` URI.
 *
 * Chunked rather than single-shot so multi-gigabyte COGs never land in memory
 * and progress can be reported while the transfer runs.
 */
export async function uploadFile(
  bucket: string,
  objectName: string,
  filePath: string,
  accessToken: string,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void,
): Promise<string> {
  const totalBytes = (await fs.promises.stat(filePath)).size;
  const params = new URLSearchParams({ uploadType: 'resumable', name: objectName });
  const session = await httpRequestRaw(
    `${GCS_UPLOAD_API}/b/${encodeURIComponent(bucket)}/o?${params.toString()}`,
    'POST',
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': totalBytes,
      'X-Upload-Content-Type': contentTypeFor(filePath),
    },
    JSON.stringify({ contentType: contentTypeFor(filePath) }),
  );
  if (session.status >= 400) {
    throw new Error(`Could not start upload of ${path.basename(filePath)}: ${session.body}`);
  }
  const location = session.headers.location;
  const sessionUri = Array.isArray(location) ? location[0] : location;
  if (!sessionUri) {
    throw new Error('Cloud Storage did not return a resumable session URI.');
  }

  // A zero byte file has no chunk to send; finalize with an empty range.
  if (totalBytes === 0) {
    const empty = await httpRequestRaw(sessionUri, 'PUT', { 'Content-Range': 'bytes */0' });
    if (empty.status >= 400) {
      throw new Error(`Upload of ${path.basename(filePath)} failed: ${empty.body}`);
    }
    onProgress?.(0, 0);
    return `gs://${bucket}/${objectName}`;
  }

  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
    let offset = 0;
    while (offset < totalBytes) {
      const { bytesRead } = await handle.read(buffer, 0, CHUNK_SIZE, offset);
      const chunk = buffer.subarray(0, bytesRead);
      const last = offset + bytesRead;
      const response = await httpRequestRaw(sessionUri, 'PUT', {
        'Content-Length': bytesRead,
        'Content-Range': `bytes ${offset}-${last - 1}/${totalBytes}`,
      }, chunk);

      if (response.status !== RESUME_INCOMPLETE && response.status >= 400) {
        throw new Error(`Upload of ${path.basename(filePath)} failed: ${response.body}`);
      }
      offset = last;
      onProgress?.(offset, totalBytes);
    }
  } finally {
    await handle.close();
  }

  return `gs://${bucket}/${objectName}`;
}

// ==================================================================
// HELPERS
// ==================================================================
/** Maps the extensions we stage to a sensible content type. */
function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.tif':
    case '.tiff':
      return 'image/tiff';
    case '.prj':
    case '.cpg':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}
