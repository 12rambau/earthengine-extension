import * as https from 'https';

const STAC_ROOT = 'https://earthengine-stac.storage.googleapis.com/catalog/catalog.json';

export interface StacLink {
	href: string;
	rel: string;
	title?: string;
	type?: string;
}

export interface StacCatalog {
	id: string;
	description: string;
	links: StacLink[];
}

export interface StacBand {
	name: string;
	description?: string;
	'gee:units'?: string;
	'gee:scale'?: number;
	'gee:offset'?: number;
	'gee:wavelength'?: string;
	'gsd'?: number;
}

export interface StacCollection {
	type: string;
	id: string;
	title: string;
	description: string;
	keywords: string[];
	'gee:type': string;
	extent: {
		spatial: { bbox: number[][] };
		temporal: { interval: string[][] };
	};
	providers: { name: string; roles: string[]; url?: string }[];
	summaries: {
		'eo:bands'?: StacBand[];
		[key: string]: unknown;
	};
	links: StacLink[];
}

export async function fetchRootCatalog(): Promise<{ id: string; title: string; href: string }[]> {
	const catalog = await fetchJson<StacCatalog>(STAC_ROOT);
	return catalog.links
		.filter(l => l.rel === 'child')
		.map(l => ({ id: l.title || '', title: l.title || '', href: l.href }));
}

export async function fetchProviderCatalog(href: string): Promise<{ id: string; title: string; href: string }[]> {
	const catalog = await fetchJson<StacCatalog>(href);
	return catalog.links
		.filter(l => l.rel === 'child')
		.map(l => ({ id: l.title || '', title: l.title || '', href: l.href }));
}

export async function fetchCollectionType(href: string): Promise<string> {
	const collection = await fetchJson<{ 'gee:type'?: string }>(href);
	return collection['gee:type'] || 'unknown';
}

export async function fetchCollection(href: string): Promise<StacCollection> {
	return fetchJson<StacCollection>(href);
}

export function getDatasetPageUrl(datasetId: string): string {
	const slug = datasetId.replace(/\//g, '_');
	return `https://developers.google.com/earth-engine/datasets/catalog/${slug}`;
}

function fetchJson<T>(url: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const get = (targetUrl: string) => {
			https.get(targetUrl, (res) => {
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					get(res.headers.location);
					return;
				}
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => chunks.push(chunk));
				res.on('end', () => {
					try {
						resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
					} catch (e) {
						reject(e);
					}
				});
				res.on('error', reject);
			}).on('error', reject);
		};
		get(url);
	});
}
