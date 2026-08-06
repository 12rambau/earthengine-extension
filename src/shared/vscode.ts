/** @module vscode — Shared helpers for Svelte webview entry points. */

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

export const vscode = acquireVsCodeApi();

export function getInitData<T = Record<string, unknown>>(): T {
  const el = document.getElementById('init-data');
  return el ? JSON.parse(el.textContent!) : ({} as T);
}
