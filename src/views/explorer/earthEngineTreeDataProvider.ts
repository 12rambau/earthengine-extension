import * as vscode from 'vscode';
import { EarthEngineTreeItem } from './earthEngineTreeItem';

export class EarthEngineTreeDataProvider implements vscode.TreeDataProvider<EarthEngineTreeItem> {
	getTreeItem(element: EarthEngineTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): EarthEngineTreeItem[] {
		return [new EarthEngineTreeItem('Welcome to Earth Engine')];
	}
}
