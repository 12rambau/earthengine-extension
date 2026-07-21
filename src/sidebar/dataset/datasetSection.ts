/**
 * @module datasetSection
 * Dataset catalog sidebar section for the Earth Engine extension.
 *
 * Registers the dataset tree view and commands for refreshing,
 * searching, opening dataset pages in the browser, and launching
 * a dataset detail panel inside VS Code.
 */

import * as vscode from 'vscode';
import { SidebarSection } from '../../shared/baseComponents.js';
import { DatasetTreeDataProvider, DatasetTreeItem } from './datasetTreeDataProvider.js';
import { fetchCollection, getDatasetPageUrl } from './stacClient.js';
import { createDatasetPanel } from '../../editor/dataset/index.js';

// ── DatasetSection ──────────────────────────────────────────────────

/** Sidebar section for browsing the Earth Engine public dataset catalog. */
export class DatasetSection extends SidebarSection {
	private provider: DatasetTreeDataProvider;

	constructor() {
		super();
		this.provider = new DatasetTreeDataProvider();
	}

	register(context: vscode.ExtensionContext): void {
		this.createTreeView('earthengine.dataset', this.provider, { showCollapseAll: true });

		this.registerCommand('earthengine.refreshDatasets', () => this.provider.refresh());

		this.registerCommand('earthengine.searchDatasets', () => this.provider.searchDatasets());

		this.registerCommand('earthengine.openDatasetInBrowser', (item: DatasetTreeItem) => {
			if (item.datasetId) {
				vscode.env.openExternal(vscode.Uri.parse(getDatasetPageUrl(item.datasetId)));
			}
		});

		this.registerCommand('earthengine.openDatasetPanel', async (hrefOrItem: string | DatasetTreeItem) => {
			const href = typeof hrefOrItem === 'string' ? hrefOrItem : hrefOrItem.stacHref;
			if (!href) { return; }
			try {
				const collection = await fetchCollection(href);
				createDatasetPanel(collection, context.extensionUri);
			} catch {
				vscode.window.showErrorMessage('Failed to load dataset details.');
			}
		});

		context.subscriptions.push(this);
	}
}
