/**
 * @module profilesTreeItem
 * Tree item for the Profiles sidebar tree: one saved authentication profile
 * with an active/inactive indicator and a Markdown tooltip.
 */

import * as vscode from 'vscode';
import { Profile } from '../../auth/index.js';

// ==================================================================
// PROFILESTREEITEM
// ==================================================================
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
