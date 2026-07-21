import * as vscode from 'vscode';

export class EarthEngineTreeItem extends vscode.TreeItem {
	constructor(label: string) {
		super(label, vscode.TreeItemCollapsibleState.None);
	}
}
