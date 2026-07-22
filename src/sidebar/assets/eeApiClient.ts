/**
 * @module eeApiClient
 * Earth Engine REST API client for asset operations.
 *
 * Wraps the Earth Engine v1 REST API to list, get, and inspect assets
 * (images, tables, image collections, folders) and their features.
 */

import { getRequest, httpRequest } from '../../shared/httpClient.js';

// ── Constants ───────────────────────────────────────────────────────

const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

// ── Interfaces ──────────────────────────────────────────────────────

/** Metadata for an Earth Engine asset (image, table, folder, etc.). */
export interface EEAsset {
	name: string;
	type: string;
	id?: string;
	title?: string;
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

// ── API Functions ───────────────────────────────────────────────────

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
export async function listAllAssets(
	parent: string,
	accessToken: string,
): Promise<EEAsset[]> {
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
	// The EE API expects: POST /v1/projects/{project}/assets?assetId={relative-path}
	// Extract the project root (projects/{id}) and compute the relative assetId
	const parts = parent.split('/');
	const projectRoot = parts.slice(0, 2).join('/'); // "projects/{project}"

	let assetId: string;
	if (parts.length > 2 && parts[2] === 'assets') {
		// Parent is "projects/{project}/assets/some/path"
		const relativePath = parts.slice(3).join('/');
		assetId = relativePath ? `${relativePath}/${folderName}` : folderName;
	} else {
		// Parent is just "projects/{project}"
		assetId = folderName;
	}

	const params = new URLSearchParams({ assetId });
	const url = `${EE_API_BASE}/${projectRoot}/assets?${params.toString()}`;
	const body = JSON.stringify({ type: 'FOLDER' });
	const response = await httpRequest(url, 'POST', accessToken, body);
	return JSON.parse(response) as EEAsset;
}
