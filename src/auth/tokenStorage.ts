import * as vscode from 'vscode';
import { AuthTokens, UserInfo } from './oauth.js';

export interface Profile {
	email: string;
	name?: string;
	project: string;
}

const PROFILES_KEY = 'earthengine.profiles';
const TOKENS_PREFIX = 'earthengine.tokens.';

export class TokenStorage {
	constructor(private readonly secrets: vscode.SecretStorage, private readonly globalState: vscode.Memento) {}

	async saveProfile(profile: Profile, tokens: AuthTokens): Promise<void> {
		const profiles = this.getProfiles();
		const existing = profiles.findIndex(p => p.email === profile.email && p.project === profile.project);
		if (existing >= 0) {
			profiles[existing] = profile;
		} else {
			profiles.push(profile);
		}
		await this.globalState.update(PROFILES_KEY, profiles);
		await this.secrets.store(`${TOKENS_PREFIX}${profile.email}`, JSON.stringify(tokens));
	}

	getProfiles(): Profile[] {
		return this.globalState.get<Profile[]>(PROFILES_KEY, []);
	}

	async getTokens(email: string): Promise<AuthTokens | undefined> {
		const raw = await this.secrets.get(`${TOKENS_PREFIX}${email}`);
		if (!raw) {
			return undefined;
		}
		return JSON.parse(raw) as AuthTokens;
	}

	async updateTokens(email: string, tokens: AuthTokens): Promise<void> {
		await this.secrets.store(`${TOKENS_PREFIX}${email}`, JSON.stringify(tokens));
	}

	async removeProfile(profile: Profile): Promise<void> {
		const profiles = this.getProfiles().filter(
			p => !(p.email === profile.email && p.project === profile.project)
		);
		await this.globalState.update(PROFILES_KEY, profiles);
		// Only remove tokens if no other profile uses this email
		if (!profiles.some(p => p.email === profile.email)) {
			await this.secrets.delete(`${TOKENS_PREFIX}${profile.email}`);
		}
	}
}
