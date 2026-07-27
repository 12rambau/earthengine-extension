/**
 * @module mapPanel
 * Leaflet-based map WebView panel for the Earth Engine extension.
 *
 * Renders a full-screen Leaflet map with dark/light/satellite base
 * layers, a layer control panel, and a status bar. Receives tile layer,
 * GeoJSON, and viewport commands from Python scripts via the bridge server.
 */

import * as vscode from 'vscode';
import { EditorPanel } from '../shared/baseComponents.js';
import { MapBridgeServer, MapCommand } from './mapBridgeServer.js';
import { ensureEe } from '../shared/eeSession.js';
import { MapLayerManager } from './mapLayerManager.js';
import { MapInspector } from './mapInspector.js';
import Handlebars from 'handlebars';
import template from './mapPanel.hbs';

const render = Handlebars.compile(template);
import style from './mapPanel.css';
import script from './mapPanel.webview.js';

// ==================================================================
// MAPPANEL
// ==================================================================
/** Editor panel hosting a Leaflet map that visualises Earth Engine layers. */
export class MapPanel extends EditorPanel {
  private bridgeServer: MapBridgeServer;
  private commandDisposable: vscode.Disposable | undefined;
  private messageDisposable: vscode.Disposable | undefined;
  private readonly layerManager = new MapLayerManager();
  private readonly inspector = new MapInspector();

  constructor() {
    super();
    this.bridgeServer = new MapBridgeServer();
  }

  /** Starts the bridge server, creates the WebView, and wires up commands. */
  async open(): Promise<void> {
    await this.bridgeServer.start();

    const panel = this.createPanel(
      'earthengine.map',
      'Earth Engine Map',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    if (this.commandDisposable) {
      return;
    } // Already wired

    const cfg = vscode.workspace.getConfiguration('earthengine.map');
    panel.webview.html = render({
      style,
      script,
      initJson: JSON.stringify({
        darkBasemap: cfg.get<string>('darkBasemap', 'CartoDB.DarkMatter'),
        lightBasemap: cfg.get<string>('lightBasemap', 'CartoDB.Positron'),
        satelliteBasemap: cfg.get<string>('satelliteBasemap', 'Esri.WorldImagery'),
        planBasemap: cfg.get<string>('planBasemap', 'CartoDB.Voyager'),
      }),
    });

    this.commandDisposable = this.bridgeServer.onCommand(async (cmd: MapCommand) => {
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

      this.panel.webview.postMessage(cmd);
    });

    // WebView → extension host messages (inspector clicks, viz editor).
    this.messageDisposable = panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'inspect') {
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
          },
        });
      } else if (msg.type === 'computeMinMax') {
        const { layerIndex } = msg.data as { layerIndex: number };
        try {
          const minMax = await this.layerManager.computeMinMax(layerIndex);
          this.post({ type: 'vizMinMax', data: { layerIndex, minMax } });
        } catch {
          this.post({ type: 'vizMinMax', data: { layerIndex, minMax: null } });
        }
      } else if (msg.type === 'updateViz') {
        const d = msg.data as Record<string, unknown>;
        const layerIndex = d.layerIndex as number;
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
   * Hardcoded test layer — NOAA DMSP-OLS nighttime lights linear fit.
   * Classic front-page Earth Engine example (stable since ~2010).
   *
   *   Collection: NOAA/DMSP-OLS/NIGHTTIME_LIGHTS → stable_lights band
   *   Transform:  prepend a year-since-1991 band, reduce with linearFit
   *   Viz:        scale→red/blue  offset→green
   */
  private async testNighttimeLights(): Promise<void> {
    await this.step('open()', () => this.open());

    const eeAny = (await this.step('ensureEe()', () => ensureEe())) as any;

    const image = await this.step('build expression', () => {
      const createTimeBand = (img: any) => {
        const year = eeAny.Date(img.get('system:time_start')).get('year').subtract(1991);
        return eeAny.Image(year).byte().addBands(img);
      };
      const france = eeAny
        .FeatureCollection('FAO/GAUL/2015/level0')
        .filter(eeAny.Filter.eq('ADM0_NAME', 'France'));
      return eeAny
        .ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS')
        .select('stable_lights')
        .map(createTimeBand)
        .reduce(eeAny.Reducer.linearFit())
        .clip(france);
    });

    const serialized = (await this.step('Serializer.toJSON()', () =>
      eeAny.Serializer.toJSON(image),
    )) as string;

    await this.step('handleAddLayer()', () =>
      this.layerManager.add(
        {
          serialized,
          visParams: { min: 0, max: [0.18, 20, -0.18], bands: ['scale', 'offset', 'scale'] },
          name: 'stable lights trend',
          shown: true,
          opacity: 1.0,
        },
        (m) => this.post(m),
      ),
    );

    // Fly to France
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'setCenter',
        data: { lat: 46.5, lon: 2.5, zoom: 5 },
      });
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

  protected override onDidDispose(): void {
    this.commandDisposable?.dispose();
    this.commandDisposable = undefined;
    this.messageDisposable?.dispose();
    this.messageDisposable = undefined;
    this.layerManager.clear();
  }

  override dispose(): void {
    this.bridgeServer.stop();
    super.dispose();
  }

  /** Registers map commands. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('earthengine.openMap', () => this.open()),
      vscode.commands.registerCommand('earthengine.map.testNighttimeLights', () =>
        this.testNighttimeLights(),
      ),
      vscode.commands.registerCommand('earthengine.map.testSepalViz', () => this.testSepalViz()),
      this,
    );
  }
}
