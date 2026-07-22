/**
 * @module tokenStorage
 * Profile and credential persistence for Earth Engine accounts.
 *
 * Manages multiple authentication profiles stored in VS Code global state,
 * each backed by a credentials file on disk. Supports saving, activating,
 * and removing profiles.
 */

import * as vscode from 'vscode';
import {
  StoredCredentials,
  readCredentials,
  writeCredentials,
  getProfileCredentialsPath,
} from './oauth.js';

// ── Interfaces ──────────────────────────────────────────────────────

/** A saved authentication profile (email + project + on-disk credentials path). */
export interface Profile {
  email: string;
  project: string;
  credentialsPath: string;
}

// ── Storage Keys ────────────────────────────────────────────────────

const PROFILES_KEY = 'earthengine.profiles';
const ACTIVE_PROFILE_KEY = 'earthengine.activeProfile';

// ── TokenStorage ────────────────────────────────────────────────────

/**
 * Manages Earth Engine authentication profiles.
 * Profiles are stored in VS Code global state; credentials live on disk.
 */
export class TokenStorage {
  constructor(private readonly globalState: vscode.Memento) {}

  /** Saves (or updates) a profile and writes its credentials to disk. */
  async saveProfile(email: string, project: string, creds: StoredCredentials): Promise<Profile> {
    // Sanitise email+project into a safe directory name
    const profileName = `${email}_${project}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const credPath = getProfileCredentialsPath(profileName);

    // Store project on user credentials; service accounts already have project_id baked in
    if (!('type' in creds) || creds.type !== 'service_account') {
      (creds as any).project = project;
    }
    writeCredentials(credPath, creds);

    const profile: Profile = { email, project, credentialsPath: credPath };

    const profiles = this.getProfiles();
    const existing = profiles.findIndex((p) => p.email === email && p.project === project);
    if (existing >= 0) {
      profiles[existing] = profile;
    } else {
      profiles.push(profile);
    }
    await this.globalState.update(PROFILES_KEY, profiles);
    await this.globalState.update(ACTIVE_PROFILE_KEY, profile);

    return profile;
  }

  /** Returns all saved profiles. */
  getProfiles(): Profile[] {
    return this.globalState.get<Profile[]>(PROFILES_KEY, []);
  }

  /** Returns the currently active profile, or `undefined`. */
  getActiveProfile(): Profile | undefined {
    return this.globalState.get<Profile>(ACTIVE_PROFILE_KEY);
  }

  /** Switches the active profile. */
  async setActiveProfile(profile: Profile): Promise<void> {
    await this.globalState.update(ACTIVE_PROFILE_KEY, profile);
  }

  /** Reads the on-disk credentials for a given profile. */
  getCredentials(profile: Profile): StoredCredentials | undefined {
    return readCredentials(profile.credentialsPath);
  }

  /** Removes a profile from the list and clears active if it matched. */
  async removeProfile(profile: Profile): Promise<void> {
    const profiles = this.getProfiles().filter(
      (p) => !(p.email === profile.email && p.project === profile.project),
    );
    await this.globalState.update(PROFILES_KEY, profiles);

    const active = this.getActiveProfile();
    if (active?.email === profile.email && active?.project === profile.project) {
      await this.globalState.update(ACTIVE_PROFILE_KEY, undefined);
    }
  }
}
