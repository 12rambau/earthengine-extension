import * as vscode from 'vscode';
import { EECredentials, readCredentials, writeCredentials, getProfileCredentialsPath } from './oauth.js';

export interface Profile {
	email: string;
	project: string;
	credentialsPath: string;
}

const PROFILES_KEY = 'earthengine.profiles';
const ACTIVE_PROFILE_KEY = 'earthengine.activeProfile';

export class TokenStorage {
	constructor(private readonly globalState: vscode.Memento) {}

	async saveProfile(email: string, project: string, creds: EECredentials): Promise<Profile> {
		const profileName = `${email}_${project}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
		const credPath = getProfileCredentialsPath(profileName);

		// Save credentials with project
		creds.project = project;
		writeCredentials(credPath, creds);

		const profile: Profile = { email, project, credentialsPath: credPath };

		const profiles = this.getProfiles();
		const existing = profiles.findIndex(p => p.email === email && p.project === project);
		if (existing >= 0) {
			profiles[existing] = profile;
		} else {
			profiles.push(profile);
		}
		await this.globalState.update(PROFILES_KEY, profiles);
		await this.globalState.update(ACTIVE_PROFILE_KEY, profile);

		return profile;
	}

	getProfiles(): Profile[] {
		return this.globalState.get<Profile[]>(PROFILES_KEY, []);
	}

	getActiveProfile(): Profile | undefined {
		return this.globalState.get<Profile>(ACTIVE_PROFILE_KEY);
	}

	async setActiveProfile(profile: Profile): Promise<void> {
		await this.globalState.update(ACTIVE_PROFILE_KEY, profile);
	}

	getCredentials(profile: Profile): EECredentials | undefined {
		return readCredentials(profile.credentialsPath);
	}

	async removeProfile(profile: Profile): Promise<void> {
		const profiles = this.getProfiles().filter(
			p => !(p.email === profile.email && p.project === profile.project)
		);
		await this.globalState.update(PROFILES_KEY, profiles);

		const active = this.getActiveProfile();
		if (active?.email === profile.email && active?.project === profile.project) {
			await this.globalState.update(ACTIVE_PROFILE_KEY, undefined);
		}
	}
}
