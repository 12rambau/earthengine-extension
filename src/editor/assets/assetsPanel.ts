/**
 * @module assetsPanel
 * Full-page Asset Manager WebView panel.
 *
 * Displays a sortable, paginated table of Earth Engine assets with
 * breadcrumb navigation, folder drill-down, inline preview and
 * delete / move / copy actions. Folder content is streamed page by
 * page from the API (folders can hold thousands of images) and
 * paginated client-side. Unlike tasks, assets are not a live
 * resource: data is only fetched on navigation or explicit refresh.
 */

import * as vscode from 'vscode';
import { listAssets, EEAsset } from '../../sidebar/assets/eeApiClient.js';
import { AuthService } from '../../auth/index.js';
import { openAssetPreview } from '../preview/assetPreviewPanel.js';

import { designTokens } from '../../shared/index.js';
import script from './AssetsPanel.svelte';

const CONTAINER_TYPES = new Set(['FOLDER', 'IMAGE_COLLECTION']);

/** Safety cap on the number of assets streamed for a single folder. */
const MAX_ASSETS = 10_000;

/** Number of assets fetched per API request while streaming. */
const API_PAGE_SIZE = 200;

const PREFS_KEY = 'earthengine.assets.prefs';

interface AssetPrefs {
  visibleCols?: string[];
  pageSize?: number;
}

/** Commands invoked by the row action buttons in the WebView. */
const ACTION_COMMANDS: Record<string, string> = {
  delete: 'earthengine.deleteAsset',
  move: 'earthengine.moveAsset',
  copy: 'earthengine.copyAsset',
  createFolder: 'earthengine.createFolder',
};

// ==================================================================
// PUBLIC API
// ==================================================================
/** Opens the Asset Manager WebView panel for the active profile's project. */
export async function openAssetsPanel(
  authService: AuthService,
  context: vscode.ExtensionContext,
): Promise<void> {
  const token = await authService.getToken();
  if (!token) {
    vscode.window.showErrorMessage('Not authenticated.');
    return;
  }

  const profile = authService.currentProfile!;
  const panel = vscode.window.createWebviewPanel(
    'earthengine.assetsPanel',
    'Asset Manager',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist'),
      ],
    },
  );

  let rootPath = `projects/${profile.project}`;
  let currentParentPath = rootPath;
  let allAssets: EEAsset[] = [];
  // Incremented on every navigation so a superseded stream stops sending
  let generation = 0;
  const savedPrefs = context.globalState.get<AssetPrefs>(PREFS_KEY) ?? {};

  function sendData(loading: boolean) {
    const items = allAssets.map((a) => ({
      name: a.name,
      shortName: a.name.split('/').pop() || a.name,
      type: a.type,
      isContainer: CONTAINER_TYPES.has(a.type),
      assetId: a.name,
    }));
    panel.webview.postMessage({
      type: 'data',
      assets: items,
      parent: currentParentPath,
      root: rootPath,
      loading,
    });
  }

  /** Streams all pages of a folder's children, sending data after each page. */
  async function loadAndStream(parent: string): Promise<void> {
    const gen = ++generation;
    currentParentPath = parent;
    allAssets = [];
    let pageToken: string | undefined;
    do {
      const t = await authService.getToken();
      if (!t) {
        throw new Error('Not authenticated');
      }
      const response = await listAssets(parent, t, API_PAGE_SIZE, pageToken);
      if (gen !== generation) {
        return; // superseded by a newer navigation
      }
      allAssets.push(...(response.assets || []));
      pageToken = response.nextPageToken;
      sendData(!!(pageToken && allAssets.length < MAX_ASSETS));
    } while (pageToken && allAssets.length < MAX_ASSETS);
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === 'navigate') {
        await loadAndStream(msg.path);
      } else if (msg.type === 'refresh') {
        await loadAndStream(currentParentPath);
      } else if (msg.type === 'preview') {
        const t = await authService.getToken();
        if (t) {
          await openAssetPreview(msg.name, t);
        }
      } else if (msg.type === 'action') {
        const command = ACTION_COMMANDS[msg.action];
        if (command) {
          // Fire and forget so the operation survives panel disposal
          void (async () => {
            try {
              const done = await vscode.commands.executeCommand<boolean>(command, msg.name);
              if (done && !disposed) {
                await loadAndStream(currentParentPath);
              }
            } catch (err) {
              if (!disposed) {
                const m = err instanceof Error ? err.message : String(err);
                panel.webview.postMessage({ type: 'error', message: m });
              }
            } finally {
              if (!disposed) {
                panel.webview.postMessage({ type: 'actionDone', name: msg.name });
              }
            }
          })();
        }
      } else if (msg.type === 'savePrefs') {
        const prefs: AssetPrefs = { visibleCols: msg.visibleCols, pageSize: msg.pageSize };
        await context.globalState.update(PREFS_KEY, prefs);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: 'error', message: m });
    }
  });

  // Reload when the active profile changes
  const authListener = authService.onDidChangeAuth((newProfile) => {
    if (!newProfile) {
      panel.dispose();
      return;
    }
    rootPath = `projects/${newProfile.project}`;
    panel.webview.postMessage({ type: 'loading' });
    loadAndStream(rootPath).catch((err) => {
      const m = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: 'error', message: m });
    });
  });

  let disposed = false;
  panel.onDidDispose(() => {
    disposed = true;
    generation++;
    authListener.dispose();
  });

  // Initial load
  panel.webview.html = getHtml(savedPrefs, panel.webview, context.extensionUri);
  try {
    await loadAndStream(rootPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load assets: ${msg}`);
  }
}

function getHtml(
  savedPrefs: AssetPrefs,
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const nonce = getNonce();
  const initData = JSON.stringify(savedPrefs).replace(/</g, '\\u003c');
  const codiconsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
  );
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${codiconsUri}" />
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
