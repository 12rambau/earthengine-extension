import * as vscode from 'vscode';
import { AuthService, Profile } from '../../auth/index.js';

export class ProfilesTreeItem extends vscode.TreeItem {
	constructor(
		public readonly profile: Profile,
		public readonly isActive: boolean,
	) {
		super(profile.email, vscode.TreeItemCollapsibleState.None);

		this.description = profile.project;
		this.iconPath = new vscode.ThemeIcon(
			isActive ? 'circle-filled' : 'circle-outline',
			isActive ? new vscode.ThemeColor('testing.iconPassed') : new vscode.ThemeColor('testing.iconFailed'),
		);
		this.contextValue = isActive ? 'profile-active' : 'profile-inactive';

		if (isActive) {
			const tooltip = new vscode.MarkdownString('', true);
			tooltip.appendMarkdown(`**${profile.email}**\n\n`);
			tooltip.appendMarkdown(`Project: \`${profile.project}\`\n\n`);
			tooltip.appendMarkdown('$(check) Active');
			this.tooltip = tooltip;
		} else {
			this.command = {
				command: 'earthengine.activateProfile',
				title: 'Activate Profile',
				arguments: [profile],
			};
		}
	}
}

export class ProfilesTreeDataProvider implements vscode.TreeDataProvider<ProfilesTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<ProfilesTreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly authService: AuthService) {
		authService.onDidChangeAuth(() => this.refresh());
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ProfilesTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): ProfilesTreeItem[] {
		const profiles = this.authService['storage'].getProfiles();
		const active = this.authService.currentProfile;

		if (profiles.length === 0) {
			const item = new vscode.TreeItem('Sign in to get started');
			item.command = { command: 'earthengine.signIn', title: 'Sign In' };
			item.iconPath = new vscode.ThemeIcon('sign-in');
			return [item as unknown as ProfilesTreeItem];
		}

		return profiles.map(p => {
			const isActive = active?.email === p.email && active?.project === p.project;
			return new ProfilesTreeItem(p, isActive);
		});
	}
}
