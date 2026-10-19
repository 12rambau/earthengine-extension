<!-- PanelTasksView: compact task list with live updates -->
<script>
  import TaskRow from './TaskRow.svelte';

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
      tasks = tasks.map((t) => (t.name === msg.name ? { ...t, state: 'CANCELLING' } : t));
    } else if (msg.type === 'loading') {
      isUnauthenticated = false;
      isLoading = true;
    }
  });
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
      <TaskRow {task} />
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
    html {
      height: 100%;
    }
    body {
      height: 100%;
      margin: 0;
      font-family: var(--vscee-editor-font-family, 'Courier New', Courier, monospace);
      font-size: var(--vscee-editor-font-size, 13px);
      color: var(--vscee-color-foreground);
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

     /* ==================================================================
       STATUS STATES
       ================================================================== */
     .empty-state,
     .loading-state {
      padding: var(--vscee-space-xl);
      text-align: center;
      opacity: 0.5;
     }
     .empty-state {
      font-style: italic;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .loading-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: var(--vscee-border-md) solid var(--vscee-color-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: var(--vscee-space-sm);
      vertical-align: middle;
    }
  }
</style>
