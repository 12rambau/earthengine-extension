/** @module extensionContext — Singleton that gives any module access to the ExtensionContext after activation. */

import * as vscode from 'vscode';

// ==================================================================
// SINGLETON
// ==================================================================

let _context: vscode.ExtensionContext | undefined;

/** Called once from activate() before any WebView panel is opened. */
export function setExtensionContext(context: vscode.ExtensionContext): void {
  _context = context;
}

function requireContext(): vscode.ExtensionContext {
  if (!_context) {
    throw new Error('extension context not initialised — call setExtensionContext() in activate()');
  }
  return _context;
}

/** Returns the extension URI; throws if setExtensionContext was not called yet. */
export function getExtensionUri(): vscode.Uri {
  return requireContext().extensionUri;
}

/** Returns the encrypted secret store, used for user-supplied API keys. */
export function getSecretStorage(): vscode.SecretStorage {
  return requireContext().secrets;
}

/** Returns the machine-scoped key/value store, used for caches that survive reloads. */
export function getGlobalState(): vscode.Memento {
  return requireContext().globalState;
}
