<!-- AssetsPanel: sortable/paginated asset table with breadcrumb, column picker, actions -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';
  import Pagination from '../../shared/Pagination.svelte';
  import ColumnPicker from '../../shared/ColumnPicker.svelte';

  const saved = getInitData();

  const ALL_COLS = [
    { key: 'icon', label: '', required: true },
    { key: 'shortName', label: 'Name', required: true },
    { key: 'type', label: 'Type' },
    { key: 'assetId', label: 'Asset ID' },
    { key: 'actions', label: 'Actions', required: true },
  ];

  const CONTAINER_TYPES = new Set(['FOLDER', 'IMAGE_COLLECTION']);

  let visibleCols = $state(new Set(saved.visibleCols || ALL_COLS.map(c => c.key)));
  ALL_COLS.filter(c => c.required).forEach(c => visibleCols.add(c.key));
  let pageSize = $state(saved.pageSize || 50);

  let assets = $state([]);
  let currentParent = $state('');
  let rootPath = $state('');
  let isLoading = $state(true);
  let currentPage = $state(0);
  let sortCol = $state('shortName');
  let sortDir = $state(1);
  let busyAssets = $state(new Map());

  // Derived
  let sorted = $derived.by(() => {
    return [...assets].sort((a, b) => {
      if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
      const va = (a[sortCol] || '').toLowerCase();
      const vb = (b[sortCol] || '').toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  });

  let totalPages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
  let pageItems = $derived(sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize));
  let rangeText = $derived.by(() => {
    if (sorted.length === 0) return '0 assets';
    const start = currentPage * pageSize + 1;
    const end = Math.min((currentPage + 1) * pageSize, sorted.length);
    return `${start}–${end} of ${sorted.length} assets`;
  });

  let visCols = $derived(ALL_COLS.filter(c => visibleCols.has(c.key)));

  let breadcrumbParts = $derived.by(() => {
    const parts = [{ label: rootPath.split('/')[1] || rootPath, path: rootPath }];
    if (currentParent !== rootPath && currentParent.includes('/assets/')) {
      const assetsIdx = currentParent.indexOf('/assets/');
      const relative = currentParent.substring(assetsIdx + '/assets/'.length);
      let accumulated = rootPath + '/assets';
      for (const part of relative.split('/')) {
        accumulated += '/' + part;
        parts.push({ label: part, path: accumulated });
      }
    }
    return parts;
  });

  function saveState() {
    vscode.postMessage({ type: 'savePrefs', visibleCols: [...visibleCols], pageSize });
  }

  function handleSort(key) {
    if (key === 'icon' || key === 'actions') return;
    if (sortCol === key) { sortDir *= -1; }
    else { sortCol = key; sortDir = 1; }
  }

  function navigate(path) {
    currentPage = 0;
    isLoading = true;
    vscode.postMessage({ type: 'navigate', path });
  }

  function goUp() {
    if (currentParent === rootPath) return;
    const parts = currentParent.split('/');
    navigate(parts.length <= 4 ? rootPath : parts.slice(0, -1).join('/'));
  }

  function refresh() {
    isLoading = true;
    vscode.postMessage({ type: 'refresh' });
  }

  function newFolder() {
    const parent = currentParent === rootPath ? rootPath + '/assets' : currentParent;
    vscode.postMessage({ type: 'action', action: 'createFolder', name: parent });
  }

  function preview(name) {
    vscode.postMessage({ type: 'preview', name });
  }

  function assetAction(action, name) {
    busyAssets.set(name, action);
    busyAssets = new Map(busyAssets);
    vscode.postMessage({ type: 'action', action, name });
  }

  function formatType(t) {
    return (t || '').toLowerCase().replace(/_/g, ' ');
  }

  function isBusy(name) {
    return busyAssets.has(name);
  }

  // Messages from host
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'data') {
      assets = msg.assets;
      currentParent = msg.parent;
      rootPath = msg.root;
      isLoading = msg.loading;
    } else if (msg.type === 'loading') {
      isLoading = true;
    } else if (msg.type === 'actionDone') {
      busyAssets.delete(msg.name);
      busyAssets = new Map(busyAssets);
    } else if (msg.type === 'error') {
      isLoading = false;
      alert(msg.message);
    }
  });
