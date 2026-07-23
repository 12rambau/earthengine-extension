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
import { AssetsTreeDataProvider, AssetTreeItem } from './assetsTreeDataProvider.js';
import { copyAsset, createFolder, deleteAsset, moveAsset } from './eeApiClient.js';
import { openAssetPreview, openAssetsPanel } from '../../editor/assets/index.js';

// ── AssetsSection ───────────────────────────────────────────────────

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
      }
    });

    this.registerCommand('earthengine.refreshAssetFolder', (item: AssetTreeItem) => {
      this.provider.refreshFolder(item.asset.name);
    });

    this.registerCommand('earthengine.openAssetPreview', async (item: AssetTreeItem) => {
      const token = await this.authService.getToken();
      if (!token) {
        vscode.window.showErrorMessage('Not authenticated.');
        return;
      }
      try {
        await openAssetPreview(item.asset.name, token);
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

    this.registerCommand('earthengine.createFolder', async (item?: AssetTreeItem) => {
      const token = await this.authService.getToken();
      if (!token) {
        vscode.window.showErrorMessage('Not authenticated.');
        return;
      }

      // Determine the parent path (selected folder or project root)
      const profile = this.authService.currentProfile!;
      let parent: string;
      if (item && item.isContainer && item.asset.type === 'FOLDER') {
        parent = item.asset.name;
      } else {
        parent = `projects/${profile.project}`;
      }

      // Prompt for folder name (inline, like the files explorer)
      const folderName = await vscode.window.showInputBox({
        prompt: `New folder in ${parent.split('/').pop() || parent}`,
        placeHolder: 'folder-name',
        validateInput: (value) => {
          if (!value) {
            return 'Folder name is required';
          }
          if (/[^a-zA-Z0-9_-]/.test(value)) {
            return 'Only letters, numbers, hyphens and underscores allowed';
          }
          return null;
        },
      });

      if (!folderName) {
        return;
      }

      try {
        await createFolder(parent, folderName, token);
        vscode.window.showInformationMessage(`Folder "${folderName}" created.`);
        // Refresh the parent so the new folder appears
        if (item) {
          this.provider.refreshFolder(item.asset.name);
        } else {
          this.provider.refresh();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to create folder: ${msg}`);
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
          `Delete asset "${name}"?`,
          { modal: true, detail: 'This action cannot be undone.' },
          'Delete',
        );
        if (confirm !== 'Delete') {
          return false;
        }
        try {
          await deleteAsset(name, token);
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
          await moveAsset(source, destination, token);
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
          await copyAsset(source, destination, token);
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
        if (this.normalizeAssetPath(value) === source) {
          return 'Destination must differ from the source';
        }
        return null;
      },
    });
    return input ? this.normalizeAssetPath(input) : undefined;
  }
}
