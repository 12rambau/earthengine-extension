/**
 * @module imageCollectionPreviewPanel.webview
 * Browser-side script for the ImageCollection preview panel: tab switching,
 * async thumbnail loading, and per-image open/delete row actions.
 */

(function () {
  const vscode = acquireVsCodeApi();

  // Tab switching
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Signal ready to load async data
  vscode.postMessage({ type: 'ready' });

  // Listen for messages from extension
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'thumbnail') {
      const el = document.getElementById('thumbnail');
      if (msg.url) {
        el.innerHTML = '<img src="' + msg.url + '" alt="Thumbnail" />';
      } else {
        const errorMsg = msg.error || 'Thumbnail not available.';
        el.innerHTML = '<span class="thumb-unavailable">' + errorMsg + '</span>';
      }
    } else if (msg.type === 'imageDeleted') {
      const row = document.querySelector('tr[data-name="' + CSS.escape(msg.name) + '"]');
      if (row) {
        row.remove();
      }
    }
  });

  // Action button delegation (CSP-safe: no inline onclick)
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) {
      return;
    }
    const action = btn.dataset.action;
    const name = btn.dataset.name;
    if (!name) {
      return;
    }
    if (action === 'open') {
      vscode.postMessage({ type: 'openImage', name: name });
    } else if (action === 'delete') {
      vscode.postMessage({ type: 'deleteImage', name: name });
    }
  });
})();
