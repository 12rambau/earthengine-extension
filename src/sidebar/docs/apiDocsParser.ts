/**
 * @module apiDocsParser
 * HTML parser for the Earth Engine API documentation page.
 *
 * Fetches the public EE API docs HTML, extracts each `ee.*` entry
 * (name, description, usage, return type, arguments), and caches
 * the result in memory. Used by the Docs tree data provider.
 */

import { fetchHtml } from '../../shared/httpClient.js';

// ==================================================================
// CONSTANTS
// ==================================================================
const API_DOCS_URL = 'https://developers.google.com/earth-engine/api_docs';

// ==================================================================
// INTERFACES
// ==================================================================
/** Parsed representation of a single API doc entry. */
interface ApiEntry {
  name: string;
  id: string;
  description: string;
  usage: string;
  returns: string;
  args: { name: string; type: string; details: string }[];
}

// ==================================================================
// CACHE
// ==================================================================
let cachedEntries: ApiEntry[] | undefined;

/** Clears the in-memory docs cache so the next fetch re-downloads. */
export function clearDocsCache() {
  cachedEntries = undefined;
}

// ==================================================================
// FETCH & PARSE
// ==================================================================
/** Fetches and parses the API docs HTML, returning cached results on repeat calls. */
export async function fetchApiDocs(): Promise<ApiEntry[]> {
  if (cachedEntries) {
    return cachedEntries;
  }

  const html = await fetchHtml(API_DOCS_URL);
  cachedEntries = parseApiDocs(html);
  return cachedEntries;
}

/** Parses raw HTML into structured API entries by splitting on `<h2>` tags. */
function parseApiDocs(html: string): ApiEntry[] {
  const entries: ApiEntry[] = [];

  // Split by h2 tags that contain ee.* entries
  const h2Regex = /<h2[^>]*data-text="(ee\.[^"]+)"[^>]*>.*?<\/h2>/g;
  const matches = [...html.matchAll(h2Regex)];

  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1];
    const id = name.toLowerCase().replace(/\./g, '');
    const startIdx = matches[i].index! + matches[i][0].length;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : html.length;
    const section = html.substring(startIdx, endIdx);

    // Extract description (first <p> after h2)
    const descMatch = section.match(/<p>(.*?)<\/p>/s);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Extract usage and returns from first table
    const usageMatch = section.match(/<code[^>]*>(.*?)<\/code>.*?<\/td>\s*<td>(.*?)<\/td>/s);
    const usage = usageMatch ? usageMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const returns = usageMatch ? usageMatch[2].replace(/<[^>]+>/g, '').trim() : '';

    // Extract arguments from details table
    const args: ApiEntry['args'] = [];
    const argsTableMatch = section.match(/<table class="details">(.*?)<\/table>/s);
    if (argsTableMatch) {
      const rowRegex = /<tr><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/gs;
      for (const row of argsTableMatch[1].matchAll(rowRegex)) {
        args.push({
          name: row[1].replace(/<[^>]+>/g, '').trim(),
          type: row[2].replace(/<[^>]+>/g, '').trim(),
          details: row[3].replace(/<[^>]+>/g, '').trim(),
        });
      }
    }

    entries.push({ name, id, description, usage, returns, args });
  }

  return entries;
}

/** Builds the canonical documentation URL for a given API name. */
export function getDocUrl(apiName: string): string {
  const anchor = apiName.toLowerCase().replace(/\./g, '');
  return `${API_DOCS_URL}#${anchor}`;
}
