/**
 * @module apiDocsParser
 * Earth Engine API docs fetcher — backed by ee.data.getAlgorithms().
 *
 * Retrieves the full algorithm registry (name, description, return type,
 * arguments) via the EE algorithms REST endpoint and caches the result
 * in memory. Requires an authenticated EE session.
 */

import ee from '@google/earthengine';
import { ensureEe } from '../../shared/eeSession.js';

// ==================================================================
// CONSTANTS
// ==================================================================
const API_DOCS_URL = 'https://developers.google.com/earth-engine/api_docs';

// ==================================================================
// INTERFACES
// ==================================================================
/** Parsed representation of a single API doc entry. */
export interface ApiEntry {
  name: string;
  id: string;
  description: string;
  usage: string;
  returns: string;
  args: { name: string; type: string; details: string }[];
}

/** Shape of one entry in the algorithms registry returned by the EE client. */
interface AlgorithmSignature {
  description?: string;
  returns?: string;
  deprecated?: string;
  args?: { name: string; type: string; optional?: boolean; description?: string }[];
}

// ==================================================================
// CACHE
// ==================================================================
let cachedEntries: ApiEntry[] | undefined;

/** Clears the in-memory docs cache so the next call re-fetches. */
export function clearDocsCache() {
  cachedEntries = undefined;
}

// ==================================================================
// FETCH & CONVERT
// ==================================================================
/** Fetches the algorithm registry via ee.data.getAlgorithms() and converts it to ApiEntry[]. */
export async function fetchApiDocs(): Promise<ApiEntry[]> {
  if (cachedEntries) {
    return cachedEntries;
  }

  await ensureEe();

  return new Promise((resolve, reject) => {
    // getAlgorithms is patched in eeSession to use httpRequest directly,
    // bypassing the xmlhttprequest transport bug in the extension host.
    // getAlgorithms is patched in eeSession to use httpRequest directly,
    // bypassing the xmlhttprequest transport bug in the extension host.
    const getAlgorithms = (ee.data as Record<string, unknown>)['getAlgorithms'] as (
      callback: (registry: unknown, err?: string) => void,
    ) => void;
    getAlgorithms((registry: unknown, err?: string) => {
      if (err) {
        reject(new Error(err));
        return;
      }

      cachedEntries = Object.entries(registry as Record<string, AlgorithmSignature>)
        .filter(([, sig]) => !sig.deprecated)
        .map(([key, sig]) => {
          const name = key.startsWith('ee.') ? key : `ee.${key}`;
          const args = (sig.args ?? []).map((a) => ({
            name: a.name,
            type: a.type,
            details: a.description ?? '',
          }));
          return {
            name,
            id: name.toLowerCase().replace(/\./g, ''),
            description: sig.description ?? '',
            usage: `${name}(${args.map((a) => a.name).join(', ')})`,
            returns: sig.returns ?? '',
            args,
          };
        });

      resolve(cachedEntries);
    });
  });
}

/** Builds the canonical documentation URL for a given API name. */
export function getDocUrl(apiName: string): string {
  const anchor = apiName.toLowerCase().replace(/\./g, '');
  return `${API_DOCS_URL}#${anchor}`;
}
