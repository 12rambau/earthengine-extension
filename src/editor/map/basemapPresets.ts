/**
 * @module basemapPresets
 * Built-in basemap definitions for the Google Map Tiles API.
 *
 * Each preset is a `createSession` request body. The five presets map onto the
 * two basemap toggles in the map panel: `light`/`dark` follow the VS Code colour
 * theme, `planLight`/`planDark` back the plan toggle, `satellite` the satellite
 * toggle. Users may override any preset through `earthengine.map.basemap.*`.
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

/** Muted greyscale, POI and road labels stripped — a neutral backdrop for data layers. */
const LIGHT_STYLES: MapStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

/** The light palette inverted for dark themes. */
const DARK_STYLES: MapStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#bdbdbd' }],
  },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
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
  // `overlay: false` merges the roadmap layer into the imagery, i.e. the "hybrid" map type.
  satellite: { mapType: 'satellite', layerTypes: ['layerRoadmap'], overlay: false },
};
