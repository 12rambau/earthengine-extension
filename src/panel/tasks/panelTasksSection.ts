/**
 * @module panelTasksSection
 * Bottom-panel section for Earth Engine export and import task WebViews.
 *
 * Registers two WebviewViewProviders that appear in the VS Code panel
 * area (next to the terminal) with monospace task lists, auto-refresh,
 * and row-level actions.
 */

import * as vscode from 'vscode';
import { SidebarSection } from '../../shared/baseComponents.js';
import { AuthService } from '../../auth/index.js';
import { PanelTasksViewProvider } from './panelTasksViewProvider.js';
import { TASK_STATES } from '../../sidebar/tasks/tasksTreeDataProvider.js';
import { openTasksPanel } from '../../editor/tasks/tasksPanel.js';

// ==================================================================
// PANELTASKSSECTION
// ==================================================================
/** Panel section displaying export and import task WebViews. */
export class PanelTasksSection extends SidebarSection {
  private exportViewProvider: PanelTasksViewProvider | undefined;
  private importViewProvider: PanelTasksViewProvider | undefined;

  constructor(private readonly authService: AuthService) {
    super();
  }

  register(context: vscode.ExtensionContext): void {
    this.exportViewProvider = new PanelTasksViewProvider(this.authService, 'export', context);
    this.importViewProvider = new PanelTasksViewProvider(this.authService, 'import', context);

    this.disposables.push(
      vscode.window.registerWebviewViewProvider(
        'earthengine.panelTasks.export',
        this.exportViewProvider,
      ),
    );
    this.disposables.push(
      vscode.window.registerWebviewViewProvider(
        'earthengine.panelTasks.import',
        this.importViewProvider,
      ),
    );

    this.registerCommand('earthengine.panelTasksRefresh', () => {
      this.exportViewProvider?.refresh();
      this.importViewProvider?.refresh();
    });

    this.registerCommand('earthengine.panelTasksOpenExportEditor', () => {
      openTasksPanel(this.authService, 'export', context);
    });

    this.registerCommand('earthengine.panelTasksOpenImportEditor', () => {
      openTasksPanel(this.authService, 'import', context);
    });

    this.registerCommand('earthengine.panelFilterTasksByStatus', async () => {
      const current = this.exportViewProvider?.getStatusFilter();
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
      this.exportViewProvider?.setStatusFilter(states);
      this.importViewProvider?.setStatusFilter(states);
    });

    context.subscriptions.push(this);
  }

  override dispose(): void {
    this.exportViewProvider?.dispose();
    this.importViewProvider?.dispose();
    super.dispose();
  }
}
