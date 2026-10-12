/**
 * @module imageVisualizations
 * Resolves an image's visualization presets, falling back to its parent collection.
 */

import { getAsset } from '../sidebar/assets/eeApiClient.js';
import { computeValue, getEeContext } from './eeSession.js';
import { parseSepalVisualizations, selectImageVisualizations, type SepalViz } from './sepalViz.js';

/** Returns image presets when present, otherwise presets from the immediate parent collection. */
export async function getImageVisualizations(
  properties: Record<string, unknown> | undefined,
  propertySource: any | undefined,
  assetName?: string,
  accessToken?: string,
): Promise<SepalViz[]> {
  let imageProperties = properties ?? {};
  let presets = parseSepalVisualizations(imageProperties);
  if (presets.length === 0 && propertySource) {
    try {
      imageProperties =
        (await computeValue<Record<string, unknown> | null>(propertySource.toDictionary())) ?? {};
      presets = parseSepalVisualizations(imageProperties);
    } catch {
      // A failed property lookup must not prevent a known asset's parent lookup.
    }
  }
  if (presets.length > 0) {
    return presets;
  }

  const id = assetName ?? imageProperties['system:id'] ?? properties?.['system:id'];
  if (typeof id !== 'string' || !id.includes('/')) {
    return [];
  }
  const normalized = id.startsWith('projects/') ? id : `projects/earthengine-legacy/assets/${id}`;
  const parentName = normalized.slice(0, normalized.lastIndexOf('/'));
  try {
    const token = accessToken ?? (await getEeContext()).token;
    const parent = await getAsset(parentName, token);
    return parent.type === 'IMAGE_COLLECTION'
      ? selectImageVisualizations(imageProperties, parent.properties ?? {})
      : [];
  } catch {
    return [];
  }
}
