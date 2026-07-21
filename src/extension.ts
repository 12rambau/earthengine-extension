import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { AuthStatusBar } from './statusBar';
import { AssetsTreeDataProvider } from './views/assets';
import { DocsTreeDataProvider } from './views/docs';
import { TasksTreeDataProvider } from './views/tasks';
import { DatasetTreeDataProvider } from './views/dataset';
import { getDocUrl } from './views/docs/apiDocsParser.js';

export function activate(context: vscode.ExtensionContext) {
	vscode.window.registerTreeDataProvider('earthengine.assets', new AssetsTreeDataProvider());
	vscode.window.registerTreeDataProvider('earthengine.tasks', new TasksTreeDataProvider());
	vscode.window.registerTreeDataProvider('earthengine.dataset', new DatasetTreeDataProvider());

	const docsProvider = new DocsTreeDataProvider();
	const docsTreeView = vscode.window.createTreeView('earthengine.docs', {
		treeDataProvider: docsProvider,
		showCollapseAll: true,
	});
	context.subscriptions.push(docsTreeView);

	const refreshDocs = vscode.commands.registerCommand('earthengine.refreshDocs', () => {
		docsProvider.refresh();
	});

	const searchDocs = vscode.commands.registerCommand('earthengine.searchDocs', async () => {
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
	});
	context.subscriptions.push(refreshDocs, searchDocs);

	registerCommands(context);

	const authStatusBar = new AuthStatusBar();
	context.subscriptions.push(authStatusBar);
}

export function deactivate() {}
