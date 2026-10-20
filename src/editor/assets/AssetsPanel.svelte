<!-- AssetsPanel: sortable/paginated asset table with breadcrumb, column picker, actions -->
<script>
  import { vscode, getInitData } from '../../shared/vscode.ts';
  import { mdiImage, mdiImageMultiple, mdiTableMultiple } from '../../shared/icons.ts';
  import DataTable from '../components/DataTable.svelte';
  import TableButton from '../components/TableButton.svelte';
  import { createDataTable } from '../components/dataTable.svelte.ts';
  import NewAssetDialog from './NewAssetDialog.svelte';
  import CollectionDialog from './CollectionDialog.svelte';

  const saved = getInitData();

  const ALL_COLS = [
    { key: 'selection', label: '', required: true },
    { key: 'icon', label: '', required: true },
    {
      key: 'shortName',
      label: 'Name',
      required: true,
      sortable: true,
      filter: { kind: 'text' },
      accessor: (a) => a.shortName,
      compare: (left, right, direction) => {
        if (left.isContainer !== right.isContainer) {
          return left.isContainer ? -1 : 1;
        }
        return (
          left.shortName.localeCompare(right.shortName, undefined, { sensitivity: 'base' }) *
          direction
        );
      },
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      filter: { kind: 'enum', options: ['FOLDER', 'IMAGE', 'IMAGE_COLLECTION', 'TABLE'] },
      accessor: (a) => a.type,
    },
    {
      key: 'assetId',
      label: 'Asset ID',
      sortable: true,
      filter: { kind: 'text' },
      accessor: (a) => a.assetId,
    },
    { key: 'actions', label: 'Actions', required: true },
  ];

  let table = createDataTable({
    columns: ALL_COLS,
    defaultPageSize: 50,
    defaultSort: { column: 'shortName', direction: 1 },
    preferences: saved,
  });

  let currentParent = $state('');
  let rootPath = $state('');
  let isLoading = $state(true);
  let busyAssets = $state(new Map());
  let selectedAssets = $state(new Set());
  let bulkBusy = $state(false);
  let selectedNames = $derived(
    table.pageRows.filter((asset) => selectedAssets.has(asset.name)).map((asset) => asset.name),
  );
  let allSelected = $derived(
    table.pageRows.length > 0 && table.pageRows.every((a) => selectedAssets.has(a.name)),
  );
  let pageHasSelection = $derived(table.pageRows.some((a) => selectedAssets.has(a.name)));

  $effect(() => {
    const visibleNames = new Set(table.pageRows.map((asset) => asset.name));
    const remaining = [...selectedAssets].filter((name) => visibleNames.has(name));
    if (remaining.length !== selectedAssets.size) {
      selectedAssets = new Set(remaining);
    }
  });

  let newMenuOpen = $state(false);
  let newMenuWrap = $state(null);
  let dialogKind = $state(null);
  let buckets = $state([]);
  let defaultBucket = $state('');
  let pickedFile = $state({ path: '', suggestedName: '', bandCount: 1 });
  let collectionSelection = $state(null);
  let collectionPicking = $state(false);
  let uploadBusy = $state(false);
  let uploadProgress = $state('');
  let uploadError = $state('');

  let targetFolder = $derived(currentParent === rootPath ? rootPath + '/assets' : currentParent);

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

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function saveState(preferences) {
    vscode.postMessage({ type: 'savePrefs', preferences });
  }

  function navigate(path) {
    table.currentPage = 0;
    selectedAssets = new Set();
    isLoading = true;
    vscode.postMessage({ type: 'navigate', path });
  }

  function goUp() {
    if (currentParent === rootPath) {
      return;
    }
    const parts = currentParent.split('/');
    navigate(parts.length <= 4 ? rootPath : parts.slice(0, -1).join('/'));
  }

  function refresh() {
    isLoading = true;
    vscode.postMessage({ type: 'refresh' });
  }

  function newFolder() {
    newMenuOpen = false;
    vscode.postMessage({ type: 'action', action: 'createFolder', name: targetFolder });
  }

  function openNewAsset(kind) {
    newMenuOpen = false;
    dialogKind = kind;
    pickedFile = { path: '', suggestedName: '', bandCount: 1 };
    collectionSelection = null;
    collectionPicking = false;
    vscode.postMessage({ type: 'clearCollectionFiles' });
    uploadError = '';
    uploadProgress = '';
    if (kind !== 'collection') {
      vscode.postMessage({ type: 'listBuckets' });
    }
  }

  function closeDialog() {
    dialogKind = null;
    uploadBusy = false;
    collectionPicking = false;
    vscode.postMessage({ type: 'clearCollectionFiles' });
  }

  function pickFile(kind) {
    vscode.postMessage({ type: 'pickFile', kind });
  }

  function startUpload(request) {
    uploadBusy = true;
    uploadError = '';
    uploadProgress = 'Preparing…';
    try {
      vscode.postMessage({ type: 'uploadAsset', request });
    } catch (err) {
      uploadBusy = false;
      uploadProgress = '';
      uploadError = `Could not send the request: ${err.message}`;
    }
  }

  function pickCollection() {
    collectionPicking = true;
    uploadError = '';
    vscode.postMessage({ type: 'pickCollectionFiles' });
  }

  function clearCollection() {
    collectionSelection = null;
    collectionPicking = false;
    vscode.postMessage({ type: 'clearCollectionFiles' });
  }

  function startCollection(request) {
    uploadBusy = true;
    uploadError = '';
    uploadProgress = 'Preparing…';
    vscode.postMessage({ type: 'createCollection', request });
  }

  function preview(name) {
    vscode.postMessage({ type: 'preview', name });
  }

  function assetAction(action, name) {
    busyAssets.set(name, action);
    busyAssets = new Map(busyAssets);
    vscode.postMessage({ type: 'action', action, name });
  }

  function toggleAsset(name) {
    const next = new Set(selectedAssets);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    selectedAssets = next;
  }

  function toggleAll() {
    const next = new Set(selectedAssets);
    for (const asset of table.pageRows) {
      if (allSelected) {
        next.delete(asset.name);
      } else {
        next.add(asset.name);
      }
    }
    selectedAssets = next;
  }

  function bulkAction(action) {
    if (bulkBusy || isLoading || selectedNames.length === 0) {
      return;
    }
    bulkBusy = true;
    vscode.postMessage({ type: 'bulkAction', action, names: selectedNames });
  }

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------
  function formatType(t) {
    return (t || '').toLowerCase().replace(/_/g, ' ');
  }

  function isBusy(name) {
    return busyAssets.has(name);
  }

  // Messages from host
  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'data') {
      if (currentParent && currentParent !== msg.parent) {
        selectedAssets = new Set();
      }
      table.setRows(msg.assets);
      if (!msg.loading) {
        const available = new Set(msg.assets.map((asset) => asset.name));
        selectedAssets = new Set([...selectedAssets].filter((name) => available.has(name)));
      }
      currentParent = msg.parent;
      rootPath = msg.root;
      isLoading = msg.loading;
    } else if (msg.type === 'loading') {
      isLoading = true;
    } else if (msg.type === 'actionDone') {
      busyAssets.delete(msg.name);
      busyAssets = new Map(busyAssets);
    } else if (msg.type === 'bulkDone') {
      bulkBusy = false;
      if (msg.changed) {
        selectedAssets = new Set();
      }
    } else if (msg.type === 'buckets') {
      buckets = msg.buckets;
      defaultBucket = msg.defaultBucket;
    } else if (msg.type === 'filePicked') {
      pickedFile = { path: msg.path, suggestedName: msg.suggestedName, bandCount: msg.bandCount };
    } else if (msg.type === 'collectionFiles') {
      collectionPicking = false;
      collectionSelection = msg.selection;
      vscode.postMessage({ type: 'listBuckets' });
    } else if (msg.type === 'collectionPickCancelled') {
      collectionPicking = false;
    } else if (msg.type === 'collectionError') {
      collectionPicking = false;
      uploadBusy = false;
      uploadError = msg.message;
    } else if (msg.type === 'uploadProgress') {
      uploadProgress = msg.message;
    } else if (msg.type === 'uploadDone') {
      closeDialog();
    } else if (msg.type === 'uploadError') {
      uploadBusy = false;
      uploadError = msg.message;
    } else if (msg.type === 'error') {
      isLoading = false;
      alert(msg.message);
    }
  });
