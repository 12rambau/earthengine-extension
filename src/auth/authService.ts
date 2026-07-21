import * as vscode from 'vscode';
import { authenticateNotebookFlow, getAccessToken } from './oauth.js';
import { TokenStorage, Profile } from './tokenStorage.js';

export class AuthService {
	private _onDidChangeAuth = new vscode.EventEmitter<Profile | undefined>();
	readonly onDidChangeAuth = this._onDidChangeAuth.event;

	private activeProfile: Profile | undefined;

	constructor(private readonly storage: TokenStorage) {
		// Restore last active profile
		this.activeProfile = storage.getActiveProfile();
	}

	get currentProfile(): Profile | undefined {
		return this.activeProfile;
	}

	get isAuthenticated(): boolean {
		return this.activeProfile !== undefined;
	}

	async signIn(): Promise<void> {
		try {
			const result = await authenticateNotebookFlow();
			if (!result) {
				return; // User cancelled
			}

			const { credentials, email, project } = result;
			const profile = await this.storage.saveProfile(email, project, credentials);
			this.activeProfile = profile;
			this._onDidChangeAuth.fire(profile);

			vscode.window.showInformationMessage(`Signed in as ${email} (project: ${project})`);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Authentication failed: ${message}`);
		}
	}

	async activateProfile(profile: Profile): Promise<void> {
		const creds = this.storage.getCredentials(profile);
		if (!creds) {
			vscode.window.showErrorMessage('Credentials file not found for this profile. Please sign in again.');
			return;
		}

		// Verify the token still works
		try {
			await getAccessToken(creds);
		} catch {
			vscode.window.showErrorMessage('Token refresh failed. Please sign in again.');
			return;
		}

		this.activeProfile = profile;
		await this.storage.setActiveProfile(profile);
		this._onDidChangeAuth.fire(profile);
		vscode.window.showInformationMessage(`Switched to ${profile.email} (project: ${profile.project})`);
	}

	async getToken(): Promise<string | undefined> {
		if (!this.activeProfile) {
			return undefined;
		}
		const creds = this.storage.getCredentials(this.activeProfile);
		if (!creds) {
			return undefined;
		}
		try {
			return await getAccessToken(creds);
		} catch {
			this.signOut();
			return undefined;
		}
	}

	signOut(): void {
		this.activeProfile = undefined;
		this._onDidChangeAuth.fire(undefined);
	}

	async removeProfile(profile: Profile): Promise<void> {
		await this.storage.removeProfile(profile);
		if (this.activeProfile?.email === profile.email && this.activeProfile?.project === profile.project) {
			this.signOut();
		}
	}
}
