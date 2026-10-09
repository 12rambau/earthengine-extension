/**
 * @module assetUpload
 * Stages local files in Cloud Storage and submits Earth Engine ingestion.
 *
 * Earth Engine never reads from the local filesystem: a new IMAGE or TABLE
 * asset is always created by pointing an ingestion manifest at `gs://` URIs.
 * This module performs that round trip for the two default formats — a single
 * Cloud Optimized GeoTIFF for images, a complete Shapefile for tables. Any
 * other vector format is rewritten as a Shapefile first (see
 * `vectorToShapefile`), because ingestion does not read them.
 *
 * Staged objects cannot be deleted as soon as the operation is submitted:
 * ingestion reads them asynchronously, minutes to hours later. Cleanup is
 * therefore handled two ways, in order of reliability:
 *
 * 1. A bucket lifecycle rule scoped to the staging prefix expires objects
 *    server-side, so it works even if VS Code is closed mid-ingestion.
 * 2. An opportunistic sweep deletes objects whose recorded operation has
 *    reached a terminal state, which reclaims space long before the rule.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { AuthService } from '../../auth/index.js';
import { startImageIngestion, startTableIngestion } from '../../sidebar/assets/eeApiClient.js';
import { getOperation } from '../../sidebar/tasks/tasksApiClient.js';
import {
  deleteObject,
  ensureLifecycleRule,
  listObjects,
  uploadFile,
} from '../../shared/gcsClient.js';
import { convertToShapefile, isConvertibleVectorPath } from './vectorToShapefile.js';
import { convertRasterToCog } from './rasterToCog.js';

// ==================================================================
// CONSTANTS
// ==================================================================
const STAGING_KEY = 'earthengine.assets.staging.pending';

/** Sidecars uploaded alongside a `.shp`; the first three are mandatory. */
const SHAPEFILE_SIDECARS = ['.dbf', '.shx', '.prj', '.cpg', '.sbn', '.sbx', '.fix', '.qix'];
const SHAPEFILE_REQUIRED = ['.dbf', '.shx'];

/** Records older than this are dropped even if their operation never resolved. */
const RECORD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// ==================================================================
// INTERFACES
// ==================================================================
/** A user supplied metadata property attached to the new asset. */
export interface AssetProperty {
  key: string;
  value: string;
}

/** Everything the New Asset dialog collects for one upload. */
export interface NewAssetRequest {
  kind: 'image' | 'table';
  /** Fully qualified destination, e.g. `projects/p/assets/folder/name`. */
  assetId: string;
  /** Absolute path of the main file (`.tif` for images, `.shp` or any OGR vector for tables). */
  filePath: string;
  bucket: string;
  bandNames: string[];
  pyramidingPolicy: string;
  description: string;
  startTime: string;
  endTime: string;
  properties: AssetProperty[];
}

/**
 * A staged object awaiting cleanup. `operation` is absent for records created
 * after a failed upload/ingestion, which are safe to delete right away.
 */
interface StagedRecord {
  bucket: string;
  objects: string[];
  operation?: string;
  createdAt: number;
}

/** The files to stage, plus the scratch directory to remove once they are. */
interface PreparedSource {
  files: { path: string; size: number }[];
  /** Set when GDAL generated a temporary raster or Shapefile. */
  temporaryDirectory?: string;
}

/** Progress reporter shared with the VS Code notification. */
export type UploadProgress = (message: string, increment?: number) => void;

// ==================================================================
// PUBLIC API
// ==================================================================
/**
 * Stages the request's files, submits the ingestion manifest and records the
 * staged objects so a later sweep can delete them.
 *
 * @returns The long running operation name tracked by the Tasks panel.
 */
export async function uploadNewAsset(
  request: NewAssetRequest,
  authService: AuthService,
  context: vscode.ExtensionContext,
  onProgress: UploadProgress,
): Promise<string> {
  const profile = authService.currentProfile;
  if (!profile) {
    throw new Error('Not authenticated.');
  }

  const source = await resolveSourceFiles(request, onProgress);
  const files = source.files;
  const prefix = stagingPrefix();
  const folder = `${prefix}${Date.now()}-${path.basename(request.assetId)}/`;

  const uris: string[] = [];
  const stagedObjects: string[] = [];
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  let uploadedBytes = 0;
  let operation: string;
  let token = '';

  try {
    onProgress(`Staging ${files.length} file(s) to gs://${request.bucket}/${prefix}`);
    token = await requireToken(authService);
    await applyLifecycleRule(request.bucket, prefix, token);
    for (const file of files) {
      const objectName = `${folder}${path.basename(file.path)}`;
      // Refreshed per file: a multi-gigabyte upload can outlive one token.
      token = await requireToken(authService);
      const uri = await uploadFile(request.bucket, objectName, file.path, token, (sent, total) => {
        const done = uploadedBytes + sent;
        onProgress(
          `Uploading ${path.basename(file.path)} — ${formatBytes(done)} / ${formatBytes(totalBytes || total)}`,
        );
      });
      uploadedBytes += file.size;
      stagedObjects.push(objectName);
      uris.push(uri);
    }

    onProgress('Submitting ingestion…');
    const manifest = buildManifest(request, uris);
    token = await requireToken(authService);
    operation =
      request.kind === 'image'
        ? await startImageIngestion(profile.project, manifest, token)
        : await startTableIngestion(profile.project, manifest, token);
  } catch (err) {
    await cleanupAfterFailure(request.bucket, stagedObjects, token, context);
    throw err;
  } finally {
    await discardTemporaryFiles(source.temporaryDirectory);
  }

  try {
    await recordStaged(context, {
      bucket: request.bucket,
      objects: stagedObjects,
      operation,
      createdAt: Date.now(),
    });
  } catch {
    vscode.window.showWarningMessage(
      'Ingestion was submitted, but its staged files could not be added to automatic cleanup tracking. The bucket lifecycle rule will still apply.',
    );
  }

  return operation;
}

