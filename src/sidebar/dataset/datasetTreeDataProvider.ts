/**
 * @module datasetTreeDataProvider
 * Tree items and data provider for the Dataset sidebar tree.
 *
 * Displays the STAC-based Earth Engine dataset catalog organized into
 * Google, Publishers, and Community categories. Provider children and
 * dataset types are resolved lazily in the background.
 */

import * as vscode from 'vscode';
import { fetchRootCatalog, fetchProviderCatalog, fetchCollectionType, getDatasetPageUrl } from './stacClient.js';

type NodeType = 'category' | 'provider' | 'dataset';

// ── Constants ───────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, vscode.ThemeIcon> = {
	'image_collection': new vscode.ThemeIcon('layers'),
	'image': new vscode.ThemeIcon('file-media'),
	'table': new vscode.ThemeIcon('table'),
};

// ── Publisher / Community Catalogs ───────────────────────────────

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

const COMMUNITY_CATALOGS = [
	{ name: 'Awesome GEE Community Catalog', id: 'sat-io' },
];

// ── DatasetTreeItem ────────────────────────────────────────────────

/** Tree item representing a dataset category, provider, or individual dataset. */
export class DatasetTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly nodeType: NodeType,
		public readonly stacHref: string,
		public readonly datasetId?: string,
		geeType?: string,
		loading?: boolean,
		public readonly externalUrl?: string,
	) {
		super(label);

		if (nodeType === 'category') {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
			this.iconPath = new vscode.ThemeIcon('folder-library');
			this.contextValue = 'dataset-category';
		} else if (loading) {
			this.collapsibleState = vscode.TreeItemCollapsibleState.None;
			this.iconPath = new vscode.ThemeIcon('loading~spin');
			this.contextValue = 'dataset-loading';
		} else if (nodeType === 'provider') {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
			this.iconPath = new vscode.ThemeIcon('database');
			this.contextValue = 'dataset-provider';
			if (externalUrl) {
				this.command = {
					command: 'vscode.open',
					title: 'Open',
					arguments: [vscode.Uri.parse(externalUrl)],
				};
			}
		} else {
			this.collapsibleState = vscode.TreeItemCollapsibleState.None;
			this.iconPath = geeType
				? (TYPE_ICONS[geeType] || new vscode.ThemeIcon('file'))
				: new vscode.ThemeIcon('loading~spin');
			this.contextValue = 'dataset-item';
			if (datasetId) {
				this.description = datasetId;
			}
			if (geeType) {
				this.tooltip = `${datasetId || label} (${geeType})`;
			}
		}
	}
}

// ── DatasetTreeDataProvider ────────────────────────────────────────

