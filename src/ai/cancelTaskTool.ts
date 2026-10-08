/**
 * @module cancelTaskTool
 * Language Model Tool that cancels a pending or running Earth Engine task.
 */

import * as vscode from 'vscode';
import type { AuthService } from '../auth/index.js';
import { cancelOperation, getOperation, getTaskState } from '../sidebar/tasks/tasksApiClient.js';

/** Input accepted by the tool. */
export interface CancelTaskInput {
  name: string;
}

/** Cancels an export or import task after user confirmation. */
export class CancelTaskTool implements vscode.LanguageModelTool<CancelTaskInput> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_cancelTask';

  constructor(private readonly authService: AuthService) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CancelTaskInput>,
  ): vscode.PreparedToolInvocation {
    const { name } = options.input;
    return {
      invocationMessage: `Cancelling ${name}`,
      confirmationMessages: {
        title: 'Cancel Earth Engine task',
        message: new vscode.MarkdownString(`Cancel task \`${name}\`?`),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CancelTaskInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { name } = options.input;
    const token = await this.authService.getToken();
    if (!token) {
      throw new Error('Not authenticated: sign in to Earth Engine first.');
    }

    const state = getTaskState(await getOperation(name, token));
    if (state !== 'PENDING' && state !== 'RUNNING') {
      throw new Error(`Task ${name} is ${state} and cannot be cancelled.`);
    }

    await cancelOperation(name, token);
    await vscode.commands.executeCommand('earthengine.refreshTasks');
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Cancellation requested for ${name}.`),
    ]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(CancelTaskTool.id, this));
  }
}
