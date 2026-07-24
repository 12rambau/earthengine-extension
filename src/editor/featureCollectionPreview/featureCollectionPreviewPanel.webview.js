/**
 * @module featureCollectionPreviewPanel.webview
 * Browser-side script for the FeatureCollection preview panel: tab switching
 * and async thumbnail loading.
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
    }
  });
})();
