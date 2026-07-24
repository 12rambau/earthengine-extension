/**
 * @module sidebar/assets
 * Barrel for the Assets sidebar section: tree view, tree data provider, and
 * the Earth Engine asset API client.
 */

export { AssetsSection } from './assetsSection.js';
export { AssetsTreeDataProvider, AssetTreeItem } from './assetsTreeDataProvider.js';
export { listAssets, getAsset, listFeatures } from './eeApiClient.js';
export type { EEAsset, EEBand, ListAssetsResponse } from './eeApiClient.js';
