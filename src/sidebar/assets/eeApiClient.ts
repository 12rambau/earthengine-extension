/**
 * @module eeApiClient
 * Earth Engine REST API client for asset operations.
 *
 * Wraps the Earth Engine v1 REST API to list, get, and inspect assets
 * (images, tables, image collections, folders) and their features, and to
 * submit ingestion jobs for files staged in Cloud Storage.
 */

import { randomUUID } from 'crypto';
import { getRequest, httpRequest } from '../../shared/httpClient.js';

// ==================================================================
// CONSTANTS
// ==================================================================
const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

// ==================================================================
// INTERFACES
// ==================================================================
/** Metadata for an Earth Engine asset (image, table, folder, etc.). */
export interface EEAsset {
  name: string;
  type: string;
  id?: string;
  title?: string;
  description?: string;
  updateTime?: string;
  startTime?: string;
  endTime?: string;
  sizeBytes?: string;
  featureCount?: string;
  properties?: Record<string, unknown>;
  bands?: EEBand[];
  geometry?: unknown;
}

/** Band metadata within an Earth Engine image asset. */
export interface EEBand {
  id: string;
  dataType?: { precision?: string; range?: { min?: number; max?: number } };
  grid?: {
    dimensions?: { width?: number; height?: number };
    affineTransform?: { scaleX?: number; scaleY?: number };
    crsCode?: string;
  };
  pyramidingPolicy?: string;
}

/** Paginated response from the listAssets endpoint. */
export interface ListAssetsResponse {
  assets?: EEAsset[];
  nextPageToken?: string;
}

/** Paginated response from the listFeatures endpoint (for TABLE assets). */
export interface ListFeaturesResponse {
  features?: { type: string; geometry?: unknown; properties?: Record<string, unknown> }[];
  nextPageToken?: string;
}

/** IAM policy returned for an asset; bindings outside the editable roles are retained. */
export interface AssetIamPolicy {
  bindings?: { role: string; members?: string[]; condition?: unknown }[];
  etag?: string;
  version?: number;
}

/** Sharing changes submitted by an asset preview. */
export interface AssetSharingChanges {
  etag: string;
  publicRead: boolean;
  users: { email: string; role: 'reader' | 'writer' }[];
}

// ==================================================================
// API FUNCTIONS
// ==================================================================
/** Reads the IAM policy for any Earth Engine asset. */
export async function getAssetIamPolicy(name: string, accessToken: string): Promise<AssetIamPolicy> {
  const response = await httpRequest(
    `${EE_API_BASE}/${name}:getIamPolicy`,
    'POST',
    accessToken,
    JSON.stringify({ options: { requestedPolicyVersion: 3 } }),
  );
  return JSON.parse(response) as AssetIamPolicy;
}

/** Sets the complete policy on an asset, using the destination's etag after a rename. */
export async function setAssetIamPolicy(
  name: string,
  accessToken: string,
  policy: AssetIamPolicy,
): Promise<void> {
  await httpRequest(
    `${EE_API_BASE}/${name}:setIamPolicy`,
    'POST',
    accessToken,
    JSON.stringify({ policy }),
  );
}

/** Replaces only the editable user and public bindings, retaining every other grant. */
export function applyAssetSharing(
  policy: AssetIamPolicy,
  changes: AssetSharingChanges,
): AssetIamPolicy {
  if (typeof changes.publicRead !== 'boolean' || !Array.isArray(changes.users)) {
    throw new Error('Invalid sharing settings.');
  }
  const seen = new Set<string>();
  for (const user of changes.users) {
    if (
      !user ||
      typeof user.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
      (user.role !== 'reader' && user.role !== 'writer') ||
      seen.has(user.email.toLowerCase())
    ) {
      throw new Error('Enter unique, valid email addresses and access levels.');
    }
    seen.add(user.email.toLowerCase());
  }
  if (changes.etag !== (policy.etag ?? '')) {
    throw new Error('Sharing changed elsewhere. Reopen the preview before saving.');
  }

  const bindings = (policy.bindings ?? []).map((binding) => ({
    ...binding,
    members: [...(binding.members ?? [])],
  }));
  for (const binding of bindings) {
    if (!binding.condition && (binding.role === 'roles/viewer' || binding.role === 'roles/editor')) {
      binding.members = binding.members.filter(
        (member) => !member.startsWith('user:') && member !== 'allUsers',
      );
    }
  }
  const add = (role: string, member: string) => {
    let binding = bindings.find((item) => item.role === role && !item.condition);
    if (!binding) {
      binding = { role, members: [] };
      bindings.push(binding);
    }
    if (!binding.members.includes(member)) {
      binding.members.push(member);
    }
  };
  if (changes.publicRead) {
    add('roles/viewer', 'allUsers');
  }
  for (const user of changes.users) {
    add(user.role === 'writer' ? 'roles/editor' : 'roles/viewer', `user:${user.email}`);
  }
  return {
    ...policy,
    bindings: bindings.filter(
      (binding) =>
        binding.members.length > 0 ||
        !!binding.condition ||
        (binding.role !== 'roles/viewer' && binding.role !== 'roles/editor'),
    ),
  };
}

