/**
 * @module sidebar/dataset
 * Barrel for the Datasets sidebar section: tree view, tree data provider, and
 * the STAC catalog client.
 */

export { DatasetSection } from './datasetSection.js';
export { DatasetTreeDataProvider, DatasetTreeItem } from './datasetTreeDataProvider.js';
export { fetchCollection, getDatasetPageUrl } from './stacClient.js';
