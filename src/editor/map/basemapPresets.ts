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
// STYLE PALETTES
// ==================================================================

/** Muted greyscale with labels, roads and POI stripped — a neutral backdrop for data layers. */
const LIGHT_STYLES: MapStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#bdbdbd' }],
  },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

/** Near-black backdrop with labels, roads and POI stripped: only water and borders remain. */
const DARK_STYLES: MapStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#757575' }, { visibility: 'off' }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#bdbdbd' }],
  },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'poi.park', elementType: 'labels.text.stroke', stylers: [{ color: '#1b1b1b' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry',
    stylers: [{ color: '#4e4e4e' }],
  },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

/** Google's standard roadmap recoloured for dark themes: POI, roads and labels kept. */
const PLAN_DARK_STYLES: MapStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#c0c0c0' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d0d0d0' }],
  },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#282828' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1b2b1b' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b8f6b' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#a8a8a8' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#4e4437' }] },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#e0c48a' }],
  },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f2f2f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a6b8a' }] },
];

// ==================================================================
// PRESETS
// ==================================================================

/** Default `createSession` body for every basemap slot. */
export const BASEMAP_PRESETS: Record<BasemapId, CreateSessionRequest> = {
  light: { mapType: 'roadmap', styles: LIGHT_STYLES },
  dark: { mapType: 'roadmap', styles: DARK_STYLES },
  // No `styles` — Google's stock cartography.
  planLight: { mapType: 'roadmap' },
  planDark: { mapType: 'roadmap', styles: PLAN_DARK_STYLES },
  // Bare imagery: no `layerTypes`, so no roads, labels or POI are baked in.
  satellite: { mapType: 'satellite' },
};

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
