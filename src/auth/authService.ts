/**
 * Authentication service for Google Earth Engine.
 *
 * Manages the full lifecycle of user authentication:
 * - Sign in via the EE notebook OAuth flow
 * - Profile switching (multiple accounts/projects)
 * - Token refresh for API calls
 * - Sign out and profile removal
 *
 * Emits `onDidChangeAuth` whenever the active profile changes,
 * allowing UI components (sidebar, status bar) to react.
 */

import * as vscode from 'vscode';
import { authenticateNotebookFlow, getAccessToken, addServiceAccountFlow } from './oauth.js';
import { TokenStorage, Profile } from './tokenStorage.js';

export class AuthService {

	// ── Events ─────────────────────────────────────────────────────────────

	/** Fired when the active profile changes (sign in, switch, or sign out). */
	private _onDidChangeAuth = new vscode.EventEmitter<Profile | undefined>();
	readonly onDidChangeAuth = this._onDidChangeAuth.event;

	// ── State ──────────────────────────────────────────────────────────────

	/** The currently active profile, or undefined if signed out. */
	private activeProfile: Profile | undefined;

	constructor(private readonly storage: TokenStorage) {
		// Restore the last active profile from persistent storage
		this.activeProfile = storage.getActiveProfile();
	}

	// ── Accessors ──────────────────────────────────────────────────────────

	/** The currently active profile, if any. */
	get currentProfile(): Profile | undefined {
		return this.activeProfile;
	}

	/** Whether a profile is currently active. */
	get isAuthenticated(): boolean {
		return this.activeProfile !== undefined;
	}

	// ── Sign in ────────────────────────────────────────────────────────────

	/**
	 * Start the notebook-mode OAuth flow:
	 * 1. Open the EE auth page in a browser
	 * 2. User pastes the authorization code
	 * 3. Exchange for refresh token
	 * 4. Save credentials and activate the profile
	 */
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

	// ── Profile management ─────────────────────────────────────────────────

	/**
	 * Activate a previously saved profile.
	 * Verifies the stored refresh token still works before switching.
	 */
	async activateProfile(profile: Profile): Promise<void> {
		const creds = this.storage.getCredentials(profile);
		if (!creds) {
			vscode.window.showErrorMessage('Credentials file not found for this profile. Please sign in again.');
			return;
		}

		// Verify the token still works by attempting a refresh
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

	// ── Token access ───────────────────────────────────────────────────────

	/**
	 * Get a fresh access token for the active profile.
	 * Returns undefined if not authenticated. Automatically signs out
	 * if the token refresh fails (expired/revoked credentials).
	 */
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

	// ── Sign out ───────────────────────────────────────────────────────────

	/** Clear the active profile without deleting stored credentials. */
	signOut(): void {
		this.activeProfile = undefined;
		this._onDidChangeAuth.fire(undefined);
	}

	/**
	 * Permanently remove a saved profile and its credentials.
	 * If it's the active profile, also signs out.
	 */
	async removeProfile(profile: Profile): Promise<void> {
		await this.storage.removeProfile(profile);
		if (this.activeProfile?.email === profile.email && this.activeProfile?.project === profile.project) {
			this.signOut();
		}
	}
	// ── Service Account ────────────────────────────────────────────────

	/**
	 * Import a service account key file and save it as a profile.
	 * Opens a file picker or InputBox; validates and activates immediately.
	 */
	async addServiceAccount(): Promise<void> {
		try {
			const result = await addServiceAccountFlow();
			if (!result) { return; }

			const { credentials, email, project } = result;
			const profile = await this.storage.saveProfile(email, project, credentials);
			this.activeProfile = profile;
			this._onDidChangeAuth.fire(profile);

			vscode.window.showInformationMessage(`Service account added: ${email} (project: ${project})`);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Failed to add service account: ${message}`);
		}
	}}
