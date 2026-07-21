import * as vscode from 'vscode';
import { EarthEngineTreeItem } from '../explorer/earthEngineTreeItem';

export class TasksTreeDataProvider implements vscode.TreeDataProvider<EarthEngineTreeItem> {
	getTreeItem(element: EarthEngineTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): EarthEngineTreeItem[] {
		return [new EarthEngineTreeItem('No tasks')];
	}
}
