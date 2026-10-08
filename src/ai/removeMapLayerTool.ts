/**
 * @module removeMapLayerTool
 * Language Model Tool that removes a layer from the map panel.
 */

import * as vscode from 'vscode';
import type { MapPanel } from '../editor/map/mapPanel.js';

/** Input accepted by the tool: the layer index or its exact name. */
export interface RemoveMapLayerInput {
  index?: number;
  name?: string;
}

/** Removes one map layer, identified by index or name. */
export class RemoveMapLayerTool implements vscode.LanguageModelTool<RemoveMapLayerInput> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_removeMapLayer';

  constructor(private readonly mapPanel: MapPanel) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RemoveMapLayerInput>,
  ): vscode.PreparedToolInvocation {
    const target = options.input.name ?? `#${options.input.index}`;
    return {
      invocationMessage: `Removing map layer ${target}`,
      confirmationMessages: {
        title: 'Remove map layer',
        message: `Remove layer ${target} from the Earth Engine map?`,
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RemoveMapLayerInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { index, name } = options.input;
    const layers = this.mapPanel.listLayers();
    const layer =
      index !== undefined
        ? layers.find((l) => l.index === index)
        : layers.find((l) => l.name === name);
    if (!layer || !this.mapPanel.removeLayer(layer.index)) {
      throw new Error(
        `No layer matches ${name !== undefined ? `name '${name}'` : `index ${index}`}. ` +
          `Current layers: ${JSON.stringify(layers.map((l) => ({ index: l.index, name: l.name })))}`,
      );
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Removed layer #${layer.index} '${layer.name}'.`),
    ]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(RemoveMapLayerTool.id, this));
  }
}