/** Carries a renamed asset's direct grants into its replacement policy. */
export function mergeAssetIamPolicies(
  destination: AssetIamPolicy,
  source: AssetIamPolicy,
): AssetIamPolicy {
  const bindings = (destination.bindings ?? []).map((binding) => ({
    ...binding,
    members: [...(binding.members ?? [])],
  }));
  for (const sourceBinding of source.bindings ?? []) {
    const binding = bindings.find(
      (item) =>
        item.role === sourceBinding.role &&
        JSON.stringify(item.condition) === JSON.stringify(sourceBinding.condition),
    );
    if (binding) {
      binding.members = [...new Set([...binding.members, ...(sourceBinding.members ?? [])])];
    } else {
      bindings.push({ ...sourceBinding, members: [...(sourceBinding.members ?? [])] });
    }
  }
  return {
    ...source,
    ...destination,
    version: Math.max(source.version ?? 1, destination.version ?? 1),
    bindings,
  };
}

/** Saves sharing with an etag check, preserving grants the preview cannot edit. */
export async function saveAssetSharing(
  name: string,
  accessToken: string,
  changes: AssetSharingChanges,
): Promise<void> {
  const policy = await getAssetIamPolicy(name, accessToken);
  const updated = applyAssetSharing(policy, changes);
  await setAssetIamPolicy(name, accessToken, updated);
}

/** Lists child assets of a parent path with pagination support. */
export async function listAssets(
  parent: string,
  accessToken: string,
  pageSize = 100,
  pageToken?: string,
): Promise<ListAssetsResponse> {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const url = `${EE_API_BASE}/${parent}:listAssets?${params.toString()}`;
  const response = await getRequest(url, accessToken);
  return JSON.parse(response) as ListAssetsResponse;
}

/** Lists all child assets by automatically following all page tokens. */
export async function listAllAssets(parent: string, accessToken: string): Promise<EEAsset[]> {
  const all: EEAsset[] = [];
  let pageToken: string | undefined;

  do {
    const response = await listAssets(parent, accessToken, 200, pageToken);
    if (response.assets) {
      all.push(...response.assets);
    }
    pageToken = response.nextPageToken;
  } while (pageToken);

  return all;
}

/** Fetches full metadata for a single asset by name. */
export async function getAsset(name: string, accessToken: string): Promise<EEAsset> {
  const url = `${EE_API_BASE}/${name}`;
  const response = await getRequest(url, accessToken);
  return JSON.parse(response) as EEAsset;
}

/** Updates only the editable metadata fields, preserving all other asset properties. */
export async function updateAssetMetadata(
  name: string,
  accessToken: string,
  changes: {
    startTime: string | null;
    endTime: string | null;
    description: string;
    properties: Record<string, unknown>;
  },
): Promise<EEAsset> {
  const asset = await getAsset(name, accessToken);
  const body = assetMetadataPatch(asset, changes);
  const response = await httpRequest(
    `${EE_API_BASE}/${name}`,
    'PATCH',
    accessToken,
    JSON.stringify(body),
  );
  return JSON.parse(response) as EEAsset;
}

