import * as vscode from 'vscode';
import { EarthEngineTreeDataProvider } from './views/explorer';
import { registerCommands } from './commands';
import { AuthStatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext) {
	const views = [
		{ id: 'earthengine.assets', placeholder: 'No assets' },
		{ id: 'earthengine.docs', placeholder: 'No docs' },
		{ id: 'earthengine.tasks', placeholder: 'No tasks' },
		{ id: 'earthengine.dataset', placeholder: 'No datasets' },
	];

	for (const view of views) {
		vscode.window.registerTreeDataProvider(
			view.id,
			new EarthEngineTreeDataProvider(view.placeholder)
		);
	}

	registerCommands(context);

	const authStatusBar = new AuthStatusBar();
	context.subscriptions.push(authStatusBar);
}

export function deactivate() {}
