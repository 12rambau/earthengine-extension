/**
 * @module tasksSection
 * Tasks sidebar section for the Earth Engine extension.
 *
 * Registers separate export and import task tree views plus commands
 * for refreshing, cancelling tasks, loading more pages, and opening
 * the full tasks panel.
 */

import * as vscode from 'vscode';
import { SidebarSection } from '../../shared/baseComponents.js';
import { AuthService } from '../../auth/index.js';
import { TasksTreeDataProvider, TaskTreeItem } from './tasksTreeDataProvider.js';
import { cancelOperation } from './tasksApiClient.js';
import type { Operation } from './tasksApiClient.js';
import { openTasksPanel } from '../../editor/tasks/index.js';

// ── TasksSection ────────────────────────────────────────────────────

/** Sidebar section displaying export and import task trees. */
export class TasksSection extends SidebarSection {
  private exportProvider: TasksTreeDataProvider;
  private importProvider: TasksTreeDataProvider;

  constructor(private readonly authService: AuthService) {
    super();
    this.exportProvider = new TasksTreeDataProvider(authService, 'export');
    this.importProvider = new TasksTreeDataProvider(authService, 'import');
  }

  register(context: vscode.ExtensionContext): void {
    const exportTreeView = this.createTreeView('earthengine.tasks.export', this.exportProvider);
    const importTreeView = this.createTreeView('earthengine.tasks.import', this.importProvider);

    this.registerCommand('earthengine.refreshTasks', () => {
      this.exportProvider.refresh();
      this.importProvider.refresh();
    });

    this.registerCommand('earthengine.searchTasks', async () => {
      const exportOps = this.exportProvider.getFilteredOperations();
      const importOps = this.importProvider.getFilteredOperations();

      type QuickPickTask = vscode.QuickPickItem & {
        operation: Operation;
        treeView: vscode.TreeView<TaskTreeItem>;
      };

      const items: QuickPickTask[] = [
        ...exportOps.map((op) => ({
          label: op.metadata?.description || op.name.split('/').pop() || 'Unknown',
          description: `$(export) ${op.metadata?.state ?? 'UNKNOWN'}`,
          operation: op,
          treeView: exportTreeView,
        })),
        ...importOps.map((op) => ({
          label: op.metadata?.description || op.name.split('/').pop() || 'Unknown',
          description: `$(import) ${op.metadata?.state ?? 'UNKNOWN'}`,
          operation: op,
          treeView: importTreeView,
        })),
      ];

      if (items.length === 0) {
        vscode.window.showInformationMessage('No tasks loaded yet. Refresh the task views first.');
        return;
      }

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Search tasks…',
        matchOnDescription: true,
      });

      if (!picked) {
        return;
      }
      const item = new TaskTreeItem(picked.operation);
      await picked.treeView.reveal(item, { select: true, focus: true });
    });

    this.registerCommand('earthengine.cancelTask', async (item: TaskTreeItem) => {
      const token = await this.authService.getToken();
      if (!token) {
        return;
      }
      try {
        await cancelOperation(item.operation.name, token);
        vscode.window.showInformationMessage('Task cancellation requested.');
        this.exportProvider.refresh();
        this.importProvider.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to cancel task: ${msg}`);
      }
    });

    this.registerCommand('earthengine.loadMoreTasks', (provider: TasksTreeDataProvider) => {
      provider.loadNextPage();
    });

    this.registerCommand('earthengine.openExportTasksPanel', () => {
      openTasksPanel(this.authService, 'export', context);
    });

    this.registerCommand('earthengine.openImportTasksPanel', () => {
      openTasksPanel(this.authService, 'import', context);
    });

    // ── Bottom Panel: Export & Import task trees ──
    const panelExportProvider = new TasksTreeDataProvider(this.authService, 'export');
    const panelImportProvider = new TasksTreeDataProvider(this.authService, 'import');
    this.createTreeView('earthengine.panelTasks.export', panelExportProvider);
    this.createTreeView('earthengine.panelTasks.import', panelImportProvider);

    this.registerCommand('earthengine.panelTasksRefresh', () => {
      panelExportProvider.refresh();
      panelImportProvider.refresh();
    });

    this.registerCommand('earthengine.panelTasksOpenEditor', () => {
      openTasksPanel(this.authService, 'export', context);
    });

    this.registerCommand('earthengine.panelTasksLoadMore', (provider: TasksTreeDataProvider) => {
      provider.loadNextPage();
    });

    context.subscriptions.push(this);
  }

  override dispose(): void {
    this.exportProvider.dispose();
    this.importProvider.dispose();
    super.dispose();
  }
}
