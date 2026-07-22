/**
 * @module docsSection
 * API Docs sidebar section for the Earth Engine extension.
 *
 * Registers the docs tree view and commands for refreshing the doc
 * index and searching API entries via a QuickPick.
 */

import * as vscode from 'vscode';
import { SidebarSection } from '../../shared/baseComponents.js';
import { DocsTreeDataProvider } from './docsTreeDataProvider.js';

// ── DocsSection ─────────────────────────────────────────────────────

/** Sidebar section that lists all `ee.*` API methods in a tree. */
export class DocsSection extends SidebarSection {
  private provider: DocsTreeDataProvider;

  constructor() {
    super();
    this.provider = new DocsTreeDataProvider();
  }

  register(context: vscode.ExtensionContext): void {
    const treeView = this.createTreeView('earthengine.docs', this.provider, {
      showCollapseAll: true,
    });

    this.registerCommand('earthengine.refreshDocs', () => this.provider.refresh());

    this.registerCommand('earthengine.searchDocs', async () => {
      const names = this.provider.getAllEntryNames();
      if (names.length === 0) {
        vscode.window.showInformationMessage(
          'API docs not loaded yet. Open the Docs section first.',
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(names, {
        placeHolder: 'Search Earth Engine API...',
        matchOnDescription: true,
      });
      if (picked) {
        const item = this.provider.getItemByName(picked);
        if (item) {
          treeView.reveal(item, { select: true, focus: true, expand: true });
        }
      }
    });

    context.subscriptions.push(this);
  }
}