/** Builds the projects.assets.patch request body (UpdateAssetRequest). */
export function assetMetadataPatch(
  asset: Pick<EEAsset, 'startTime' | 'endTime' | 'properties'>,
  changes: {
    startTime: string | null;
    endTime: string | null;
    description: string;
    properties: Record<string, unknown>;
  },
) {
  const previous = asset.properties ?? {};
  const desired: Record<string, unknown> = Object.fromEntries(
    Object.entries(changes.properties).filter(
      ([key, value]) => key.trim() && (typeof value !== 'string' || value.trim()),
    ),
  );
  if (changes.description) {
    desired['description'] = changes.description;
  }
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(desired)])].filter(
    (key) =>
      !key.startsWith('system:') && JSON.stringify(previous[key]) !== JSON.stringify(desired[key]),
  );
  const properties = Object.fromEntries(
    keys
      .filter((key) => Object.prototype.hasOwnProperty.call(desired, key))
      .map((key) => [key, desired[key]]),
  );
  const startTime = asset.startTime ? new Date(asset.startTime).toISOString() : null;
  const endTime = asset.endTime ? new Date(asset.endTime).toISOString() : null;
  const updateMask = [
    ...(startTime === changes.startTime ? [] : ['startTime']),
    ...(endTime === changes.endTime ? [] : ['endTime']),
    ...keys.map((key) => `properties.${key}`),
  ];
  return {
    asset: {
      ...(startTime === changes.startTime ? {} : { startTime: changes.startTime }),
      ...(endTime === changes.endTime ? {} : { endTime: changes.endTime }),
      properties,
    },
    updateMask: updateMask.join(','),
  };
}

/** Lists features (rows) of a TABLE asset with pagination. */
export async function listFeatures(
  asset: string,
  accessToken: string,
  pageSize = 1,
): Promise<ListFeaturesResponse> {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  const url = `${EE_API_BASE}/${asset}:listFeatures?${params.toString()}`;
  const response = await getRequest(url, accessToken);
  return JSON.parse(response) as ListFeaturesResponse;
}

/**
 * Deletes an asset by name.
 * Containers (folders, image collections) are deleted recursively.
 */
export async function deleteAsset(
  name: string,
  accessToken: string,
  onProgress?: (assetName: string) => void,
): Promise<void> {
  const asset = await getAsset(name, accessToken);
  if (CONTAINER_TYPES.has(asset.type)) {
    await deleteContainerRecursive(name, accessToken, onProgress);
  } else {
    await deleteLeaf(name, accessToken, onProgress);
  }
}

/** Deletes a single (non-container) asset. */
async function deleteLeaf(
  name: string,
  accessToken: string,
  onProgress?: (assetName: string) => void,
): Promise<void> {
  onProgress?.(name);
  const url = `${EE_API_BASE}/${name}`;
  await httpRequest(url, 'DELETE', accessToken);
}

// ==================================================================
// CONTAINER HELPERS
// ==================================================================
const CONTAINER_TYPES = new Set(['FOLDER', 'IMAGE_COLLECTION']);

/** POSTs a create-asset request to the EE REST API. */
async function postCreateAsset(
  projectRoot: string,
  assetId: string,
  type: 'FOLDER' | 'IMAGE_COLLECTION',
  accessToken: string,
): Promise<EEAsset> {
  const params = new URLSearchParams({ assetId });
  const url = `${EE_API_BASE}/${projectRoot}/assets?${params.toString()}`;
  const body = JSON.stringify({ type });
  const response = await httpRequest(url, 'POST', accessToken, body);
  return JSON.parse(response) as EEAsset;
}

/** Creates a container (FOLDER or IMAGE_COLLECTION) at the given full path. */
async function createContainerByPath(
  fullPath: string,
  type: 'FOLDER' | 'IMAGE_COLLECTION',
  accessToken: string,
): Promise<EEAsset> {
  const parts = fullPath.split('/');
  return postCreateAsset(parts.slice(0, 2).join('/'), parts.slice(3).join('/'), type, accessToken);
}

