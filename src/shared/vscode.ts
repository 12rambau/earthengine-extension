/** @module vscode — Shared helpers for Svelte webview entry points. */

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

export const vscode = acquireVsCodeApi();

export function getInitData<T = Record<string, unknown>>(): T {
  const el = document.getElementById('init-data');
  const data = el ? JSON.parse(el.textContent!) : {};
  const assetName = data.metadata?.assetId ?? data.assetName;
  if (data.restoreState !== undefined) {
    vscode.setState(data.restoreState);
  } else if (typeof assetName === 'string') {
    vscode.setState({ assetName });
  }
  return data as T;
}

window.addEventListener('message', (event) => {
  const state = vscode.getState();
  if (event.data?.type === 'metadataSaved' && typeof event.data.metadata?.assetId === 'string') {
    if (state && typeof state === 'object' && 'assetName' in state) {
      vscode.setState({ ...state, assetName: event.data.metadata.assetId });
    }
  } else if (event.data?.type === 'data' && typeof event.data.parent === 'string') {
    if (state && typeof state === 'object' && 'parent' in state) {
      vscode.setState({ ...state, parent: event.data.parent });
    }
  }
});
