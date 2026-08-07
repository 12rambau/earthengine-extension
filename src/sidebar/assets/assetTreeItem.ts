/**
 * @module assetTreeItem
 * Tree item for the Assets sidebar tree: a single Earth Engine asset
 * (folder, image collection, image, or table) with a type icon and tooltip.
 */

import * as vscode from 'vscode';
import { EEAsset } from './eeApiClient.js';
import { getExtensionUri } from '../../shared/extensionContext.js';

// ==================================================================
// CONSTANTS
// ==================================================================
/** Returns the icon path for an Earth Engine asset type using MDI SVG files. */
export function resolveTypeIcon(type: string): vscode.Uri | vscode.ThemeIcon {
  const svgFile: Record<string, string> = {
    IMAGE_COLLECTION: 'image-multiple',
    IMAGE: 'image',
    TABLE: 'table-multiple',
    FOLDER: '',
  };
  const file = svgFile[type];
  if (file) {
    return vscode.Uri.joinPath(getExtensionUri(), 'resources', 'icons', `${file}.svg`);
  }
  return new vscode.ThemeIcon('folder');
}

/** ThemeIcon fallback kept for callers that need a ThemeIcon specifically. */
export const TYPE_ICONS: Record<string, vscode.ThemeIcon> = {
  FOLDER: new vscode.ThemeIcon('folder'),
  IMAGE_COLLECTION: new vscode.ThemeIcon('layers', new vscode.ThemeColor('charts.blue')),
  IMAGE: new vscode.ThemeIcon('image', new vscode.ThemeColor('charts.orange')),
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

    this.iconPath = resolveTypeIcon(asset.type);

    // Stable id (the unique asset path) so the tree can reveal this item.
    if (asset.type !== 'PLACEHOLDER') {
      this.id = asset.name;
    }

    // Build tooltip with formatted header + plain-text description.
    // For leaf assets without a description yet, leave tooltip undefined
    // so resolveTreeItem can lazily fill it in — VS Code ignores resolved
    // tooltip when the original is already set.
    if (isContainer || asset.description) {
      const tooltip = new vscode.MarkdownString('', true);
      tooltip.isTrusted = true;
      tooltip.appendMarkdown(
        `**${asset.type.toLowerCase().replace(/_/g, ' ')}** — \`${asset.name}\`\n\n`,
      );
      if (asset.title) {
        tooltip.appendMarkdown(`**${asset.title}**\n\n`);
      }
      if (asset.description) {
        const truncated =
          asset.description.length > 200
            ? asset.description.slice(0, 200) + '\u2026'
            : asset.description;
        tooltip.appendText(truncated);
      }
      this.tooltip = tooltip;
    }

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
