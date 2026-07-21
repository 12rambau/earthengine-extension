import * as https from 'https';

const EE_API_BASE = 'https://earthengine.googleapis.com/v1';

export interface OperationMetadata {
	'@type'?: string;
	state?: string;
	description?: string;
	createTime?: string;
	updateTime?: string;
	startTime?: string;
	endTime?: string;
	progress?: number;
	type?: string;
	destinationType?: string;
}

export interface Operation {
	name: string;
	metadata?: OperationMetadata;
	done?: boolean;
	error?: { code?: number; message?: string };
}

export interface ListOperationsResponse {
	operations?: Operation[];
	nextPageToken?: string;
}

export interface PaginatedOperations {
	operations: Operation[];
	nextPageToken?: string;
	project: string;
}

export async function listOperationsPage(
	project: string,
	accessToken: string,
	pageSize = 10,
	pageToken?: string,
): Promise<PaginatedOperations> {
	const projectsToTry = [project];
	if (project !== 'earthengine-legacy') {
		projectsToTry.push('earthengine-legacy');
	}

	for (const proj of projectsToTry) {
		const params = new URLSearchParams({ pageSize: String(pageSize) });
		if (pageToken) {
			params.set('pageToken', pageToken);
		}
		const url = `${EE_API_BASE}/projects/${proj}/operations?${params.toString()}`;
		try {
			const response = await request(url, 'GET', accessToken);
			const data = JSON.parse(response) as ListOperationsResponse;
			return {
				operations: data.operations || [],
				nextPageToken: data.nextPageToken,
				project: proj,
			};
		} catch (err) {
			if (proj === project) {
				throw err;
			}
		}
	}

	return { operations: [], project };
}

export async function cancelOperation(name: string, accessToken: string): Promise<void> {
	const url = `${EE_API_BASE}/${name}:cancel`;
	await request(url, 'POST', accessToken);
}

export function isExportTask(op: Operation): boolean {
	const type = (op.metadata?.type || '').toUpperCase();
	return type.startsWith('EXPORT') || type === '';
}

export function isImportTask(op: Operation): boolean {
	const type = (op.metadata?.type || '').toUpperCase();
	return type.startsWith('INGEST') || type.startsWith('IMPORT');
}

export function getTaskState(op: Operation): string {
	return op.metadata?.state || (op.done ? 'SUCCEEDED' : 'PENDING');
}

export function getElapsedTime(op: Operation): string {
	const start = op.metadata?.startTime || op.metadata?.createTime;
	if (!start) { return ''; }
	const end = op.metadata?.endTime || new Date().toISOString();
	const ms = new Date(end).getTime() - new Date(start).getTime();
	if (ms < 0) { return ''; }
	const minutes = Math.floor(ms / 60000);
	if (minutes < 1) { return '<1m'; }
	if (minutes < 60) { return `${minutes}m`; }
	const hours = Math.floor(minutes / 60);
	return `${hours}h${minutes % 60}m`;
}

function request(url: string, method: string, accessToken: string, body?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const options: https.RequestOptions = {
			hostname: parsed.hostname,
			path: parsed.pathname + parsed.search,
			method,
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
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
