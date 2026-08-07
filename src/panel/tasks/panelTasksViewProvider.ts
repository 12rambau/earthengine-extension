/**
 * @module panelTasksViewProvider
 * WebviewViewProvider for a single task panel (export or import).
 *
 * Streams Earth Engine operations into a compact, monospace WebView
 * with live status updates, cancel buttons, and auto-refresh.
 */

import * as vscode from 'vscode';
import {
  listOperationsPage,
  Operation,
  getTaskState,
  getElapsedTime,
  cancelOperation,
  getOperation,
  isExportTask,
  isImportTask,
} from '../../sidebar/tasks/tasksApiClient.js';
import { AuthService } from '../../auth/index.js';
import { designTokens } from '../../shared/index.js';
import { openAssetPreview } from '../../editor/preview/assetPreviewPanel.js';

import script from './PanelTasksView.svelte';

type TaskFilter = 'export' | 'import';

const TERMINAL_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

/** Reads the configured max items from the extension settings. */
function getMaxTasks(): number {
  return vscode.workspace.getConfiguration('earthengine.tasks').get<number>('maxItems', 100);
}

/** Reads the configured scan limit from the extension settings. */
function getMaxScan(): number {
  return vscode.workspace.getConfiguration('earthengine.tasks').get<number>('scanLimit', 1_000);
}

