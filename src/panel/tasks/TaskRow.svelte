<!-- TaskRow: compact task status, details, and available actions -->
<script>
  import { vscode } from '../../shared/vscode.ts';
  import {
    mdiChartTree,
    mdiEarth,
    mdiImage,
    mdiMapOutline,
    mdiTable,
    mdiVideoBox,
  } from '../../shared/icons.ts';

  let { task } = $props();

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
    'image-import': mdiImage,
    'table-import': mdiTable,
    'export': mdiEarth,
    'import': mdiEarth,
  };

  function stateClass(state) {
    const s = (state || '').toUpperCase();
    const anim = s === 'RUNNING' || s === 'CANCELLING' ? ' running' : '';
    return 'state-icon state-' + s + anim;
  }

  function cancel(name) {
    vscode.postMessage({ type: 'cancel', name });
  }

  function preview(assetName) {
    vscode.postMessage({ type: 'preview', assetName });
  }
</script>

<li class="task-row" title={task.id || ''}>
  <span class={stateClass(task.state)}
    ><i class={STATE_ICONS[task.state] || 'codicon codicon-question'}></i></span
  >
  <span class={stateClass(task.state)}
    ><svg class="task-type-icon" viewBox="0 0 24 24" aria-hidden="true"
      ><path d={TASK_TYPE_ICONS[task.kind] || mdiEarth} /></svg
    ></span
  >
  <span class="task-name">{task.description || task.id || ''}</span>
  <span class="task-elapsed">{task.elapsed || ''}</span>
  <span class="task-actions">
    {#if task.state === 'RUNNING' || task.state === 'PENDING'}
      <button type="button" class="danger" title="Cancel" onclick={() => cancel(task.name)}
        ><i class="codicon codicon-stop-circle"></i></button
      >
    {:else if task.previewAssetName}
      <button
        type="button"
        title="Preview asset"
        onclick={() => preview(task.previewAssetName)}
        ><i class="codicon codicon-open-preview"></i></button
      >
    {/if}
  </span>
</li>

<style>
  :global {
    /* ==================================================================
       TASK ROW
       ================================================================== */
    .task-row {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
      white-space: nowrap;
      overflow: hidden;

      &:hover {
        background: var(--vscee-color-list-hover);
        .task-actions {
          visibility: visible;
        }
      }
    }

    /* ==================================================================
       STATUS INDICATORS
       ================================================================== */
    .state-icon {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;

      &.running i {
        animation: task-spin 1.5s linear infinite;
      }
    }
    @keyframes task-spin {
      to {
        transform: rotate(360deg);
      }
    }
    .state-PENDING {
      color: var(--vscee-color-chart-yellow);
    }
    .state-RUNNING {
      color: var(--vscee-color-progress);
    }
    .state-CANCELLING {
      color: var(--vscee-color-disabled);
    }
    .state-SUCCEEDED {
      color: var(--vscee-color-testing-passed);
    }
    .state-FAILED {
      color: var(--vscee-color-testing-failed);
    }
    .state-CANCELLED {
      color: var(--vscee-color-disabled);
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
        color: var(--vscee-color-foreground);
        cursor: pointer;
        padding: var(--vscee-space-xxs) var(--vscee-space-xs);
        opacity: 0.7;
        font-size: var(--vscee-font-md);

        &:hover {
          opacity: 1;
        }
        &.danger:hover {
          color: var(--vscee-color-testing-failed);
        }
      }
    }
  }
</style>