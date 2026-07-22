/**
 * @module profilesTreeDataProvider
 * Tree items and data provider for the Profiles sidebar tree.
 *
 * Renders each saved authentication profile with an active/inactive
 * indicator and a rich Markdown tooltip.
 */

import * as vscode from 'vscode';
import { AuthService, Profile } from '../../auth/index.js';

// ── ProfilesTreeItem ────────────────────────────────────────────────

/** Tree item representing a single Earth Engine profile. */
export class ProfilesTreeItem extends vscode.TreeItem {
  constructor(
    public readonly profile: Profile,
    public readonly isActive: boolean,
  ) {
    super(profile.project, vscode.TreeItemCollapsibleState.None);

    const tooltip = new vscode.MarkdownString('', true);
    tooltip.appendMarkdown(`**${profile.project}** — ${profile.email}`);
    this.tooltip = tooltip;

    this.iconPath = new vscode.ThemeIcon(
      isActive ? 'circle-filled' : 'circle-outline',
      isActive
        ? new vscode.ThemeColor('testing.iconPassed')
        : new vscode.ThemeColor('testing.iconFailed'),
    );
    this.contextValue = isActive ? 'profile-active' : 'profile-inactive';

    if (!isActive) {
      this.command = {
        command: 'earthengine.activateProfile',
        title: 'Activate Profile',
        arguments: [profile],
      };
    }
  }
}

// ── ProfilesTreeDataProvider ───────────────────────────────────────

/** Provides profile tree items; refreshes automatically on auth changes. */
export class ProfilesTreeDataProvider implements vscode.TreeDataProvider<ProfilesTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProfilesTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly authService: AuthService) {
    authService.onDidChangeAuth(() => this.refresh());
  }

  /** Triggers a full tree refresh. */
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

    return profiles.map((p) => {
      const isActive = active?.email === p.email && active?.project === p.project;
      return new ProfilesTreeItem(p, isActive);
    });
  }
}
