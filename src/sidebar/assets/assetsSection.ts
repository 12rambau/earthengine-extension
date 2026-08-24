/**
 * @module assetsSection
 * Assets sidebar section for the Earth Engine extension.
 *
 * Registers the assets tree view and commands for refreshing,
 * opening asset previews, and launching the full asset manager panel.
 */

import * as vscode from 'vscode';
import { SidebarSection } from '../../shared/baseComponents.js';
import { AuthService } from '../../auth/index.js';
import { AssetsTreeDataProvider } from './assetsTreeDataProvider.js';
import { AssetTreeItem } from './assetTreeItem.js';
import { copyAsset, createFolder, deleteAsset, moveAsset } from './eeApiClient.js';
import { openAssetPreview } from '../../editor/preview/assetPreviewPanel.js';
import { openAssetsPanel } from '../../editor/assets/assetsPanel.js';

// ==================================================================
// ASSETSSECTION
// ==================================================================
/** Sidebar section that displays the user's Earth Engine asset tree. */
export class AssetsSection extends SidebarSection {
  private provider: AssetsTreeDataProvider;

  constructor(private readonly authService: AuthService) {
    super();
    this.provider = new AssetsTreeDataProvider(authService);
  }

  register(context: vscode.ExtensionContext): void {
    const treeView = this.createTreeView('earthengine.assets', this.provider, {
      showCollapseAll: true,
    });

    treeView.onDidExpandElement((e) => this.provider.setExpanded(e.element, true));
    treeView.onDidCollapseElement((e) => this.provider.setExpanded(e.element, false));
    this.registerCommand('earthengine.refreshAssets', () => this.provider.refresh());

    this.registerCommand('earthengine.searchAssets', async () => {
      const item = await this.provider.searchAssets();
      if (item) {
        treeView.reveal(item, { select: true, focus: true, expand: true });
        if (!item.isContainer) {
          vscode.commands.executeCommand('earthengine.openAssetPreview', item);
        }
      }
    });

    this.registerCommand('earthengine.refreshAssetFolder', (item: AssetTreeItem) => {
      this.provider.refreshFolder(item.asset.name);
    });

    this.registerCommand('earthengine.openAssetPreview', async (arg: AssetTreeItem | string) => {
      const token = await this.authService.getToken();
      if (!token) {
        vscode.window.showErrorMessage('Not authenticated.');
        return;
      }
      const name = typeof arg === 'string' ? arg : arg.asset.name;
      try {
        await openAssetPreview(name, token);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to load asset: ${msg}`);
      }
    });

    this.registerCommand('earthengine.openAssetsPanel', () => {
      openAssetsPanel(this.authService, context);
    });

    this.registerCommand('earthengine.copyAssetId', (item: AssetTreeItem) => {
      vscode.env.clipboard.writeText(item.asset.name);
      vscode.window.showInformationMessage(`Copied: ${item.asset.name}`);
    });

    this.registerCommand('earthengine.createFolder', async (item?: AssetTreeItem | string) => {
      const token = await this.authService.getToken();
      if (!token) {
        vscode.window.showErrorMessage('Not authenticated.');
        return false;
      }

      const profile = this.authService.currentProfile!;
      const projectRoot = `projects/${profile.project}`;

      // The locked prefix the user cannot delete.
      let basePath: string;
      if (typeof item === 'string') {
        basePath = item + '/';
      } else if (item && item.isContainer && item.asset.type === 'FOLDER') {
        basePath = item.asset.name + '/';
      } else {
        basePath = `${projectRoot}/assets/`;
      }

      // Cache of folder children (full paths) keyed by full parent path.
      const folderCache = new Map<string, string[]>();
      const loadChildren = async (dir: string): Promise<string[]> => {
        if (folderCache.has(dir)) {
          return folderCache.get(dir)!;
        }
        try {
          const { listAllAssets } = await import('./eeApiClient.js');
          const listParent = dir === `${projectRoot}/assets` ? projectRoot : dir;
          const children = await listAllAssets(listParent, token);
          // Store FULL paths so labels match the QuickPick value for fuzzy filtering.
          const paths = children.filter((a) => a.type === 'FOLDER').map((a) => a.name);
          folderCache.set(dir, paths);
          return paths;
        } catch {
          folderCache.set(dir, []);
          return [];
        }
      };

      const quickPick = vscode.window.createQuickPick();
      quickPick.title = 'Create Folder';
      quickPick.placeholder = 'Navigate with Enter, then type a new name';
      quickPick.value = basePath;

      /** Updates items with full-path labels so VS Code fuzzy matching works. */
      const refreshItems = (dir: string) => {
        const paths = folderCache.get(dir) || [];
        quickPick.items = paths.map((p) => ({
          label: p,
          description: p.split('/').pop() || p,
        }));
      };

      // Pre-load the initial directory.
      const initDir = basePath.replace(/\/$/, '');
      quickPick.busy = true;
      await loadChildren(initDir);
      quickPick.busy = false;
      refreshItems(initDir);
      quickPick.show();

      // Flag to prevent accept immediately after a navigation click.
      let justNavigated = false;

      // Enforce the locked prefix and lazy-load children.
      quickPick.onDidChangeValue((value) => {
        // Any user-initiated value change clears the navigation flag.
        justNavigated = false;

        if (!value.startsWith(basePath)) {
          quickPick.value = basePath;
          return;
        }

        // Determine which directory to show children for.
        const lastSlash = value.lastIndexOf('/');
        const dir = lastSlash >= 0 ? value.slice(0, lastSlash) : initDir;

        if (folderCache.has(dir)) {
          refreshItems(dir);
        } else if (dir.startsWith(`${projectRoot}/assets`)) {
          quickPick.busy = true;
          loadChildren(dir).then(() => {
            quickPick.busy = false;
            const currentSlash = quickPick.value.lastIndexOf('/');
            const currentDir = currentSlash >= 0 ? quickPick.value.slice(0, currentSlash) : initDir;
            if (currentDir === dir) {
              refreshItems(dir);
            }
          });
        }
      });

      const result = await new Promise<string | undefined>((resolve) => {
        let resolved = false;

        // Clicking an item auto-completes the path (navigation).
        quickPick.onDidChangeSelection((selection) => {
          if (selection.length === 0) {
            return;
          }
          const selected = selection[0];
          const newValue = selected.label + '/';
          quickPick.value = newValue;
          // Prevent the accept that fires right after a click.
          justNavigated = true;

          const newDir = selected.label;
          if (!folderCache.has(newDir)) {
            quickPick.busy = true;
            loadChildren(newDir).then(() => {
              quickPick.busy = false;
              refreshItems(newDir);
            });
          } else {
            refreshItems(newDir);
          }
        });

        // Enter validates — creates the folder at the typed path.
        quickPick.onDidAccept(() => {
          if (justNavigated) {
            return;
          }
          const value = quickPick.value.replace(/\/+$/, '');
          if (value && value !== initDir) {
            resolved = true;
            quickPick.hide();
            resolve(value);
          }
        });

        quickPick.onDidHide(() => {
          quickPick.dispose();
          if (!resolved) {
            resolve(undefined);
          }
        });
      });

      if (!result) {
        return false;
      }

      // Extract relative path after projects/{project}/assets/.
      const assetsPrefix = `${projectRoot}/assets/`;
      if (!result.startsWith(assetsPrefix)) {
        vscode.window.showErrorMessage(`Folder path must start with "${assetsPrefix}".`);
        return false;
      }
      const relativePath = result.slice(assetsPrefix.length);

      if (!relativePath) {
        return false;
      }

      // Validate all segments.
      const segments = relativePath.split('/').filter(Boolean);
      for (const seg of segments) {
        if (/[^a-zA-Z0-9_-]/.test(seg) || !seg) {
          vscode.window.showErrorMessage(
            `Invalid segment "${seg}" — only letters, numbers, hyphens and underscores allowed.`,
          );
          return false;
        }
      }

      // Create all intermediate folders (mkdir -p behavior).
      // Skip segments that already exist as assets.
      try {
        const { getAsset } = await import('./eeApiClient.js');
        let currentPath = '';
        for (const segment of segments) {
          currentPath = currentPath ? `${currentPath}/${segment}` : segment;
          const fullName = `${projectRoot}/assets/${currentPath}`;
          // Check if this segment already exists.
          let exists = false;
          try {
            await getAsset(fullName, token);
            exists = true;
          } catch (e) {
            const msg = e instanceof Error ? e.message : '';
            if (!/HTTP 404\b|NOT_FOUND/.test(msg)) {
              throw e;
            }
          }
          if (!exists) {
            await createFolder(projectRoot, currentPath, token);
          }
        }
        vscode.window.showInformationMessage(`Folder "${segments.join('/')}" created.`);
        if (typeof item === 'string') {
          // Called from the panel — refresh handled by caller
        } else if (item) {
          this.provider.refreshFolder(item.asset.name);
        } else {
          this.provider.refresh();
        }
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to create folder: ${msg}`);
        return false;
      }
    });