/** Copies properties and system times from a source asset to a destination. */
async function copyContainerProperties(
  source: EEAsset,
  destinationName: string,
  accessToken: string,
): Promise<void> {
  const updateFields: string[] = [];
  const body: Record<string, unknown> = {};

  if (source.title) {
    updateFields.push('title');
    body.title = source.title;
  }
  if (source.description) {
    updateFields.push('description');
    body.description = source.description;
  }
  if (source.properties && Object.keys(source.properties).length > 0) {
    updateFields.push('properties');
    body.properties = source.properties;
  }
  if (source.startTime) {
    updateFields.push('startTime');
    body.startTime = source.startTime;
  }
  if (source.endTime) {
    updateFields.push('endTime');
    body.endTime = source.endTime;
  }
  if (updateFields.length === 0) {
    return;
  }

  const params = new URLSearchParams({ updateMask: updateFields.join(',') });
  const url = `${EE_API_BASE}/${destinationName}?${params.toString()}`;
  await httpRequest(url, 'PATCH', accessToken, JSON.stringify(body));
}

/** Recursively deletes a container and all its children (deepest first). */
async function deleteContainerRecursive(
  name: string,
  accessToken: string,
  onProgress?: (assetName: string) => void,
): Promise<void> {
  const children = await listAllAssets(name, accessToken);
  for (const child of children) {
    if (CONTAINER_TYPES.has(child.type)) {
      await deleteContainerRecursive(child.name, accessToken, onProgress);
    } else {
      await deleteLeaf(child.name, accessToken, onProgress);
    }
  }
  await deleteLeaf(name, accessToken, onProgress);
}

/** Internal recursive copy implementation; caller is responsible for fetching the asset. */
async function copyAssetImpl(
  asset: EEAsset,
  destinationName: string,
  accessToken: string,
  onProgress?: (assetName: string) => void,
): Promise<EEAsset> {
  onProgress?.(asset.name);
  if (!CONTAINER_TYPES.has(asset.type)) {
    const url = `${EE_API_BASE}/${asset.name}:copy`;
    const body = JSON.stringify({ destinationName });
    const response = await httpRequest(url, 'POST', accessToken, body);
    return JSON.parse(response) as EEAsset;
  }

  const created = await createContainerByPath(
    destinationName,
    asset.type as 'FOLDER' | 'IMAGE_COLLECTION',
    accessToken,
  );

  if (asset.type === 'IMAGE_COLLECTION') {
    await copyContainerProperties(asset, destinationName, accessToken);
  }

  const children = await listAllAssets(asset.name, accessToken);
  for (const child of children) {
    const relativeSuffix = child.name.substring(asset.name.length);
    // IMAGE_COLLECTION children need properties; listAllAssets doesn't return them
    const childAsset =
      child.type === 'IMAGE_COLLECTION' ? await getAsset(child.name, accessToken) : child;
    await copyAssetImpl(childAsset, destinationName + relativeSuffix, accessToken, onProgress);
  }

  return created;
}

// ==================================================================
// MUTATING OPERATIONS
// ==================================================================
/**
 * Moves (renames) an asset to a new location.
 * Leaf assets use the :move endpoint; containers are copied recursively
 * then the source is deleted (the API does not support moving containers).
 */
export async function moveAsset(
  sourceName: string,
  destinationName: string,
  accessToken: string,
  onProgress?: (assetName: string) => void,
): Promise<EEAsset> {
  if (destinationName === sourceName || destinationName.startsWith(sourceName + '/')) {
    throw new Error(`Cannot move "${sourceName}" into itself or a descendant.`);
  }

  const asset = await getAsset(sourceName, accessToken);

  if (!CONTAINER_TYPES.has(asset.type)) {
    onProgress?.(sourceName);
    const url = `${EE_API_BASE}/${sourceName}:move`;
    const body = JSON.stringify({ destinationName });
    const response = await httpRequest(url, 'POST', accessToken, body);
    return JSON.parse(response) as EEAsset;
  }

  const result = await copyAssetImpl(asset, destinationName, accessToken, onProgress);
  await deleteContainerRecursive(sourceName, accessToken, onProgress);
  return result;
}

/**
 * Copies an asset to a new location.
 * Leaf assets use the :copy endpoint; containers (folders, image collections)
 * are created at the destination and their children copied recursively —
 * matching the geetools `ee.Asset.copy` behaviour.
 */
export async function copyAsset(
  sourceName: string,
  destinationName: string,
  accessToken: string,
  onProgress?: (assetName: string) => void,
): Promise<EEAsset> {
  if (destinationName === sourceName || destinationName.startsWith(sourceName + '/')) {
    throw new Error(`Cannot copy "${sourceName}" into itself or a descendant.`);
  }
  const asset = await getAsset(sourceName, accessToken);
  return copyAssetImpl(asset, destinationName, accessToken, onProgress);
}

