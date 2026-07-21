/**
 * @module oauth
 * OAuth2 authentication flow for Google Earth Engine.
 *
 * Implements the notebook-style PKCE auth flow: generate an auth URL,
 * open the browser, exchange the authorization code for a refresh token,
 * and persist credentials to disk. Uses the same client ID/secret as the
 * official `earthengine-api` Python library.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { URLSearchParams } from 'url';
import { postForm, postJson, getRequest, fetchJson } from '../shared/httpClient.js';

// ── OAuth Constants ──────────────────────────────────────────────────

// Same credentials as earthengine-api (python/ee/oauth.py)
const CLIENT_ID = '517222506229-vsmmajv00ul0bs7p89v5m89qs8eb9359.apps.googleusercontent.com';
const CLIENT_SECRET = 'RUP0RZ6e0pPhDzsqIJ7KlNd1';
const SCOPES = [
	'https://www.googleapis.com/auth/earthengine',
	'https://www.googleapis.com/auth/cloud-platform',
	'https://www.googleapis.com/auth/devstorage.full_control',
	'openid',
	'email',
];
const AUTH_PAGE_URL = 'https://code.earthengine.google.com/client-auth';
const FETCH_URL = AUTH_PAGE_URL + '/fetch';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

// ── Interfaces ───────────────────────────────────────────────────────

/** Persisted OAuth2 credentials for an Earth Engine session. */
export interface EECredentials {
	client_id: string;
	client_secret: string;
	refresh_token: string;
	scopes: string[];
	project?: string;
}

// ── Credential Paths ─────────────────────────────────────────────────

/** Returns the default credentials path (~/.config/earthengine/credentials). */
export function getDefaultCredentialsPath(): string {
	return path.join(os.homedir(), '.config', 'earthengine', 'credentials');
}

/** Returns the profile-specific credentials path under ~/.config/earthengine/profiles/. */
export function getProfileCredentialsPath(profileName: string): string {
	return path.join(os.homedir(), '.config', 'earthengine', 'profiles', profileName, 'credentials');
}

// ── Credential I/O ──────────────────────────────────────────────────

/** Reads and parses a JSON credentials file; returns `undefined` on failure. */
export function readCredentials(credPath: string): EECredentials | undefined {
	try {
		const content = fs.readFileSync(credPath, 'utf-8');
		return JSON.parse(content) as EECredentials;
	} catch {
		return undefined;
	}
}

