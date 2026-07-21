import * as vscode from 'vscode';
import { EarthEngineTreeItem } from '../explorer/earthEngineTreeItem';

export class AssetsTreeDataProvider implements vscode.TreeDataProvider<EarthEngineTreeItem> {
	getTreeItem(element: EarthEngineTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): EarthEngineTreeItem[] {
		return [new EarthEngineTreeItem('No assets')];
	}
}
