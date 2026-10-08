/**
 * @module deleteAssetTool
 * Language Model Tool that deletes an Earth Engine asset.
 */

import * as vscode from 'vscode';
import type { AssetsSection } from '../sidebar/assets/assetsSection.js';

/** Input accepted by the tool. */
export interface DeleteAssetInput {
  assetPath: string;
}

/** Deletes an asset (folders and collections recursively) after user confirmation. */
export class DeleteAssetTool implements vscode.LanguageModelTool<DeleteAssetInput> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_deleteAsset';

  constructor(private readonly assets: AssetsSection) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<DeleteAssetInput>,
  ): vscode.PreparedToolInvocation {
    const { assetPath } = options.input;
    return {
      invocationMessage: `Deleting ${assetPath}`,
      confirmationMessages: {
        title: 'Delete Earth Engine asset',
        message: new vscode.MarkdownString(
          `Delete \`${assetPath}\`? Folders and image collections are deleted with all their content. This cannot be undone.`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DeleteAssetInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const name = await this.assets.deleteAssetAt(options.input.assetPath);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Deleted ${name}.`),
    ]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(DeleteAssetTool.id, this));
  }
}
