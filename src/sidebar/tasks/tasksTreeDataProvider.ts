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
import { listOperationsPage, Operation, getTaskState, getElapsedTime, isExportTask, isImportTask } from './tasksApiClient.js';

type TaskFilter = 'export' | 'import';

// ── Constants ───────────────────────────────────────────────────────

const STATE_ICONS: Record<string, vscode.ThemeIcon> = {
	'PENDING': new vscode.ThemeIcon('clock'),
	'RUNNING': new vscode.ThemeIcon('loading~spin'),
	'CANCELLING': new vscode.ThemeIcon('loading~spin'),
	'SUCCEEDED': new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed')),
	'FAILED': new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground')),
	'CANCELLED': new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground')),
};

// ── TaskTreeItem ────────────────────────────────────────────────────

/** Tree item representing a single Earth Engine operation/task. */
export class TaskTreeItem extends vscode.TreeItem {
	constructor(public readonly operation: Operation) {
		const desc = operation.metadata?.description || operation.name.split('/').pop() || 'Unknown';
		super(desc, vscode.TreeItemCollapsibleState.None);

		const state = getTaskState(operation);
		const elapsed = getElapsedTime(operation);

		this.iconPath = STATE_ICONS[state] || new vscode.ThemeIcon('question');
		this.description = elapsed;

		const tooltip = new vscode.MarkdownString('', true);
		tooltip.appendMarkdown(`**${desc}**\n\n`);
		tooltip.appendMarkdown(`State: \`${state}\`\n\n`);
		if (operation.metadata?.type) {
			tooltip.appendMarkdown(`Type: \`${operation.metadata.type}\`\n\n`);
		}
		if (elapsed) {
			tooltip.appendMarkdown(`Duration: ${elapsed}\n\n`);
		}
		if (operation.error?.message) {
			tooltip.appendMarkdown(`Error: ${operation.error.message}\n\n`);
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
			const result = await listOperationsPage(project, token, 10, this.nextPageToken);

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
			const result = await listOperationsPage(project, token, this.loadedTasks.length || 10);

			this.loadedTasks = result.operations;
			this.nextPageToken = result.nextPageToken;
			this._onDidChangeTreeData.fire();
		} catch {
			// Silently ignore soft refresh errors
		}
	}

	dispose() {
		if (this.autoRefreshTimer) {
			clearInterval(this.autoRefreshTimer);
		}
	}
}
