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
import { renderTemplate } from '../shared/index.js';
import template from './mapPanel.hbs';
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
    panel.webview.html = renderTemplate(template, {
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

    // WebView → extension host messages (inspector clicks).
    this.messageDisposable = panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'inspect') {
        const d = msg.data as { lat: number; lng: number; zoom: number };
        await this.inspector.inspect(d.lat, d.lng, d.zoom, this.layerManager.layers, (m) =>
          this.post(m),
        );
      }
    });
  }

  // ── Private helpers ─────────────────────────────────────────────

  /** Forwards a message to the WebView if the panel is open. */
  private post(msg: unknown): void {
    this.panel?.webview.postMessage(msg);
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
    const step = async (label: string, fn: () => Promise<unknown> | unknown) => {
      try {
        const result = await fn();
        vscode.window.showInformationMessage(`[Map test] ✓ ${label}`);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`[Map test] ✗ ${label}: ${msg}`);
        throw err;
      }
    };

    await step('open()', () => this.open());

    const eeAny = (await step('ensureEe()', () => ensureEe())) as any;

    const image = await step('build expression', () => {
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

    const serialized = (await step('Serializer.toJSON()', () =>
      eeAny.Serializer.toJSON(image),
    )) as string;

    await step('handleAddLayer()', () =>
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
      this,
    );
  }
}
