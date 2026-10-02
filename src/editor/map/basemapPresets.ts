/**
 * @module basemapPresets
 * Built-in basemap definitions for the Google Map Tiles API.
 *
 * Each preset is a `createSession` request body. The five presets map onto the
 * two basemap toggles in the map panel: `light`/`dark` follow the VS Code colour
 * theme, `planLight`/`planDark` back the plan toggle, `satellite` the satellite
 * toggle. Users may override any preset through `earthengine.map.basemap.*`.
 *
 * `FALLBACK_BASEMAPS` holds the keyless tile sources used when no Google
 * session can be minted.
 *
 * See https://developers.google.com/maps/documentation/tile/session_tokens
 */

import defaultBasemaps from './defaultBasemaps.json';

// ==================================================================
// TYPES
// ==================================================================

/** Identifier of a basemap slot. Doubles as the settings key suffix. */
export type BasemapId = 'light' | 'dark' | 'planLight' | 'planDark' | 'satellite';

/** Every basemap slot, in settings order. */
export const BASEMAP_IDS: readonly BasemapId[] = [
  'light',
  'dark',
  'planLight',
  'planDark',
  'satellite',
];

/** A single Google Maps styler, e.g. `{ color: '#f5f5f5' }` or `{ visibility: 'off' }`. */
export type MapStyler = Record<string, string | number>;

/** A Google Maps style rule: which features it targets and how they are painted. */
export interface MapStyle {
  featureType?: string;
  elementType?: string;
  stylers: MapStyler[];
}

/**
 * Body of a `POST /v1/createSession` request, minus `language` and `region`
 * which the extension derives from the VS Code locale.
 */
export interface CreateSessionRequest {
  mapType: 'roadmap' | 'satellite' | 'terrain';
  layerTypes?: Array<'layerRoadmap' | 'layerStreetview' | 'layerTraffic'>;
  overlay?: boolean;
  /** Only honoured by the API when `mapType` is `roadmap`. */
  styles?: MapStyle[];
  scale?: 'scaleFactor1x' | 'scaleFactor2x' | 'scaleFactor4x';
  highDpi?: boolean;
  imageFormat?: 'jpeg' | 'png';
}

// ==================================================================
// PRESETS
// ==================================================================

/** Default `createSession` body for every basemap slot, loaded from JSON. */
export const BASEMAP_PRESETS = defaultBasemaps as Record<BasemapId, CreateSessionRequest>;

// ==================================================================
// FALLBACKS
// ==================================================================

/** A keyless tile source used when the Google Maps API key is missing or rejected. */
export interface FallbackBasemap {
  url: string;
  attribution: string;
  maxNativeZoom: number;
}

const OSM: FallbackBasemap = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxNativeZoom: 19,
};

/**
 * Free basemaps shown when no Google session can be minted. OpenStreetMap has
 * a single cartography, so all four roadmap slots share it; Esri World Imagery
 * stands in for satellite.
 */
export const FALLBACK_BASEMAPS: Record<BasemapId, FallbackBasemap> = {
  light: OSM,
  dark: OSM,
  planLight: OSM,
  planDark: OSM,
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 19,
  },
};
