/**
 * @module assetsTreeDataProvider
 * Tree items and data provider for the Assets sidebar tree.
 *
 * Lazily loads asset children in the background, caches results,
 * and paginates through the Earth Engine REST API.
 */

import * as vscode from 'vscode';
import { AuthService } from '../../auth/index.js';
import { listAssets, EEAsset } from './eeApiClient.js';

// ── Constants ───────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, vscode.ThemeIcon> = {
  FOLDER: new vscode.ThemeIcon('folder'),
  IMAGE_COLLECTION: new vscode.ThemeIcon('layers'),
  IMAGE: new vscode.ThemeIcon('file-media'),
  TABLE: new vscode.ThemeIcon('table'),
};

const CONTAINER_TYPES = new Set(['FOLDER', 'IMAGE_COLLECTION']);

// ── AssetTreeItem ───────────────────────────────────────────────────

/** Tree item representing a single Earth Engine asset (image, table, folder, etc.). */
export class AssetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly asset: EEAsset,
    public readonly isContainer: boolean,
  ) {
    const shortName = asset.name.split('/').pop() || asset.name;
    super(
      shortName,
      isContainer
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.iconPath = TYPE_ICONS[asset.type] || new vscode.ThemeIcon('file');

    // Stable id (the unique asset path) so the tree can reveal this item.
    if (asset.type !== 'PLACEHOLDER') {
      this.id = asset.name;
    }

    const tooltip = new vscode.MarkdownString('', true);
    tooltip.appendMarkdown(`**${asset.type.toLowerCase().replace('_', ' ')}** — ${asset.name}`);
    this.tooltip = tooltip;

    // Context values for menu visibility
    if (isContainer) {
      this.contextValue = `asset-container-${asset.type.toLowerCase()}`;
    } else {
      this.contextValue = `asset-leaf-${asset.type.toLowerCase()}`;
    }
  }

  /** Creates a placeholder tree item (e.g. "Loading..."). */
  static placeholder(
    label: string,
    icon: vscode.ThemeIcon,
    command?: vscode.Command,
  ): AssetTreeItem {
    const dummy: EEAsset = { name: label, type: 'PLACEHOLDER' };
    const item = new AssetTreeItem(dummy, false);
    item.iconPath = icon;
    item.description = undefined;
    if (command) {
      item.command = command;
    }
    return item;
  }
}

// ── AssetsTreeDataProvider ─────────────────────────────────────────

/** Provides lazy-loading asset tree items with background pagination. */
export class AssetsTreeDataProvider implements vscode.TreeDataProvider<AssetTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AssetTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private childrenCache = new Map<string, EEAsset[]>();
  private loadingState = new Set<string>();
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
      return new AssetTreeItem(a, isContainer);
    });
  }

  /** Clears all cached data and triggers a full tree reload. */
  refresh() {
    this.childrenCache.clear();
    this.loadingState.clear();
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

  /**
   * Opens a QuickPick search across the assets already loaded into the tree,
   * returning the selected item. Only cached (expanded) folders are searched —
   * no additional network requests are made.
   */
  async searchAssets(): Promise<AssetTreeItem | undefined> {
    if (!this.authService.isAuthenticated) {
      vscode.window.showErrorMessage('Not authenticated.');
      return undefined;
    }

    // Collect every asset that has already been loaded, de-duplicated by name.
    const seen = new Set<string>();
    const allAssets: EEAsset[] = [];
    for (const assets of this.childrenCache.values()) {
      for (const a of assets) {
        if (a.type !== 'PLACEHOLDER' && !seen.has(a.name)) {
          seen.add(a.name);
          allAssets.push(a);
        }
      }
    }

    if (allAssets.length === 0) {
      vscode.window.showInformationMessage(
        'No assets loaded yet — expand the asset tree, then search.',
      );
      return undefined;
    }

    const picked = await vscode.window.showQuickPick(
      allAssets.map((a) => ({
        label: a.name.split('/').pop() || a.name,
        description: a.name,
        asset: a,
      })),
      { placeHolder: 'Search loaded assets...', matchOnDescription: true },
    );

    if (picked) {
      return new AssetTreeItem(picked.asset, CONTAINER_TYPES.has(picked.asset.type));
    }
    return undefined;
  }
}
