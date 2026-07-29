/**
 * @module datasetTreeDataProvider
 * Data provider for the Dataset sidebar tree.
 *
 * Displays the STAC-based Earth Engine dataset catalog organized into
 * Google, Publishers, and Community categories. Provider children and
 * dataset types are resolved lazily in the background.
 */

import * as vscode from 'vscode';
import { fetchRootCatalog, fetchProviderCatalog, fetchCollectionMetadata } from './stacClient.js';
import { DatasetTreeItem } from './datasetTreeItem.js';
import {
  fetchCommunityThemes,
  CommunityDatasetEntry,
  CommunityThemesMap,
} from './communityClient.js';

type CollectionMetadata = { type: string; title: string; description: string; keywords: string[] };

// ==================================================================
// HELPERS
// ==================================================================
/** Creates a DatasetTreeItem from a community catalog entry. */
function makeCommunityDatasetItem(entry: CommunityDatasetEntry): DatasetTreeItem {
  const tags = entry.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return new DatasetTreeItem(
    entry.title,
    'communityDataset',
    '',
    entry.id,
    entry.type,
    false,
    undefined,
    entry.thematic_group,
    tags,
    entry.docs,
    entry.thumbnail,
    entry,
  );
}

// ==================================================================
// PUBLISHER / COMMUNITY CATALOGS
// ==================================================================
const PUBLISHER_CATALOGS = [
  { name: 'BirdLife International', id: 'ee-kbas-in-gee' },
  { name: 'Canadian Forest Earth Observation Products', id: 'gcpm041u-lemur' },
  { name: 'Continuous Global Mangrove Dynamics', id: 'mangrovedatahub2' },
  { name: 'Environmental Defense Fund - MethaneSAT', id: 'edf-methanesat-ee' },
  { name: 'Forest Data Partnership', id: 'forestdatapartnership' },
  { name: 'Global Pasture Watch', id: 'global-pasture-watch' },
  { name: 'Land and Carbon Lab', id: 'landandcarbon' },
  { name: 'Large Scale Hydrology Lab', id: 'pml_evapotranspiration' },
  { name: 'MapBiomas', id: 'mapbiomas-public' },
  { name: 'National Ecological Observatory Network', id: 'neon-prod-earthengine' },
  { name: 'Nature Trace', id: 'nature-trace' },
  { name: 'OpenET', id: 'openet' },
  { name: 'Overture Maps', id: 'overture-maps' },
  { name: 'Oya', id: 'global-precipitation-nowcast' },
  { name: 'Planet', id: 'planet-nicfi' },
  { name: 'The Malaria Atlas Project', id: 'malariaatlasproject' },
  { name: 'USDA Forest Services', id: 'gtac-data-publish' },
  { name: 'WeatherNext', id: 'gcp-public-data-weathernext' },
];

/** Lowercase set of publisher STAC IDs for filtering the root catalog. */
const PUBLISHER_ID_SET = new Set(PUBLISHER_CATALOGS.map((p) => p.id.toLowerCase()));

