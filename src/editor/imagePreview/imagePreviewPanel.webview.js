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
        el.innerHTML = '<span class="thumb-unavailable">Thumbnail not available.</span>';
      }
    } else if (msg.type === 'minmax') {
      const cells = document.querySelectorAll('.minmax');
      cells.forEach((cell) => {
        const band = cell.dataset.band;
        const bandData = msg.data ? msg.data[band] : null;
        // Determine if this is a min or max cell (even index = min, odd = max)
        const sibling = cell.previousElementSibling;
        const isMin = sibling && !sibling.classList.contains('minmax');
        if (bandData) {
          if (isMin) {
            cell.textContent = bandData.min !== null ? formatNum(bandData.min) : '—';
          } else {
            cell.textContent = bandData.max !== null ? formatNum(bandData.max) : '—';
          }
        } else {
          cell.textContent = '—';
        }
      });
    }
  });

  function formatNum(n) {
    if (Number.isInteger(n)) {
      return String(n);
    }
    return n.toFixed(4);
  }
})();
