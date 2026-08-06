/** @module extensionContext — Singleton that gives any module access to extensionUri after activation. */

import * as vscode from 'vscode';

// ==================================================================
// SINGLETON
// ==================================================================

let _extensionUri: vscode.Uri | undefined;

/** Called once from activate() before any WebView panel is opened. */
export function setExtensionUri(uri: vscode.Uri): void {
  _extensionUri = uri;
}

/** Returns the extension URI; throws if setExtensionUri was not called yet. */
export function getExtensionUri(): vscode.Uri {
  if (!_extensionUri) {
    throw new Error('extensionUri not initialised — call setExtensionUri() in activate()');
  }
  return _extensionUri;
}
