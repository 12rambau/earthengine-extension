/**
 * @module stacClient
 * STAC (SpatioTemporal Asset Catalog) client for the Earth Engine dataset catalog.
 *
 * Fetches the public EE STAC catalog hierarchy to list providers,
 * collections, and their metadata (type, bands, temporal extent).
 */

import { fetchJson } from '../../shared/httpClient.js';

// ==================================================================
// CONSTANTS
// ==================================================================
const STAC_ROOT = 'https://earthengine-stac.storage.googleapis.com/catalog/catalog.json';

// ==================================================================
// INTERFACES
// ==================================================================
/** A link entry in a STAC catalog or collection. */
export interface StacLink {
  href: string;
  rel: string;
  title?: string;
  type?: string;
}

/** A STAC catalog node containing child links. */
export interface StacCatalog {
  id: string;
  description: string;
  links: StacLink[];
}

/** Band summary from a STAC collection's `eo:bands` field. */
export interface StacBand {
  name: string;
  description?: string;
  'gee:units'?: string;
  'gee:scale'?: number;
  'gee:offset'?: number;
  'gee:wavelength'?: string;
  gsd?: number;
}

/** Full STAC collection with spatial/temporal extent, bands, and providers. */
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

// ==================================================================
// API FUNCTIONS
// ==================================================================
/** Rejects after `ms` milliseconds so hung STAC requests don't spin forever. */
function withTimeout<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`STAC request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/** Fetches the top-level STAC catalog and returns child (provider) entries. */
export async function fetchRootCatalog(): Promise<{ id: string; title: string; href: string }[]> {
  const catalog = await withTimeout(fetchJson<StacCatalog>(STAC_ROOT));
  return catalog.links
    .filter((l) => l.rel === 'child')
    .map((l) => ({ id: l.title || '', title: l.title || '', href: l.href }));
}

/** Fetches a provider sub-catalog and returns its child dataset entries. */
export async function fetchProviderCatalog(
  href: string,
): Promise<{ id: string; title: string; href: string }[]> {
  const catalog = await withTimeout(fetchJson<StacCatalog>(href));
  return catalog.links
    .filter((l) => l.rel === 'child')
    .map((l) => ({ id: l.title || '', title: l.title || '', href: l.href }));
}

/** Fetches type, description, and keywords from a STAC collection. */
export async function fetchCollectionMetadata(
  href: string,
): Promise<{ type: string; title: string; description: string; keywords: string[] }> {
  const collection = await withTimeout(
    fetchJson<{
      'gee:type'?: string;
      title?: string;
      description?: string;
      keywords?: string[];
    }>(href),
  );
  return {
    type: collection['gee:type'] || 'unknown',
    title: collection.title || '',
    description: collection.description || '',
    keywords: collection.keywords || [],
  };
}

/** Fetches the full STAC collection metadata for a dataset. */
export async function fetchCollection(href: string): Promise<StacCollection> {
  return fetchJson<StacCollection>(href);
}

/** Builds the Google Earth Engine catalog page URL for a given dataset ID. */
export function getDatasetPageUrl(datasetId: string): string {
  const slug = datasetId.replace(/\//g, '_');
  return `https://developers.google.com/earth-engine/datasets/catalog/${slug}`;
}
