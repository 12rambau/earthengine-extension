/** @module featureCollectionThumbnail — generate map thumbnails for vector assets. */

import { EEAsset } from '../../../sidebar/assets/eeApiClient.js';
import { computeValue, ensureEe, getThumbUrlRest } from '../../../shared/eeSession.js';
import {
  parseSepalVisualizations,
  selectSepalViz,
  vectorVisParams,
} from '../../../shared/sepalViz.js';
import { styleFeatureCollection } from '../../map/mapLayerManager.js';

const TABLE_THUMBNAIL_PALETTE = ['FFFFFF', 'FFCCCC', 'FF0000'];

/** Generates a thumbnail from the first vector preset, or falls back to painted features. */
export async function getFeatureCollectionThumbnailUrl(
  asset: EEAsset,
  palette: string[] = TABLE_THUMBNAIL_PALETTE,
  fallbackOnly = false,
): Promise<{ url: string; preset: boolean }> {
  const ee = await ensureEe();
  const collection = ee.FeatureCollection(asset.name);
  const coordinates = await computeValue<number[][][]>(
    collection.geometry().bounds(1).coordinates(),
  ).catch(() => undefined);
  const params = {
    format: 'PNG',
    grid: buildSquareGrid(coordinates?.length ? { coordinates } : asset.geometry),
  };
  const presets = parseSepalVisualizations(asset.properties ?? {}).filter((preset) =>
    ['uniform', 'continuous', 'categorical', 'intervals'].includes(preset.type),
  );
  const preset = selectSepalViz(presets, 0);
  if (preset && !fallbackOnly) {
    try {
      return {
        url: await getThumbUrlRest(
          styleFeatureCollection(collection, vectorVisParams(preset), ee),
          params,
        ),
        preset: true,
      };
    } catch {
      console.warn('FeatureCollection thumbnail preset failed; using fallback.');
    }
  }
  const painted = ee.Image(0).paint(collection, 1).paint(collection, 2, 1);
  const visualized = painted.visualize({ palette, min: 0, max: 2 });
  return { url: await getThumbUrlRest(visualized, params), preset: false };
}

/** Builds a padded 256×256 Mercator grid from the collection bounds, or a global fallback. */
export function buildSquareGrid(geometry: unknown): Record<string, unknown> {
  const bbox = extractBbox(geometry);
  const earthRadius = 6378137;
  const maxLatitude = 85.0511287798066;
  const toMercatorY = (latitude: number): number => {
    const clamped = Math.max(-maxLatitude, Math.min(maxLatitude, latitude));
    return earthRadius * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
  };
  const minX = (bbox[0] * Math.PI * earthRadius) / 180;
  const minY = toMercatorY(bbox[1]);
  const maxX = (bbox[2] * Math.PI * earthRadius) / 180;
  const maxY = toMercatorY(bbox[3]);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2;
  const maxHalf = Math.PI * earthRadius;
  const minHalf = (0.05 * Math.PI * earthRadius) / 180;
  const paddedHalf = half < maxHalf - 1 ? Math.max(half * 1.2, minHalf) : half;
  const x0 = cx - paddedHalf;
  const y0 = cy + paddedHalf;
  const span = paddedHalf * 2;
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
    crsCode: 'EPSG:3857',
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
