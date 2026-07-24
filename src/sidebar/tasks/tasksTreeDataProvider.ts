/**
 * @module tasksTreeDataProvider
 * Tree items and data provider for the Tasks sidebar trees.
 *
 * Displays Earth Engine operations (export / import) with live status
 * icons, pagination via a "Load more..." item, and auto-refresh
 * while tasks are running.
 */

import * as vscode from 'vscode';
import { AuthService } from '../../auth/index.js';
import {
  listOperationsPage,
  Operation,
  getTaskState,
  getElapsedTime,
  getPhaseLabel,
  formatRuntimeLine,
  getOperation,
  isExportTask,
  isImportTask,
} from './tasksApiClient.js';

type TaskFilter = 'export' | 'import';

// ── Constants ───────────────────────────────────────────────────────

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

// ── TaskTreeItem ────────────────────────────────────────────────────

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

    // ── Tooltip ──────────────────────────────────────────────────────
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

// ── TasksTreeDataProvider ──────────────────────────────────────────

/** Maximum number of tasks to keep in the view. */
const MAX_TASKS = 100;

const TERMINAL_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

/** Provides a fixed-size list of task tree items with incremental refresh. */
export class TasksTreeDataProvider implements vscode.TreeDataProvider<TaskTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private loadedTasks: Operation[] = [];
  private resolvedProject: string | undefined;
  private loading = false;
  private initialLoaded = false;
  private autoRefreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly authService: AuthService,
    private readonly filter: TaskFilter,
  ) {
    authService.onDidChangeAuth(() => this.refresh());
  }

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(_element: TaskTreeItem): undefined {
    return undefined;
  }

  async getChildren(): Promise<TaskTreeItem[]> {
    if (!this.authService.isAuthenticated) {
      const item = new vscode.TreeItem('Not authenticated');
      item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      item.command = { command: 'earthengine.signIn', title: 'Sign In' };
      return [item as unknown as TaskTreeItem];
    }

    if (!this.initialLoaded && !this.loading) {
      this.loading = true;
      this.initialLoad();
      const placeholder = new vscode.TreeItem('Loading tasks...');
      placeholder.iconPath = new vscode.ThemeIcon('loading~spin');
      return [placeholder as unknown as TaskTreeItem];
    }

    if (this.loading) {
      const placeholder = new vscode.TreeItem('Loading tasks...');
      placeholder.iconPath = new vscode.ThemeIcon('loading~spin');
      return [placeholder as unknown as TaskTreeItem];
    }

    return this.buildItems();
  }

  private buildItems(): TaskTreeItem[] {
    const filterFn = this.filter === 'export' ? isExportTask : isImportTask;
    const filtered = this.loadedTasks.filter(filterFn).slice(0, MAX_TASKS);

    if (filtered.length === 0) {
      const empty = new vscode.TreeItem(`No ${this.filter} tasks`);
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty as unknown as TaskTreeItem];
    }

    const items: TaskTreeItem[] = filtered.map((op) => new TaskTreeItem(op));

    // Show a hint to open the editor panel for more tasks
    if (filtered.length >= MAX_TASKS) {
      const more = new TaskTreeItem({
        name: '__open_preview__',
        metadata: { description: 'Open preview to see more…', state: '__MORE__' },
      });
      more.iconPath = new vscode.ThemeIcon('open-preview');
      more.description = '';
      more.command = {
        command:
          this.filter === 'export'
            ? 'earthengine.openExportTasksPanel'
            : 'earthengine.openImportTasksPanel',
        title: 'Open Preview',
      };
      more.contextValue = 'task-open-preview';
      items.push(more);
    }

    return items;
  }

  // ── Data loading ────────────────────────────────────────────────────

  /** Initial load: fetch the first page (100 tasks). */
  private async initialLoad(): Promise<void> {
    try {
      const token = await this.authService.getToken();
      if (!token) {
        return;
      }

      const profile = this.authService.currentProfile!;
      const project = this.resolvedProject || profile.project;
      const result = await listOperationsPage(project, token, MAX_TASKS);

      this.resolvedProject = result.project;
      this.loadedTasks = result.operations;
      this.initialLoaded = true;
      this.manageAutoRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to load ${this.filter} tasks: ${msg}`);
      this.initialLoaded = true;
    } finally {
      this.loading = false;
      this._onDidChangeTreeData.fire();
    }
  }

  /** Full refresh — clears everything and reloads. */
  refresh(): void {
    this.loadedTasks = [];
    this.resolvedProject = undefined;
    this.loading = false;
    this.initialLoaded = false;
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = undefined;
    }
    this._onDidChangeTreeData.fire();
  }

  /**
   * Incremental refresh: fetch new tasks one batch at a time until overlap,
   * update non-terminal tasks, then prune to MAX_TASKS.
   */
  private async incrementalRefresh(): Promise<void> {
    try {
      const token = await this.authService.getToken();
      if (!token || this.loadedTasks.length === 0) {
        return;
      }

      const existingNames = new Set(this.loadedTasks.map((op) => op.name));
      const newOps: Operation[] = [];
      let foundOverlap = false;
      let pageToken: string | undefined;
      let fetched = 0;

      // Fetch batches of 25 until we find an operation we already know
      do {
        const result = await listOperationsPage(this.resolvedProject!, token, 25, pageToken);
        this.resolvedProject = result.project;

        for (const op of result.operations) {
          if (existingNames.has(op.name)) {
            foundOverlap = true;
            break;
          }
          newOps.push(op);
        }

        fetched += result.operations.length;
        pageToken = result.nextPageToken;
      } while (!foundOverlap && pageToken && fetched < 1_000);

      // Insert new tasks at the front
      if (newOps.length > 0) {
        this.loadedTasks.unshift(...newOps);
      }

      // Update non-terminal tasks that weren't just fetched
      const newNames = new Set(newOps.map((op) => op.name));
      const nonTerminal = this.loadedTasks.filter(
        (op) => !TERMINAL_STATES.has(getTaskState(op)) && !newNames.has(op.name),
      );

      await Promise.all(
        nonTerminal.map(async (op) => {
          try {
            const updated = await getOperation(op.name, token);
            op.metadata = updated.metadata;
            op.done = updated.done;
            op.error = updated.error;
          } catch {
            // keep stale data
          }
        }),
      );

      // Prune to MAX_TASKS
      if (this.loadedTasks.length > MAX_TASKS) {
        this.loadedTasks.length = MAX_TASKS;
      }

      this.manageAutoRefresh();
      this._onDidChangeTreeData.fire();
    } catch {
      // Silently ignore incremental refresh errors
    }
  }

  private manageAutoRefresh(): void {
    const hasRunning = this.loadedTasks.some((op) => {
      const s = getTaskState(op);
      return s === 'RUNNING' || s === 'PENDING' || s === 'CANCELLING';
    });
    if (hasRunning && !this.autoRefreshTimer) {
      this.autoRefreshTimer = setInterval(() => this.incrementalRefresh(), 15_000);
    } else if (!hasRunning && this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = undefined;
    }
  }

  /** Returns the currently loaded operations filtered for this tree's type. */
  getFilteredOperations(): Operation[] {
    const filterFn = this.filter === 'export' ? isExportTask : isImportTask;
    return this.loadedTasks.filter(filterFn);
  }

  dispose(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }
  }
}
