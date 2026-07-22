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
import { createFolder } from './eeApiClient.js';
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
    this.createTreeView('earthengine.assets', this.provider, { showCollapseAll: true });

    this.registerCommand('earthengine.refreshAssets', () => this.provider.refresh());

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
      openAssetsPanel(this.authService);
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

    context.subscriptions.push(this);
  }
}