/** Writes credentials to disk with restricted file permissions (0o600). */
export function writeCredentials(credPath: string, creds: EECredentials): void {
	const dir = path.dirname(credPath);
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	fs.writeFileSync(credPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

// ── Notebook Auth Flow ───────────────────────────────────────────────

/**
 * Interactive notebook-style PKCE authentication flow.
 *
 * 1. Generate PKCE nonces and build the auth URL.
 * 2. Open the browser for the user to sign in.
 * 3. User pastes the authorization code.
 * 4. Exchange the code for a refresh token.
 * 5. Return credentials, email, and project.
 */
export async function authenticateNotebookFlow(): Promise<{ credentials: EECredentials; email: string; project: string } | undefined> {
	// Generate PKCE nonces
	const nonces = generateNonces('request_id', 'token_verifier', 'client_verifier');

	// Build auth URL
	const authUrl = `${AUTH_PAGE_URL}?scopes=${encodeURIComponent(SCOPES.join(' '))}` +
		`&request_id=${nonces.request_id}` +
		`&tc=${nonces.token_challenge}` +
		`&cc=${nonces.client_challenge}`;

	// Show the link and open browser
	const openChoice = await vscode.window.showInformationMessage(
		'Earth Engine authentication: a browser window will open. Sign in and copy the authorization code.',
		'Open Browser'
	);

	if (openChoice !== 'Open Browser') {
		return undefined;
	}

	vscode.env.openExternal(vscode.Uri.parse(authUrl));

	// Ask user to paste the code
	const authCode = await vscode.window.showInputBox({
		title: 'Earth Engine Authentication',
		prompt: 'Paste the authorization code from the browser here',
		placeHolder: '4/0A...',
		ignoreFocusOut: true,
	});

	if (!authCode) {
		return undefined;
	}

	// Fetch client info from EE auth server
	const fetchData = JSON.stringify({
		request_id: nonces.request_id,
		client_verifier: nonces.client_verifier,
	});

	let clientInfo: { client_id: string; client_secret: string; scopes?: string[] };
	try {
		const fetchResponse = await postJson(FETCH_URL, fetchData);
		const parsed = JSON.parse(fetchResponse);
		if (parsed.error) {
			throw new Error(parsed.error);
		}
		clientInfo = parsed;
	} catch {
		clientInfo = { client_id: CLIENT_ID, client_secret: CLIENT_SECRET };
	}

	// Exchange code for refresh token
	const tokenParams = new URLSearchParams({
		code: authCode.trim(),
		client_id: clientInfo.client_id,
		client_secret: clientInfo.client_secret,
		redirect_uri: REDIRECT_URI,
		grant_type: 'authorization_code',
		code_verifier: nonces.token_verifier,
	});

	const tokenResponse = await postForm(TOKEN_URI, tokenParams.toString());
	const tokenData = JSON.parse(tokenResponse);

	if (!tokenData.refresh_token) {
		throw new Error('No refresh token received. ' + JSON.stringify(tokenData));
	}

	// Get user email from the access token
	const email = await fetchEmail(tokenData.access_token);

	// Ask for the Cloud project ID (the human-readable name, not the number)
	const project = await vscode.window.showInputBox({
		title: 'Google Cloud Project',
		prompt: 'Enter your Cloud project ID (e.g. ee-my-project or my-project-name)',
		placeHolder: 'ee-my-project',
		ignoreFocusOut: true,
	});

	if (!project) {
		vscode.window.showWarningMessage('Sign in cancelled: a project ID is required.');
		return undefined;
	}

	const credentials: EECredentials = {
		client_id: clientInfo.client_id,
		client_secret: clientInfo.client_secret,
		refresh_token: tokenData.refresh_token,
		scopes: clientInfo.scopes || SCOPES,
		project,
	};

	return { credentials, email, project };
}

// ── Token Refresh ────────────────────────────────────────────────────

/** Exchanges a refresh token for a short-lived access token. */
export async function getAccessToken(creds: EECredentials): Promise<string> {
	const params = new URLSearchParams({
		client_id: creds.client_id || CLIENT_ID,
		client_secret: creds.client_secret || CLIENT_SECRET,
		refresh_token: creds.refresh_token,
		grant_type: 'refresh_token',
	});

	const response = await postForm(TOKEN_URI, params.toString());
	const data = JSON.parse(response);
	return data.access_token;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Fetches the user's email from the access token. Tries userinfo first, falls back to tokeninfo. */
async function fetchEmail(accessToken: string): Promise<string> {
	// Try userinfo endpoint (requires openid/email scope)
	try {
		const response = await getRequest('https://www.googleapis.com/oauth2/v3/userinfo', accessToken);
		const data = JSON.parse(response);
		if (data.email) { return data.email; }
	} catch { /* fall through */ }

	// Fallback: tokeninfo endpoint (works with any valid token, no auth needed)
	try {
		const data = await fetchJson<{ email?: string }>(
			`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`
		);
		if (data.email) { return data.email; }
	} catch { /* fall through */ }

	return 'unknown';
}

/** Generates random PKCE nonces and their SHA-256 challenges. */
function generateNonces(...keys: string[]): Record<string, string> {
	const table: Record<string, string> = {};
	for (const key of keys) {
		const raw = crypto.randomBytes(32);
		table[key] = base64url(raw);
		if (key.endsWith('_verifier')) {
			const challenge = crypto.createHash('sha256').update(table[key]).digest();
			table[key.replace('_verifier', '_challenge')] = base64url(challenge);
		}
	}
	return table;
}

/** Encodes a buffer as an unpadded base64url string. */
function base64url(buf: Buffer): string {
	return buf.toString('base64url').replace(/=+$/, '');
}
