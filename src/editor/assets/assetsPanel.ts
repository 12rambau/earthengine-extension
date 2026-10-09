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

import * as path from 'path';
import * as vscode from 'vscode';
import { listAssets, EEAsset } from '../../sidebar/assets/eeApiClient.js';
import { AuthService } from '../../auth/index.js';
import { openAssetPreview } from '../preview/assetPreviewPanel.js';
import { listBuckets } from '../../shared/gcsClient.js';
import { NewAssetRequest, sweepStagedObjects, uploadNewAsset } from './assetUpload.js';
import { readTiffBandCount } from './geotiffMeta.js';
import { CONVERTIBLE_EXTENSIONS } from './vectorToShapefile.js';

import { designTokens, codiconsCss } from '../../shared/index.js';
import type { TablePreferences } from '../../shared/dataTable/tableTypes.js';
import script from './AssetsPanel.svelte';

const CONTAINER_TYPES = new Set(['FOLDER', 'IMAGE_COLLECTION']);

/** Safety cap on the number of assets streamed for a single folder. */
const MAX_ASSETS = 10_000;

/** Number of assets fetched per API request while streaming. */
const API_PAGE_SIZE = 200;

const PREFS_KEY = 'earthengine.assets.prefs';
const LAST_BUCKET_KEY = 'earthengine.assets.staging.lastBucket';

interface AssetPrefs extends TablePreferences {}

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
      localResourceRoots: [],
    },
  );
  panel.iconPath = new vscode.ThemeIcon('folder-library');

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

  // ----------------------------------------------------------------
  // NEW ASSET UPLOAD
  // ----------------------------------------------------------------
  /** Sends the Cloud Storage buckets usable as a staging area. */
  async function sendBuckets(): Promise<void> {
    const t = await authService.getToken();
    if (!t) {
      throw new Error('Not authenticated');
    }
    const project = authService.currentProfile!.project;
    let names: string[] = [];
    try {
      names = await listBuckets(project, t);
    } catch {
      // Listing needs storage.buckets.list; the dialog falls back to free text.
    }
    const remembered = context.globalState.get<string>(LAST_BUCKET_KEY);
    const preferred =
      (remembered && names.includes(remembered) ? remembered : undefined) ??
      names.find((name) => name === project) ??
      names.find((name) => name.startsWith(project)) ??
      names[0] ??
      project;
    panel.webview.postMessage({ type: 'buckets', buckets: names, defaultBucket: preferred });
  }

  /** Opens the native file picker for the format matching the asset kind. */
  async function pickSourceFile(kind: 'image' | 'table'): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters:
        kind === 'image'
          ? { 'Cloud Optimized GeoTIFF': ['tif', 'tiff'] }
          : { 'Vector data': ['shp', ...CONVERTIBLE_EXTENSIONS] },
      title: kind === 'image' ? 'Select a GeoTIFF to ingest' : 'Select a vector file to ingest',
    });
    if (!uris?.length) {
      return;
    }
    const file = uris[0].fsPath;
    let bandCount = 1;
    if (kind === 'image') {
      try {
        bandCount = await readTiffBandCount(file);
      } catch {
        // Not a classic TIFF or tag missing (e.g. BigTIFF) — the dialog falls back to a single band.
      }
    }
    panel.webview.postMessage({
      type: 'filePicked',
      path: file,
      suggestedName: path.basename(file, path.extname(file)).replace(/[^\w.-]/g, '_'),
      bandCount,
    });
  }

  /** Stages the files, submits ingestion and reports progress to both UIs. */
  async function runUpload(request: NewAssetRequest): Promise<void> {
    try {
      await context.globalState.update(LAST_BUCKET_KEY, request.bucket);
      const operation = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Ingesting ${request.assetId.split('/').pop()}`,
        },
        (progress) =>
          uploadNewAsset(request, authService, context, (message) => {
            progress.report({ message });
            if (!disposed) {
              panel.webview.postMessage({ type: 'uploadProgress', message });
            }
          }),
      );
      if (!disposed) {
        panel.webview.postMessage({ type: 'uploadDone' });
      }
      try {
        await vscode.commands.executeCommand('earthengine.trackSubmittedImport', {
          name: operation,
          kind: request.kind,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showWarningMessage(
          `Import submitted, but it could not be added to the Tasks list: ${message}`,
        );
      }
      vscode.window.showInformationMessage(
        `Ingestion submitted as ${operation.split('/').pop()}. Follow it in the Tasks panel.`,
      );
      // Reclaims the staging area for any earlier upload that has since finished.
      void sweepStagedObjects(authService, context).catch(() => undefined);
      if (!disposed) {
        await loadAndStream(currentParentPath);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!disposed) {
        panel.webview.postMessage({ type: 'uploadError', message });
      }
    }
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
        await context.globalState.update(PREFS_KEY, msg.preferences as AssetPrefs);
      } else if (msg.type === 'listBuckets') {
        await sendBuckets();
      } else if (msg.type === 'pickFile') {
        await pickSourceFile(msg.kind);
      } else if (msg.type === 'uploadAsset') {
        await runUpload(msg.request as NewAssetRequest);
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
  panel.webview.html = getHtml(savedPrefs, panel.webview);
  void sweepStagedObjects(authService, context).catch(() => undefined);
  try {
    await loadAndStream(rootPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load assets: ${msg}`);
  }
}

function getHtml(savedPrefs: AssetPrefs, webview: vscode.Webview): string {
  const nonce = getNonce();
  const initData = JSON.stringify(savedPrefs).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
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
