/**
 * @module mapPanel
 * Leaflet-based map WebView panel for the Earth Engine extension.
 *
 * Renders a full-screen Leaflet map with Google Map Tiles basemaps, a layer
 * control panel, and a status bar. Receives tile layer, GeoJSON, and viewport
 * commands from Python scripts via the bridge server.
 */

import * as vscode from 'vscode';
import { EditorPanel } from '../../shared/baseComponents.js';
import { MapBridgeServer, MapCommand } from './mapBridgeServer.js';
import { ensureEe, getEeContext } from '../../shared/eeSession.js';
import { getAsset } from '../../sidebar/assets/eeApiClient.js';
import { MapLayerManager } from './mapLayerManager.js';
import { MapInspector } from './mapInspector.js';
import { MapTilesService, NO_API_KEY_MESSAGE, ViewportBounds } from './mapTilesService.js';
import { BASEMAP_IDS, BasemapId, FALLBACK_BASEMAPS } from './basemapPresets.js';
import { getGlobalState } from '../../shared/extensionContext.js';

import { codiconsCss, designTokens, leafletCss } from '../../shared/index.js';
import script from './MapPanel.svelte';

/** Global-state flag set when the user dismisses the fallback warning for good. */
const FALLBACK_NOTICE_KEY = 'earthengine.map.fallbackNoticeDismissed';

/** Summary of a map layer, as reported to callers of {@link MapPanel.listLayers}. */
export interface MapLayerInfo {
  index: number;
  name: string;
  shown: boolean;
  opacity: number;
  visParams: Record<string, unknown>;
}

/** A map viewport: center and zoom level. */
export interface MapView {
  lat: number;
  lon: number;
  zoom?: number;
}

// ==================================================================
// MAPPANEL
// ==================================================================
/** Editor panel hosting a Leaflet map that visualises Earth Engine layers. */
export class MapPanel extends EditorPanel {
  private bridgeServer: MapBridgeServer;
  private commandDisposable: vscode.Disposable | undefined;
  private messageDisposable: vscode.Disposable | undefined;
  private configDisposable: vscode.Disposable | undefined;
  private fallbackWarned = false;
  private webviewReady = false;
  /** View requested before the WebView finished loading; applied on `ready`. */
  private pendingView: MapView | undefined;
  private readonly layerManager = new MapLayerManager();
  private readonly inspector = new MapInspector();
  private readonly tiles = new MapTilesService();

  constructor() {
    super();
    this.bridgeServer = new MapBridgeServer();
  }

