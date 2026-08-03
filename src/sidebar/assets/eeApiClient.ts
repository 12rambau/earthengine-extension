/**
 * @module eeApiClient
 * Earth Engine REST API client for asset operations.
 *
 * Wraps the Earth Engine v1 REST API to list, get, and inspect assets
 * (images, tables, image collections, folders) and their features.
 */

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

// ==================================================================
// API FUNCTIONS
// ==================================================================
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
export async function deleteAsset(name: string, accessToken: string): Promise<void> {
  const asset = await getAsset(name, accessToken);
  if (CONTAINER_TYPES.has(asset.type)) {
    await deleteContainerRecursive(name, accessToken);
  } else {
    await deleteLeaf(name, accessToken);
  }
}

/** Deletes a single (non-container) asset. */
async function deleteLeaf(name: string, accessToken: string): Promise<void> {
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
async function deleteContainerRecursive(name: string, accessToken: string): Promise<void> {
  const children = await listAllAssets(name, accessToken);
  for (const child of children) {
    if (CONTAINER_TYPES.has(child.type)) {
      await deleteContainerRecursive(child.name, accessToken);
    } else {
      await deleteLeaf(child.name, accessToken);
    }
  }
  await deleteLeaf(name, accessToken);
}

/** Internal recursive copy implementation; caller is responsible for fetching the asset. */
async function copyAssetImpl(
  asset: EEAsset,
  destinationName: string,
  accessToken: string,
): Promise<EEAsset> {
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
    await copyAssetImpl(childAsset, destinationName + relativeSuffix, accessToken);
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
): Promise<EEAsset> {
  if (destinationName === sourceName || destinationName.startsWith(sourceName + '/')) {
    throw new Error(`Cannot move "${sourceName}" into itself or a descendant.`);
  }

  const asset = await getAsset(sourceName, accessToken);

  if (!CONTAINER_TYPES.has(asset.type)) {
    const url = `${EE_API_BASE}/${sourceName}:move`;
    const body = JSON.stringify({ destinationName });
    const response = await httpRequest(url, 'POST', accessToken, body);
    return JSON.parse(response) as EEAsset;
  }

  const result = await copyAssetImpl(asset, destinationName, accessToken);
  await deleteContainerRecursive(sourceName, accessToken);
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
): Promise<EEAsset> {
  if (destinationName === sourceName || destinationName.startsWith(sourceName + '/')) {
    throw new Error(`Cannot copy "${sourceName}" into itself or a descendant.`);
  }
  const asset = await getAsset(sourceName, accessToken);
  return copyAssetImpl(asset, destinationName, accessToken);
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
