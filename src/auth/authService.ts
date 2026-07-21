import * as vscode from 'vscode';
import { authenticateWithBrowser, refreshAccessToken, AuthTokens } from './oauth.js';
import { TokenStorage, Profile } from './tokenStorage.js';

export class AuthService {
	private _onDidChangeAuth = new vscode.EventEmitter<Profile | undefined>();
	readonly onDidChangeAuth = this._onDidChangeAuth.event;

	private activeProfile: Profile | undefined;
	private activeTokens: AuthTokens | undefined;

	constructor(private readonly storage: TokenStorage) {}

	get currentProfile(): Profile | undefined {
		return this.activeProfile;
	}

	get isAuthenticated(): boolean {
		return this.activeProfile !== undefined;
	}

	async signIn(): Promise<void> {
		try {
			const { tokens, userInfo } = await authenticateWithBrowser();

			const project = await vscode.window.showInputBox({
				title: 'Google Cloud Project',
				prompt: 'Enter your GCP project ID (registered for Earth Engine)',
				placeHolder: 'my-ee-project',
				ignoreFocusOut: true,
			});

			if (!project) {
				vscode.window.showWarningMessage('Sign in cancelled: a project ID is required.');
				return;
			}

			const profile: Profile = {
				email: userInfo.email,
				name: userInfo.name,
				project,
			};

			await this.storage.saveProfile(profile, tokens);
			this.activeProfile = profile;
			this.activeTokens = tokens;
			this._onDidChangeAuth.fire(profile);

			vscode.window.showInformationMessage(`Signed in as ${profile.email} (project: ${profile.project})`);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Authentication failed: ${message}`);
		}
	}

	async activateProfile(profile: Profile): Promise<void> {
		const tokens = await this.storage.getTokens(profile.email);
		if (!tokens) {
			vscode.window.showErrorMessage('No stored credentials for this profile. Please sign in again.');
			return;
		}

		// Refresh token if expired
		if (Date.now() >= tokens.expires_at) {
			try {
				const refreshed = await refreshAccessToken(tokens.refresh_token);
				await this.storage.updateTokens(profile.email, refreshed);
				this.activeTokens = refreshed;
			} catch {
				vscode.window.showErrorMessage('Token refresh failed. Please sign in again.');
				return;
			}
		} else {
			this.activeTokens = tokens;
		}

		this.activeProfile = profile;
		this._onDidChangeAuth.fire(profile);
		vscode.window.showInformationMessage(`Switched to ${profile.email} (project: ${profile.project})`);
	}

	async getAccessToken(): Promise<string | undefined> {
		if (!this.activeTokens || !this.activeProfile) {
			return undefined;
		}

		if (Date.now() >= this.activeTokens.expires_at) {
			try {
				this.activeTokens = await refreshAccessToken(this.activeTokens.refresh_token);
				await this.storage.updateTokens(this.activeProfile.email, this.activeTokens);
			} catch {
				this.signOut();
				return undefined;
			}
		}

		return this.activeTokens.access_token;
	}

	signOut(): void {
		this.activeProfile = undefined;
		this.activeTokens = undefined;
		this._onDidChangeAuth.fire(undefined);
	}

	async removeProfile(profile: Profile): Promise<void> {
		await this.storage.removeProfile(profile);
		if (this.activeProfile?.email === profile.email && this.activeProfile?.project === profile.project) {
			this.signOut();
		}
	}
}
