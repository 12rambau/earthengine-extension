<!-- PanelTasksView: compact task list with live updates and row actions -->
<script>
  import { vscode } from '../../webview/shared/vscode.ts';

  const STATE_SYMBOLS = {
    PENDING: '◌',
    RUNNING: '◎',
    CANCELLING: '◎',
    SUCCEEDED: '✓',
    FAILED: '✗',
    CANCELLED: '⊘',
  };

  let tasks = $state([]);
  let isLoading = $state(true);
  let isUnauthenticated = $state(false);

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

  function stateClass(state) {
    const s = (state || '').toUpperCase();
    const anim = s === 'RUNNING' || s === 'CANCELLING' ? ' running' : '';
    return 'state-icon state-' + s + anim;
  }

  function assetNameFromUri(uri) {
    const m = uri.match(/\/v1\/(projects\/[^/]+\/assets\/.+)/);
    return m ? m[1] : null;
  }

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
