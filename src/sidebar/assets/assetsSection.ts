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

		context.subscriptions.push(this);
	}
}
