/**
 * @module copyAssetTool
 * Language Model Tool that copies an Earth Engine asset.
 */

import * as vscode from 'vscode';
import type { AssetsSection } from '../sidebar/assets/assetsSection.js';
import type { AssetTransferInput } from './moveAssetTool.js';

/** Copies an asset (folders and collections recursively). */
export class CopyAssetTool implements vscode.LanguageModelTool<AssetTransferInput> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_copyAsset';

  constructor(private readonly assets: AssetsSection) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AssetTransferInput>,
  ): vscode.PreparedToolInvocation {
    const { sourcePath, destinationPath } = options.input;
    return {
      invocationMessage: `Copying ${sourcePath} to ${destinationPath}`,
      confirmationMessages: {
        title: 'Copy Earth Engine asset',
        message: new vscode.MarkdownString(`Copy \`${sourcePath}\` to \`${destinationPath}\`?`),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AssetTransferInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { sourcePath, destinationPath } = options.input;
    const { source, destination } = await this.assets.copyAssetTo(sourcePath, destinationPath);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Copied ${source} to ${destination}.`),
    ]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(CopyAssetTool.id, this));
  }
}
