/**
 * @module earthEngineCommandTool
 * Language Model Tool that lets AI assistants (Copilot agent mode, etc.) run
 * a curated set of argument-free Earth Engine commands.
 */

import * as vscode from 'vscode';

/** Commands exposed to assistants, with the description the model sees. */
export const AI_COMMANDS: Readonly<Record<string, string>> = {
  'earthengine.openMap': 'Open (or reveal) the interactive Earth Engine map panel.',
  'earthengine.map.demo':
    'Open the map and add one layer for each visualization preset on projects/earthengine-extension/assets/demo-image.',
  'earthengine.openAssetsPanel': 'Open the asset manager panel.',
  'earthengine.openExportTasksPanel': 'Open the export tasks table.',
  'earthengine.openImportTasksPanel': 'Open the import tasks table.',
  'earthengine.refreshAssets': 'Refresh the assets tree.',
  'earthengine.refreshTasks': 'Refresh the tasks trees.',
  'earthengine.refreshDatasets': 'Refresh the dataset catalog tree.',
  'earthengine.refreshDocs': 'Refresh the API docs tree.',
  'earthengine.showAuthStatus': 'Show the current Earth Engine authentication status.',
};

/** Input accepted by the tool. */
export interface EarthEngineCommandInput {
  command: string;
}

/** Runs one of the {@link AI_COMMANDS} through the VS Code command registry. */
export class EarthEngineCommandTool implements vscode.LanguageModelTool<EarthEngineCommandInput> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_runCommand';

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<EarthEngineCommandInput>,
  ): vscode.PreparedToolInvocation {
    return { invocationMessage: `Running ${options.input.command}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<EarthEngineCommandInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { command } = options.input;
    if (!(command in AI_COMMANDS)) {
      throw new Error(
        `Unknown command '${command}'. Available: ${Object.keys(AI_COMMANDS).join(', ')}`,
      );
    }
    await vscode.commands.executeCommand(command);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Command ${command} completed.`),
    ]);
  }

  /** Registers the tool and returns its disposable. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(EarthEngineCommandTool.id, this));
  }
}
