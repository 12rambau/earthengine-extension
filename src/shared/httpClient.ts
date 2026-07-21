/**
 * @module httpClient
 * Shared HTTPS request utilities for the Earth Engine extension.
 *
 * Provides a consistent set of functions for making HTTP requests:
 * - `getRequest()` — authenticated GET with Bearer token
 * - `httpRequest()` — authenticated request with configurable method
 * - `postForm()` — unauthenticated POST with form-encoded body
 * - `postJson()` — unauthenticated POST with JSON body
 * - `fetchJson()` — fetch and parse JSON (follows redirects)
 * - `fetchHtml()` — fetch raw HTML (follows redirects)
 *
 * All functions return Promises and handle HTTP error codes by rejecting.
 */

import * as https from 'https';
import { URL } from 'url';

/**
 * Perform an HTTPS GET request with an Authorization header.
 */
export function getRequest(url: string, accessToken: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		https.get({
			hostname: parsed.hostname,
			path: parsed.pathname + parsed.search,
			headers: { 'Authorization': `Bearer ${accessToken}` },
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
			res.on('error', reject);
		}).on('error', reject);
	});
}

/**
 * Perform an HTTPS request with configurable method, auth, and optional body.
 */
export function httpRequest(
	url: string,
	method: string,
	accessToken: string,
	body?: string,
	contentType = 'application/json',
): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const options: https.RequestOptions = {
			hostname: parsed.hostname,
			path: parsed.pathname + parsed.search,
			method,
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': contentType,
			},
		};
		const req = https.request(options, (res) => {
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
			res.on('error', reject);
		});
		req.on('error', reject);
		if (body) { req.write(body); }
		req.end();
	});
}

/**
 * Perform an HTTPS POST with form-encoded body (no auth header).
 */
export function postForm(url: string, body: string): Promise<string> {
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

/**
 * Perform an HTTPS POST with JSON body (no auth header).
 */
export function postJson(url: string, body: string): Promise<string> {
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

/**
 * Fetch JSON from a URL (no auth, follows redirects).
 */
export function fetchJson<T>(url: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const get = (targetUrl: string) => {
			https.get(targetUrl, (res) => {
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					get(res.headers.location);
					return;
				}
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => chunks.push(chunk));
				res.on('end', () => {
					try {
						resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
					} catch (e) {
						reject(e);
					}
				});
				res.on('error', reject);
			}).on('error', reject);
		};
		get(url);
	});
}

/**
 * Fetch raw HTML from a URL (no auth, follows redirects).
 */
export function fetchHtml(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const get = (targetUrl: string) => {
			https.get(targetUrl, (res) => {
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					get(res.headers.location);
					return;
				}
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => chunks.push(chunk));
				res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
				res.on('error', reject);
			}).on('error', reject);
		};
		get(url);
	});
}
