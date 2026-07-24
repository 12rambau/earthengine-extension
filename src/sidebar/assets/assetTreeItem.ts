/**
 * @module assetTreeItem
 * Tree item for the Assets sidebar tree: a single Earth Engine asset
 * (folder, image collection, image, or table) with a type icon and tooltip.
 */

import * as vscode from 'vscode';
import { EEAsset } from './eeApiClient.js';

// ==================================================================
// CONSTANTS
// ==================================================================
/** Theme icon per Earth Engine asset type. Shared with the data provider. */
export const TYPE_ICONS: Record<string, vscode.ThemeIcon> = {
  FOLDER: new vscode.ThemeIcon('folder'),
  IMAGE_COLLECTION: new vscode.ThemeIcon('layers', new vscode.ThemeColor('charts.blue')),
  IMAGE: new vscode.ThemeIcon('file-media', new vscode.ThemeColor('charts.orange')),
  TABLE: new vscode.ThemeIcon('table', new vscode.ThemeColor('charts.green')),
};

// ==================================================================
// ASSETTREEITEM
// ==================================================================
/** Tree item representing a single Earth Engine asset (image, table, folder, etc.). */
export class AssetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly asset: EEAsset,
    public readonly isContainer: boolean,
  ) {
    const shortName = asset.name.split('/').pop() || asset.name;
    super(
      shortName,
      isContainer
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.iconPath = TYPE_ICONS[asset.type] || new vscode.ThemeIcon('file');

    // Stable id (the unique asset path) so the tree can reveal this item.
    if (asset.type !== 'PLACEHOLDER') {
      this.id = asset.name;
    }

    const tooltip = new vscode.MarkdownString('', true);
    tooltip.appendMarkdown(`**${asset.type.toLowerCase().replace('_', ' ')}** — ${asset.name}`);
    this.tooltip = tooltip;

    // Context values for menu visibility
    if (isContainer) {
      this.contextValue = `asset-container-${asset.type.toLowerCase()}`;
    } else {
      this.contextValue = `asset-leaf-${asset.type.toLowerCase()}`;
    }
  }

  /** Creates a placeholder tree item (e.g. "Loading..."). */
  static placeholder(
    label: string,
    icon: vscode.ThemeIcon,
    command?: vscode.Command,
  ): AssetTreeItem {
    const dummy: EEAsset = { name: label, type: 'PLACEHOLDER' };
    const item = new AssetTreeItem(dummy, false);
    item.iconPath = icon;
    item.description = undefined;
    if (command) {
      item.command = command;
    }
    return item;
  }
}