/** Deletes objects staged by a failed upload/ingestion, falling back to a retryable record. */
async function cleanupAfterFailure(
  bucket: string,
  objects: string[],
  token: string,
  context: vscode.ExtensionContext,
): Promise<void> {
  if (objects.length === 0) {
    return;
  }
  const failed: string[] = [];
  for (const objectName of objects) {
    try {
      await deleteObject(bucket, objectName, token);
    } catch {
      failed.push(objectName);
    }
  }
  if (failed.length === 0) {
    return;
  }
  try {
    // No operation to poll: the next sweep deletes these unconditionally.
    await recordStaged(context, { bucket, objects: failed, createdAt: Date.now() });
  } catch {
    // Best effort only; the bucket lifecycle rule is the final backstop.
  }
}

/**
 * Deletes staged objects whose ingestion operation has finished.
 *
 * Safe to call at any time: objects belonging to a still running operation are
 * left untouched, because Earth Engine would fail to read them.
 *
 * @returns The number of objects deleted.
 */
export async function sweepStagedObjects(
  authService: AuthService,
  context: vscode.ExtensionContext,
): Promise<number> {
  const records = context.globalState.get<StagedRecord[]>(STAGING_KEY) ?? [];
  if (records.length === 0) {
    return 0;
  }
  const token = await authService.getToken();
  if (!token) {
    return 0;
  }

  const remaining: StagedRecord[] = [];
  let deleted = 0;

  for (const record of records) {
    const expired = Date.now() - record.createdAt > RECORD_MAX_AGE_MS;
    // Records without an operation came from a failed upload/ingestion and are
    // safe to delete unconditionally.
    let finished = expired || !record.operation;
    if (!finished) {
      try {
        finished = (await getOperation(record.operation!, token)).done === true;
      } catch {
        // Transient lookup failure: keep the record so the next sweep retries.
        remaining.push(record);
        continue;
      }
    }
    if (!finished) {
      remaining.push(record);
      continue;
    }
    for (const objectName of record.objects) {
      try {
        await deleteObject(record.bucket, objectName, token);
        deleted++;
      } catch {
        // Keep the record so the next sweep retries.
        remaining.push(record);
        break;
      }
    }
  }

  await context.globalState.update(STAGING_KEY, remaining);
  return deleted;
}

/**
 * Deletes every object under the staging prefix of a bucket, regardless of
 * operation state. Intended for the explicit "clean staging area" command.
 *
 * @returns The number of objects deleted.
 */
export async function purgeStagingPrefix(
  bucket: string,
  authService: AuthService,
  context: vscode.ExtensionContext,
): Promise<number> {
  const token = await requireToken(authService);
  const prefix = stagingPrefix();
  const objects = await listObjects(bucket, prefix, token);
  for (const object of objects) {
    await deleteObject(bucket, object.name, token);
  }
  const records = context.globalState.get<StagedRecord[]>(STAGING_KEY) ?? [];
  await context.globalState.update(
    STAGING_KEY,
    records.filter((record) => record.bucket !== bucket),
  );
  return objects.length;
}

