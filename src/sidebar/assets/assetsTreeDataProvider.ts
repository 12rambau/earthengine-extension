/**
 * @module assetsTreeDataProvider
 * Data provider for the Assets sidebar tree.
 *
 * Lazily loads asset children in the background, caches results,
 * and paginates through the Earth Engine REST API.
 */

import * as vscode from 'vscode';
import { AuthService } from '../../auth/index.js';
import { ensureEe, computeValue } from '../../shared/eeSession.js';
import { listAssets, listAllAssets, EEAsset } from './eeApiClient.js';
import { AssetTreeItem, TYPE_ICONS, resolveTypeIcon } from './assetTreeItem.js';

// ==================================================================
// CONSTANTS
// ==================================================================
const CONTAINER_TYPES = new Set(['FOLDER']);

// ==================================================================
// ASSETSTREEDATAPROVIDER
// ==================================================================
/** Provides lazy-loading asset tree items with background pagination. */
export class AssetsTreeDataProvider implements vscode.TreeDataProvider<AssetTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AssetTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private childrenCache = new Map<string, EEAsset[]>();
  private loadingState = new Set<string>();
  private expandedFolders = new Set<string>();
  // Reverse indexes used for search + reveal.
  private parentMap = new Map<string, string>();
  private assetByName = new Map<string, EEAsset>();

  constructor(private readonly authService: AuthService) {
    authService.onDidChangeAuth(() => this.refresh());
  }

  getTreeItem(element: AssetTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: AssetTreeItem): AssetTreeItem | undefined {
    const parentKey = this.parentMap.get(element.asset.name);
    if (!parentKey) {
      return undefined;
    }
    // Children of the project root are top-level items (no tree parent).
    const profile = this.authService.currentProfile;
    if (profile && parentKey === `projects/${profile.project}`) {
      return undefined;
    }
    const parentAsset = this.assetByName.get(parentKey);
    return parentAsset ? new AssetTreeItem(parentAsset, true) : undefined;
  }

  async getChildren(element?: AssetTreeItem): Promise<AssetTreeItem[]> {
    if (!this.authService.isAuthenticated) {
      return [
        AssetTreeItem.placeholder(
          'Not authenticated — Sign in to view assets',
          new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground')),
          { command: 'earthengine.signIn', title: 'Sign In' },
        ),
      ];
    }

    const profile = this.authService.currentProfile!;
    const parent = element ? element.asset.name : `projects/${profile.project}`;

    // Check cache
    const cached = this.childrenCache.get(parent);
    if (cached) {
      return this.mapAssets(cached);
    }

    // If already loading, show spinner
    if (this.loadingState.has(parent)) {
      return [AssetTreeItem.placeholder('Loading...', new vscode.ThemeIcon('loading~spin'))];
    }

    // Start loading in background
    this.loadingState.add(parent);
    this.loadAssetsInBackground(parent);

    return [AssetTreeItem.placeholder('Loading...', new vscode.ThemeIcon('loading~spin'))];
  }

  /** Loads and caches all pages of child assets for a parent path. */
  private async loadAssetsInBackground(parent: string): Promise<void> {
    try {
      const token = await this.authService.getToken();
      if (!token) {
        return;
      }

      const allAssets: EEAsset[] = [];
      let pageToken: string | undefined;

      do {
        const response = await listAssets(parent, token, 200, pageToken);
        if (response.assets) {
          allAssets.push(...response.assets);
        }
        pageToken = response.nextPageToken;
      } while (pageToken);

      this.childrenCache.set(parent, allAssets);
      this.indexChildren(parent, allAssets);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Store empty array with error indicator
      this.childrenCache.set(parent, []);
      if (message.includes('403') || message.includes('404')) {
        vscode.window.showWarningMessage(`No assets found in project or access denied.`);
      }
    } finally {
      this.loadingState.delete(parent);
      this._onDidChangeTreeData.fire();
    }
  }

  /** Records the parent → children relationship so items can be found and revealed. */
  private indexChildren(parent: string, assets: EEAsset[]): void {
    for (const a of assets) {
      this.parentMap.set(a.name, parent);
      this.assetByName.set(a.name, a);
    }
  }

  /** Converts raw EEAsset items to AssetTreeItem instances. */
  private mapAssets(assets: EEAsset[]): AssetTreeItem[] {
    return assets.map((a) => {
      const isContainer = CONTAINER_TYPES.has(a.type);
      const item = new AssetTreeItem(a, isContainer);
      if (isContainer && this.expandedFolders.has(a.name)) {
        item.iconPath = new vscode.ThemeIcon('folder-opened');
      }
      return item;
    });
  }

  /** Clears all cached data and triggers a full tree reload. */
  refresh() {
    this.childrenCache.clear();
    this.loadingState.clear();
    this.expandedFolders.clear();
    this.parentMap.clear();
    this.assetByName.clear();
    this._onDidChangeTreeData.fire();
  }

  /** Invalidates the cache for a single folder and reloads it. */
  refreshFolder(assetName: string) {
    this.childrenCache.delete(assetName);
    this.loadingState.delete(assetName);
    // Drop stale index entries for this folder's children.
    for (const [name, parent] of this.parentMap) {
      if (parent === assetName) {
        this.parentMap.delete(name);
        this.assetByName.delete(name);
      }
    }
    this._onDidChangeTreeData.fire();
  }

  /** Updates the folder icon when the user expands or collapses a folder. */
  setExpanded(item: AssetTreeItem, expanded: boolean): void {
    if (!item.isContainer) {
      return;
    }
    if (expanded) {
      this.expandedFolders.add(item.asset.name);
      item.iconPath = new vscode.ThemeIcon('folder-opened');
    } else {
      this.expandedFolders.delete(item.asset.name);
      item.iconPath = resolveTypeIcon(item.asset.type);
    }
    this._onDidChangeTreeData.fire(item);
  }

  /**
   * Lazily resolves the tooltip for a tree item by fetching full asset metadata
   * (including description) on hover, without slowing down the initial tree load.
   */
  async resolveTreeItem(
    item: vscode.TreeItem,
    element: AssetTreeItem,
    cancellation: vscode.CancellationToken,
  ): Promise<vscode.TreeItem> {
    if (element.asset.type === 'PLACEHOLDER' || element.asset.description) {
      return item;
    }
    try {
      const ee = (await ensureEe()) as any;
      if (cancellation.isCancellationRequested) {
        return item;
      }

      let eeObj: any;
      switch (element.asset.type) {
        case 'IMAGE':
          eeObj = ee.Image(element.asset.name);
          break;
        case 'IMAGE_COLLECTION':
          eeObj = ee.ImageCollection(element.asset.name);
          break;
        case 'TABLE':
          eeObj = ee.FeatureCollection(element.asset.name);
          break;
        default:
          return item;
      }

      const description = await computeValue<string>(eeObj.get('description'));
      if (cancellation.isCancellationRequested || !description) {
        return item;
      }

      element.asset.description = description;
      const tooltip = new vscode.MarkdownString('', true);
      tooltip.isTrusted = true;
      tooltip.appendMarkdown(
        `**${element.asset.type.toLowerCase().replace(/_/g, ' ')}** — \`${element.asset.name}\`\n\n`,
      );
      if (element.asset.title) {
        tooltip.appendMarkdown(`**${element.asset.title}**\n\n`);
      }
      const truncated =
        description.length > 200 ? description.slice(0, 200) + '\u2026' : description;
      tooltip.appendText(truncated);
      item.tooltip = tooltip;
    } catch {
      // Ignore — keep the basic tooltip.
    }
    return item;
  }

  /**
   * Progressive asset search that recursively indexes the entire project.
   *
   * Opens a QuickPick immediately with whatever is already cached, then
   * crawls all FOLDER children in the background, stopping at IMAGE_COLLECTION
   * (never listing their internal images). Items stream into the list as they
   * are discovered. Everything loaded is kept in the shared cache.
   */
  async searchAssets(): Promise<AssetTreeItem | undefined> {
    if (!this.authService.isAuthenticated) {
      vscode.window.showErrorMessage('Not authenticated.');
      return undefined;
    }

    const token = await this.authService.getToken();
    if (!token) {
      return undefined;
    }

    const profile = this.authService.currentProfile!;
    const projectRoot = `projects/${profile.project}`;

    // Flat index of all leaf assets found so far (IMAGE, IMAGE_COLLECTION, TABLE).
    const searchIndex = new Map<string, EEAsset>();
    const fetchedFolders = new Set<string>();

    /** Seed the index from the existing childrenCache. */
    for (const [, assets] of this.childrenCache) {
      for (const a of assets) {
        if (a.type !== 'PLACEHOLDER' && a.type !== 'FOLDER') {
          searchIndex.set(a.name, a);
        }
      }
    }

    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { asset: EEAsset }>();
    quickPick.placeholder = 'Search assets — indexing project in background…';
    quickPick.matchOnDescription = true;
    quickPick.busy = true;

    const refreshItems = () => {
      const items: (vscode.QuickPickItem & { asset: EEAsset })[] = [];
      for (const [name, asset] of searchIndex) {
        const shortName = name.split('/').pop() || name;
        const relativePath = name.slice(projectRoot.length + 1);
        items.push({
          label: `$(${iconId(asset.type)}) ${shortName}`,
          description: relativePath,
          asset,
        });
      }
      quickPick.items = items;
    };

    refreshItems();
    quickPick.show();

    // Crawl in the background — breadth-first, skip IMAGE_COLLECTION internals.
    let cancelled = false;

    const crawl = async (parent: string): Promise<void> => {
      if (cancelled || fetchedFolders.has(parent)) {
        return;
      }
      fetchedFolders.add(parent);

      let assets: EEAsset[];
      if (this.childrenCache.has(parent)) {
        assets = this.childrenCache.get(parent)!;
      } else {
        try {
          assets = await listAllAssets(parent, token);
          this.childrenCache.set(parent, assets);
          this.indexChildren(parent, assets);
        } catch {
          return;
        }
      }

      const subFolders: string[] = [];
      for (const a of assets) {
        if (cancelled) {
          return;
        }
        if (a.type === 'FOLDER') {
          subFolders.push(a.name);
        } else if (a.type !== 'PLACEHOLDER') {
          searchIndex.set(a.name, a);
        }
      }

      // Update items after each folder is processed.
      if (cancelled) {
        return;
      }
      refreshItems();

      // Recurse into subfolders (not IMAGE_COLLECTIONs).
      for (const folder of subFolders) {
        if (cancelled) {
          return;
        }
        await crawl(folder);
      }
    };

    // Fire-and-forget — crawl runs while the user can already interact.
    void crawl(projectRoot)
      .then(() => {
        if (!cancelled) {
          quickPick.busy = false;
          quickPick.placeholder = 'Search assets';
          refreshItems();
        }
      })
      .catch(() => {
        // Indexing failed — leave whatever was already discovered.
      });

    return new Promise<AssetTreeItem | undefined>((resolve) => {
      let resolved = false;
      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        cancelled = true;
        resolved = true;
        quickPick.hide();
        if (selected?.asset) {
          resolve(new AssetTreeItem(selected.asset, CONTAINER_TYPES.has(selected.asset.type)));
        } else {
          resolve(undefined);
        }
      });
      quickPick.onDidHide(() => {
        cancelled = true;
        quickPick.dispose();
        if (!resolved) {
          resolve(undefined);
        }
      });
    });
  }
}

/** Maps asset type to a codicon id for QuickPick labels. */
function iconId(type: string): string {
  switch (type) {
    case 'IMAGE_COLLECTION':
      return 'layers';
    case 'IMAGE':
      return 'file-media';
    case 'TABLE':
      return 'table';
    default:
      return 'file';
  }
}
