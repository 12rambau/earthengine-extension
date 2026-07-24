/**
 * @module profilesTreeDataProvider
 * Data provider for the Profiles sidebar tree.
 *
 * Renders each saved authentication profile with an active/inactive
 * indicator and a rich Markdown tooltip.
 */

import * as vscode from 'vscode';
import { AuthService } from '../../auth/index.js';
import { ProfilesTreeItem } from './profilesTreeItem.js';

// ==================================================================
// PROFILESTREEDATAPROVIDER
// ==================================================================
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
