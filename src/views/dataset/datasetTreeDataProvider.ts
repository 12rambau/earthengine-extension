import * as vscode from 'vscode';
import { EarthEngineTreeItem } from '../explorer/earthEngineTreeItem';

export class DatasetTreeDataProvider implements vscode.TreeDataProvider<EarthEngineTreeItem> {
	getTreeItem(element: EarthEngineTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): EarthEngineTreeItem[] {
		return [new EarthEngineTreeItem('No datasets')];
	}
}
