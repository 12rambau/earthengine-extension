/**
 * @module addMapLayerTool
 * Language Model Tool that adds any Earth Engine asset to the map panel.
 */

import * as vscode from 'vscode';
import type { MapPanel } from '../editor/map/mapPanel.js';

/** Input accepted by the tool. */
export interface AddMapLayerInput {
  assetId: string;
  visParams?: Record<string, unknown>;
  name?: string;
  opacity?: number;
  shown?: boolean;
}

/** Adds an asset (image, image collection or table) as a map layer. */
export class AddMapLayerTool implements vscode.LanguageModelTool<AddMapLayerInput> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_addMapLayer';

  constructor(private readonly mapPanel: MapPanel) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AddMapLayerInput>,
  ): vscode.PreparedToolInvocation {
    return { invocationMessage: `Adding ${options.input.assetId} to the map` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AddMapLayerInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { assetId, visParams = {}, name, opacity = 1, shown = true } = options.input;
    const { layer, assetType } = await this.mapPanel.addAssetLayer(
      assetId,
      visParams,
      name || assetId,
      opacity,
      shown,
    );
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `Added ${assetType} '${assetId}' as layer ${JSON.stringify(layer)}.`,
      ),
    ]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(AddMapLayerTool.id, this));
  }
}
