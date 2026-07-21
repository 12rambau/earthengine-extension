import * as https from 'https';

const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

export interface EEAsset {
	name: string;
	type: string;
	id?: string;
	title?: string;
}

export interface ListAssetsResponse {
	assets?: EEAsset[];
	nextPageToken?: string;
}

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

function getRequest(url: string, accessToken: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		https.get({
			hostname: parsed.hostname,
			path: parsed.pathname + parsed.search,
			headers: { 'Authorization': `Bearer ${accessToken}` },
		}, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				const result = Buffer.concat(chunks).toString('utf-8');
				if (res.statusCode && res.statusCode >= 400) {
					reject(new Error(`HTTP ${res.statusCode}: ${result}`));
				} else {
					resolve(result);
				}
			});
			res.on('error', reject);
		}).on('error', reject);
	});
}
