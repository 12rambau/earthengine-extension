/**
 * @module listMapLayersTool
 * Language Model Tool that lists the layers on the map panel.
 */

import * as vscode from 'vscode';
import type { MapPanel } from '../editor/map/mapPanel.js';

/** Reports every layer on the map with its index, name and display state. */
export class ListMapLayersTool implements vscode.LanguageModelTool<Record<string, never>> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_listMapLayers';

  constructor(private readonly mapPanel: MapPanel) {}

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    const layers = this.mapPanel.listLayers();
    const text = layers.length === 0 ? 'The map has no layers.' : JSON.stringify(layers, null, 2);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(ListMapLayersTool.id, this));
  }
}