/** Maps selected assets into one destination folder, rejecting overlapping or duplicate paths. */
export function bulkAssetDestinations(
  names: readonly string[],
  folder: string,
): { source: string; destination: string }[] {
  const destinations = new Set<string>();
  return names.map((source) => {
    const destination = `${folder.replace(/\/+$/, '')}/${source.split('/').pop()}`;
    if (
      destination === source ||
      destination.startsWith(source + '/') ||
      destinations.has(destination)
    ) {
      throw new Error(`Invalid or duplicate destination for "${source}".`);
    }
    destinations.add(destination);
    return { source, destination };
  });
}

/**
 * Creates a new folder asset under the given parent path.
 * @param parent The parent path (e.g. "projects/my-project/assets/my-folder")
 * @param folderName The name for the new folder
 * @param accessToken OAuth2 access token
 */
export async function createFolder(
  parent: string,
  folderName: string,
  accessToken: string,
): Promise<EEAsset> {
  const parts = parent.split('/');
  const projectRoot = parts.slice(0, 2).join('/');

  let assetId: string;
  if (parts.length > 2 && parts[2] === 'assets') {
    const relativePath = parts.slice(3).join('/');
    assetId = relativePath ? `${relativePath}/${folderName}` : folderName;
  } else {
    assetId = folderName;
  }

  return postCreateAsset(projectRoot, assetId, 'FOLDER', accessToken);
}

/**
 * Makes sure a folder exists at the given full path, creating it and any
 * missing ancestors. Existing folders are reused; a non-folder asset sitting
 * at that path is an error.
 */
export async function ensureFolder(fullPath: string, accessToken: string): Promise<void> {
  const path = fullPath.trim().replace(/\/+$/, '');
  const parts = path.split('/');
  // "projects/<project>/assets" is the implicit root; nothing to create.
  if (parts.length <= 3) {
    return;
  }
  let existing: EEAsset | undefined;
  try {
    existing = await getAsset(path, accessToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/HTTP 40[34]\b/.test(message)) {
      throw err;
    }
  }
  if (existing) {
    if (existing.type !== 'FOLDER') {
      throw new Error(`"${path}" already exists and is not a folder.`);
    }
    return;
  }
  await ensureFolder(parts.slice(0, -1).join('/'), accessToken);
  await createContainerByPath(path, 'FOLDER', accessToken);
}

// ==================================================================
// INGESTION
// ==================================================================
/**
 * Submits an image ingestion manifest and returns the operation name.
 *
 * The manifest `tilesets[].sources[].uris` must already point at Cloud
 * Storage: Earth Engine reads the objects itself, asynchronously, long after
 * this call returns.
 *
 * @param project The Cloud project owning the destination asset
 * @param manifest An Earth Engine image manifest
 * @param accessToken OAuth2 access token
 */
export async function startImageIngestion(
  project: string,
  manifest: Record<string, unknown>,
  accessToken: string,
): Promise<string> {
  return startIngestion(project, 'image', { imageManifest: manifest }, accessToken);
}

/**
 * Submits a table ingestion manifest and returns the operation name.
 *
 * @param project The Cloud project owning the destination asset
 * @param manifest An Earth Engine table manifest
 * @param accessToken OAuth2 access token
 */
export async function startTableIngestion(
  project: string,
  manifest: Record<string, unknown>,
  accessToken: string,
): Promise<string> {
  return startIngestion(project, 'table', { tableManifest: manifest }, accessToken);
}

/** Shared POST for the `image:import` and `table:import` endpoints. */
async function startIngestion(
  project: string,
  kind: 'image' | 'table',
  manifestField: Record<string, unknown>,
  accessToken: string,
): Promise<string> {
  const url = `${EE_API_BASE}/projects/${encodeURIComponent(project)}/${kind}:import`;
  const body = JSON.stringify({
    ...manifestField,
    overwrite: false,
    requestId: randomUUID(),
  });
  const response = await httpRequest(url, 'POST', accessToken, body);
  const operation = JSON.parse(response) as { name?: string };
  if (!operation.name) {
    throw new Error('Earth Engine did not return an ingestion operation.');
  }
  return operation.name;
}