  /** Creates (or reveals) the map WebView and wires WebView message handling. */
  async open(): Promise<void> {
    // The bridge server is started in register(); starting again is a no-op.
    await this.bridgeServer.start();

    const alreadyOpen = this.panel !== undefined;
    const panel = this.createPanel(
      'earthengine.map',
      'Earth Engine Map',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.iconPath = new vscode.ThemeIcon('map');

    if (alreadyOpen) {
      return;
    }

    const nonce = getNonce();

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${leafletCss}</style>
    <style>${codiconsCss}</style>
    <style>${designTokens}</style>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}">${script}</script>
  </body>
</html>`;

    this.messageDisposable?.dispose();

    // WebView → extension host messages (inspector clicks, viz editor).
    this.messageDisposable = panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'ready') {
        this.webviewReady = true;
        this.layerManager.replay((m) => this.post(m));
        if (this.pendingView) {
          this.post({ type: 'setCenter', data: this.pendingView });
          this.pendingView = undefined;
        }
      } else if (msg.type === 'requestBasemap') {
        const d = msg.data as { id: BasemapId };
        await this.sendBasemapUrl(d.id);
      } else if (msg.type === 'requestAttribution') {
        const d = msg.data as { id: BasemapId; bounds: ViewportBounds; zoom: number };
        const copyright = await this.tiles.getAttribution(d.id, d.bounds, d.zoom);
        if (copyright) {
          this.post({ type: 'attribution', data: { id: d.id, copyright } });
        }
      } else if (msg.type === 'setApiKey') {
        await this.setApiKey();
      } else if (msg.type === 'clearAllLayers') {
        if (this.layerManager.layers.size === 0) {
          return;
        }
        const choice = await vscode.window.showWarningMessage(
          'Clear all layers from the map? This cannot be undone.',
          'Clear all',
        );
        if (choice === 'Clear all') {
          this.layerManager.clear();
          this.post({ type: 'clearLayers' });
        }
      } else if (msg.type === 'layerVisibility') {
        const d = msg.data as { layerIndex: number; shown: boolean };
        this.layerManager.setLayerVisibility(d.layerIndex, d.shown);
      } else if (msg.type === 'layerOpacity') {
        const d = msg.data as { layerIndex: number; opacity: number };
        this.layerManager.setLayerOpacity(d.layerIndex, d.opacity);
      } else if (msg.type === 'removeLayer') {
        const d = msg.data as { layerIndex: number };
        this.layerManager.remove(d.layerIndex);
      } else if (msg.type === 'inspect') {
        const d = msg.data as { lat: number; lng: number; zoom: number };
        await this.inspector.inspect(d.lat, d.lng, d.zoom, this.layerManager.layers, (m) =>
          this.post(m),
        );
      } else if (msg.type === 'openVizEditor') {
        const { layerIndex } = msg.data as { layerIndex: number };
        // Fetch band names and presets independently — one failure should not
        // prevent the editor from opening.
        const [bands, presets] = await Promise.all([
          this.layerManager.getBandNames(layerIndex).catch(() => [] as string[]),
          this.layerManager
            .getPresets(layerIndex)
            .catch(() => [] as Array<{ index: number; name: string; type: string }>),
        ]);
        const layer = this.layerManager.layers.get(layerIndex);
        this.post({
          type: 'vizEditorData',
          data: {
            layerIndex,
            bands,
            presets,
            currentVisParams: layer?.visParams ?? {},
            opacity: layer?.opacity ?? 1,
          },
        });
      } else if (msg.type === 'computeStretch') {
        const d = msg.data as {
          layerIndex: number;
          bands: string[];
          mode: string;
          bounds: [number, number, number, number];
          scale: number;
        };
        try {
          const ranges = await this.layerManager.computeStretch(
            d.layerIndex,
            d.bands,
            d.mode,
            d.bounds,
            d.scale,
          );
          this.post({
            type: 'vizStretch',
            data: { layerIndex: d.layerIndex, mode: d.mode, ranges },
          });
        } catch (err) {
          this.post({
            type: 'vizStretch',
            data: {
              layerIndex: d.layerIndex,
              mode: d.mode,
              ranges: null,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      } else if (msg.type === 'computeClasses') {
        const d = msg.data as {
          layerIndex: number;
          band: string;
          bounds: [number, number, number, number];
          scale: number;
        };
        try {
          const { values, truncated } = await this.layerManager.computeClasses(
            d.layerIndex,
            d.band,
            d.bounds,
            d.scale,
          );
          this.post({
            type: 'vizClasses',
            data: { layerIndex: d.layerIndex, values, truncated },
          });
        } catch (err) {
          this.post({
            type: 'vizClasses',
            data: {
              layerIndex: d.layerIndex,
              values: null,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      } else if (msg.type === 'updateViz') {
        const d = msg.data as Record<string, unknown>;
        const layerIndex = d.layerIndex as number;
        if (typeof d.opacity === 'number') {
          this.layerManager.setLayerOpacity(layerIndex, d.opacity);
        }
        try {
          await this.layerManager.updateLayer(layerIndex, d, (m) => this.post(m));
        } catch (err) {
          vscode.window.showErrorMessage(
            `[Map] Viz update failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });
  }

  // ── Private helpers ─────────────────────────────────────────────

  /** Forwards a message to the WebView if the panel is open. */
  private post(msg: unknown): void {
    this.panel?.webview.postMessage(msg);
  }

  // ==================================================================
  // BASEMAPS
  // ==================================================================

  /**
   * Resolves a basemap tile URL and pushes it to the WebView. Without a usable
   * Google session the panel falls back to a keyless source; a rejected key is
   * additionally surfaced as a banner, a missing one is not.
   */
  private async sendBasemapUrl(id: BasemapId): Promise<void> {
    try {
      const url = await this.tiles.getTileUrlTemplate(id);
      this.post({ type: 'basemapUrl', data: { id, url, maxNativeZoom: 22 } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: 'basemapUrl', data: { id, ...FALLBACK_BASEMAPS[id], fallback: true } });
      if (message === NO_API_KEY_MESSAGE) {
        await this.warnFallback();
      } else {
        this.post({ type: 'basemapError', data: { id, message } });
      }
    }
  }

  /**
   * Tells the user the map is running on free tiles. Fires at most once per
   * session, and never again once dismissed for good.
   */
  private async warnFallback(): Promise<void> {
    if (this.fallbackWarned || getGlobalState().get<boolean>(FALLBACK_NOTICE_KEY)) {
      return;
    }
    this.fallbackWarned = true;
    const setKey = 'Set API key';
    const never = "Don't show again";
    const choice = await vscode.window.showWarningMessage(
      '[Map] No Google Maps API key set \u2014 falling back to OpenStreetMap and Esri basemaps.',
      setKey,
      never,
    );
    if (choice === setKey) {
      await this.setApiKey();
    } else if (choice === never) {
      await getGlobalState().update(FALLBACK_NOTICE_KEY, true);
    }
  }

  /** Prompts for a Google Maps API key, then reloads the basemaps. */
  private async setApiKey(): Promise<void> {
    if (await this.tiles.promptForApiKey()) {
      this.post({ type: 'basemapReset' });
    }
  }

  /** Forgets the stored Google Maps API key. */
  private async clearApiKey(): Promise<void> {
    await this.tiles.clearApiKey();
    this.post({ type: 'basemapReset' });
    vscode.window.showInformationMessage('[Map] Google Maps API key removed.');
  }

  /** Runs `fn`, shows a success/error notification, and re-throws on failure. */
  private async step<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    try {
      const result = await fn();
      vscode.window.showInformationMessage(`[Map test] \u2713 ${label}`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`[Map test] \u2717 ${label}: ${msg}`);
      throw err;
    }
  }

  /**
   * Hardcoded test layer — SEPAL visualization example asset.
   * Tests the SEPAL viz preset resolution: adds the same asset four times,
   * each with a different `default` selector to exercise every preset type
   * (rgb, hsv, continuous, categorical) stored on the asset.
   *
   *   Asset: users/wiell/forum/visualization_example
   *   Reference: https://pysepal.readthedocs.io/en/latest/tutorials/create_asset.html
   */
  private async testSepalViz(): Promise<void> {
    await this.step('open()', () => this.open());

    const eeAny = (await this.step('ensureEe()', () => ensureEe())) as any;

    const assetId = 'users/wiell/forum/visualization_example';

    const serialized = (await this.step('Serializer.toJSON()', () =>
      eeAny.Serializer.toJSON(eeAny.Image(assetId)),
    )) as string;

    const presets: Array<{ selector: string | number; name: string }> = [
      { selector: 'RGB', name: 'SEPAL \u2013 RGB' },
      { selector: 'NDWI harmonics', name: 'SEPAL \u2013 NDWI harmonics (HSV)' },
      { selector: 'NDWI', name: 'SEPAL \u2013 NDWI (continuous)' },
      { selector: 'Classification', name: 'SEPAL \u2013 Classification (categorical)' },
    ];

    for (const { selector, name } of presets) {
      await this.step(`addLayer(default: '${selector}')`, () =>
        this.layerManager.add(
          { serialized, visParams: { default: selector }, name, shown: true, opacity: 1.0 },
          (m) => this.post(m),
        ),
      );
    }
  }

  // ==================================================================
  // PROGRAMMATIC API
  // ==================================================================

  /**
   * Adds an Earth Engine asset to the map, opening the panel if needed.
   * Image collections are mosaicked; tables are rendered with `style()`,
   * which receives `visParams` (color, width, fillColor, pointSize...).
   * A layer with the same name is replaced.
   *
   * @returns The added layer and the detected asset type.
   */
  async addAssetLayer(
    assetId: string,
    visParams: Record<string, unknown>,
    name: string,
    opacity = 1,
    shown = true,
  ): Promise<{ layer: MapLayerInfo; assetType: string }> {
    await this.open();
    const eeAny = (await ensureEe()) as any;
    const { token } = await getEeContext();
    const assetName = assetId.startsWith('projects/')
      ? assetId
      : `projects/earthengine-legacy/assets/${assetId}`;
    const { type } = await getAsset(assetName, token);

    let eeObject: unknown;
    let layerVisParams = visParams;
    if (type === 'IMAGE') {
      eeObject = eeAny.Image(assetId);
    } else if (type === 'IMAGE_COLLECTION') {
      eeObject = eeAny.ImageCollection(assetId).mosaic();
    } else if (type === 'TABLE') {
      eeObject = eeAny.FeatureCollection(assetId).style(visParams);
      layerVisParams = {};
    } else {
      throw new Error(`Asset '${assetId}' has type ${type}, which cannot be displayed on the map.`);
    }

    await this.layerManager.add(
      {
        serialized: eeAny.Serializer.toJSON(eeObject) as string,
        visParams: layerVisParams,
        name,
        shown,
        opacity,
      },
      (m) => this.post(m),
    );
    const layer = this.listLayers().find((l) => l.name === name);
    if (!layer) {
      throw new Error(`Layer '${name}' was not registered.`);
    }
    return { layer, assetType: type };
  }

  /** Centers the map on `lat`/`lon` at `zoom`, opening the panel if needed. */
  async setView(view: MapView): Promise<void> {
    await this.open();
    if (this.webviewReady) {
      this.post({ type: 'setCenter', data: view });
    } else {
      this.pendingView = view;
    }
  }

  /** Returns the layers currently registered on the map. */
  listLayers(): MapLayerInfo[] {
    return [...this.layerManager.layers.values()].map((l) => ({
      index: l.index,
      name: l.name,
      shown: l.shown,
      opacity: l.opacity,
      visParams: l.visParams,
    }));
  }

  /** Removes the layer at `layerIndex`; returns false when no such layer exists. */
  removeLayer(layerIndex: number): boolean {
    if (!this.layerManager.layers.has(layerIndex)) {
      return false;
    }
    this.layerManager.remove(layerIndex);
    this.post({ type: 'removeTileLayer', data: { layerIndex } });
    return true;
  }

  protected override onDidDispose(): void {
    this.webviewReady = false;
    this.messageDisposable?.dispose();
    this.messageDisposable = undefined;
    // Keep layerManager state so a subsequent open() can replay the layers.
  }

  override dispose(): void {
    this.commandDisposable?.dispose();
    this.commandDisposable = undefined;
    this.configDisposable?.dispose();
    this.configDisposable = undefined;
    this.bridgeServer.stop();
    super.dispose();
  }

  /** Registers map commands. */
  register(context: vscode.ExtensionContext): void {
    // Start the bridge server on activation so Python scripts can connect
    // before the user has manually opened the map panel.
    void this.bridgeServer.start().catch((err) => {
      console.error('[Map] Bridge server failed to start:', err);
    });

    // Subscribe once to bridge commands; the panel opens on demand.
    this.commandDisposable = this.bridgeServer.onCommand((cmd) => {
      void this.handleBridgeCommand(cmd);
    });

    // A basemap override changes the createSession body, so the cached session
    // token no longer matches and the open panel must reload its tiles.
    this.configDisposable = vscode.workspace.onDidChangeConfiguration(async (event) => {
      const changed = BASEMAP_IDS.filter((id) =>
        event.affectsConfiguration(`earthengine.map.basemap.${id}`),
      );
      if (changed.length === 0) {
        return;
      }
      await Promise.all(changed.map((id) => this.tiles.invalidate(id)));
      this.post({ type: 'basemapReset' });
    });

    context.subscriptions.push(
      vscode.commands.registerCommand('earthengine.openMap', () => this.open()),
      vscode.commands.registerCommand('earthengine.map.setGoogleMapsApiKey', () =>
        this.setApiKey(),
      ),
      vscode.commands.registerCommand('earthengine.map.clearGoogleMapsApiKey', () =>
        this.clearApiKey(),
      ),
      vscode.commands.registerCommand('earthengine.map.testSepalViz', () => this.testSepalViz()),
      this,
    );
  }

  // ==================================================================
  // BRIDGE COMMANDS
  // ==================================================================

  /** Dispatches a command received on the HTTP bridge from a Python script. */
  private async handleBridgeCommand(cmd: MapCommand): Promise<void> {
    // Any incoming command reveals or opens the panel first, so the user
    // never has to open the map manually before running a Python script.
    await this.open();
    if (!this.panel) {
      return;
    }

    if (cmd.type === 'addLayer') {
      const d = cmd.data as {
        serialized: string;
        visParams: Record<string, unknown>;
        name: string;
        shown: boolean;
        opacity: number;
      };
      try {
        await this.layerManager.add(d, (m) => this.post(m));
      } catch (err) {
        vscode.window.showErrorMessage(
          `[Map] Layer error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }

    if (cmd.type === 'clear') {
      this.layerManager.clear();
      this.post({ type: 'clearLayers' });
      return;
    }

    this.panel.webview.postMessage(cmd);
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