</script>

<h1>Asset Manager</h1>

<svelte:document
  onclick={(e) => {
    if (!newMenuWrap?.contains(e.target)) {
      newMenuOpen = false;
    }
  }}
/>

<DataTable
  {table}
  itemLabel="assets"
  showToolbarEndSeparator={selectedNames.length > 0}
  loading={isLoading}
  rowKey={(asset) => asset.name}
  rowClass={(asset) => (isBusy(asset.name) ? 'busy' : '')}
  onpreferenceschange={saveState}
>
  {#snippet toolbar()}
    <div class="new-menu" bind:this={newMenuWrap}>
      <TableButton
        class="trigger"
        active={newMenuOpen}
        title="Create a new asset"
        onclick={(e) => {
          e.stopPropagation();
          newMenuOpen = !newMenuOpen;
        }}
      >
        <i class="codicon codicon-add"></i>
        New
        <i class="codicon codicon-chevron-down chevron" class:open={newMenuOpen}></i>
      </TableButton>
      {#if newMenuOpen}
        <div class="new-menu-items">
          <TableButton variant="menu" onclick={newFolder}>
            <i class="codicon codicon-folder"></i> New folder
          </TableButton>
          <TableButton variant="menu" onclick={() => openNewAsset('image')}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="var(--vscee-color-image)"
              ><path d={mdiImage} /></svg
            >
            New image
          </TableButton>
          <TableButton variant="menu" onclick={() => openNewAsset('collection')}>
            <i class="codicon codicon-layers"></i> New image collection
          </TableButton>
          <TableButton variant="menu" onclick={() => openNewAsset('table')}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="var(--vscee-color-table)"><path d={mdiTableMultiple} /></svg
            >
            New feature collection
          </TableButton>
        </div>
      {/if}
    </div>
    <TableButton variant="primary" class="btn-primary" loading={isLoading} disabled={isLoading} onclick={refresh}>
      <i class="codicon codicon-sync refresh-icon" aria-hidden="true"></i>
      <span>{isLoading ? 'Refreshing…' : 'Refresh'}</span>
    </TableButton>
    <TableButton title="Go to parent" aria-label="Go to parent" disabled={currentParent === rootPath} onclick={goUp}>
      <i class="codicon codicon-arrow-up"></i>
    </TableButton>
    <div class="breadcrumb">
      {#each breadcrumbParts as part, i}
        {#if i > 0}<span class="sep"> / </span>{/if}
        <TableButton variant="link" onclick={() => navigate(part.path)}>{part.label}</TableButton>
      {/each}
    </div>
  {/snippet}

  {#snippet toolbarEnd()}
    {#if selectedNames.length}
      <div class="bulk-actions">
        <span class="selection-count">{selectedNames.length} {selectedNames.length === 1 ? 'asset' : 'assets'} selected</span>
        <TableButton disabled={bulkBusy || isLoading} onclick={() => bulkAction('copy')}>
          <i class="codicon codicon-copy"></i> Copy
        </TableButton>
        <TableButton disabled={bulkBusy || isLoading} onclick={() => bulkAction('move')}>
          <i class="codicon codicon-clippy"></i> Move
        </TableButton>
        <TableButton danger disabled={bulkBusy || isLoading} onclick={() => bulkAction('delete')}>
          <i class="codicon codicon-trash"></i> Delete
        </TableButton>
      </div>
    {/if}
  {/snippet}

  {#snippet headerCell(column)}
    {#if column.key === 'selection'}
      <input
        type="checkbox"
        aria-label={allSelected ? 'Deselect all visible assets' : 'Select all visible assets'}
        title={allSelected ? 'Deselect all visible assets' : 'Select all visible assets'}
        checked={allSelected}
        indeterminate={!allSelected && pageHasSelection}
        disabled={bulkBusy || isLoading || table.pageRows.length === 0}
        onchange={toggleAll}
      />
    {:else}
      {column.label}
    {/if}
  {/snippet}

  {#snippet row(a, columns)}
    {@const visible = new Set(columns.map((column) => column.key))}
    {#if visible.has('selection')}
      <td class="selection-cell">
        <input
          type="checkbox"
          aria-label={`Select ${a.shortName}`}
          checked={selectedAssets.has(a.name)}
          disabled={bulkBusy || isLoading}
          onchange={() => toggleAsset(a.name)}
        />
      </td>
    {/if}
    {#if visible.has('icon')}
      <td class="icon-col">
        {#if a.type === 'FOLDER'}
          <i class="codicon codicon-folder"></i>
        {:else if a.type === 'IMAGE_COLLECTION'}
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
            fill="var(--vscee-color-image-collection)"><path d={mdiImageMultiple} /></svg
          >
        {:else if a.type === 'IMAGE'}
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
            fill="var(--vscee-color-image)"><path d={mdiImage} /></svg
          >
        {:else if a.type === 'TABLE'}
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
            fill="var(--vscee-color-table)"><path d={mdiTableMultiple} /></svg
          >
        {/if}
      </td>
    {/if}
    {#if visible.has('shortName')}
      <td>
        {#if a.isContainer}
          <TableButton variant="link" onclick={() => navigate(a.name)}>{a.shortName}</TableButton>
        {:else}
          <span class="name-text">{a.shortName}</span>
        {/if}
      </td>
    {/if}
    {#if visible.has('type')}<td>{formatType(a.type)}</td>{/if}
    {#if visible.has('assetId')}<td class="id-cell" title={a.assetId}>{a.assetId}</td>{/if}
    {#if visible.has('actions')}
      <td class="actions-cell">
        <span class="action-dots">
          <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
          <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
          <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
          <span class="action-dot"><i class="codicon codicon-circle-small-filled"></i></span>
        </span>
        <span class="action-btns">
          {#if a.type === 'FOLDER'}
            <TableButton
              class="action-btn"
              variant="ghost"
              size="compact"
              title="New folder"
              aria-label="New folder"
              disabled={bulkBusy || isBusy(a.name)}
              onclick={() => assetAction('createFolder', a.name)}
            >
              <i class="codicon codicon-new-folder"></i>
            </TableButton>
          {:else}
            <TableButton
              class="action-btn"
              variant="ghost"
              size="compact"
              title="Preview"
              aria-label="Preview"
              disabled={bulkBusy || isBusy(a.name)}
              onclick={() => preview(a.name)}
            >
              <i class="codicon codicon-open-preview"></i>
            </TableButton>
          {/if}
          <TableButton
            class="action-btn"
            variant="ghost"
            size="compact"
            title="Copy asset"
            aria-label="Copy asset"
            disabled={bulkBusy || isBusy(a.name)}
            onclick={() => assetAction('copy', a.name)}
          >
            <i class="codicon codicon-copy"></i>
          </TableButton>
          <TableButton
            class="action-btn"
            variant="ghost"
            size="compact"
            title="Move asset"
            aria-label="Move asset"
            disabled={bulkBusy || isBusy(a.name)}
            onclick={() => assetAction('move', a.name)}
          >
            <i class="codicon codicon-clippy"></i>
          </TableButton>
          <TableButton
            class="action-btn"
            variant="ghost"
            size="compact"
            danger
            title="Delete asset"
            aria-label="Delete asset"
            disabled={bulkBusy || isBusy(a.name)}
            onclick={() => assetAction('delete', a.name)}
          >
            <i class="codicon codicon-trash"></i>
          </TableButton>
        </span>
      </td>
    {/if}
  {/snippet}
</DataTable>

{#if dialogKind === 'collection'}
  <CollectionDialog
    parent={targetFolder}
    {buckets}
    {defaultBucket}
    selection={collectionSelection}
    loadingSource={collectionPicking}
    busy={uploadBusy}
    progress={uploadProgress}
    error={uploadError}
    onpick={pickCollection}
    onclear={clearCollection}
    onsubmit={startCollection}
    oncancel={closeDialog}
  />
{:else if dialogKind}
  <NewAssetDialog
    kind={dialogKind}
    parent={targetFolder}
    {buckets}
    {defaultBucket}
    file={pickedFile}
    busy={uploadBusy}
    progress={uploadProgress}
    error={uploadError}
    onpickfile={pickFile}
    onsubmit={startUpload}
    oncancel={closeDialog}
  />
{/if}

<style>
  :global {
    /* ==================================================================
       RESET & BASE LAYOUT
       ================================================================== */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }
    html,
    body {
      height: 100%;
      margin: 0;
    }
    body {
      font-family: var(--vscee-font-family, sans-serif);
      color: var(--vscee-color-foreground);
      background: var(--vscee-color-editor-background);
      padding: var(--vscee-space-lg) var(--vscee-space-xl) var(--vscee-space-md);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    /* Mount point must participate in body's flex column */
    #app {
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    h1 {
      font-size: var(--vscee-font-xxl);
      margin: 0 0 var(--vscee-space-md) 0;
      display: flex;
      align-items: center;
      gap: var(--vscee-space-md);
      flex-shrink: 0;
    }

    .topbar-left {
      flex-wrap: wrap;
    }

    /* ==================================================================
       BREADCRUMB
       ================================================================== */
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-xs);
      font-size: var(--vscee-font-md);
      flex-wrap: wrap;
      min-width: 0;

      .sep {
        opacity: 0.5;
      }
    }

    /* ==================================================================
       BUTTONS
       ================================================================== */
    select {
      background: var(--vscee-color-button-secondary-background);
      color: var(--vscee-color-button-secondary-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      border-radius: var(--vscee-radius-md);
      cursor: pointer;
      font-size: var(--vscee-font-sm);
    }
    .btn-primary.loading .refresh-icon {
      animation: spin 0.8s linear infinite;
    }

    /* ==================================================================
       NEW ASSET MENU
       ================================================================== */
    .new-menu {
      position: relative;

      .chevron {
        opacity: 0.7;
        transition: transform 0.15s;

        &.open {
          transform: rotate(180deg);
        }
      }
    }
    .new-menu-items {
      position: absolute;
      top: calc(100% + var(--vscee-space-xs));
      left: 0;
      z-index: 20;
      display: flex;
      flex-direction: column;
      min-width: 220px;
      padding: var(--vscee-space-xs);
      background: var(--vscee-color-dropdown-background);
      border: var(--vscee-border-sm) solid var(--vscee-color-dropdown-border);
      border-radius: var(--vscee-radius-md);
      box-shadow: var(--vscee-shadow-lg);
    }
    /* ==================================================================
       TABLE CELLS
       ================================================================== */
    td {
      padding: var(--vscee-space-sm) var(--vscee-space-md);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    }

    /* ==================================================================
       LOADING STATES
       ================================================================== */
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .refresh-icon {
      display: inline-block;
    }

    /* ==================================================================
       ASSET NAME & ICONS
       ================================================================== */
    .bulk-actions {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-md);
    }
    .selection-count {
      white-space: nowrap;
      font-size: var(--vscee-font-sm);
    }
    .selection-cell {
      width: 32px;
      text-align: center;
    }
    .icon-col {
      width: 24px;
      padding: var(--vscee-space-xs) var(--vscee-space-xs);
      text-align: center;

      .codicon {
        display: block;
        margin: auto;
        font-size: var(--vscee-font-icon-md);
      }
    }
    .id-cell {
      font-family: var(--vscee-editor-font-family, monospace);
      font-size: var(--vscee-font-xxs);
      opacity: 0.75;
    }

    /* ==================================================================
       ROW ACTIONS
       ================================================================== */
    .actions-cell {
      white-space: nowrap;
      text-align: right;
    }
    /* Idle rows show one dot per available action; hovering the row reveals the
       buttons. Each dot has the exact same footprint as an action button so the
       column width does not shift on hover. */
    .action-dots {
      display: inline-flex;
      align-items: center;
      height: 22px;
      opacity: 0.4;
    }
    .action-dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 22px;

      .codicon {
        font-size: var(--vscee-font-icon-sm);
      }
    }
    .action-btns {
      display: none;
      align-items: center;
      height: 22px;
    }
    tr {
      &:hover {
        background: var(--vscee-color-list-hover);
      }
      &:hover,
      &:focus-within,
      &.busy {
        .action-dots {
          display: none;
        }
        .action-btns {
          display: inline-flex;
        }
      }
      &.busy {
        .action-btn {
          opacity: 0.35;
          pointer-events: none;
        }
      }
    }
    .action-btn {
      box-sizing: border-box;
      width: 30px;
      padding: 0;
      opacity: 0.7;
      &:hover {
        opacity: 1;
      }
    }
  }
</style>
