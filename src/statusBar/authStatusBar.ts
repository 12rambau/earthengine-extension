import * as vscode from 'vscode';

export class AuthStatusBar {
	private statusBarItem: vscode.StatusBarItem;
	private authenticated = false;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			0
		);
		this.statusBarItem.command = 'earthengine.showAuthStatus';
		this.update();
		this.statusBarItem.show();
	}

	update() {
		if (this.authenticated) {
			this.statusBarItem.text = '$(earthengine-icon) Earth Engine';
			this.statusBarItem.backgroundColor = undefined;
			const tooltip = new vscode.MarkdownString('', true);
			tooltip.isTrusted = true;
			tooltip.appendMarkdown('$(earthengine-icon) Google Earth Engine\n\n');
			tooltip.appendMarkdown('Status: **Connected**');
			this.statusBarItem.tooltip = tooltip;
		} else {
			this.statusBarItem.text = '$(earthengine-icon)$(warning) Earth Engine';
			this.statusBarItem.backgroundColor = new vscode.ThemeColor(
				'statusBarItem.warningBackground'
			);
			const tooltip = new vscode.MarkdownString('', true);
			tooltip.isTrusted = true;
			tooltip.appendMarkdown('$(earthengine-icon) Google Earth Engine\n\n');
			tooltip.appendMarkdown('Status: **Not authenticated**\n\n');
			tooltip.appendMarkdown('---\n\n');
			tooltip.appendMarkdown('$(sign-in) [Sign in to Earth Engine](command:earthengine.signIn)');
			this.statusBarItem.tooltip = tooltip;
		}
	}

	setAuthenticated(value: boolean) {
		this.authenticated = value;
		this.update();
	}

	dispose() {
		this.statusBarItem.dispose();
	}
}
