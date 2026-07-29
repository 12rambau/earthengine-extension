/**
 * @module communityClient
 * Client for the Awesome GEE Community Catalog.
 *
 * Fetches the community_datasets.json manifest from GitHub and groups
 * datasets by thematic_group, deduplicating entries that share a docs page
 * (multiple EE assets can reference the same documentation page).
 */

import { fetchJson } from '../../shared/httpClient.js';

const COMMUNITY_JSON_URL =
  'https://raw.githubusercontent.com/samapriya/awesome-gee-community-datasets/master/community_datasets.json';

// ==================================================================
// INTERFACES
// ==================================================================
/** A single entry from community_datasets.json. */
export interface CommunityDatasetEntry {
  title: string;
  type: string;
  id: string;
  provider: string;
  tags: string;
  license?: string;
  docs: string;
  thematic_group: string;
  thumbnail?: string;
  sample_code?: string;
}

/** Map from thematic_group name to the unique dataset entries in that group. */
export type CommunityThemesMap = Map<string, CommunityDatasetEntry[]>;

// ==================================================================
// PUBLIC API
// ==================================================================
/**
 * Fetches the community datasets manifest and returns unique documentation
 * pages grouped by thematic group. Multiple EE assets can share the same
 * docs page; only the first entry per page is kept.
 */
export async function fetchCommunityThemes(): Promise<CommunityThemesMap> {
  const data = await fetchJson<CommunityDatasetEntry[]>(COMMUNITY_JSON_URL);

  const seen = new Set<string>();
  const themes = new Map<string, CommunityDatasetEntry[]>();

  for (const entry of data) {
    if (seen.has(entry.docs)) {
      continue;
    }
    seen.add(entry.docs);

    const theme = entry.thematic_group || 'Other';
    if (!themes.has(theme)) {
      themes.set(theme, []);
    }
    themes.get(theme)!.push(entry);
  }

  return themes;
}
