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
import { renderTemplate } from '../shared/index.js';
import template from './mapPanel.hbs';
import style from './mapPanel.css';
import script from './mapPanel.webview.js';

// ── MapPanel ────────────────────────────────────────────────────────

/** Editor panel hosting a Leaflet map that visualises Earth Engine layers. */
export class MapPanel extends EditorPanel {
  private bridgeServer: MapBridgeServer;
  private commandDisposable: vscode.Disposable | undefined;

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

    panel.webview.html = renderTemplate(template, { style, script });

    this.commandDisposable = this.bridgeServer.onCommand((cmd: MapCommand) => {
      if (this.panel) {
        this.panel.webview.postMessage(cmd);
      }
    });
  }

  protected override onDidDispose(): void {
    this.commandDisposable?.dispose();
    this.commandDisposable = undefined;
  }

  override dispose(): void {
    this.bridgeServer.stop();
    super.dispose();
  }

  /** Registers the `earthengine.openMap` command. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('earthengine.openMap', () => this.open()),
      this,
    );
  }
}
