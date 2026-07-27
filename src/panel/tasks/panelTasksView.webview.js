/**
 * @module panelTasksView.webview
 * Browser-side script for the bottom-panel task WebView. Renders a
 * compact monospace task list with live status updates and row actions.
 */

const vscode = acquireVsCodeApi();

// ==================================================================
// STATE ICONS (monospace-friendly)
// ==================================================================
const STATE_SYMBOLS = {
  PENDING: '◌',
  RUNNING: '◎',
  CANCELLING: '◎',
  SUCCEEDED: '✓',
  FAILED: '✗',
  CANCELLED: '⊘',
};

// ==================================================================
// HELPERS
// ==================================================================
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stateClass(state) {
  const s = (state || '').toUpperCase();
  const anim = s === 'RUNNING' || s === 'CANCELLING' ? ' running' : '';
  return 'state-icon state-' + s + anim;
}

function stateSymbol(state) {
  return STATE_SYMBOLS[state] || '?';
}

/** Extracts an EE asset name from a destinationUri. */
function assetNameFromUri(uri) {
  const m = uri.match(/\/v1\/(projects\/[^/]+\/assets\/.+)/);
  return m ? m[1] : null;
}

// ==================================================================
// RENDER
// ==================================================================
let tasks = [];
let isLoading = true;
let isUnauthenticated = false;

function render() {
  const list = document.getElementById('taskList');

  if (isUnauthenticated) {
    list.innerHTML = '<li class="empty-state">sign in to view tasks</li>';
    return;
  }

  if (isLoading && tasks.length === 0) {
    list.innerHTML = '<li class="loading-state"><span class="loading-spinner"></span>loading…</li>';
    return;
  }

  if (tasks.length === 0) {
    list.innerHTML = '<li class="empty-state">no tasks</li>';
    return;
  }

  list.innerHTML = tasks
    .map(function (t) {
      const sym = stateSymbol(t.state);
      const cls = stateClass(t.state);
      const name = esc(t.description || t.id);
      const elapsed = esc(t.elapsed || '');

      let actions = '';
      if (t.state === 'RUNNING' || t.state === 'PENDING') {
        actions +=
          '<button class="danger" title="Cancel" onclick="cancelTask(\'' +
          esc(t.name) +
          '\')">✗</button>';
      }
      if (t.state === 'SUCCEEDED' && t.destinationUris && t.destinationUris.length > 0) {
        const asset = assetNameFromUri(t.destinationUris[0]);
        if (asset) {
          actions +=
            '<button title="Preview" onclick="previewAsset(\'' + esc(asset) + '\')">⧉</button>';
        }
      }

      return (
        '<li class="task-row" title="' +
        esc(t.id) +
        '">' +
        '<span class="' +
        cls +
        '">' +
        sym +
        '</span>' +
        '<span class="task-name">' +
        name +
        '</span>' +
        '<span class="task-elapsed">' +
        elapsed +
        '</span>' +
        '<span class="task-actions">' +
        actions +
        '</span>' +
        '</li>'
      );
    })
    .join('');
}

// ==================================================================
// MESSAGING
// ==================================================================
function cancelTask(name) {
  vscode.postMessage({ type: 'cancel', name: name });
}

function previewAsset(assetName) {
  vscode.postMessage({ type: 'preview', assetName: assetName });
}

window.addEventListener('message', function (e) {
  var msg = e.data;
  if (msg.type === 'data') {
    isUnauthenticated = false;
    tasks = msg.tasks;
    isLoading = msg.loading;
    render();
  } else if (msg.type === 'unauthenticated') {
    isUnauthenticated = true;
    isLoading = false;
    tasks = [];
    render();
  } else if (msg.type === 'cancelled') {
    var t = tasks.find(function (t) {
      return t.name === msg.name;
    });
    if (t) {
      t.state = 'CANCELLING';
    }
    render();
  } else if (msg.type === 'loading') {
    isUnauthenticated = false;
    isLoading = true;
    render();
  }
});

// ==================================================================
// INIT
// ==================================================================
render();
