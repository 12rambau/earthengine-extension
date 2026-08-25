<!-- PanelTasksView: compact task list with live updates and row actions -->
<script>
  import { vscode } from '../../shared/vscode.ts';
  import {
    mdiChartTree, mdiEarth, mdiImage, mdiMapOutline, mdiTable, mdiVideoBox,
  } from '../../shared/icons.ts';

  const STATE_ICONS = {
    PENDING: 'codicon codicon-circle-outline',
    RUNNING: 'codicon codicon-sync',
    CANCELLING: 'codicon codicon-sync',
    SUCCEEDED: 'codicon codicon-check',
    FAILED: 'codicon codicon-error',
    CANCELLED: 'codicon codicon-circle-slash',
  };

  const TASK_TYPE_ICONS = {
    'image-export': mdiImage,
    'map-export': mdiMapOutline,
    'table-export': mdiTable,
    'video-export': mdiVideoBox,
    'classifier-export': mdiChartTree,
    export: mdiEarth,
    import: mdiEarth,
    unknown: mdiEarth,
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

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function cancel(name) {
    vscode.postMessage({ type: 'cancel', name });
  }

  function preview(assetName) {
    vscode.postMessage({ type: 'preview', assetName });
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
        <span class={stateClass(task.state)}><i class={STATE_ICONS[task.state] || 'codicon codicon-question'}></i></span>
        <span class={stateClass(task.state)}><svg class="task-type-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={TASK_TYPE_ICONS[task.kind] || mdiEarth}/></svg></span>
        <span class="task-name">{task.description || task.id || ''}</span>
        <span class="task-elapsed">{task.state !== 'PENDING' ? (task.elapsed || '') : ''}</span>
        <span class="task-actions">
          {#if task.state === 'RUNNING' || task.state === 'PENDING'}
            <button type="button" class="danger" title="Cancel" onclick={() => cancel(task.name)}><i class="codicon codicon-stop-circle"></i></button>
          {:else if task.previewAssetName}
            <button type="button" title="Preview asset" onclick={() => preview(task.previewAssetName)}><i class="codicon codicon-open-preview"></i></button>
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
      overflow: hidden;
      margin: 0;
    }
    body {
      font-family: var(--vscode-editor-font-family, 'Courier New', Courier, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      color: var(--vscode-foreground);
      background: transparent;
      padding: var(--vscee-space-sm);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #app {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ==================================================================
       TASK LIST
       ================================================================== */
    .task-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0;
      margin: 0;
      list-style: none;
    }
    .task-row {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      cursor: default;
      border-bottom: var(--vscee-border-sm) solid var(--vscode-panel-border);
      white-space: nowrap;
      overflow: hidden;

      &:hover {
        background: var(--vscode-list-hoverBackground);
        .task-actions { visibility: visible; }
      }
    }

    /* ==================================================================
       STATUS INDICATORS
       ================================================================== */
    .state-icon {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      text-align: center;
      font-size: var(--vscee-font-sm);
      display: inline-flex;
      align-items: center;
      justify-content: center;

      &.running i,
      &.cancelling i {
        display: inline-block;
        animation: spin 0.8s linear infinite;
      }
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
    .task-type-icon {
      width: 14px;
      height: 14px;
      display: block;
      fill: currentColor;
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
      font-size: var(--vscee-font-md);
      font-family: var(--vscode-editor-font-family, 'Courier New', Courier, monospace);
      min-width: 40px;
      text-align: right;
    }

    /* ==================================================================
       ROW ACTIONS
       ================================================================== */
    .task-actions {
      flex-shrink: 0;
      width: 26px;
      display: flex;
      justify-content: center;
      visibility: hidden;

      button {
        background: transparent;
        border: none;
        color: var(--vscode-foreground);
        cursor: pointer;
        padding: var(--vscee-space-xxs) var(--vscee-space-xs);
        border-radius: var(--vscee-radius-md);
        opacity: 0.7;
        font-family: inherit;
        font-size: var(--vscee-font-md);

        &:hover { background: var(--vscode-list-hoverBackground); opacity: 1; }
        &.danger:hover { color: var(--vscode-testing-iconFailed); }
      }
    }


    /* ==================================================================
       EMPTY STATE
       ================================================================== */
    .empty-state {
      padding: var(--vscee-space-xl);
      text-align: center;
      opacity: 0.5;
      font-style: italic;
    }

    /* ==================================================================
       LOADING
       ================================================================== */
    .loading-state {
      padding: var(--vscee-space-xl);
      text-align: center;
      opacity: 0.5;
    }
    .loading-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: var(--vscee-border-md) solid var(--vscode-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: var(--vscee-space-sm);
      vertical-align: middle;
    }
  }
</style>
