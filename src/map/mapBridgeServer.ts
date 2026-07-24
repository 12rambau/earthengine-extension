/**
 * @module mapBridgeServer
 * Local HTTP bridge server for Python \u2192 Map communication.
 *
 * Listens on `127.0.0.1:31415` for JSON POST requests from Python
 * scripts (via `earthengine_vscode_map.py`) and translates them into
 * VS Code events that the MapPanel forwards to the Leaflet WebView.
 */

import * as http from 'http';
import * as vscode from 'vscode';

// \u2500\u2500 Interfaces \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/** A map command received from a Python script via the HTTP bridge. */
export interface MapCommand {
  type: string;
  data: Record<string, unknown>;
}

// ==================================================================
// MAPBRIDGESERVER
// ==================================================================
/** Lightweight HTTP server bridging Python map commands to the VS Code extension. */
export class MapBridgeServer {
  private server: http.Server | undefined;
  private _onCommand = new vscode.EventEmitter<MapCommand>();
  readonly onCommand = this._onCommand.event;

  readonly port = 31415;

  /** Starts the HTTP server on the bridge port (idempotent). */
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

  /** Stops the HTTP server and releases the port. */
  stop() {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }
}
