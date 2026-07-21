import * as vscode from 'vscode';

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

		if (collapsibleState === vscode.TreeItemCollapsibleState.None && apiDescription) {
			const tooltip = new vscode.MarkdownString('', true);
			tooltip.isTrusted = true;

			tooltip.appendMarkdown(`### ${fullName}\n\n`);
			tooltip.appendMarkdown(`${apiDescription}\n\n`);

			if (usage) {
				tooltip.appendMarkdown(`**Usage:** \`${usage}\`\n\n`);
			}
			if (returns) {
				tooltip.appendMarkdown(`**Returns:** \`${returns}\`\n\n`);
			}
			if (args && args.length > 0) {
				tooltip.appendMarkdown('**Arguments:**\n\n');
				tooltip.appendMarkdown('| Name | Type | Details |\n|---|---|---|\n');
				for (const arg of args) {
					tooltip.appendMarkdown(`| ${arg.name} | \`${arg.type}\` | ${arg.details} |\n`);
				}
				tooltip.appendMarkdown('\n');
			}
			if (docUrl) {
				tooltip.appendMarkdown(`---\n\n[Open documentation](${docUrl})\n`);
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
	}
}
