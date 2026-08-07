/**
 * @module tasksPanel
 * Full-page Tasks WebView panel for export or import operations.
 *
 * Displays a sortable, paginated table of Earth Engine tasks with
 * live status indicators, cancel buttons, and 15 s auto-refresh.
 */

import * as vscode from 'vscode';
import {
  listOperationsPage,
  Operation,
  getTaskState,
  getElapsedTime,
  cancelOperation,
  getOperation,
} from '../../sidebar/tasks/tasksApiClient.js';
import { AuthService } from '../../auth/index.js';
import { openAssetPreview } from '../preview/assetPreviewPanel.js';
import { getExtensionUri } from '../../shared/extensionContext.js';
import { designTokens, codiconsCss } from '../../shared/index.js';

import script from './TasksPanel.svelte';

type TaskFilter = 'export' | 'import';

// ==================================================================
// PUBLIC API
// ==================================================================
/** Opens a WebView panel listing tasks of the given filter type. */
const PREFS_KEY = 'earthengine.tasks.prefs';

/** Reads the configured scan limit from the extension settings. */
function getMaxScan(): number {
  return vscode.workspace.getConfiguration('earthengine.tasks').get<number>('scanLimit', 1_000);
}

interface TaskPrefs {
  visibleCols?: string[];
  pageSize?: number;
}

export async function openTasksPanel(
  authService: AuthService,
  filter: TaskFilter,
  context: vscode.ExtensionContext,
): Promise<void> {
  const token = await authService.getToken();
  if (!token) {
    vscode.window.showErrorMessage('Not authenticated.');
    return;
  }

  const profile = authService.currentProfile!;
  const panel = vscode.window.createWebviewPanel(
    'earthengine.tasks.panel',
    'Tasks',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  let allOps: Operation[] = [];
  let resolvedProject = profile.project;

  // Terminal states that will never change
  const TERMINAL_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

  function sendData(loading = false, silent = false) {
    const mapped = allOps.map((op) => ({
      name: op.name,
      id: op.name.split('/').pop() || '',
      description: op.metadata?.description || op.name.split('/').pop() || '',
      state: getTaskState(op),
      type: op.metadata?.type || '',
      createTime: op.metadata?.createTime || '',
      startTime: op.metadata?.startTime || '',
      endTime: op.metadata?.endTime || '',
      updateTime: op.metadata?.updateTime || '',
      elapsed: getElapsedTime(op),
      progress: op.metadata?.progress,
      attempt: op.metadata?.attempt ?? null,
      priority: op.metadata?.priority ?? null,
      computeUsage: op.metadata?.batchEecuUsageSeconds ?? null,
      destinationUris: op.metadata?.destinationUris || [],
      error: op.error?.message || '',
    }));
    panel.webview.postMessage({ type: 'data', tasks: mapped, loading, silent });
  }

  /** Streams all pages of operations, calling sendData after each page. */
  async function loadAndStream(silent = false): Promise<void> {
    const t = await authService.getToken();
    if (!t) {
      return;
    }
    allOps = [];
    let pageToken: string | undefined;
    const scanLimit = getMaxScan();
    do {
      const result = await listOperationsPage(
        resolvedProject,
        t,
        Math.min(100, scanLimit - allOps.length),
        pageToken,
      );
      resolvedProject = result.project;
      allOps.push(...result.operations);
      pageToken = result.nextPageToken;
      sendData(!!(pageToken && allOps.length < scanLimit), silent);
    } while (pageToken && allOps.length < scanLimit);
  }

  /**
   * Incremental refresh: fetches new tasks in batches of 25 until overlap
   * with existing data, then updates non-terminal tasks individually.
   * Does NOT reload terminal tasks (SUCCEEDED, FAILED, CANCELLED).
   */
  async function refreshIncremental(): Promise<void> {
    const t = await authService.getToken();
    if (!t) {
      return;
    }

    // If we have no existing data, fall back to full load
    if (allOps.length === 0) {
      await loadAndStream(true);
      return;
    }

    const existingNames = new Set(allOps.map((op) => op.name));
    const newOps: Operation[] = [];
    let foundOverlap = false;
    let pageToken: string | undefined;
    let fetched = 0;

    const scanLimit = getMaxScan();
    // Step 1: Fetch batches of 25 until we overlap with known tasks
    do {
      const result = await listOperationsPage(
        resolvedProject,
        t,
        Math.min(25, scanLimit - fetched),
        pageToken,
      );
      resolvedProject = result.project;

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

    // Step 2: Insert new tasks at the front
    if (newOps.length > 0) {
      allOps.unshift(...newOps);
    }

    // Step 3: Update non-terminal tasks (skip those just fetched as new)
    const newNames = new Set(newOps.map((op) => op.name));
    const nonTerminal = allOps.filter(
      (op) => !TERMINAL_STATES.has(getTaskState(op)) && !newNames.has(op.name),
    );

    const updatePromises = nonTerminal.map(async (op) => {
      try {
        const updated = await getOperation(op.name, t!);
        op.metadata = updated.metadata;
        op.done = updated.done;
        op.error = updated.error;
      } catch {
        // If individual fetch fails, keep stale data
      }
    });
    await Promise.all(updatePromises);

    // Step 4: Send refreshed data (no loading indicators)
    sendData(false, true);
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'cancel') {
      try {
        const t = await authService.getToken();
        if (t) {
          await cancelOperation(msg.name, t);
          panel.webview.postMessage({ type: 'cancelled', name: msg.name });
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        panel.webview.postMessage({ type: 'error', message: m });
      }
    } else if (msg.type === 'preview') {
      try {
        const t = await authService.getToken();
        if (t && msg.assetName) {
          await openAssetPreview(msg.assetName, t);
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to open preview: ${m}`);
      }
    } else if (msg.type === 'refresh') {
      panel.webview.postMessage({ type: 'refreshStart' });
      refreshIncremental().catch((err) => {
        const m = err instanceof Error ? err.message : String(err);
        panel.webview.postMessage({ type: 'error', message: m });
      });
    } else if (msg.type === 'savePrefs') {
      const prefs: TaskPrefs = { visibleCols: msg.visibleCols, pageSize: msg.pageSize };
      await context.globalState.update(PREFS_KEY, prefs);
    }
  });

  const savedPrefs = context.globalState.get<TaskPrefs>(PREFS_KEY) ?? {};
  panel.webview.html = getHtml(filter, savedPrefs, panel.webview);

  loadAndStream(false).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load tasks: ${msg}`);
  });

  // Auto-refresh every 15s (incremental, silent — no button spinner)
  const interval = setInterval(() => {
    if (panel.visible) {
      refreshIncremental().catch(() => {
        sendData(false, true);
      });
    }
  }, 15_000);

  // Reload when the active profile changes
  const authListener = authService.onDidChangeAuth((profile) => {
    if (!profile) {
      panel.dispose();
      return;
    }
    resolvedProject = profile.project;
    allOps = [];
    panel.webview.postMessage({ type: 'loading' });
    loadAndStream(false).catch((err) => {
      const m = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: 'error', message: m });
    });
  });

  panel.onDidDispose(() => {
    clearInterval(interval);
    authListener.dispose();
  });
}

function getHtml(filter: TaskFilter, savedPrefs: TaskPrefs, webview: vscode.Webview): string {
  const nonce = getNonce();
  const initData = JSON.stringify({ ...savedPrefs, filter }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${codiconsCss}</style>
    <style>${designTokens}</style>
  </head>
  <body>
    <div id="app"></div>
    <script id="init-data" type="application/json" nonce="${nonce}">${initData}</script>
    <script nonce="${nonce}">${script}</script>
  </body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
