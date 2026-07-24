/**
 * @module docsTreeItem
 * Custom tree item for the API Docs sidebar tree.
 *
 * Renders each `ee.*` method/class with a rich Markdown tooltip
 * containing description, usage, return type, argument table,
 * and a link to the official documentation.
 */

import * as vscode from 'vscode';

// ── DocsTreeItem ────────────────────────────────────────────────────

/** Tree item representing a single API entry with an optional rich tooltip. */
export class DocsTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly fullName: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly description?: string,
    public readonly apiDescription?: string,
    public readonly usage?: string,
    public readonly returns?: string,
    public readonly args?: { name: string; type: string; details: string }[],
    public readonly docUrl?: string,
  ) {
    super(label, collapsibleState);

    if (apiDescription) {
      const tooltip = new vscode.MarkdownString('', true);
      tooltip.isTrusted = true;

      if (usage) {
        const returnSuffix = returns ? ` → ${returns}` : '';
        tooltip.appendMarkdown(`\`\`\`javascript\n${usage}${returnSuffix}\n\`\`\`\n`);
      } else {
        const returnSuffix = returns ? ` → \`${returns}\`` : '';
        tooltip.appendMarkdown(`**${fullName}**${returnSuffix}\n\n`);
      }

      tooltip.appendMarkdown(`---\n\n${apiDescription}\n\n`);

      if (args && args.length > 0) {
        tooltip.appendMarkdown('**Arguments**\n\n');
        tooltip.appendMarkdown('| Argument | Type | Details |\n|---|---|---|\n');
        for (const arg of args) {
          tooltip.appendMarkdown(`| \`${arg.name}\` | \`${arg.type}\` | ${arg.details} |\n`);
        }
        tooltip.appendMarkdown('\n');
      }

      if (docUrl) {
        tooltip.appendMarkdown(`---\n\n[Open in docs ↗](${docUrl})\n`);
      }

      this.tooltip = tooltip;
    }

    if (collapsibleState === vscode.TreeItemCollapsibleState.None && docUrl) {
      this.command = {
        command: 'vscode.open',
        title: 'Open Documentation',
        arguments: [vscode.Uri.parse(docUrl)],
      };
    }

    if (collapsibleState === vscode.TreeItemCollapsibleState.None) {
      this.iconPath = new vscode.ThemeIcon('symbol-method');
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-class');
    }
  }
}
