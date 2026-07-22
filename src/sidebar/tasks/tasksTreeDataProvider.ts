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
import { listOperationsPage, Operation, getTaskState, getElapsedTime, getPhaseLabel, formatRuntimeLine, isExportTask, isImportTask } from './tasksApiClient.js';

type TaskFilter = 'export' | 'import';

// ── Constants ───────────────────────────────────────────────────────

const STATE_COLORS: Partial<Record<string, vscode.ThemeColor>> = {
	'PENDING':    new vscode.ThemeColor('testing.iconQueued'),
	'RUNNING':    new vscode.ThemeColor('progressBar.background'),
	'CANCELLING': new vscode.ThemeColor('disabledForeground'),
	'SUCCEEDED':  new vscode.ThemeColor('testing.iconPassed'),
	'FAILED':     new vscode.ThemeColor('errorForeground'),
	'CANCELLED':  new vscode.ThemeColor('disabledForeground'),
};

function getTypeIconId(op: Operation): string {
	const type = (op.metadata?.type || '').toUpperCase();
	if (type.startsWith('INGEST') || type.startsWith('IMPORT')) { return 'cloud-upload'; }
	if (type === 'EXPORT_IMAGE' || type === 'EXPORT_VIDEO')     { return 'file-media'; }
	if (type === 'EXPORT_TABLE' || type === 'EXPORT_FEATURES')  { return 'table'; }
	if (type.startsWith('EXPORT'))                             { return 'cloud-download'; }
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
			this.iconPath = color
				? new vscode.ThemeIcon(iconId, color)
				: new vscode.ThemeIcon(iconId);
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
			tooltip.appendMarkdown(`**Batch compute usage:** ${meta.batchEecuUsageSeconds.toFixed(4)} EECU-seconds  \n`);
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

/** Provides paginated task tree items with automatic 15 s refresh for running tasks. */
export class TasksTreeDataProvider implements vscode.TreeDataProvider<TaskTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private loadedTasks: Operation[] = [];
	private nextPageToken: string | undefined;
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
			this.loadNextPage();
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

	/** Builds the visible item list, appending a "Load more" item when needed. */
	private buildItems(): TaskTreeItem[] {
		const filterFn = this.filter === 'export' ? isExportTask : isImportTask;
		const filtered = this.loadedTasks.filter(filterFn);

		if (filtered.length === 0 && !this.nextPageToken) {
			const empty = new vscode.TreeItem(`No ${this.filter} tasks`);
			empty.iconPath = new vscode.ThemeIcon('info');
			return [empty as unknown as TaskTreeItem];
		}

		const items: TaskTreeItem[] = filtered.map(op => new TaskTreeItem(op));

		// Add "Load more..." item if there are more pages
		if (this.nextPageToken) {
			const loadMore = new TaskTreeItem({
				name: '__load_more__',
				metadata: { description: `Load more ${this.filter} tasks...`, state: '__LOAD_MORE__' },
			});
			loadMore.iconPath = new vscode.ThemeIcon('ellipsis');
			loadMore.description = `${filtered.length} loaded`;
			loadMore.command = {
				command: 'earthengine.loadMoreTasks',
				title: 'Load More',
				arguments: [this],
			};
			loadMore.contextValue = 'task-load-more';
			items.push(loadMore);
		}

		return items;
	}

	/** Fetches the next page of operations from the API. */
	async loadNextPage(): Promise<void> {
		try {
			const token = await this.authService.getToken();
			if (!token) { return; }

			const profile = this.authService.currentProfile!;
			const project = this.resolvedProject || profile.project;
			const result = await listOperationsPage(project, token, 100, this.nextPageToken);

			this.resolvedProject = result.project;
			this.loadedTasks.push(...result.operations);
			this.nextPageToken = result.nextPageToken;
			this.initialLoaded = true;

			// Auto-refresh if running tasks exist
			const hasRunning = this.loadedTasks.some(op => {
				const s = getTaskState(op);
				return s === 'RUNNING' || s === 'PENDING' || s === 'CANCELLING';
			});
			if (hasRunning && !this.autoRefreshTimer) {
				this.autoRefreshTimer = setInterval(() => this.softRefresh(), 15_000);
			} else if (!hasRunning && this.autoRefreshTimer) {
				clearInterval(this.autoRefreshTimer);
				this.autoRefreshTimer = undefined;
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Failed to load ${this.filter} tasks: ${msg}`);
			this.initialLoaded = true;
		} finally {
			this.loading = false;
			this._onDidChangeTreeData.fire();
		}
	}

	/** Full refresh — clears everything and reloads first page */
	refresh() {
		this.loadedTasks = [];
		this.nextPageToken = undefined;
		this.resolvedProject = undefined;
		this.loading = false;
		this.initialLoaded = false;
		if (this.autoRefreshTimer) {
			clearInterval(this.autoRefreshTimer);
			this.autoRefreshTimer = undefined;
		}
		this._onDidChangeTreeData.fire();
	}

	/** Soft refresh — reloads only the first page to update running task states */
	private async softRefresh(): Promise<void> {
		try {
			const token = await this.authService.getToken();
			if (!token) { return; }

			const project = this.resolvedProject || this.authService.currentProfile!.project;
			const result = await listOperationsPage(project, token, this.loadedTasks.length || 100);

			this.loadedTasks = result.operations;
			this.nextPageToken = result.nextPageToken;
			this._onDidChangeTreeData.fire();
		} catch {
			// Silently ignore soft refresh errors
		}
	}

	/** Returns the currently loaded operations filtered for this tree's type. */
	getFilteredOperations(): Operation[] {
		const filterFn = this.filter === 'export' ? isExportTask : isImportTask;
		return this.loadedTasks.filter(filterFn);
	}

	dispose() {
		if (this.autoRefreshTimer) {
			clearInterval(this.autoRefreshTimer);
		}
	}
}
