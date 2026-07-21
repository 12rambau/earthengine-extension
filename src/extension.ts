import * as vscode from 'vscode';
import { AuthStatusBar } from './statusBar/index.js';
import { AssetsTreeDataProvider, AssetTreeItem, openAssetPreview, openAssetsPanel } from './views/assets/index.js';
import { DocsTreeDataProvider } from './views/docs/index.js';
import { TasksTreeDataProvider, TaskTreeItem, cancelOperation, openTasksPanel } from './views/tasks/index.js';
import { DatasetTreeDataProvider, DatasetTreeItem, createDatasetPanel, fetchCollection, getDatasetPageUrl } from './views/dataset/index.js';
import { ProfilesTreeDataProvider } from './views/profiles/index.js';
import { AuthService, TokenStorage, Profile } from './auth/index.js';
import { getDocUrl } from './views/docs/apiDocsParser.js';
import { openMapPanel, disposeMapPanel } from './map/index.js';

export function activate(context: vscode.ExtensionContext) {
	// Auth setup
	const tokenStorage = new TokenStorage(context.globalState);
	const authService = new AuthService(tokenStorage);

	// Status bar
	const authStatusBar = new AuthStatusBar();
	authService.onDidChangeAuth((profile) => {
		authStatusBar.setAuthenticated(!!profile);
	});
	context.subscriptions.push(authStatusBar);

	// Profiles view
	const profilesProvider = new ProfilesTreeDataProvider(authService);
	const profilesTreeView = vscode.window.createTreeView('earthengine.profiles', {
		treeDataProvider: profilesProvider,
	});
	context.subscriptions.push(profilesTreeView);

	// Auth commands
	context.subscriptions.push(
		vscode.commands.registerCommand('earthengine.signIn', () => authService.signIn()),
		vscode.commands.registerCommand('earthengine.signOut', () => {
			authService.signOut();
			vscode.window.showInformationMessage('Signed out of Earth Engine.');
		}),
		vscode.commands.registerCommand('earthengine.activateProfile', (profile: Profile) => {
			authService.activateProfile(profile);
		}),
		vscode.commands.registerCommand('earthengine.removeProfile', (item: { profile: Profile }) => {
			authService.removeProfile(item.profile);
			profilesProvider.refresh();
		}),
		vscode.commands.registerCommand('earthengine.showAuthStatus', () => {
			if (authService.isAuthenticated) {
				const p = authService.currentProfile!;
				vscode.window.showInformationMessage(`Connected as ${p.email} (project: ${p.project})`);
			} else {
				vscode.window.showWarningMessage('Google Earth Engine is not authenticated.', 'Sign in')
					.then(choice => { if (choice === 'Sign in') { authService.signIn(); } });
			}
		}),
		vscode.commands.registerCommand('earthengine.newScript', async (item: { profile: Profile }) => {
			const project = item.profile.project;
			const content = [
				'import ee',
				'from earthengine_vscode_map import Map',
				'',
				'# prior to execute this code make sure you are authenticated',
				`ee.Initialize(project="${project}")`,
				'',
				'# TODO: remove',
				'# check server connection',
				'print(ee.Number(1).getInfo())',
				'',
				'# Example: add a layer to the VS Code map',
				'# image = ee.Image("COPERNICUS/S2_SR_HARMONIZED/20200101T100319_20200101T100321_T32TQM")',
				'# Map.addLayer(image, {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}, "RGB")',
				'# Map.centerObject(image, zoom=10)',
				'',
			].join('\n');
			const doc = await vscode.workspace.openTextDocument({ content, language: 'python' });
			vscode.window.showTextDocument(doc);
		}),
	);

	// Assets view
	const assetsProvider = new AssetsTreeDataProvider(authService);
	const assetsTreeView = vscode.window.createTreeView('earthengine.assets', {
		treeDataProvider: assetsProvider,
		showCollapseAll: true,
	});
	context.subscriptions.push(assetsTreeView);
	context.subscriptions.push(
		vscode.commands.registerCommand('earthengine.refreshAssets', () => assetsProvider.refresh()),
		vscode.commands.registerCommand('earthengine.refreshAssetFolder', (item: AssetTreeItem) => {
			assetsProvider.refreshFolder(item.asset.name);
		}),
		vscode.commands.registerCommand('earthengine.openAssetPreview', async (item: AssetTreeItem) => {
			const token = await authService.getToken();
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
		}),
		vscode.commands.registerCommand('earthengine.openAssetsPanel', () => {
			openAssetsPanel(authService);
		}),
	);

	// Task views
	const exportTasksProvider = new TasksTreeDataProvider(authService, 'export');
	const importTasksProvider = new TasksTreeDataProvider(authService, 'import');

	context.subscriptions.push(
		vscode.window.createTreeView('earthengine.tasks.export', {
			treeDataProvider: exportTasksProvider,
		}),
		vscode.window.createTreeView('earthengine.tasks.import', {
			treeDataProvider: importTasksProvider,
		}),
		vscode.commands.registerCommand('earthengine.refreshTasks', () => {
			exportTasksProvider.refresh();
			importTasksProvider.refresh();
		}),
		vscode.commands.registerCommand('earthengine.cancelTask', async (item: TaskTreeItem) => {
			const token = await authService.getToken();
			if (!token) { return; }
			try {
				await cancelOperation(item.operation.name, token);
				vscode.window.showInformationMessage('Task cancellation requested.');
				exportTasksProvider.refresh();
				importTasksProvider.refresh();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				vscode.window.showErrorMessage(`Failed to cancel task: ${msg}`);
			}
		}),
		vscode.commands.registerCommand('earthengine.loadMoreTasks', (provider: TasksTreeDataProvider) => {
			provider.loadNextPage();
		}),
		vscode.commands.registerCommand('earthengine.openExportTasksPanel', () => {
			openTasksPanel(authService, 'export', context.extensionUri);
		}),
		vscode.commands.registerCommand('earthengine.openImportTasksPanel', () => {
			openTasksPanel(authService, 'import', context.extensionUri);
		}),
	);

	// Dataset view
	const datasetProvider = new DatasetTreeDataProvider();
	const datasetTreeView = vscode.window.createTreeView('earthengine.dataset', {
		treeDataProvider: datasetProvider,
		showCollapseAll: true,
	});
	context.subscriptions.push(datasetTreeView);

	context.subscriptions.push(
		vscode.commands.registerCommand('earthengine.refreshDatasets', () => datasetProvider.refresh()),
		vscode.commands.registerCommand('earthengine.searchDatasets', () => datasetProvider.searchDatasets()),
		vscode.commands.registerCommand('earthengine.openDatasetInBrowser', (item: DatasetTreeItem) => {
			if (item.datasetId) {
				vscode.env.openExternal(vscode.Uri.parse(getDatasetPageUrl(item.datasetId)));
			}
		}),
		vscode.commands.registerCommand('earthengine.openDatasetPanel', async (hrefOrItem: string | DatasetTreeItem) => {
			const href = typeof hrefOrItem === 'string' ? hrefOrItem : hrefOrItem.stacHref;
			if (!href) { return; }
			try {
				const collection = await fetchCollection(href);
				createDatasetPanel(collection, context.extensionUri);
			} catch {
				vscode.window.showErrorMessage('Failed to load dataset details.');
			}
		}),
	);

	// Docs view
	const docsProvider = new DocsTreeDataProvider();
	const docsTreeView = vscode.window.createTreeView('earthengine.docs', {
		treeDataProvider: docsProvider,
		showCollapseAll: true,
	});
	context.subscriptions.push(docsTreeView);

	context.subscriptions.push(
		vscode.commands.registerCommand('earthengine.refreshDocs', () => docsProvider.refresh()),
		vscode.commands.registerCommand('earthengine.searchDocs', async () => {
			const names = docsProvider.getAllEntryNames();
			if (names.length === 0) {
				vscode.window.showInformationMessage('API docs not loaded yet. Open the Docs section first.');
				return;
			}
			const picked = await vscode.window.showQuickPick(names, {
				placeHolder: 'Search Earth Engine API...',
				matchOnDescription: true,
			});
			if (picked) {
				vscode.env.openExternal(vscode.Uri.parse(getDocUrl(picked)));
			}
		}),
	);

	// Map panel
	context.subscriptions.push(
		vscode.commands.registerCommand('earthengine.openMap', () => openMapPanel()),
	);
}

export function deactivate() {
	disposeMapPanel();
}
