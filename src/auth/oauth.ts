import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import { URL, URLSearchParams } from 'url';

// These are the public "installed app" credentials from the open-source
// earthengine-api (python/ee/oauth.py), designed for desktop OAuth flows.
const CLIENT_ID = '517222506229-vsmmajv00ul0bs7p89v5m89qs8eb9359.apps.googleusercontent.com';
const CLIENT_SECRET = 'RUP0RZ6e0pPhDzsqIJ7KlNd1';
const SCOPES = [
	'https://www.googleapis.com/auth/earthengine',
	'https://www.googleapis.com/auth/cloud-platform',
];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export interface AuthTokens {
	access_token: string;
	refresh_token: string;
	expires_at: number;
}

export interface UserInfo {
	email: string;
	name?: string;
}

export async function authenticateWithBrowser(): Promise<{ tokens: AuthTokens; userInfo: UserInfo }> {
	const { code, redirectUri, codeVerifier } = await getAuthorizationCode();
	const tokens = await exchangeCodeForTokens(code, redirectUri, codeVerifier);
	const userInfo = await fetchUserInfo(tokens.access_token);
	return { tokens, userInfo };
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		client_secret: CLIENT_SECRET,
		refresh_token: refreshToken,
		grant_type: 'refresh_token',
	});

	const response = await postRequest(TOKEN_URL, params.toString());
	const data = JSON.parse(response);

	return {
		access_token: data.access_token,
		refresh_token: refreshToken,
		expires_at: Date.now() + (data.expires_in * 1000),
	};
}

function getAuthorizationCode(): Promise<{ code: string; redirectUri: string; codeVerifier: string }> {
	return new Promise((resolve, reject) => {
		const server = http.createServer();
		const state = crypto.randomBytes(16).toString('hex');

		// PKCE: generate code_verifier and code_challenge
		const codeVerifier = crypto.randomBytes(32).toString('base64url');
		const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				reject(new Error('Failed to start local server'));
				return;
			}

			const port = address.port;
			const redirectUri = `http://localhost:${port}`;

			const params = new URLSearchParams({
				client_id: CLIENT_ID,
				redirect_uri: redirectUri,
				response_type: 'code',
				scope: [...SCOPES, 'openid', 'email', 'profile'].join(' '),
				access_type: 'offline',
				state,
				code_challenge: codeChallenge,
				code_challenge_method: 'S256',
			});

			const authUrl = `${AUTH_URL}?${params.toString()}`;
			vscode.env.openExternal(vscode.Uri.parse(authUrl));

			server.on('request', (req, res) => {
				const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
				const receivedState = url.searchParams.get('state');
				const code = url.searchParams.get('code');
				const error = url.searchParams.get('error');

				if (error) {
					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.end('<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>');
					server.close();
					reject(new Error(`Auth error: ${error}`));
					return;
				}

				if (receivedState !== state) {
					res.writeHead(400, { 'Content-Type': 'text/html' });
					res.end('<html><body><h2>Invalid state</h2></body></html>');
					server.close();
					reject(new Error('State mismatch'));
					return;
				}

				if (code) {
					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.end('<html><body><h2>Authentication successful!</h2><p>You can close this window and return to VS Code.</p></body></html>');
					server.close();
					resolve({ code, redirectUri, codeVerifier });
				}
			});

			// Timeout after 2 minutes
			setTimeout(() => {
				server.close();
				reject(new Error('Authentication timed out'));
			}, 120_000);
		});
	});
}

async function exchangeCodeForTokens(code: string, redirectUri: string, codeVerifier: string): Promise<AuthTokens> {
	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		client_secret: CLIENT_SECRET,
		code,
		redirect_uri: redirectUri,
		grant_type: 'authorization_code',
		code_verifier: codeVerifier,
	});

	const response = await postRequest(TOKEN_URL, params.toString());
	const data = JSON.parse(response);

	return {
		access_token: data.access_token,
		refresh_token: data.refresh_token,
		expires_at: Date.now() + (data.expires_in * 1000),
	};
}

async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
	const response = await getRequest(USERINFO_URL, accessToken);
	const data = JSON.parse(response);
	return { email: data.email, name: data.name };
}

function postRequest(url: string, body: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const req = https.request({
			hostname: parsed.hostname,
			path: parsed.pathname,
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

function getRequest(url: string, accessToken: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const req = https.request({
			hostname: parsed.hostname,
			path: parsed.pathname,
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
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
		req.end();
	});
}
