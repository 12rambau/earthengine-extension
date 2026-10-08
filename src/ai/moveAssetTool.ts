/**
 * @module moveAssetTool
 * Language Model Tool that moves (renames) an Earth Engine asset.
 */

import * as vscode from 'vscode';
import type { AssetsSection } from '../sidebar/assets/assetsSection.js';

/** Input accepted by the move and copy tools. */
export interface AssetTransferInput {
  sourcePath: string;
  destinationPath: string;
}

/** Moves an asset (folders and collections recursively) after user confirmation. */
export class MoveAssetTool implements vscode.LanguageModelTool<AssetTransferInput> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_moveAsset';

  constructor(private readonly assets: AssetsSection) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AssetTransferInput>,
  ): vscode.PreparedToolInvocation {
    const { sourcePath, destinationPath } = options.input;
    return {
      invocationMessage: `Moving ${sourcePath} to ${destinationPath}`,
      confirmationMessages: {
        title: 'Move Earth Engine asset',
        message: new vscode.MarkdownString(`Move \`${sourcePath}\` to \`${destinationPath}\`?`),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AssetTransferInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { sourcePath, destinationPath } = options.input;
    const { source, destination } = await this.assets.moveAssetTo(sourcePath, destinationPath);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Moved ${source} to ${destination}.`),
    ]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(MoveAssetTool.id, this));
  }
}
