/**
 * @module setMapViewTool
 * Language Model Tool that centers the map panel on a location.
 */

import * as vscode from 'vscode';
import type { MapPanel, MapView } from '../editor/map/mapPanel.js';

/** Centers the map on a latitude/longitude at a zoom level. */
export class SetMapViewTool implements vscode.LanguageModelTool<MapView> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_setMapView';

  constructor(private readonly mapPanel: MapPanel) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<MapView>,
  ): vscode.PreparedToolInvocation {
    const { lat, lon, zoom } = options.input;
    return {
      invocationMessage: `Centering the map on ${lat}, ${lon}${zoom ? ` (zoom ${zoom})` : ''}`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<MapView>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { lat, lon, zoom } = options.input;
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon)) {
      throw new Error(`Invalid coordinates: lat=${lat}, lon=${lon}.`);
    }
    await this.mapPanel.setView({ lat, lon, zoom });
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Map centered on ${lat}, ${lon}.`),
    ]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(SetMapViewTool.id, this));
  }
}
