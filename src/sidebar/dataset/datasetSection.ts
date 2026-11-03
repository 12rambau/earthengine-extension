/**
 * @module datasetSection
 * Dataset catalog sidebar section for the Earth Engine extension.
 *
 * Registers the dataset tree view and commands for refreshing,
 * searching, opening dataset pages in the browser, and launching
 * a dataset detail panel inside VS Code.
 */

import * as vscode from 'vscode';
import { SidebarSection } from '../../shared/baseComponents.js';
import { DatasetTreeDataProvider } from './datasetTreeDataProvider.js';
import { DatasetTreeItem } from './datasetTreeItem.js';
import { fetchCollection, getDatasetPageUrl } from './stacClient.js';
import { fetchHtml } from '../../shared/httpClient.js';
import { fetchCommunityThemes } from './communityClient.js';
import type { CommunityDatasetEntry } from './communityClient.js';
import {
  createDatasetPanel,
  createCommunityDatasetPanel,
} from '../../editor/dataset/datasetPanel.js';
import type { DatasetPanelState } from '../../editor/dataset/datasetPanel.js';

// ==================================================================
// DATASETSECTION
// ==================================================================
/** Sidebar section for browsing the Earth Engine public dataset catalog. */
export class DatasetSection extends SidebarSection {
  private provider: DatasetTreeDataProvider;

  constructor() {
    super();
    this.provider = new DatasetTreeDataProvider();
  }

  register(context: vscode.ExtensionContext): void {
    this.disposables.push(
      vscode.window.registerWebviewPanelSerializer('earthengine.datasetDetail', {
        deserializeWebviewPanel: async (panel, state: unknown) => {
          const saved = state as DatasetPanelState | null;
          try {
            if (saved?.kind === 'stac' && typeof saved.href === 'string') {
              const url = new URL(saved.href);
              if (
                url.origin !== 'https://earthengine-stac.storage.googleapis.com' ||
                !url.pathname.startsWith('/catalog/')
              ) {
                throw new Error('Invalid dataset catalog URL');
              }
              const collection = await fetchCollection(url.href);
              createDatasetPanel(collection, context.extensionUri, undefined, panel, saved);
            } else if (saved?.kind === 'community' && typeof saved.docs === 'string') {
              const themes = await fetchCommunityThemes();
              const entry = [...themes.values()].flat().find((item) => item.docs === saved.docs);
              if (!entry) {
                throw new Error('Dataset not found in community catalog');
              }
              await this.openCommunityPanel(entry, context.extensionUri, panel);
            } else {
              throw new Error('Invalid saved dataset');
            }
          } catch (error) {
            panel.dispose();
            vscode.window.showErrorMessage(
              `Failed to restore dataset details: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      }),
    );
    const treeView = this.createTreeView('earthengine.dataset', this.provider, {
      showCollapseAll: true,
    });

    treeView.onDidExpandElement((e) => this.provider.setExpanded(e.element, true));
    treeView.onDidCollapseElement((e) => this.provider.setExpanded(e.element, false));

    this.registerCommand('earthengine.refreshDatasets', () => this.provider.refresh());

    this.registerCommand('earthengine.searchDatasets', async () => {
      const item = await this.provider.searchDatasets();
      if (item) {
        treeView.reveal(item, { select: true, focus: true, expand: true });
      }
    });

    this.registerCommand('earthengine.openDatasetInBrowser', (item: DatasetTreeItem) => {
      if (item.datasetId) {
        vscode.env.openExternal(vscode.Uri.parse(getDatasetPageUrl(item.datasetId)));
      }
    });

    this.registerCommand(
      'earthengine.openDatasetPanel',
      async (hrefOrItem: string | DatasetTreeItem) => {
        const href = typeof hrefOrItem === 'string' ? hrefOrItem : hrefOrItem.stacHref;
        if (!href) {
          return;
        }
        try {
          const collection = await fetchCollection(href);
          createDatasetPanel(collection, context.extensionUri, undefined, undefined, {
            kind: 'stac',
            href,
          });
        } catch {
          vscode.window.showErrorMessage('Failed to load dataset details.');
        }
      },
    );

    this.registerCommand('earthengine.copyDatasetId', (item: DatasetTreeItem) => {
      if (item.datasetId) {
        vscode.env.clipboard.writeText(item.datasetId);
        vscode.window.showInformationMessage(`Copied: ${item.datasetId}`);
      }
    });

    this.registerCommand('earthengine.openCommunityDatasetPanel', async (item: DatasetTreeItem) => {
      if (item.nodeType !== 'communityDataset' || !item.communityEntry) {
        return;
      }
      try {
        await this.openCommunityPanel(item.communityEntry, context.extensionUri);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to load community dataset: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    context.subscriptions.push(this);
  }

  /** Fetch the current community description before opening or restoring its detail panel. */
  private async openCommunityPanel(
    entry: CommunityDatasetEntry,
    extensionUri: vscode.Uri,
    restoredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const slug = entry.docs.replace(/^.*\/projects\//, '').replace(/\/$/, '');
    const markdownUrl = `https://raw.githubusercontent.com/samapriya/awesome-gee-community-datasets/master/docs/projects/${slug}.md`;
    const markdown = await fetchHtml(markdownUrl);
    createCommunityDatasetPanel(entry, markdown, extensionUri, restoredPanel);
  }
}
