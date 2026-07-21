/**
 * Base UI components for the Earth Engine extension.
 *
 * Provides abstract base classes that enforce consistent patterns
 * for sidebar tree views and editor WebView panels:
 *
 * - SidebarSection: owns a tree view + its commands, auto-disposed
 * - EditorPanel: singleton WebView panel with lifecycle management
 */

import * as vscode from 'vscode';

// ═══════════════════════════════════════════════════════════════════════════════
//  SidebarSection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Abstract base class for sidebar sections.
 *
 * Each section encapsulates:
 * - A tree view registered against a `viewId`
 * - A set of commands
 * - Automatic disposal of all registered resources
 *
 * Subclasses implement `register()` to wire everything up.
 */
export abstract class SidebarSection implements vscode.Disposable {
	/** Accumulated disposables — cleaned up on `dispose()`. */
	protected disposables: vscode.Disposable[] = [];

	/** Called once during activation to register views and commands. */
	abstract register(context: vscode.ExtensionContext): void;

	/** Shorthand to register a command and track it for disposal. */
	protected registerCommand(id: string, handler: (...args: any[]) => any): void {
		this.disposables.push(vscode.commands.registerCommand(id, handler));
	}

	/** Create and register a tree view, optionally with collapse-all support. */
	protected createTreeView<T extends vscode.TreeItem>(
		viewId: string,
		provider: vscode.TreeDataProvider<T>,
		options: { showCollapseAll?: boolean } = {},
	): vscode.TreeView<T> {
		const treeView = vscode.window.createTreeView(viewId, {
			treeDataProvider: provider,
			showCollapseAll: options.showCollapseAll,
		});
		this.disposables.push(treeView);
		return treeView;
	}

	/** Release all registered disposables. */
	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EditorPanel
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Abstract base class for singleton WebView panels.
 *
 * Handles the create-or-reveal pattern: calling `createPanel()` either
 * creates a new panel or reveals the existing one. Subclasses can
 * override `onDidDispose()` to clean up when the user closes the panel.
 */
export abstract class EditorPanel implements vscode.Disposable {
	/** The active WebView panel, or `undefined` if closed. */
	protected panel: vscode.WebviewPanel | undefined;

	/** Accumulated disposables — cleaned up on `dispose()`. */
	protected disposables: vscode.Disposable[] = [];

	/**
	 * Create a new WebView panel, or reveal the existing one.
	 * Automatically tracks the panel lifecycle.
	 */
	protected createPanel(
		viewType: string,
		title: string,
		column: vscode.ViewColumn = vscode.ViewColumn.One,
		options: vscode.WebviewOptions & vscode.WebviewPanelOptions = { enableScripts: true, retainContextWhenHidden: true },
	): vscode.WebviewPanel {
		if (this.panel) {
			this.panel.reveal();
			return this.panel;
		}

		this.panel = vscode.window.createWebviewPanel(viewType, title, column, options);
		this.panel.onDidDispose(() => {
			this.panel = undefined;
			this.onDidDispose();
		});

		return this.panel;
	}

	/** Override in subclasses to perform cleanup when the panel is closed. */
	protected onDidDispose(): void {
		// no-op by default
	}

	/** Whether the panel is currently visible. */
	get isVisible(): boolean {
		return this.panel?.visible ?? false;
	}

	/** Bring the panel to the foreground. */
	reveal(): void {
		this.panel?.reveal();
	}

	/** Dispose the panel and all tracked resources. */
	dispose(): void {
		this.panel?.dispose();
		this.disposables.forEach(d => d.dispose());
	}
}