</script>

<h1>Asset Manager</h1>

<div class="topbar">
  <div class="topbar-left">
    <button class="btn-primary" title="Create a new folder" onclick={newFolder}>+ New</button>
    <button class="btn-primary" class:loading={isLoading} disabled={isLoading} onclick={refresh}>
      <span class="refresh-icon">⟳</span>
      <span>{isLoading ? 'Refreshing…' : 'Refresh'}</span>
    </button>
    <button title="Go to parent" disabled={currentParent === rootPath} onclick={goUp}>↑</button>
    <div class="breadcrumb">
      {#each breadcrumbParts as part, i}
        {#if i > 0}<span class="sep"> / </span>{/if}
        <button onclick={() => navigate(part.path)}>{part.label}</button>
      {/each}
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:6px;">
    <span class="page-info">{rangeText}{#if isLoading} <span class="spinner-inline"></span>{/if}</span>
    <ColumnPicker columns={ALL_COLS} bind:visibleCols onchange={saveState} />
  </div>
</div>

<div class="table-wrap" class:loading={isLoading}>
  <table>
    <thead>
      <tr>
        {#each visCols as col}
          {#if col.key === 'icon'}
            <th></th>
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
      {#each pageItems as a (a.name)}
        <tr class:busy={isBusy(a.name)}>
          {#if visibleCols.has('icon')}
            <td class="icon-col">
              {#if a.type === 'FOLDER'}
                <i class="codicon codicon-folder"></i>
              {:else if a.type === 'IMAGE_COLLECTION'}
                <i class="codicon codicon-layers" style="color:var(--vscode-charts-blue)"></i>
              {:else if a.type === 'IMAGE'}
                <i class="codicon codicon-file-media" style="color:var(--vscode-charts-orange)"></i>
              {:else if a.type === 'TABLE'}
                <i class="codicon codicon-table" style="color:var(--vscode-charts-green)"></i>
              {/if}
            </td>
          {/if}
          {#if visibleCols.has('shortName')}
            <td>
              {#if a.isContainer}
                <button class="name-link" onclick={() => navigate(a.name)}>{a.shortName}</button>
              {:else}
                <span class="name-text">{a.shortName}</span>
              {/if}
            </td>
          {/if}
          {#if visibleCols.has('type')}<td>{formatType(a.type)}</td>{/if}
          {#if visibleCols.has('assetId')}<td class="id-cell" title={a.assetId}>{a.assetId}</td>{/if}
          {#if visibleCols.has('actions')}
            <td class="actions-cell">
              {#if a.type === 'FOLDER'}
                <button class="action-btn" title="New folder" disabled={isBusy(a.name)} onclick={() => assetAction('createFolder', a.name)}>
                  <i class="codicon codicon-new-folder"></i>
                </button>
              {:else}
                <button class="action-btn" title="Preview" disabled={isBusy(a.name)} onclick={() => preview(a.name)}>
                  <i class="codicon codicon-preview"></i>
                </button>
              {/if}
              <button class="action-btn" title="Copy asset" disabled={isBusy(a.name)} onclick={() => assetAction('copy', a.name)}>
                <i class="codicon codicon-copy"></i>
              </button>
              <button class="action-btn" title="Move asset" disabled={isBusy(a.name)} onclick={() => assetAction('move', a.name)}>
                <i class="codicon codicon-move"></i>
              </button>
              <button class="action-btn danger" title="Delete asset" disabled={isBusy(a.name)} onclick={() => assetAction('delete', a.name)}>
                <i class="codicon codicon-trash"></i>
              </button>
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<Pagination bind:currentPage {totalPages} bind:pageSize onPageSizeChange={saveState} />
