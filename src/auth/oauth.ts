import * as vscode from 'vscode';
import * as https from 'https';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { URL, URLSearchParams } from 'url';

// Same credentials as earthengine-api (python/ee/oauth.py)
const CLIENT_ID = '517222506229-vsmmajv00ul0bs7p89v5m89qs8eb9359.apps.googleusercontent.com';
const CLIENT_SECRET = 'RUP0RZ6e0pPhDzsqIJ7KlNd1';
const SCOPES = [
	'https://www.googleapis.com/auth/earthengine',
	'https://www.googleapis.com/auth/cloud-platform',
	'https://www.googleapis.com/auth/devstorage.full_control',
];
const AUTH_PAGE_URL = 'https://code.earthengine.google.com/client-auth';
const FETCH_URL = AUTH_PAGE_URL + '/fetch';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

export interface EECredentials {
	client_id: string;
	client_secret: string;
	refresh_token: string;
	scopes: string[];
	project?: string;
}

/**
 * Default credentials path (same as earthengine CLI)
 */
export function getDefaultCredentialsPath(): string {
	return path.join(os.homedir(), '.config', 'earthengine', 'credentials');
}

/**
 * Profile-specific credentials path
 */
export function getProfileCredentialsPath(profileName: string): string {
	return path.join(os.homedir(), '.config', 'earthengine', 'profiles', profileName, 'credentials');
}

/**
 * Read credentials from a file
 */
export function readCredentials(credPath: string): EECredentials | undefined {
	try {
		const content = fs.readFileSync(credPath, 'utf-8');
		return JSON.parse(content) as EECredentials;
	} catch {
		return undefined;
	}
}

/**
 * Write credentials to a file (with restricted permissions)
 */
export function writeCredentials(credPath: string, creds: EECredentials): void {
	const dir = path.dirname(credPath);
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	fs.writeFileSync(credPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

/**
 * Notebook-mode authentication flow:
 * 1. Generate auth URL
 * 2. Open in browser
 * 3. User pastes the code
 * 4. Exchange for refresh token
 * 5. Save credentials file
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

/**
 * Refresh an access token from a credentials file
 */
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

async function fetchEmail(accessToken: string): Promise<string> {
	try {
		const response = await getRequest('https://www.googleapis.com/oauth2/v3/userinfo', accessToken);
		const data = JSON.parse(response);
		return data.email || 'unknown';
	} catch {
		return 'unknown';
	}
}

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

function base64url(buf: Buffer): string {
	return buf.toString('base64url').replace(/=+$/, '');
}

function postForm(url: string, body: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const req = https.request({
			hostname: parsed.hostname,
			path: parsed.pathname + parsed.search,
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Content-Length': Buffer.byteLength(body),
			},
		}, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				const result = Buffer.concat(chunks).toString('utf-8');
				if (res.statusCode && res.statusCode >= 400) {
					reject(new Error(`HTTP ${res.statusCode}: ${result}`));
				} else {
					resolve(result);
				}
			});
		});
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

function postJson(url: string, body: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const req = https.request({
			hostname: parsed.hostname,
			path: parsed.pathname + parsed.search,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json; charset=UTF-8',
				'Content-Length': Buffer.byteLength(body),
			},
		}, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				const result = Buffer.concat(chunks).toString('utf-8');
				if (res.statusCode && res.statusCode >= 400) {
					reject(new Error(`HTTP ${res.statusCode}: ${result}`));
				} else {
					resolve(result);
				}
			});
		});
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

function getRequest(url: string, accessToken: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		https.get({
			hostname: parsed.hostname,
			path: parsed.pathname,
			headers: { 'Authorization': `Bearer ${accessToken}` },
		}, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
			res.on('error', reject);
		}).on('error', reject);
	});
}
