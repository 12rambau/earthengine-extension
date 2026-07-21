import * as vscode from 'vscode';

class EarthEngineTreeItem extends vscode.TreeItem {
	constructor(label: string) {
		super(label, vscode.TreeItemCollapsibleState.None);
	}
}

class EarthEngineTreeDataProvider implements vscode.TreeDataProvider<EarthEngineTreeItem> {
	getTreeItem(element: EarthEngineTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): EarthEngineTreeItem[] {
		return [new EarthEngineTreeItem('Welcome to Earth Engine')];
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "earthengine" is now active!');

	const treeDataProvider = new EarthEngineTreeDataProvider();
	vscode.window.registerTreeDataProvider('earthengine.explorer', treeDataProvider);

	const disposable = vscode.commands.registerCommand('earthengine.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from earthengine!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