/** The configured staging prefix, always normalised to end with a slash. */
export function stagingPrefix(): string {
  const configured = vscode.workspace
    .getConfiguration('earthengine.assets.staging')
    .get<string>('prefix', 'earthengine-staging/');
  const trimmed = configured.replace(/^\/+/, '').trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

// ==================================================================
// MANIFESTS
// ==================================================================
/** Builds the image or table ingestion manifest for a staged request. */
export function buildManifest(request: NewAssetRequest, uris: string[]): Record<string, unknown> {
  const manifest: Record<string, unknown> = { name: request.assetId };

  const properties = buildProperties(request);
  if (Object.keys(properties).length > 0) {
    manifest.properties = properties;
  }
  if (request.startTime) {
    manifest.startTime = request.startTime;
  }
  if (request.endTime) {
    manifest.endTime = request.endTime;
  }

  if (request.kind === 'table') {
    // TableSource accepts exactly one URI; sidecars are inferred by Earth
    // Engine from files next to it (same bucket prefix and base name).
    manifest.sources = [{ uris: [uris[0]] }];
    return manifest;
  }

  manifest.tilesets = [{ sources: [{ uris: [uris[0]] }] }];
  if (request.pyramidingPolicy) {
    manifest.pyramidingPolicy = request.pyramidingPolicy;
  }
  if (request.bandNames.length > 0) {
    manifest.bands = request.bandNames.map((id, index) => ({ id, tilesetBandIndex: index }));
  }
  return manifest;
}

// ==================================================================
// HELPERS
// ==================================================================
/** Collects the files to stage, converting vectors and validating Shapefile completeness. */
async function resolveSourceFiles(
  request: NewAssetRequest,
  onProgress: UploadProgress,
): Promise<PreparedSource> {
  const stat = async (file: string) => ({ path: file, size: (await fs.promises.stat(file)).size });

  if (request.kind === 'image') {
    onProgress(`Converting ${path.basename(request.filePath)} to a Cloud Optimized GeoTIFF…`);
    const converted = await convertRasterToCog(request.filePath);
    if (request.bandNames.length > converted.bandCount) {
      await discardTemporaryFiles(converted.directory);
      throw new Error(
        `The source has ${converted.bandCount} band(s), but ${request.bandNames.length} names were supplied.`,
      );
    }
    try {
      return {
        files: [await stat(converted.cogPath)],
        temporaryDirectory: converted.directory,
      };
    } catch (error) {
      await discardTemporaryFiles(converted.directory);
      throw error;
    }
  }

  let mainFile = request.filePath;
  let temporaryDirectory: string | undefined;
  if (isConvertibleVectorPath(mainFile)) {
    onProgress(`Converting ${path.basename(mainFile)} to a Shapefile…`);
    const converted = await convertToShapefile(mainFile, pickLayer);
    mainFile = converted.shpPath;
    temporaryDirectory = converted.directory;
    if (converted.renamedFields.length > 0) {
      vscode.window.showInformationMessage(
        'Shapefile columns are limited to 10 characters, so some properties were renamed: ' +
          converted.renamedFields.map(({ source, column }) => `${source} → ${column}`).join(', '),
      );
    }
  }

  const base = mainFile.replace(/\.shp$/i, '');
  const missing = SHAPEFILE_REQUIRED.filter((extension) => !fs.existsSync(base + extension));
  if (missing.length > 0) {
    throw new Error(
      `Incomplete Shapefile: ${missing.join(', ')} missing next to ${path.basename(mainFile)}.`,
    );
  }
  const present = SHAPEFILE_SIDECARS.map((extension) => base + extension).filter((file) =>
    fs.existsSync(file),
  );
  return {
    files: await Promise.all([mainFile, ...present].map(stat)),
    temporaryDirectory,
  };
}

/** Prompts for the single layer to ingest when a source holds several. */
async function pickLayer(layers: string[]): Promise<string | undefined> {
  return vscode.window.showQuickPick(layers, {
    title: 'Select the layer to ingest',
    placeHolder: 'A Shapefile holds a single layer',
    ignoreFocusOut: true,
  });
}

/** Removes the scratch directory of a converted Shapefile, if there was one. */
async function discardTemporaryFiles(directory: string | undefined): Promise<void> {
  if (!directory) {
    return;
  }
  try {
    await fs.promises.rm(directory, { recursive: true, force: true });
  } catch {
    // The OS temp directory is swept anyway; a leftover is harmless.
  }
}

/** Merges description and user properties into the manifest property bag. */
function buildProperties(request: NewAssetRequest): Record<string, string | number> {
  const properties: Record<string, string | number> = {};
  if (request.description.trim()) {
    properties.description = request.description.trim();
  }
  for (const { key, value } of request.properties) {
    const name = key.trim();
    if (!name) {
      continue;
    }
    const numeric = Number(value);
    properties[name] = value.trim() !== '' && Number.isFinite(numeric) ? numeric : value;
  }
  return properties;
}

/** Installs the staging lifecycle rule, downgrading a denial to a warning. */
async function applyLifecycleRule(
  bucket: string,
  prefix: string,
  accessToken: string,
): Promise<void> {
  const days = vscode.workspace
    .getConfiguration('earthengine.assets.staging')
    .get<number>('retentionDays', 7);
  if (days <= 0) {
    return;
  }
  try {
    if (await ensureLifecycleRule(bucket, prefix, days, accessToken)) {
      vscode.window.showInformationMessage(
        `Staged files under gs://${bucket}/${prefix} will be deleted automatically after ${days} days.`,
      );
    }
  } catch {
    vscode.window.showWarningMessage(
      `Could not set an expiry rule on gs://${bucket}. Staged files will be removed once ingestion completes, ` +
        'but you may want to clean the bucket manually.',
    );
  }
}

/** Appends a staged record to global state. */
async function recordStaged(context: vscode.ExtensionContext, record: StagedRecord): Promise<void> {
  const records = context.globalState.get<StagedRecord[]>(STAGING_KEY) ?? [];
  await context.globalState.update(STAGING_KEY, [...records, record]);
}

/** Fetches a fresh access token or throws. */
async function requireToken(authService: AuthService): Promise<string> {
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Not authenticated.');
  }
  return token;
}

/** Formats a byte count for the progress notification. */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