    this.registerCommand(
      'earthengine.deleteAsset',
      async (arg?: AssetTreeItem | string): Promise<boolean> => {
        const token = await this.authService.getToken();
        if (!token) {
          vscode.window.showErrorMessage('Not authenticated.');
          return false;
        }
        const name = await this.resolveAssetName(arg, 'Asset to delete');
        if (!name) {
          return false;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Delete "${name.split('/').pop()}"? This action cannot be undone.`,
          'Delete',
        );
        if (confirm !== 'Delete') {
          return false;
        }
        try {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Deleting asset…' },
            (_progress) => {
              _progress.report({ message: name });
              return deleteAsset(name, token, (assetName) => {
                _progress.report({ message: assetName });
              });
            },
          );
          vscode.window.showInformationMessage(`Asset "${name}" deleted.`);
          this.provider.refresh();
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to delete asset: ${msg}`);
          return false;
        }
      },
    );

    this.registerCommand(
      'earthengine.moveAsset',
      async (arg?: AssetTreeItem | string): Promise<boolean> => {
        const token = await this.authService.getToken();
        if (!token) {
          vscode.window.showErrorMessage('Not authenticated.');
          return false;
        }
        const source = await this.resolveAssetName(arg, 'Asset to move');
        if (!source) {
          return false;
        }
        const destination = await this.promptDestination('Move', source);
        if (!destination) {
          return false;
        }
        try {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Moving asset…' },
            (_progress) => {
              _progress.report({ message: source });
              return moveAsset(source, destination, token, (assetName) => {
                _progress.report({ message: assetName });
              });
            },
          );
          vscode.window.showInformationMessage(`Asset moved to "${destination}".`);
          this.provider.refresh();
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to move asset: ${msg}`);
          return false;
        }
      },
    );

    this.registerCommand(
      'earthengine.copyAsset',
      async (arg?: AssetTreeItem | string): Promise<boolean> => {
        const token = await this.authService.getToken();
        if (!token) {
          vscode.window.showErrorMessage('Not authenticated.');
          return false;
        }
        const source = await this.resolveAssetName(arg, 'Asset to copy');
        if (!source) {
          return false;
        }
        const destination = await this.promptDestination('Copy', source);
        if (!destination) {
          return false;
        }
        try {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Copying asset…' },
            (_progress) => {
              _progress.report({ message: source });
              return copyAsset(source, destination, token, (assetName) => {
                _progress.report({ message: assetName });
              });
            },
          );
          vscode.window.showInformationMessage(`Asset copied to "${destination}".`);
          this.provider.refresh();
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to copy asset: ${msg}`);
          return false;
        }
      },
    );

    context.subscriptions.push(this);
  }

  /** Expands a bare or relative path into a full "projects/…/assets/…" path. */
  private normalizeAssetPath(path: string): string {
    const trimmed = path.trim().replace(/^\/+|\/+$/g, '');
    if (trimmed.startsWith('projects/')) {
      return trimmed;
    }
    const profile = this.authService.currentProfile!;
    return `projects/${profile.project}/assets/${trimmed}`;
  }

  /**
   * Resolves the target asset name from a tree item, a raw path string
   * (sent by the Asset Manager panel), or an input box (command palette).
   */
  private async resolveAssetName(
    arg: AssetTreeItem | string | undefined,
    prompt: string,
  ): Promise<string | undefined> {
    if (typeof arg === 'string') {
      return this.normalizeAssetPath(arg);
    }
    if (arg?.asset?.name) {
      return arg.asset.name;
    }
    const input = await vscode.window.showInputBox({
      prompt,
      placeHolder: 'path/to/asset or projects/my-project/assets/path',
      validateInput: (value) => (value.trim() ? null : 'Asset path is required'),
    });
    return input ? this.normalizeAssetPath(input) : undefined;
  }

  /** Prompts for a destination path, pre-filled with the source path. */
  private async promptDestination(verb: string, source: string): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({
      prompt: `${verb} "${source}" to`,
      value: source,
      valueSelection: [source.lastIndexOf('/') + 1, source.length],
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Destination path is required';
        }
        const normalized = this.normalizeAssetPath(value);
        if (normalized === source || normalized.startsWith(source + '/')) {
          return 'Destination cannot be the source or inside it';
        }
        return null;
      },
    });
    return input ? this.normalizeAssetPath(input) : undefined;
  }
}
