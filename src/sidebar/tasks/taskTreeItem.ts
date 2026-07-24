/**
 * @module taskTreeItem
 * Tree item for the Tasks sidebar trees: a single Earth Engine operation
 * with a type-shaped, state-coloured icon and a rich Markdown tooltip.
 */

import * as vscode from 'vscode';
import {
  Operation,
  getTaskState,
  getElapsedTime,
  getPhaseLabel,
  formatRuntimeLine,
  isExportTask,
  isImportTask,
} from './tasksApiClient.js';

// ==================================================================
// CONSTANTS
// ==================================================================
const STATE_COLORS: Partial<Record<string, vscode.ThemeColor>> = {
  PENDING: new vscode.ThemeColor('testing.iconQueued'),
  RUNNING: new vscode.ThemeColor('progressBar.background'),
  CANCELLING: new vscode.ThemeColor('disabledForeground'),
  SUCCEEDED: new vscode.ThemeColor('testing.iconPassed'),
  FAILED: new vscode.ThemeColor('errorForeground'),
  CANCELLED: new vscode.ThemeColor('disabledForeground'),
};

function getTypeIconId(op: Operation): string {
  const type = (op.metadata?.type || '').toUpperCase();
  if (type.startsWith('INGEST') || type.startsWith('IMPORT')) {
    return 'cloud-upload';
  }
  if (type === 'EXPORT_IMAGE' || type === 'EXPORT_VIDEO') {
    return 'file-media';
  }
  if (type === 'EXPORT_TABLE' || type === 'EXPORT_FEATURES') {
    return 'table';
  }
  if (type.startsWith('EXPORT')) {
    return 'cloud-download';
  }
  return 'symbol-misc';
}

// ==================================================================
// TASKTREEITEM
// ==================================================================
/** Tree item representing a single Earth Engine operation/task. */
export class TaskTreeItem extends vscode.TreeItem {
  constructor(public readonly operation: Operation) {
    const desc = operation.metadata?.description || operation.name.split('/').pop() || 'Unknown';
    const label = desc.length > 70 ? `${desc.slice(0, 70)}…` : desc;
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = operation.name;

    const state = getTaskState(operation);
    const elapsed = getElapsedTime(operation);

    // Icon: shape from task type, color from state; spinner for active tasks
    const color = STATE_COLORS[state];
    if (state === 'RUNNING' || state === 'CANCELLING') {
      this.iconPath = color
        ? new vscode.ThemeIcon('loading~spin', color)
        : new vscode.ThemeIcon('loading~spin');
    } else {
      const iconId = getTypeIconId(operation);
      this.iconPath = color ? new vscode.ThemeIcon(iconId, color) : new vscode.ThemeIcon(iconId);
    }

    this.description = elapsed;

    // ==================================================================
    // TOOLTIP
    // ==================================================================
    const meta = operation.metadata;
    const operationId = operation.name.split('/').pop() ?? operation.name;
    const truncatedDesc = desc.length > 80 ? `${desc.slice(0, 80)}…` : desc;

    const tooltip = new vscode.MarkdownString('', true);
    tooltip.supportThemeIcons = true;
    tooltip.appendMarkdown(`**${truncatedDesc}**\n\n`);

    if (isImportTask(operation) && meta?.destinationUris?.[0]) {
      tooltip.appendMarkdown(`**Asset name:** \`${meta.destinationUris[0]}\`  \n`);
    }
    tooltip.appendMarkdown(`**ID:** \`${operationId}\`  \n`);
    tooltip.appendMarkdown(`**Phase:** **${getPhaseLabel(state)}**  \n`);

    const runtime = formatRuntimeLine(operation);
    if (runtime) {
      tooltip.appendMarkdown(`**Runtime:** ${runtime}  \n`);
    }
    if (meta?.attempt !== undefined) {
      tooltip.appendMarkdown(`**Execution status:** Attempt #${meta.attempt}  \n`);
    }
    if (isExportTask(operation) && meta?.priority !== undefined) {
      const suffix = meta.priority === 100 ? ' (default)' : '';
      tooltip.appendMarkdown(`**Priority:** ${meta.priority}${suffix}  \n`);
    }
    if (meta?.batchEecuUsageSeconds !== undefined) {
      tooltip.appendMarkdown(
        `**Batch compute usage:** ${meta.batchEecuUsageSeconds.toFixed(4)} EECU-seconds  \n`,
      );
    }
    if (operation.error?.message) {
      tooltip.appendMarkdown(`**Error:** ${operation.error.message}  \n`);
    }
    this.tooltip = tooltip;

    if (state === 'RUNNING' || state === 'PENDING' || state === 'CANCELLING') {
      this.contextValue = 'task-running';
    } else if (state === 'FAILED') {
      this.contextValue = 'task-failed';
    } else {
      this.contextValue = 'task-done';
    }
  }
}
