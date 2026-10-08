/**
 * @module listTasksTool
 * Language Model Tool that lists Earth Engine export/import tasks with runtime and cost.
 */

import * as vscode from 'vscode';
import type { AuthService } from '../auth/index.js';
import {
  getElapsedTime,
  getOperation,
  getTaskKind,
  getTaskState,
  isExportTask,
  isImportTask,
  listOperationsPage,
  type Operation,
} from '../sidebar/tasks/tasksApiClient.js';

/** Input accepted by the tool. */
export interface ListTasksInput {
  name?: string;
  type?: 'export' | 'import' | 'all';
  states?: string[];
  limit?: number;
}

/** Seconds between `from` and `to` (or now), or undefined when `from` is unset or the epoch sentinel. */
function secondsBetween(from?: string, to?: string): number | undefined {
  if (!from || from === '1970-01-01T00:00:00.000Z') {
    return undefined;
  }
  const end = to ? Date.parse(to) : Date.now();
  return Math.max(0, Math.round((end - Date.parse(from)) / 1000));
}

/** Formats one operation as a compact JSON-friendly record. */
function summarize(op: Operation): Record<string, unknown> {
  const m = op.metadata ?? {};
  const state = getTaskState(op);
  return {
    name: op.name,
    description: m.description,
    kind: getTaskKind(op),
    state,
    progress: m.progress !== undefined ? `${Math.round(m.progress * 100)}%` : undefined,
    createTime: m.createTime,
    startTime: m.startTime,
    endTime: m.endTime,
    elapsed: getElapsedTime(op) || undefined,
    runSeconds: state === 'PENDING' ? undefined : secondsBetween(m.startTime, m.endTime),
    queuedSeconds: secondsBetween(m.createTime, state === 'PENDING' ? undefined : m.startTime),
    eecuSeconds: m.batchEecuUsageSeconds,
    eecuHours:
      m.batchEecuUsageSeconds !== undefined
        ? Number((m.batchEecuUsageSeconds / 3600).toFixed(4))
        : undefined,
    priority: m.priority,
    attempt: m.attempt,
    destinationUris: m.destinationUris,
    error: op.error?.message,
  };
}

/** Lists tasks (or details one) so the assistant can report status, runtime and EECU usage. */
export class ListTasksTool implements vscode.LanguageModelTool<ListTasksInput> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_listTasks';

  constructor(private readonly authService: AuthService) {}

  prepareInvocation(): vscode.PreparedToolInvocation {
    return { invocationMessage: 'Fetching Earth Engine tasks' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListTasksInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { name, type = 'all', states, limit = 20 } = options.input;
    const token = await this.authService.getToken();
    const profile = this.authService.currentProfile;
    if (!token || !profile) {
      throw new Error('Not authenticated: sign in to Earth Engine first.');
    }

    let ops: Operation[];
    if (name) {
      ops = [await getOperation(name, token)];
    } else {
      const wanted = states?.map((s) => s.toUpperCase());
      const page = await listOperationsPage(profile.project, token, 100);
      ops = page.operations
        .filter((op) => type === 'all' || (type === 'export' ? isExportTask(op) : isImportTask(op)))
        .filter((op) => !wanted?.length || wanted.includes(getTaskState(op)))
        .slice(0, Math.max(1, limit));
    }

    const text = ops.length
      ? JSON.stringify(ops.map(summarize), null, 2)
      : 'No matching tasks in the most recent 100 operations.';
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(ListTasksTool.id, this));
  }
}