/** Provides a three-level dataset tree: category → provider → datasets. */
export class DatasetTreeDataProvider implements vscode.TreeDataProvider<DatasetTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<DatasetTreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private providers: { id: string; title: string; href: string }[] | undefined;
	private typeCache = new Map<string, string>();
	private loadingProviders = new Set<string>();
	private providerChildren = new Map<string, { id: string; title: string; href: string }[]>();
	private providerLoadingState = new Set<string>();

	getTreeItem(element: DatasetTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: DatasetTreeItem): Promise<DatasetTreeItem[]> {
		if (!element) {
			return [
				new DatasetTreeItem('Google', 'category', 'google'),
				new DatasetTreeItem('Publishers', 'category', 'publishers'),
				new DatasetTreeItem('Community', 'category', 'community'),
			];
		}

		if (element.nodeType === 'category') {
			if (element.stacHref === 'google') {
				return this.getGoogleProviders();
			}
			if (element.stacHref === 'publishers') {
				return PUBLISHER_CATALOGS.map(p =>
					new DatasetTreeItem(
						p.name, 'provider', '', undefined, undefined, false,
						`https://developers.google.com/earth-engine/datasets/publisher/${p.id}`,
					)
				);
			}
			if (element.stacHref === 'community') {
				return COMMUNITY_CATALOGS.map(c =>
					new DatasetTreeItem(
						c.name, 'provider', '', undefined, undefined, false,
						`https://developers.google.com/earth-engine/datasets/community/${c.id}`,
					)
				);
			}
			return [];
		}

		if (element.nodeType === 'provider' && element.stacHref) {
			const cached = this.providerChildren.get(element.stacHref);

			if (cached) {
				return cached.map(d => {
					const eeId = d.id.replace(/_/g, '/');
					const parts = d.id.split('_');
					const shortName = parts.length > 1 ? parts.slice(1).join('_') : d.id;
					const cachedType = this.typeCache.get(d.href);
					return new DatasetTreeItem(shortName, 'dataset', d.href, eeId, cachedType);
				});
			}

			if (!this.providerLoadingState.has(element.stacHref)) {
				this.providerLoadingState.add(element.stacHref);
				this.loadProviderInBackground(element.stacHref);
			}

			return [new DatasetTreeItem('Loading...', 'dataset', '', undefined, undefined, true)];
		}

		return [];
	}

	/** Fetches and caches the Google providers from the STAC root catalog. */
	private async getGoogleProviders(): Promise<DatasetTreeItem[]> {
		if (!this.providers) {
			try {
				this.providers = await fetchRootCatalog();
			} catch {
				vscode.window.showErrorMessage('Failed to load dataset catalog');
				return [];
			}
		}
		return this.providers.map(p => new DatasetTreeItem(p.title, 'provider', p.href));
	}

	/** Loads datasets for a provider in the background, then refreshes the tree. */
	private async loadProviderInBackground(providerHref: string): Promise<void> {
		try {
			const datasets = await fetchProviderCatalog(providerHref);
			this.providerChildren.set(providerHref, datasets);

			// Fire refresh so the real items replace the spinner
			this._onDidChangeTreeData.fire();

			// Then resolve types in background
			const uncached = datasets.filter(d => !this.typeCache.has(d.href));
			if (uncached.length > 0 && !this.loadingProviders.has(providerHref)) {
				this.loadingProviders.add(providerHref);
				this.resolveTypesInBackground(uncached.map(d => d.href));
			}
		} catch {
			this.providerChildren.set(providerHref, []);
			this._onDidChangeTreeData.fire();
		}
	}

	/** Resolves gee:type for datasets in batches of 10 so icons appear progressively. */
	private async resolveTypesInBackground(hrefs: string[]): Promise<void> {
		const batchSize = 10;
		for (let i = 0; i < hrefs.length; i += batchSize) {
			const batch = hrefs.slice(i, i + batchSize);
			const results = await Promise.allSettled(
				batch.map(async href => {
					const type = await fetchCollectionType(href);
					this.typeCache.set(href, type);
				})
			);
			// Refresh after each batch so icons update progressively
			if (results.some(r => r.status === 'fulfilled')) {
				this._onDidChangeTreeData.fire();
			}
		}
	}

	/** Clears all caches and triggers a full tree reload. */
	refresh() {
		this.providers = undefined;
		this.providerChildren.clear();
		this.providerLoadingState.clear();
		this.loadingProviders.clear();
		this.typeCache.clear();
		this._onDidChangeTreeData.fire();
	}

	/** Opens a QuickPick search across all datasets in the catalog. */
	async searchDatasets(): Promise<void> {
		if (!this.providers) {
			this.providers = await fetchRootCatalog();
		}

		// Collect all datasets across all providers
		const allItems: { label: string; datasetId: string; href: string; provider: string }[] = [];

		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Loading dataset index...' },
			async () => {
				const results = await Promise.all(
					this.providers!.map(async p => {
						try {
							const datasets = await fetchProviderCatalog(p.href);
							return datasets.map(d => ({
								label: `${p.title}/${d.title}`,
								datasetId: d.id.replace(/_/g, '/'),
								href: d.href,
								provider: p.title,
							}));
						} catch {
							return [];
						}
					})
				);
				for (const batch of results) {
					allItems.push(...batch);
				}
			}
		);

		const picked = await vscode.window.showQuickPick(
			allItems.map(item => ({
				label: item.label,
				description: item.datasetId,
				item,
			})),
			{ placeHolder: 'Search datasets...', matchOnDescription: true }
		);

		if (picked) {
			const url = getDatasetPageUrl(picked.item.datasetId);
			const choice = await vscode.window.showQuickPick(
				[
					{ label: '$(link-external) Open in browser', action: 'browser' },
					{ label: '$(open-preview) Open in VS Code', action: 'panel' },
				],
				{ placeHolder: picked.item.label }
			);
			if (choice?.action === 'browser') {
				vscode.env.openExternal(vscode.Uri.parse(url));
			} else if (choice?.action === 'panel') {
				vscode.commands.executeCommand('earthengine.openDatasetPanel', picked.item.href);
			}
		}
	}
}

