/**
 * @module profilesSection
 * Profiles sidebar section for the Earth Engine extension.
 *
 * Registers the profiles tree view and all profile-related commands
 * (sign in, sign out, activate, remove, new script template).
 */

import * as vscode from 'vscode';
import { SidebarSection } from '../../shared/baseComponents.js';
import { AuthService, Profile } from '../../auth/index.js';
import { ProfilesTreeDataProvider } from './profilesTreeDataProvider.js';

// ==================================================================
// PROFILESSECTION
// ==================================================================
/** Sidebar section that displays and manages authentication profiles. */
export class ProfilesSection extends SidebarSection {
  private provider: ProfilesTreeDataProvider;

  constructor(private readonly authService: AuthService) {
    super();
    this.provider = new ProfilesTreeDataProvider(authService);
  }

  register(context: vscode.ExtensionContext): void {
    this.createTreeView('earthengine.profiles', this.provider);

    this.registerCommand('earthengine.signIn', () => this.authService.signIn());

    this.registerCommand('earthengine.addServiceAccount', () =>
      this.authService.addServiceAccount(),
    );

    this.registerCommand('earthengine.signOut', () => {
      this.authService.signOut();
      vscode.window.showInformationMessage('Signed out of Earth Engine.');
    });

    this.registerCommand('earthengine.activateProfile', (profile: Profile) => {
      this.authService.activateProfile(profile);
    });

    this.registerCommand('earthengine.removeProfile', (item: { profile: Profile }) => {
      this.authService.removeProfile(item.profile);
      this.provider.refresh();
    });

    this.registerCommand('earthengine.showAuthStatus', () => {
      if (this.authService.isAuthenticated) {
        const p = this.authService.currentProfile!;
        vscode.window.showInformationMessage(`Connected as ${p.email} (project: ${p.project})`);
      } else {
        vscode.window
          .showWarningMessage('Google Earth Engine is not authenticated.', 'Sign in')
          .then((choice) => {
            if (choice === 'Sign in') {
              this.authService.signIn();
            }
          });
      }
    });

    this.registerCommand('earthengine.newScript', async (item: { profile: Profile }) => {
      const project = item.profile.project;
      const content = [
        'import ee',
        'from earthengine_vscode_map import Map',
        '',
        '# prior to execute this code make sure you are authenticated',
        `ee.Initialize(project="${project}")`,
        '',
        '# TODO: remove',
        '# check server connection',
        'print(ee.Number(1).getInfo())',
        '',
        '# Example: add a layer to the VS Code map',
        '# image = ee.Image("COPERNICUS/S2_SR_HARMONIZED/20200101T100319_20200101T100321_T32TQM")',
        '# Map.addLayer(image, {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}, "RGB")',
        '# Map.centerObject(image, zoom=10)',
        '',
      ].join('\n');
      const doc = await vscode.workspace.openTextDocument({ content, language: 'python' });
      vscode.window.showTextDocument(doc);
    });

    context.subscriptions.push(this);
  }
}
