<!-- PanelTasksView: compact task list with live updates and row actions -->
<script>
  import { vscode } from '../../shared/vscode.ts';

  const STATE_SYMBOLS = {
    PENDING: '◌',
    RUNNING: '◎',
    CANCELLING: '◎',
    SUCCEEDED: '✓',
    FAILED: '✗',
    CANCELLED: '⊘',
  };

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let tasks = $state([]);
  let isLoading = $state(true);
  let isUnauthenticated = $state(false);

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'data') {
      isUnauthenticated = false;
      tasks = msg.tasks;
      isLoading = msg.loading;
    } else if (msg.type === 'unauthenticated') {
      isUnauthenticated = true;
      isLoading = false;
      tasks = [];
    } else if (msg.type === 'cancelled') {
      tasks = tasks.map(t => t.name === msg.name ? { ...t, state: 'CANCELLING' } : t);
    } else if (msg.type === 'loading') {
      isUnauthenticated = false;
      isLoading = true;
    }
  });

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------
  function stateClass(state) {
    const s = (state || '').toUpperCase();
    const anim = s === 'RUNNING' || s === 'CANCELLING' ? ' running' : '';
    return 'state-icon state-' + s + anim;
  }

  function assetNameFromUri(uri) {
    const m = uri.match(/asset=(projects\/[^&\s]+)/) ||
              uri.match(/\/v1\/(projects\/[^/]+\/assets\/.+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function cancel(name) {
    vscode.postMessage({ type: 'cancel', name });
  }

  function preview(assetName) {
    vscode.postMessage({ type: 'preview', assetName });
  }

  function getPreviewAsset(task) {
    if (task.state !== 'SUCCEEDED' || !task.destinationUris?.length) return null;
    return assetNameFromUri(task.destinationUris[0]);
  }
</script>

<ul class="task-list">
  {#if isUnauthenticated}
    <li class="empty-state">sign in to view tasks</li>
  {:else if isLoading && tasks.length === 0}
    <li class="loading-state"><span class="loading-spinner"></span>loading…</li>
  {:else if tasks.length === 0}
    <li class="empty-state">no tasks</li>
  {:else}
    {#each tasks as task (task.name)}
      <li class="task-row" title={task.id || ''}>
        <span class={stateClass(task.state)}>{STATE_SYMBOLS[task.state] || '?'}</span>
        <span class="task-name">{task.description || task.id || ''}</span>
        <span class="task-elapsed">{task.elapsed || ''}</span>
        <span class="task-actions">
          {#if task.state === 'RUNNING' || task.state === 'PENDING'}
            <button type="button" class="danger" title="Cancel" onclick={() => cancel(task.name)}>✗</button>
          {/if}
          {#if getPreviewAsset(task)}
            <button type="button" title="Preview" onclick={() => preview(getPreviewAsset(task))}>⧉</button>
          {/if}
        </span>
      </li>
    {/each}
  {/if}
</ul>

<style>
  :global {
    /* ==================================================================
       RESET & BASE
       ================================================================== */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
      font-family: inherit;
    }
    html,
    body {
      height: 100%;
      margin: 0;
    }
    body {
      font-family: var(--vscode-editor-font-family, 'Courier New', Courier, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      color: var(--vscode-foreground);
      background: transparent;
      padding: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ==================================================================
       TASK LIST
       ================================================================== */
    .task-list {
      flex: 1;
      overflow-y: auto;
      padding: 0;
      margin: 0;
      list-style: none;
    }
    .task-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      cursor: default;
      border-bottom: 1px solid var(--vscode-panel-border);
      white-space: nowrap;
      overflow: hidden;
    }
    .task-row:hover {
      background: var(--vscode-list-hoverBackground);
    }

    /* ==================================================================
       STATUS INDICATORS
       ================================================================== */
    .state-icon {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      text-align: center;
      font-size: 0.85em;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .state-icon.running,
    .state-icon.cancelling {
      /* hide the text symbol, show spinner instead */
      font-size: 0;
      border: 1.5px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      width: 10px;
      height: 10px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .state-PENDING {
      color: var(--vscode-charts-yellow);
    }
    .state-RUNNING {
      color: var(--vscode-progressBar-background);
    }
    .state-CANCELLING {
      color: var(--vscode-disabledForeground);
    }
    .state-SUCCEEDED {
      color: var(--vscode-testing-iconPassed);
    }
    .state-FAILED {
      color: var(--vscode-testing-iconFailed);
    }
    .state-CANCELLED {
      color: var(--vscode-disabledForeground);
    }

    /* ==================================================================
       TASK FIELDS
       ================================================================== */
    .task-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .task-elapsed {
      flex-shrink: 0;
      opacity: 0.6;
      font-size: 0.9em;
      font-family: var(--vscode-editor-font-family, 'Courier New', Courier, monospace);
      min-width: 40px;
      text-align: right;
    }

    /* ==================================================================
       ROW ACTIONS
       ================================================================== */
    .task-actions {
      flex-shrink: 0;
      display: flex;
      gap: 2px;
      visibility: hidden;
    }
    .task-row:hover .task-actions {
      visibility: visible;
    }
    .task-actions button {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 1px 4px;
      border-radius: 3px;
      opacity: 0.7;
      font-family: inherit;
      font-size: 0.9em;
    }
    .task-actions button:hover {
      background: var(--vscode-list-hoverBackground);
      opacity: 1;
    }
    .task-actions button.danger:hover {
      color: var(--vscode-testing-iconFailed);
    }

    /* ==================================================================
       EMPTY STATE
       ================================================================== */
    .empty-state {
      padding: 16px;
      text-align: center;
      opacity: 0.5;
      font-style: italic;
    }

    /* ==================================================================
       LOADING
       ================================================================== */
    .loading-state {
      padding: 16px;
      text-align: center;
      opacity: 0.5;
    }
    .loading-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--vscode-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 6px;
      vertical-align: middle;
    }
  }
</style>
