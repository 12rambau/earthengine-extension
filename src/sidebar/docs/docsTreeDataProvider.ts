/**
 * @module docsTreeDataProvider
 * Data provider for the API Docs sidebar tree.
 *
 * Fetches and parses the Earth Engine API docs page, builds a
 * hierarchical tree (e.g. ee \u2192 Image \u2192 abs), and provides
 * search over all entry names.
 */

import * as vscode from 'vscode';
import { DocsTreeItem } from './docsTreeItem.js';
import { fetchApiDocs, getDocUrl, clearDocsCache } from './apiDocsParser.js';

// ── Internal Types ──────────────────────────────────────────────────

/** Recursive tree node used to organise API entries by dotted path. */
interface TreeNode {
	children: Map<string, TreeNode>;
	entry?: {
		name: string;
		description: string;
		usage: string;
		returns: string;
		args: { name: string; type: string; details: string }[];
	};
}

// ── DocsTreeDataProvider ───────────────────────────────────────────

/** Provides a hierarchical tree of all `ee.*` API methods and classes. */
export class DocsTreeDataProvider implements vscode.TreeDataProvider<DocsTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<DocsTreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private tree: TreeNode | undefined;
	private loading = false;
	private loaded = false;

	getTreeItem(element: DocsTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: DocsTreeItem): Promise<DocsTreeItem[]> {
		if (!this.loaded && !this.loading) {
			this.loading = true;
			try {
				const entries = await fetchApiDocs();
				this.tree = this.buildTree(entries);
				this.loaded = true;
			} finally {
				this.loading = false;
			}
			this._onDidChangeTreeData.fire();
			return [];
		}

		if (this.loading) {
			return [new DocsTreeItem(
				'Loading API docs...',
				'',
				vscode.TreeItemCollapsibleState.None,
			)];
		}

		if (!this.tree) {
			return [];
		}

		// At the root level, skip the "ee" node and show its children directly
		let node: TreeNode | undefined;
		if (!element) {
			const eeNode = this.tree?.children.get('ee');
			node = eeNode ?? this.tree;
		} else {
			node = this.findNode(element.fullName);
		}
		if (!node) {
			return [];
		}

		const items: DocsTreeItem[] = [];
		for (const [key, child] of [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
			const fullName = element ? `${element.fullName}.${key}` : `ee.${key}`;
			const hasChildren = child.children.size > 0;
			const isLeaf = !hasChildren && child.entry;

			if (isLeaf && child.entry) {
				items.push(new DocsTreeItem(
					key,
					child.entry.name,
					vscode.TreeItemCollapsibleState.None,
					undefined,
					child.entry.description,
					child.entry.usage,
					child.entry.returns,
					child.entry.args,
					getDocUrl(child.entry.name),
				));
			} else {
				const state = vscode.TreeItemCollapsibleState.Collapsed;
				if (child.entry) {
					items.push(new DocsTreeItem(
						key,
						fullName,
						state,
						undefined,
						child.entry.description,
						child.entry.usage,
						child.entry.returns,
						child.entry.args,
						getDocUrl(child.entry.name),
					));
				} else {
					items.push(new DocsTreeItem(
						key,
						fullName,
						state,
					));
				}
			}
		}

		return items;
	}

	/** Clears the cached docs and reloads from the web. */
	refresh() {
		clearDocsCache();
		this.tree = undefined;
		this.loaded = false;
		this._onDidChangeTreeData.fire();
	}

	/** Returns a flat list of all parsed API entry names (e.g. "ee.Image.abs"). */
	getAllEntryNames(): string[] {
		if (!this.tree) {
			return [];
		}
		const names: string[] = [];
		const collect = (node: TreeNode) => {
			if (node.entry) {
				names.push(node.entry.name);
			}
			for (const child of node.children.values()) {
				collect(child);
			}
		};
		collect(this.tree);
		return names;
	}

	/** Builds a hierarchical TreeNode from a flat list of dotted API names. */
	private buildTree(entries: { name: string; description: string; usage: string; returns: string; args: { name: string; type: string; details: string }[] }[]): TreeNode {
		const root: TreeNode = { children: new Map() };

		for (const entry of entries) {
			// "ee.Image.abs" → ["ee", "Image", "abs"]
			const parts = entry.name.split('.');
			let current = root;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (!current.children.has(part)) {
					current.children.set(part, { children: new Map() });
				}
				current = current.children.get(part)!;
			}

			current.entry = entry;
		}

		return root;
	}

	/** Walks the tree to find the node matching a dotted full name. */
	private findNode(fullName: string): TreeNode | undefined {
		if (!this.tree) {
			return undefined;
		}
		const parts = fullName.split('.');
		let current = this.tree;
		for (const part of parts) {
			const child = current.children.get(part);
			if (!child) {
				return undefined;
			}
			current = child;
		}
		return current;
	}
}
