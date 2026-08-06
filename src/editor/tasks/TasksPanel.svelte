<!-- TasksPanel: sortable/paginated task table with filter toggle and column picker -->
<script>
  import { vscode, getInitData } from '../../webview/shared/vscode.ts';
  import Pagination from '../../webview/shared/Pagination.svelte';
  import ColumnPicker from '../../webview/shared/ColumnPicker.svelte';

  const saved = getInitData();

  const ALL_COLS = [
    { key: 'icon', label: '', required: true },
    { key: 'state', label: 'Status', required: true },
    { key: 'description', label: 'Name', required: true },
    { key: 'id', label: 'ID' },
    { key: 'createTime', label: 'Created' },
    { key: 'startTime', label: 'Start' },
    { key: 'elapsed', label: 'Duration' },
    { key: 'attempt', label: 'Attempts' },
    { key: 'priority', label: 'Priority' },
    { key: 'computeUsage', label: 'Compute Usage' },
    { key: 'actions', label: 'Actions', required: true },
  ];

  let visibleCols = $state(new Set(saved.visibleCols || ALL_COLS.map(c => c.key)));
  ALL_COLS.filter(c => c.required).forEach(c => visibleCols.add(c.key));
  let pageSize = $state(saved.pageSize || 25);
  let currentFilter = $state(saved.filter || 'export');

  let allTasks = $state([]);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let currentPage = $state(0);
  let sortCol = $state('createTime');
  let sortDir = $state(-1);

  // Derived: filtered tasks
  let tasks = $derived.by(() => {
    return currentFilter === 'export'
      ? allTasks.filter(t => { const type = (t.type || '').toUpperCase(); return type.startsWith('EXPORT') || type === ''; })
      : allTasks.filter(t => { const type = (t.type || '').toUpperCase(); return type.startsWith('INGEST') || type.startsWith('IMPORT'); });
  });

  // Derived: sorted tasks
  let sorted = $derived.by(() => {
    return [...tasks].sort((a, b) => {
      const va = a[sortCol] ?? '';
      const vb = b[sortCol] ?? '';
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  });

  let totalPages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
  let pageItems = $derived(sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize));
  let rangeText = $derived.by(() => {
    if (sorted.length === 0) return '0 tasks';
    const start = currentPage * pageSize + 1;
    const end = Math.min((currentPage + 1) * pageSize, sorted.length);
    return `${start}–${end} of ${sorted.length} tasks`;
  });

  // Visible columns (excluding hidden ones)
  let visCols = $derived(ALL_COLS.filter(c => visibleCols.has(c.key)));

  function saveState() {
    vscode.postMessage({ type: 'savePrefs', visibleCols: [...visibleCols], pageSize });
  }

  function handleSort(key) {
    if (key === 'icon' || key === 'actions') return;
    if (sortCol === key) {
      sortDir *= -1;
    } else {
      sortCol = key;
      sortDir = key === 'createTime' ? -1 : 1;
    }
  }

  function changeFilter(f) {
    currentFilter = f;
    currentPage = 0;
    saveState();
  }

  function cancelTask(name) {
    vscode.postMessage({ type: 'cancel', name });
  }

  function previewAsset(uri) {
    const m = uri.match(/\/v1\/(projects\/[^/]+\/assets\/.+)/);
    if (m) vscode.postMessage({ type: 'preview', assetName: m[1] });
  }

  function refresh() {
    vscode.postMessage({ type: 'refresh' });
  }

  function formatTime(t) {
    if (!t) return '';
    return new Date(t).toLocaleString();
  }

  // Messages from host
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'data') {
      allTasks = msg.tasks;
      isLoading = msg.loading;
      isRefreshing = false;
    } else if (msg.type === 'refreshStart') {
      isRefreshing = true;
    } else if (msg.type === 'loading') {
      isLoading = true;
    } else if (msg.type === 'cancelled') {
      allTasks = allTasks.map(t => t.name === msg.name ? { ...t, state: 'CANCELLING' } : t);
    } else if (msg.type === 'error') {
      isRefreshing = false;
      isLoading = false;
      alert(msg.message);
    }
  });
