const vscode = acquireVsCodeApi();
const btn = document.getElementById('copy-btn');
btn.addEventListener('click', () => {
  const text = document.getElementById('snippet-code').textContent;
  vscode.postMessage({ type: 'copy', text });
  const prev = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => {
    btn.textContent = prev;
  }, 1200);
});

const tabButtons = document.querySelectorAll('.tab');
tabButtons.forEach((tab) => {
  tab.addEventListener('click', () => {
    const id = tab.getAttribute('data-tab');
    tabButtons.forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === 'panel-' + id);
    });
  });
});
