/**
 * @module datasetTreeItem
 * Tree item for the Dataset sidebar tree: a category, a provider, or an
 * individual STAC dataset, with type icon, description, and keyword tooltip.
 */

import * as vscode from 'vscode';
import { CommunityDatasetEntry } from './communityClient.js';

/** Kind of node a `DatasetTreeItem` represents. */
export type NodeType = 'category' | 'provider' | 'dataset' | 'communityTheme' | 'communityDataset';

// ==================================================================
// CONSTANTS
// ==================================================================
const TYPE_ICONS: Record<string, vscode.ThemeIcon> = {
  image_collection: new vscode.ThemeIcon('layers', new vscode.ThemeColor('charts.blue')),
  image: new vscode.ThemeIcon('file-media', new vscode.ThemeColor('charts.orange')),
  table: new vscode.ThemeIcon('table', new vscode.ThemeColor('charts.green')),
};

// ==================================================================
// DATASETTREEITEM
// ==================================================================
/** Tree item representing a dataset category, provider, or individual dataset. */
export class DatasetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly nodeType: NodeType,
    public readonly stacHref: string,
    public readonly datasetId?: string,
    public readonly geeType?: string,
    loading?: boolean,
    public readonly externalUrl?: string,
    description?: string,
    keywords?: string[],
    public readonly docsUrl?: string,
    public readonly thumbnailUrl?: string,
    public readonly communityEntry?: CommunityDatasetEntry,
  ) {
    super(label);

    if (nodeType === 'category') {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      this.iconPath = new vscode.ThemeIcon('root-folder');
      this.contextValue = 'dataset-category';
      this.id = `cat:${stacHref}`;
    } else if (loading) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.iconPath = new vscode.ThemeIcon('loading~spin');
      this.contextValue = 'dataset-loading';
    } else if (nodeType === 'provider') {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      this.iconPath = new vscode.ThemeIcon('folder-library');
      this.contextValue = 'dataset-provider';
      if (stacHref) {
        this.id = `prov:${stacHref}`;
      }
      if (externalUrl) {
        this.command = {
          command: 'vscode.open',
          title: 'Open',
          arguments: [vscode.Uri.parse(externalUrl)],
        };
      }
    } else if (nodeType === 'communityTheme') {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      this.iconPath = new vscode.ThemeIcon('folder-library');
      this.contextValue = 'dataset-community-theme';
      this.id = `ct:${stacHref}`;
    } else if (nodeType === 'communityDataset') {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.iconPath = geeType
        ? TYPE_ICONS[geeType] || new vscode.ThemeIcon('file')
        : new vscode.ThemeIcon('file');
      this.contextValue = 'dataset-community-item';
      this.id = `cd:${docsUrl}`;
      const communityTooltip = new vscode.MarkdownString('', true);
      communityTooltip.isTrusted = true;
      communityTooltip.appendMarkdown(
        `**${(geeType || 'unknown').replace(/_/g, ' ')}** — \`${datasetId || label}\`\n\n`,
      );
      if (description) {
        communityTooltip.appendMarkdown(`${description}\n\n`);
      }
      if (keywords && keywords.length > 0) {
        communityTooltip.appendMarkdown(keywords.map((k) => `\`${k}\``).join(' ') + '\n');
      }
      this.tooltip = communityTooltip;
    } else {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.iconPath = geeType
        ? TYPE_ICONS[geeType] || new vscode.ThemeIcon('file')
        : new vscode.ThemeIcon('loading~spin');
      this.contextValue = 'dataset-item';
      this.id = `ds:${stacHref}`;
      if (geeType) {
        const tooltip = new vscode.MarkdownString('', true);
        tooltip.isTrusted = true;
        tooltip.appendMarkdown(`**${geeType.replace(/_/g, ' ')}** — \`${datasetId || label}\`\n\n`);
        if (description) {
          const truncated =
            description.length > 200 ? description.slice(0, 200) + '…' : description;
          tooltip.appendMarkdown(`${truncated}\n\n`);
        }
        if (keywords && keywords.length > 0) {
          tooltip.appendMarkdown(keywords.map((k) => `\`${k}\``).join(' ') + '\n');
        }
        this.tooltip = tooltip;
      }
    }
  }
}