</script>

<div class="toolbar">
  <div class="filter-toggle" id="filterToggle">
    <label class:active={currentFilter === 'export'}>
      <input type="radio" name="filter" checked={currentFilter === 'export'} onchange={() => changeFilter('export')} />
      Export
    </label>
    <label class:active={currentFilter === 'import'}>
      <input type="radio" name="filter" checked={currentFilter === 'import'} onchange={() => changeFilter('import')} />
      Import
    </label>
    <span class="toggle-slider" style:left={currentFilter === 'export' ? '0' : '50%'} style:width="50%"></span>
  </div>

  <span class="page-info">{rangeText}</span>

  <button class="refresh-btn" class:loading={isRefreshing} disabled={isRefreshing} onclick={refresh}>
    <span class="refresh-icon">↻</span>
    <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
  </button>

  <ColumnPicker columns={ALL_COLS} bind:visibleCols onchange={saveState} />
</div>

<div class="table-wrap" class:loading={isLoading}>
  <table>
    <thead>
      <tr>
        {#each visCols as col}
          {#if col.key === 'icon'}
            <th class="icon-col"></th>
          {:else if col.key === 'actions'}
            <th>Actions</th>
          {:else}
            <th class:sorted={sortCol === col.key} onclick={() => handleSort(col.key)}>
              {col.label}
              <span class="sort-arrow">{sortCol === col.key ? (sortDir === 1 ? '▲' : '▼') : '▲'}</span>
            </th>
          {/if}
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each pageItems as t (t.name)}
        <tr>
          {#if visibleCols.has('icon')}
            <td class="icon-col">
              {#if t.state === 'RUNNING' || t.state === 'CANCELLING'}
                <span class="spinner"></span>
              {:else if t.state === 'SUCCEEDED'}
                <span class="dot succeeded"></span>
              {:else if t.state === 'FAILED'}
                <span class="dot failed"></span>
              {:else if t.state === 'CANCELLED'}
                <span class="dot cancelled"></span>
              {:else if t.state === 'PENDING'}
                <span class="dot pending"></span>
              {/if}
            </td>
          {/if}
          {#if visibleCols.has('state')}<td><span class="status">{t.state}</span></td>{/if}
          {#if visibleCols.has('description')}
            <td>
              {t.description}
              {#if t.error}<br /><span class="error-text">{t.error}</span>{/if}
            </td>
          {/if}
          {#if visibleCols.has('id')}<td class="id-cell" title={t.id}>{t.id}</td>{/if}
          {#if visibleCols.has('createTime')}<td>{formatTime(t.createTime)}</td>{/if}
          {#if visibleCols.has('startTime')}<td>{formatTime(t.startTime)}</td>{/if}
          {#if visibleCols.has('elapsed')}<td class="elapsed">{t.elapsed}</td>{/if}
          {#if visibleCols.has('attempt')}<td style="text-align:center">{t.attempt ?? ''}</td>{/if}
          {#if visibleCols.has('priority')}<td style="text-align:center">{t.priority ?? ''}</td>{/if}
          {#if visibleCols.has('computeUsage')}<td class="compute">{t.computeUsage != null ? t.computeUsage.toFixed(1) + ' EECU·s' : ''}</td>{/if}
          {#if visibleCols.has('actions')}
            <td class="actions-cell">
              {#if t.state === 'RUNNING' || t.state === 'PENDING'}
                <button class="action-btn danger" title="Cancel task" onclick={() => cancelTask(t.name)}>
                  {@html saved.icons.cancel}
                </button>
              {/if}
              {#if t.state === 'SUCCEEDED' && t.destinationUris?.length > 0}
                <button class="action-btn" title="Preview asset" onclick={() => previewAsset(t.destinationUris[0])}>
                  {@html saved.icons.preview}
                </button>
              {/if}
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<Pagination bind:currentPage {totalPages} bind:pageSize onPageSizeChange={saveState} />
