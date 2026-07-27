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

function createMessageRow(className, text, includeSpinner) {
  const item = document.createElement('li');
  item.className = className;

  if (includeSpinner) {
    const spinner = document.createElement('span');
    spinner.className = 'loading-spinner';
    item.appendChild(spinner);
  }

  item.appendChild(document.createTextNode(text));
  return item;
}

function createActionButton(title, text, action, value, extraClass) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = title;
  button.textContent = text;
  button.dataset.action = action;

  if (action === 'cancel') {
    button.dataset.name = value;
  } else if (action === 'preview') {
    button.dataset.assetName = value;
  }

  if (extraClass) {
    button.className = extraClass;
  }

  return button;
}

// ==================================================================
// RENDER
// ==================================================================
let tasks = [];
let isLoading = true;
let isUnauthenticated = false;

function render() {
  const list = document.getElementById('taskList');
  list.replaceChildren();

  if (isUnauthenticated) {
   list.appendChild(createMessageRow('empty-state', 'sign in to view tasks'));
   return;
  }

  if (isLoading && tasks.length === 0) {
   list.appendChild(createMessageRow('loading-state', 'loading…', true));
   return;
  }

  if (tasks.length === 0) {
   list.appendChild(createMessageRow('empty-state', 'no tasks'));
   return;
  }

  const rows = tasks.map(function (t) {
   const item = document.createElement('li');
   item.className = 'task-row';
   item.title = t.id || '';

   const icon = document.createElement('span');
   icon.className = stateClass(t.state);
   icon.textContent = stateSymbol(t.state);
   item.appendChild(icon);

   const name = document.createElement('span');
   name.className = 'task-name';
   name.textContent = t.description || t.id || '';
   item.appendChild(name);

   const elapsed = document.createElement('span');
   elapsed.className = 'task-elapsed';
   elapsed.textContent = t.elapsed || '';
   item.appendChild(elapsed);

   const actions = document.createElement('span');
   actions.className = 'task-actions';

   if (t.state === 'RUNNING' || t.state === 'PENDING') {
     actions.appendChild(createActionButton('Cancel', '✗', 'cancel', t.name, 'danger'));
   }

   if (t.state === 'SUCCEEDED' && t.destinationUris && t.destinationUris.length > 0) {
     const asset = assetNameFromUri(t.destinationUris[0]);
     if (asset) {
       actions.appendChild(createActionButton('Preview', '⧉', 'preview', asset));
     }
   }

   item.appendChild(actions);
   return item;
  });

  list.append(...rows);
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

document.getElementById('taskList').addEventListener('click', function (event) {
  const actionButton = event.target.closest('button[data-action]');
  if (!actionButton) {
    return;
  }

  if (actionButton.dataset.action === 'cancel' && actionButton.dataset.name) {
    cancelTask(actionButton.dataset.name);
  } else if (actionButton.dataset.action === 'preview' && actionButton.dataset.assetName) {
    previewAsset(actionButton.dataset.assetName);
  }
});

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
