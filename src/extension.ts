/**
 * Earth Engine VS Code Extension
 *
 * Main entry point. This file acts as the orchestrator that wires together
 * all sidebar sections, editor panels, and the interactive map.
 *
 * Architecture overview:
 * - auth/          → OAuth2 authentication and profile management
 * - sidebar/       → Tree views in the primary sidebar (profiles, assets, tasks, dataset, docs)
 * - editor/        → WebView panels opened in the editor area (asset manager, task table, dataset detail)
 * - map/           → Interactive Leaflet map with Python bridge
 * - shared/        → Reusable HTTP client and WebView utilities
 */

import * as vscode from 'vscode';
import { AuthService, TokenStorage } from './auth/index.js';
import { ProfilesSection } from './sidebar/profiles/index.js';
import { AssetsSection } from './sidebar/assets/index.js';
import { TasksSection } from './sidebar/tasks/index.js';
import { DatasetSection } from './sidebar/dataset/index.js';
import { DocsSection } from './sidebar/docs/index.js';
import { MapPanel } from './map/index.js';

/** All registered sections — disposed on deactivation. */
const sections: vscode.Disposable[] = [];

/**
 * Called by VS Code when the extension is activated.
 * Sets up the auth service, registers all sidebar sections and the map panel.
 */
export function activate(context: vscode.ExtensionContext) {
  // ==================================================================
  // CORE SERVICES
  // ==================================================================
  const tokenStorage = new TokenStorage(context.globalState);
  const authService = new AuthService(tokenStorage);

  // ==================================================================
  // SIDEBAR SECTIONS
  // ==================================================================
  // Each section is self-contained: it owns its tree view, commands, and cleanup.
  const profiles = new ProfilesSection(authService);
  const assets = new AssetsSection(authService);
  const tasks = new TasksSection(authService);
  const dataset = new DatasetSection();
  const docs = new DocsSection();

  profiles.register(context);
  assets.register(context);
  tasks.register(context);
  dataset.register(context);
  docs.register(context);

  sections.push(profiles, assets, tasks, dataset, docs);

  // ==================================================================
  // MAP PANEL
  // ==================================================================
  // Leaflet-based interactive map that receives layers from Python scripts
  // through a local HTTP bridge server.
  const mapPanel = new MapPanel();
  mapPanel.register(context);
  sections.push(mapPanel);
}

/**
 * Called by VS Code when the extension is deactivated.
 * Disposes all sections and stops background services.
 */
export function deactivate() {
  sections.forEach((s) => s.dispose());
  sections.length = 0;
}
