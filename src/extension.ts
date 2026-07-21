import * as vscode from 'vscode';
import { AuthStatusBar } from './statusBar/index.js';
import { AssetsTreeDataProvider } from './views/assets/index.js';
import { DocsTreeDataProvider } from './views/docs/index.js';
import { TasksTreeDataProvider } from './views/tasks/index.js';
import { DatasetTreeDataProvider } from './views/dataset/index.js';
import { ProfilesTreeDataProvider } from './views/profiles/index.js';
import { AuthService, TokenStorage, Profile } from './auth/index.js';
import { getDocUrl } from './views/docs/apiDocsParser.js';

export function activate(context: vscode.ExtensionContext) {
	// Auth setup
	const tokenStorage = new TokenStorage(context.secrets, context.globalState);
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
	);

	// Other views
	vscode.window.registerTreeDataProvider('earthengine.assets', new AssetsTreeDataProvider());
	vscode.window.registerTreeDataProvider('earthengine.tasks', new TasksTreeDataProvider());
	vscode.window.registerTreeDataProvider('earthengine.dataset', new DatasetTreeDataProvider());

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
}

export function deactivate() {}
