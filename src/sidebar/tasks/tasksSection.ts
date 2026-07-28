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
import { TasksTreeDataProvider, TASK_STATES } from './tasksTreeDataProvider.js';
import { TaskTreeItem } from './taskTreeItem.js';
import { cancelOperation } from './tasksApiClient.js';
import { openTasksPanel } from '../../editor/tasks/index.js';

// ==================================================================
// TASKSSECTION
// ==================================================================
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
    this.createTreeView('earthengine.tasks.export', this.exportProvider);
    this.createTreeView('earthengine.tasks.import', this.importProvider);

    this.registerCommand('earthengine.refreshTasks', () => {
      this.exportProvider.refresh();
      this.importProvider.refresh();
    });

    this.registerCommand('earthengine.filterTasksByStatus', async () => {
      const current = this.exportProvider.getStatusFilter();
      const items = TASK_STATES.map((state) => ({
        label: state,
        picked: current ? current.has(state) : false,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'Select statuses to show (leave empty to show all)',
      });
      if (picked === undefined) {
        return;
      }
      const states = new Set(picked.map((p) => p.label));
      this.exportProvider.setStatusFilter(states);
      this.importProvider.setStatusFilter(states);
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

    this.registerCommand('earthengine.openExportTasksPanel', () => {
      openTasksPanel(this.authService, 'export', context);
    });

    this.registerCommand('earthengine.openImportTasksPanel', () => {
      openTasksPanel(this.authService, 'import', context);
    });

    context.subscriptions.push(this);
  }

  override dispose(): void {
    this.exportProvider.dispose();
    this.importProvider.dispose();
    super.dispose();
  }
}