// ==================================================================
// DATASETTREEDATAPROVIDER
// ==================================================================
/** Provides a three-level dataset tree: category → provider → datasets. */
export class DatasetTreeDataProvider implements vscode.TreeDataProvider<DatasetTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DatasetTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private providers: { id: string; title: string; href: string }[] | undefined;
  private typeCache = new Map<string, string>();
  private metadataCache = new Map<string, CollectionMetadata>();
  private leafParentMap = new Map<string, string>();
  private loadingProviders = new Set<string>();
  private providerChildren = new Map<string, { id: string; title: string; href: string }[]>();
  private providerLoadingState = new Set<string>();
  private expandedNodes = new Set<string>();
  private communityThemes: CommunityThemesMap | undefined;
  private communityLoading = false;

  getTreeItem(element: DatasetTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: DatasetTreeItem): DatasetTreeItem | undefined {
    if (element.nodeType === 'dataset') {
      const providerHref = this.leafParentMap.get(element.stacHref);
      if (!providerHref) {
        return undefined;
      }
      const provider = this.providers?.find((p) => p.href === providerHref);
      if (!provider) {
        return undefined;
      }
      return new DatasetTreeItem(provider.title, 'provider', provider.href);
    }
    if (
      element.nodeType === 'provider' &&
      this.providers?.some((p) => p.href === element.stacHref)
    ) {
      const stacEntry = this.providers!.find((p) => p.href === element.stacHref);
      const isPublisher = stacEntry && PUBLISHER_ID_SET.has(stacEntry.title.toLowerCase());
      return new DatasetTreeItem(
        isPublisher ? 'Publishers' : 'Google',
        'category',
        isPublisher ? 'publishers' : 'google',
      );
    }
    return undefined;
  }

  async getChildren(element?: DatasetTreeItem): Promise<DatasetTreeItem[]> {
    if (!element) {
      return [
        this.applyExpandedIcon(new DatasetTreeItem('Google', 'category', 'google')),
        this.applyExpandedIcon(new DatasetTreeItem('Publishers', 'category', 'publishers')),
        this.applyExpandedIcon(new DatasetTreeItem('Community', 'category', 'community')),
      ];
    }

    if (element.nodeType === 'category') {
      if (element.stacHref === 'google') {
        return this.getGoogleProviders();
      }
      if (element.stacHref === 'publishers') {
        return this.getPublisherProviders();
      }
      if (element.stacHref === 'community') {
        return this.getCommunityThemeItems();
      }
      return [];
    }

    if (element.nodeType === 'provider' && element.stacHref) {
      const cached = this.providerChildren.get(element.stacHref);

      if (cached) {
        // Start metadata resolution the first time the tree accesses this provider's
        // children — covers both manual expansion and expansion triggered by reveal().
        const uncached = cached.filter((d) => !this.metadataCache.has(d.href));
        if (uncached.length > 0 && !this.loadingProviders.has(element.stacHref)) {
          this.loadingProviders.add(element.stacHref);
          void this.resolveTypesInBackground(uncached.map((d) => d.href));
        }
        return cached.map((d) => {
          const eeId = d.id.replace(/_/g, '/');
          const parts = d.id.split('_');
          const shortName = parts.length > 1 ? parts.slice(1).join('_') : d.id;
          const meta = this.metadataCache.get(d.href);
          return new DatasetTreeItem(
            meta?.title || shortName,
            'dataset',
            d.href,
            eeId,
            meta?.type,
            undefined,
            undefined,
            meta?.description,
            meta?.keywords,
          );
        });
      }

      if (!this.providerLoadingState.has(element.stacHref)) {
        this.providerLoadingState.add(element.stacHref);
        this.loadProviderInBackground(element.stacHref);
      }

      return [new DatasetTreeItem('Loading...', 'dataset', '', undefined, undefined, true)];
    }

    if (element.nodeType === 'communityTheme') {
      return (this.communityThemes?.get(element.stacHref) ?? []).map(makeCommunityDatasetItem);
    }

    return [];
  }

  /** Applies the folder-opened icon when this node is currently expanded. */
  private applyExpandedIcon(item: DatasetTreeItem): DatasetTreeItem {
    if (this.expandedNodes.has(item.id ?? item.stacHref)) {
      item.iconPath = new vscode.ThemeIcon(
        item.nodeType === 'category' ? 'root-folder-opened' : 'folder-opened',
      );
    }
    return item;
  }

  /** Updates the icon when the user expands or collapses a container node. */
  setExpanded(item: DatasetTreeItem, expanded: boolean): void {
    const key = item.id ?? item.stacHref;
    if (expanded) {
      this.expandedNodes.add(key);
      item.iconPath = new vscode.ThemeIcon(
        item.nodeType === 'category' ? 'root-folder-opened' : 'folder-opened',
      );
    } else {
      this.expandedNodes.delete(key);
      item.iconPath =
        item.nodeType === 'category'
          ? new vscode.ThemeIcon('root-folder')
          : new vscode.ThemeIcon('folder-library');
    }
    this._onDidChangeTreeData.fire(item);
  }

  /** Returns community theme items, kicking off a background load on first call. */
  private getCommunityThemeItems(): DatasetTreeItem[] {
    if (this.communityThemes) {
      return [...this.communityThemes.keys()]
        .sort()
        .map((theme) =>
          this.applyExpandedIcon(new DatasetTreeItem(theme, 'communityTheme', theme)),
        );
    }
    if (!this.communityLoading) {
      this.communityLoading = true;
      this.loadCommunityInBackground();
    }
    return [new DatasetTreeItem('Loading...', 'dataset', '', undefined, undefined, true)];
  }

  /** Fetches the community catalog in the background, then refreshes the tree. */
  private async loadCommunityInBackground(): Promise<void> {
    try {
      this.communityThemes = await fetchCommunityThemes();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to load community catalog: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.communityLoading = false;
    }
    this._onDidChangeTreeData.fire();
  }

  /** Fetches and caches the Google providers from the STAC root catalog, excluding publishers. */
  private async getGoogleProviders(): Promise<DatasetTreeItem[]> {
    if (!this.providers) {
      try {
        this.providers = await fetchRootCatalog();
      } catch {
        vscode.window.showErrorMessage('Failed to load dataset catalog');
        return [];
      }
    }
    return this.providers
      .filter((p) => !PUBLISHER_ID_SET.has(p.title.toLowerCase()))
      .map((p) => this.applyExpandedIcon(new DatasetTreeItem(p.title, 'provider', p.href)));
  }

  /**
   * Returns publisher provider items derived from the STAC root catalog.
   * Matches each entry in PUBLISHER_CATALOGS against the root catalog by
   * case-insensitive ID to obtain the real STAC href.
   */
  private async getPublisherProviders(): Promise<DatasetTreeItem[]> {
    if (!this.providers) {
      try {
        this.providers = await fetchRootCatalog();
      } catch {
        vscode.window.showErrorMessage('Failed to load publisher catalog');
        return [];
      }
    }
    return PUBLISHER_CATALOGS.flatMap((p) => {
      const stacEntry = this.providers!.find((e) => e.title.toLowerCase() === p.id.toLowerCase());
      if (!stacEntry) {
        return [];
      }
      return [this.applyExpandedIcon(new DatasetTreeItem(p.name, 'provider', stacEntry.href))];
    });
  }

  /** Loads datasets for a provider in the background, then refreshes the tree. */
  private async loadProviderInBackground(providerHref: string): Promise<void> {
    try {
      const datasets = await fetchProviderCatalog(providerHref);
      this.providerChildren.set(providerHref, datasets);
      datasets.forEach((d) => this.leafParentMap.set(d.href, providerHref));

      // Fire refresh so the real items replace the spinner
      this._onDidChangeTreeData.fire();

      // Then resolve types in background
      const uncached = datasets.filter((d) => !this.metadataCache.has(d.href));
      if (uncached.length > 0 && !this.loadingProviders.has(providerHref)) {
        this.loadingProviders.add(providerHref);
        this.resolveTypesInBackground(uncached.map((d) => d.href));
      }
    } catch {
      this.providerChildren.set(providerHref, []);
      this._onDidChangeTreeData.fire();
    }
  }

  /** Resolves gee:type for datasets in batches of 10 so icons appear progressively. */
  private async resolveTypesInBackground(hrefs: string[]): Promise<void> {
    const FALLBACK: CollectionMetadata = {
      type: 'unknown',
      title: '',
      description: '',
      keywords: [],
    };
    const batchSize = 10;
    for (let i = 0; i < hrefs.length; i += batchSize) {
      const batch = hrefs.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (href) => {
          try {
            const meta = await fetchCollectionMetadata(href);
            this.metadataCache.set(href, meta);
          } catch {
            // Timed out or unreachable — store fallback so the spinner clears
            this.metadataCache.set(href, FALLBACK);
          }
        }),
      );
      // Refresh after each batch so icons update progressively
      this._onDidChangeTreeData.fire();
    }
  }

  /** Clears all caches and triggers a full tree reload. */
  refresh() {
    this.providers = undefined;
    this.providerChildren.clear();
    this.providerLoadingState.clear();
    this.loadingProviders.clear();
    this.communityThemes = undefined;
    this.communityLoading = false;
    this.typeCache.clear();
    this.metadataCache.clear();
    this.leafParentMap.clear();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Opens an incremental QuickPick search that shows immediately with cached
   * data and loads remaining providers lazily in the background, indicating
   * progress via the QuickPick's built-in busy spinner.
   */
  async searchDatasets(): Promise<DatasetTreeItem | undefined> {
    if (!this.providers) {
      try {
        this.providers = await fetchRootCatalog();
      } catch {
        vscode.window.showErrorMessage('Failed to load dataset catalog');
        return undefined;
      }
    }

    type SearchItem = vscode.QuickPickItem & {
      href: string;
      datasetId: string;
      providerHref: string;
    };

    const qp = vscode.window.createQuickPick<SearchItem>();
    qp.placeholder = 'Search datasets...';
    qp.matchOnDescription = true;

    /** Rebuilds QuickPick items from all currently cached provider children. */
    const rebuildItems = () => {
      const items: SearchItem[] = [];
      for (const [provHref, datasets] of this.providerChildren) {
        for (const d of datasets) {
          const eeId = d.id.replace(/_/g, '/');
          const meta = this.metadataCache.get(d.href);
          items.push({
            label: meta?.title || d.title,
            description: eeId,
            href: d.href,
            datasetId: eeId,
            providerHref: provHref,
          });
        }
      }
      qp.items = items;
    };

    // Show immediately with whatever is already cached from tree expansion
    rebuildItems();
    qp.show();

    // Providers not yet fetched
    const unloaded = this.providers.filter((p) => !this.providerChildren.has(p.href));

    return new Promise((resolve) => {
      let disposed = false;

      if (unloaded.length > 0) {
        qp.busy = true;
        (async () => {
          const batchSize = 5;
          for (let i = 0; i < unloaded.length; i += batchSize) {
            if (disposed) {
              break;
            }
            const batch = unloaded.slice(i, i + batchSize);
            await Promise.allSettled(
              batch.map(async (p) => {
                try {
                  const datasets = await fetchProviderCatalog(p.href);
                  this.providerChildren.set(p.href, datasets);
                  datasets.forEach((d) => this.leafParentMap.set(d.href, p.href));
                } catch {
                  // skip unreachable providers
                }
              }),
            );
            if (!disposed) {
              rebuildItems();
            }
          }
          if (!disposed) {
            qp.busy = false;
          }
        })();
      }

      qp.onDidAccept(() => {
        if (disposed) {
          return;
        }
        disposed = true;
        const [selected] = qp.selectedItems;
        qp.dispose();
        if (!selected) {
          resolve(undefined);
          return;
        }
        // Fetch metadata now if not yet cached so the revealed tree item
        // has a proper icon, tooltip and label instead of a spinner.
        (async () => {
          const FALLBACK: CollectionMetadata = {
            type: 'unknown',
            title: '',
            description: '',
            keywords: [],
          };
          let meta = this.metadataCache.get(selected.href);
          if (!meta) {
            try {
              meta = await fetchCollectionMetadata(selected.href);
            } catch {
              meta = FALLBACK;
            }
            this.metadataCache.set(selected.href, meta);
          }
          const dId = selected.datasetId.replace(/\//g, '_');
          const parts = dId.split('_');
          const shortName = parts.length > 1 ? parts.slice(1).join('_') : dId;
          resolve(
            new DatasetTreeItem(
              meta.title || shortName,
              'dataset',
              selected.href,
              selected.datasetId,
              meta.type,
              undefined,
              undefined,
              meta.description,
              meta.keywords,
            ),
          );
        })();
      });

      qp.onDidHide(() => {
        if (!disposed) {
          disposed = true;
          resolve(undefined);
        }
        qp.dispose();
      });
    });
  }
}
