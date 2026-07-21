import * as http from 'http';
import * as vscode from 'vscode';

export interface MapCommand {
	type: string;
	data: Record<string, unknown>;
}

export class MapBridgeServer {
	private server: http.Server | undefined;
	private _onCommand = new vscode.EventEmitter<MapCommand>();
	readonly onCommand = this._onCommand.event;

	readonly port = 31415;

	start(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.server) {
				resolve();
				return;
			}

			this.server = http.createServer((req, res) => {
				// CORS headers for local requests
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

				if (req.method === 'OPTIONS') {
					res.writeHead(204);
					res.end();
					return;
				}

				if (req.method !== 'POST') {
					res.writeHead(405);
					res.end('Method Not Allowed');
					return;
				}

				const chunks: Buffer[] = [];
				req.on('data', (chunk: Buffer) => chunks.push(chunk));
				req.on('end', () => {
					try {
						const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
						const endpoint = (req.url || '/').replace(/^\//, '');

						this._onCommand.fire({ type: endpoint, data: body });

						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ ok: true }));
					} catch {
						res.writeHead(400);
						res.end('Bad Request');
					}
				});
			});

			this.server.listen(this.port, '127.0.0.1', () => {
				resolve();
			});

			this.server.on('error', (err: NodeJS.ErrnoException) => {
				if (err.code === 'EADDRINUSE') {
					// Port already in use — another instance may be running
					resolve();
				} else {
					reject(err);
				}
			});
		});
	}

	stop() {
		if (this.server) {
			this.server.close();
			this.server = undefined;
		}
	}
}
