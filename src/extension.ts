import * as vscode from 'vscode';
import { EarthEngineTreeDataProvider } from './views/explorer';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
	const treeDataProvider = new EarthEngineTreeDataProvider();
	vscode.window.registerTreeDataProvider('earthengine.explorer', treeDataProvider);

	registerCommands(context);
}

export function deactivate() {}
