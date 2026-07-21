import * as vscode from 'vscode';
import { EarthEngineTreeDataProvider } from './views/explorer';
import { registerCommands } from './commands';
import { AuthStatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext) {
	const treeDataProvider = new EarthEngineTreeDataProvider();
	vscode.window.registerTreeDataProvider('earthengine.explorer', treeDataProvider);

	registerCommands(context);

	const authStatusBar = new AuthStatusBar();
	context.subscriptions.push(authStatusBar);
}

export function deactivate() {}
