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
  formatRuntimeLine,
  isExportTask,
  isImportTask,
  getTaskKind,
  type TaskKind,
} from './tasksApiClient.js';
import {
  mdiChartTree,
  mdiEarth,
  mdiImage,
  mdiMapOutline,
  mdiTable,
  mdiVideoBox,
} from '../../shared/icons.js';

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

const STATE_ICON_COLORS: Record<string, string> = {
  PENDING: '#cca700',
  RUNNING: '#3794ff',
  CANCELLING: '#8c8c8c',
  SUCCEEDED: '#89d185',
  FAILED: '#f14c4c',
  CANCELLED: '#8c8c8c',
};

const TREE_MDI_ICONS: Record<TaskKind, string> = {
  'image-export': mdiImage,
  'map-export': mdiMapOutline,
  'table-export': mdiTable,
  'video-export': mdiVideoBox,
  'classifier-export': mdiChartTree,
  export: mdiEarth,
  import: mdiEarth,
  unknown: mdiEarth,
};

function getTaskTreeIcon(kind: TaskKind, state: string): vscode.Uri {
  const color = STATE_ICON_COLORS[state] ?? '#8c8c8c';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${color}" d="${TREE_MDI_ICONS[kind]}"/></svg>`;
  return vscode.Uri.parse(`data:image/svg+xml,${encodeURIComponent(svg)}`);
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
    const elapsed = state !== 'PENDING' ? getElapsedTime(operation) : undefined;

    // Icon: shape from task type, color from state; spinner for active tasks
    const color = STATE_COLORS[state];
    if (state === 'RUNNING' || state === 'CANCELLING') {
      this.iconPath = color
        ? new vscode.ThemeIcon('loading~spin', color)
        : new vscode.ThemeIcon('loading~spin');
    } else {
      this.iconPath = getTaskTreeIcon(getTaskKind(operation), state);
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
    tooltip.appendMarkdown(
      `**Phase:** **${state.charAt(0).toUpperCase() + state.slice(1).toLowerCase()}**  \n`,
    );

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