// ==================================================================
// PANELTASKSVIEWPROVIDER
// ==================================================================
/** Provides a WebView for the bottom-panel task list. */
export class PanelTasksViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private allOps: Operation[] = [];
  private resolvedProject: string | undefined;
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private disposables: vscode.Disposable[] = [];
  private statusFilter: Set<string> | undefined;

  constructor(
    private readonly authService: AuthService,
    private readonly filter: TaskFilter,
    private readonly context: vscode.ExtensionContext,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Listen for messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.disposables,
    );

    // Auto-refresh every 15 s
    this.refreshTimer = setInterval(() => {
      if (webviewView.visible) {
        this.refreshIncremental().catch(() => this.sendData(false));
      }
    }, 15_000);

    // Reload on profile change
    const authListener = this.authService.onDidChangeAuth((profile) => {
      if (!profile) {
        this.resolvedProject = undefined;
        this.allOps = [];
        this.view?.webview.postMessage({ type: 'unauthenticated' });
        return;
      }
      this.resolvedProject = profile.project;
      this.allOps = [];
      this.view?.webview.postMessage({ type: 'loading' });
      this.loadAndStream().catch(() => {});
    });
    this.disposables.push(authListener);

    webviewView.onDidDispose(() => {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }
      this.disposables.forEach((d) => d.dispose());
      this.disposables = [];
      this.view = undefined;
    });

    // Initial load
    this.loadAndStream().catch(() => {});
  }

  /** Triggers a full reload from the extension host side. */
  refresh(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage({ type: 'loading' });
    this.loadAndStream().catch(() => {});
  }

  /** Sets the status filter. Pass undefined or empty set to clear. */
  setStatusFilter(states: Set<string> | undefined): void {
    this.statusFilter = states && states.size > 0 ? states : undefined;
    this.sendData(false);
  }

  /** Returns the current status filter, if any. */
  getStatusFilter(): Set<string> | undefined {
    return this.statusFilter;
  }

  // ==================================================================
  // DATA
  // ==================================================================

  private sendData(loading = false): void {
    if (!this.view) {
      return;
    }
    const filterFn = this.filter === 'export' ? isExportTask : isImportTask;
    let filtered = this.allOps.filter(filterFn);
    if (this.statusFilter) {
      filtered = filtered.filter((op) => this.statusFilter!.has(getTaskState(op)));
    }
    filtered = filtered.slice(0, getMaxTasks());
    const mapped = filtered.map((op) => ({
      name: op.name,
      id: op.name.split('/').pop() || '',
      description: op.metadata?.description || op.name.split('/').pop() || '',
      state: getTaskState(op),
      elapsed: getElapsedTime(op),
      destinationUris: op.metadata?.destinationUris || [],
    }));
    this.view.webview.postMessage({ type: 'data', tasks: mapped, loading });
  }

  private async loadAndStream(): Promise<void> {
    const token = await this.authService.getToken();
    if (!token) {
      this.view?.webview.postMessage({ type: 'unauthenticated' });
      return;
    }
    const profile = this.authService.currentProfile!;
    const project = this.resolvedProject || profile.project;
    this.allOps = [];
    let pageToken: string | undefined;
    const scanLimit = getMaxScan();
    do {
      const result = await listOperationsPage(
        project,
        token,
        Math.min(100, scanLimit - this.allOps.length),
        pageToken,
      );
      this.resolvedProject = result.project;
      this.allOps.push(...result.operations);
      pageToken = result.nextPageToken;
      this.sendData(!!pageToken && this.allOps.length < scanLimit);
    } while (pageToken && this.allOps.length < scanLimit);
  }

  private async refreshIncremental(): Promise<void> {
    const token = await this.authService.getToken();
    if (!token) {
      this.view?.webview.postMessage({ type: 'unauthenticated' });
      return;
    }
    if (this.allOps.length === 0) {
      await this.loadAndStream();
      return;
    }

    const existingNames = new Set(this.allOps.map((op) => op.name));
    const newOps: Operation[] = [];
    let foundOverlap = false;
    let pageToken: string | undefined;
    let fetched = 0;
    const scanLimit = getMaxScan();

    do {
      const result = await listOperationsPage(
        this.resolvedProject!,
        token,
        Math.min(25, scanLimit - fetched),
        pageToken,
      );
      this.resolvedProject = result.project;
      for (const op of result.operations) {
        if (existingNames.has(op.name)) {
          foundOverlap = true;
          break;
        }
        newOps.push(op);
      }
      fetched += result.operations.length;
      pageToken = result.nextPageToken;
    } while (!foundOverlap && pageToken && fetched < scanLimit);

    if (newOps.length > 0) {
      this.allOps.unshift(...newOps);
    }

    const newNames = new Set(newOps.map((op) => op.name));
    const nonTerminal = this.allOps.filter(
      (op) => !TERMINAL_STATES.has(getTaskState(op)) && !newNames.has(op.name),
    );
    await Promise.all(
      nonTerminal.map(async (op) => {
        try {
          const updated = await getOperation(op.name, token!);
          op.metadata = updated.metadata;
          op.done = updated.done;
          op.error = updated.error;
        } catch {
          // keep stale data
        }
      }),
    );
    this.sendData(false);
  }

  // ==================================================================
  // MESSAGES
  // ==================================================================

  private async handleMessage(msg: { type: string; name?: string; assetName?: string }) {
    if (msg.type === 'cancel' && msg.name) {
      try {
        const token = await this.authService.getToken();
        if (token) {
          await cancelOperation(msg.name, token);
          this.view?.webview.postMessage({ type: 'cancelled', name: msg.name });
        } else {
          vscode.window.showErrorMessage('Not authenticated. Please sign in to cancel operations.');
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Cancel failed: ${m}`);
      }
    } else if (msg.type === 'preview' && msg.assetName) {
      try {
        const token = await this.authService.getToken();
        if (token) {
          await openAssetPreview(msg.assetName, token);
        } else {
          vscode.window.showErrorMessage('Not authenticated. Please sign in to preview assets.');
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Preview failed: ${m}`);
      }
    }
  }

  // ==================================================================
  // HTML
  // ==================================================================

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'node_modules',
        '@vscode',
        'codicons',
        'dist',
        'codicon.css',
      ),
    );
    const csp = [
      `default-src 'none'`,
      `font-src ${webview.cspSource}`,
      `style-src 'unsafe-inline' ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    const initJson = JSON.stringify({ filter: this.filter }).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${codiconsUri}" />
    <style>${designTokens}</style>
  </head>
  <body>
    <div id="app"></div>
    <script id="init-data" type="application/json" nonce="${nonce}">${initJson}</script>
    <script nonce="${nonce}">${script}</script>
  </body>
</html>`;
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.disposables.forEach((d) => d.dispose());
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
