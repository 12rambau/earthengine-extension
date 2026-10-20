/** @module featureViewThumbnail — create a tiled thumbnail for a FeatureView asset. */

import { EEAsset } from '../../../sidebar/assets/eeApiClient.js';
import { ensureEe } from '../../../shared/eeSession.js';

const TILE_SIZE = 256;
const TILE_GRID_SIZE = 3;
const MAX_ZOOM = 20;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

interface FeatureViewTilesKey {
  formatTileUrl(x: number, y: number, zoom: number): string;
}

interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Gets FeatureView tile URLs centered on the asset geometry using a purple style. */
export async function getFeatureViewThumbnail(asset: EEAsset): Promise<{
  tiles: string[];
  columns: number;
}> {
  const ee = (await ensureEe()) as any;
  const tilesKey = (await ee.data.getFeatureViewTilesKey({
    assetId: asset.name,
    visParams: {
      color: 'A371F7',
      fillColor: 'E9D5FF',
      fillOpacity: 0.7,
      width: 2,
      pointSize: 5,
    },
  })) as FeatureViewTilesKey;
  if (!tilesKey?.formatTileUrl) {
    throw new Error('Earth Engine did not return a FeatureView tile key.');
  }

  const bounds = extractBounds(asset.geometry);
  if (!bounds) {
    return { tiles: [tilesKey.formatTileUrl(0, 0, 0)], columns: 1 };
  }

  const zoom = calculateZoom(bounds);
  const worldTiles = 2 ** zoom;
  const centerX = longitudeToPixel((bounds.west + bounds.east) / 2, zoom);
  const centerY = latitudeToPixel((bounds.south + bounds.north) / 2, zoom);
  const firstTileX = Math.floor(centerX / TILE_SIZE - TILE_GRID_SIZE / 2);
  const firstTileY = Math.floor(centerY / TILE_SIZE - TILE_GRID_SIZE / 2);
  const tiles: string[] = [];

  for (let row = 0; row < TILE_GRID_SIZE; row++) {
    const y = Math.max(0, Math.min(worldTiles - 1, firstTileY + row));
    for (let column = 0; column < TILE_GRID_SIZE; column++) {
      const rawX = firstTileX + column;
      const x = ((rawX % worldTiles) + worldTiles) % worldTiles;
      tiles.push(tilesKey.formatTileUrl(x, y, zoom));
    }
  }

  return { tiles, columns: TILE_GRID_SIZE };
}

function calculateZoom(bounds: Bounds): number {
  const worldWidth = longitudeToPixel(bounds.east, 0) - longitudeToPixel(bounds.west, 0);
  const worldHeight = latitudeToPixel(bounds.south, 0) - latitudeToPixel(bounds.north, 0);
  const extent = Math.max(worldWidth, worldHeight);
  if (!Number.isFinite(extent) || extent <= 0) {
    return MAX_ZOOM;
  }
  return Math.max(0, Math.min(MAX_ZOOM, Math.floor(Math.log2((TILE_SIZE * 2) / extent))));
}

function longitudeToPixel(longitude: number, zoom: number): number {
  return ((longitude + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

function latitudeToPixel(latitude: number, zoom: number): number {
  const boundedLatitude = Math.max(
    -WEB_MERCATOR_MAX_LATITUDE,
    Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude),
  );
  const sin = Math.sin((boundedLatitude * Math.PI) / 180);
  const normalized = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return normalized * TILE_SIZE * 2 ** zoom;
}

function extractBounds(geometry: unknown): Bounds | undefined {
  if (!geometry || typeof geometry !== 'object') {
    return undefined;
  }
  const coordinates = (geometry as Record<string, unknown>).coordinates;
  if (!coordinates) {
    return undefined;
  }

  const bounds: Bounds = {
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity,
  };
  (function walk(value: unknown) {
    if (!Array.isArray(value)) {
      return;
    }
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      const [longitude, latitude] = value;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return;
      }
      bounds.west = Math.min(bounds.west, longitude);
      bounds.south = Math.min(bounds.south, latitude);
      bounds.east = Math.max(bounds.east, longitude);
      bounds.north = Math.max(bounds.north, latitude);
      return;
    }
    value.forEach(walk);
  })(coordinates);

  return Number.isFinite(bounds.west) ? bounds : undefined;
}
