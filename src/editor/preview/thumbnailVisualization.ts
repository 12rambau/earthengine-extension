/**
 * @module thumbnailVisualization
 * Prepares the first asset visualization preset for a PNG preview thumbnail.
 */

import { computeValue } from '../../shared/eeSession.js';
import {
  parseSepalVisualizations,
  resolveSepalViz,
  selectSepalViz,
} from '../../shared/sepalViz.js';

/** Returns the first asset preset rendered as a PNG-ready image, or undefined if none exists. */
export async function getPresetThumbnailImage(
  properties: Record<string, unknown> | undefined,
  propertySource: any,
  image: any,
  ee: any,
): Promise<unknown | undefined> {
  let presets = parseSepalVisualizations(properties ?? {});
  if (presets.length === 0) {
    const serverProperties = await computeValue<Record<string, unknown> | null>(
      propertySource.toDictionary(),
    );
    presets = parseSepalVisualizations(serverProperties ?? {});
  }

  const preset = selectSepalViz(presets, 0);
  if (!preset) {
    return undefined;
  }
  if (!['rgb', 'hsv', 'continuous', 'categorical', 'intervals'].includes(preset.type)) {
    throw new Error(`Unsupported thumbnail visualization type: ${preset.type}`);
  }

  const resolved = resolveSepalViz(preset, image, ee);
  if (preset.type === 'intervals') {
    return resolved.image;
  }
  if (preset.type === 'hsv') {
    return ee.Image(resolved.image).visualize({ min: 0, max: 1 });
  }
  return ee.Image(resolved.image).visualize(resolved.visParams);
}
