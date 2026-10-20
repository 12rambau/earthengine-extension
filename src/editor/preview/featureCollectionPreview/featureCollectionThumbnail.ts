/** @module featureCollectionThumbnail — generate map thumbnails for vector assets. */

import { EEAsset } from '../../../sidebar/assets/eeApiClient.js';
import { ensureEe, getThumbUrlRest } from '../../../shared/eeSession.js';

const TABLE_THUMBNAIL_PALETTE = ['FFFFFF', 'FFCCCC', 'FF0000'];

/** Generates a FeatureCollection thumbnail with the supplied background, fill, and outline colors. */
export async function getFeatureCollectionThumbnailUrl(
  asset: EEAsset,
  palette: string[] = TABLE_THUMBNAIL_PALETTE,
): Promise<string> {
  const ee = await ensureEe();
  const collection = ee.FeatureCollection(asset.name);
  const painted = ee.Image(0).paint(collection, 1).paint(collection, 2, 1);
  const visualized = painted.visualize({ palette, min: 0, max: 2 });
  return getThumbUrlRest(visualized, {
    format: 'PNG',
    grid: buildSquareGrid(asset.geometry),
  });
}

function buildSquareGrid(geometry: unknown): Record<string, unknown> {
  const bbox = extractBbox(geometry);
  const cx = (bbox[0] + bbox[2]) / 2;
  const cy = (bbox[1] + bbox[3]) / 2;
  const half = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]) / 2;
  const x0 = cx - half;
  const y0 = cy + half;
  const span = half * 2;
  return {
    dimensions: { width: 256, height: 256 },
    affineTransform: {
      scaleX: span / 256,
      shearX: 0,
      translateX: x0,
      shearY: 0,
      scaleY: -span / 256,
      translateY: y0,
    },
    crsCode: 'EPSG:4326',
  };
}

function extractBbox(geometry: unknown): [number, number, number, number] {
  const fallback: [number, number, number, number] = [-89, -89, 89, 89];
  if (!geometry || typeof geometry !== 'object') {
    return fallback;
  }
  const coords = (geometry as Record<string, unknown>).coordinates;
  if (!coords) {
    return fallback;
  }
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  (function walk(coordinates: unknown) {
    if (Array.isArray(coordinates)) {
      if (
        coordinates.length >= 2 &&
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number'
      ) {
        if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
          return;
        }
        bbox[0] = Math.min(bbox[0], coordinates[0]);
        bbox[1] = Math.min(bbox[1], coordinates[1]);
        bbox[2] = Math.max(bbox[2], coordinates[0]);
        bbox[3] = Math.max(bbox[3], coordinates[1]);
      } else {
        coordinates.forEach(walk);
      }
    }
  })(coords);
  return Number.isFinite(bbox[0]) ? bbox : fallback;
}
