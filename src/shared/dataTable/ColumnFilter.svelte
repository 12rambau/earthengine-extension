<!-- ColumnFilter: header popover for a declarative data-table column filter -->
<script>
  let { column, filter, open = false, align = 'end', onchange, onopenchange } = $props();

  let wrap = $state(null);

  const active = $derived(filter !== undefined);
  const filterKind = $derived(column.filter?.kind);

  function setText(query) {
    onchange?.(query ? { kind: 'text', query } : undefined);
  }

  function toggleOption(value) {
    const selected = filter?.kind === 'enum' ? filter.values : [];
    const values = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
    onchange?.(values.length ? { kind: 'enum', values } : undefined);
  }

  function setComparison(field, value) {
    const current = filter?.kind === filterKind
      ? filter
      : { kind: filterKind, operator: filterKind === 'date' ? 'equals' : 'equals', value: '' };
    const next = { ...current, [field]: value };
    onchange?.(next.value === '' ? undefined : next);
  }

  function closeOnEscape(event) {
    if (open && event.key === 'Escape') {
      onopenchange?.(false);
    }
  }
</script>

<svelte:document onclick={(event) => { if (open && !wrap?.contains(event.target)) {onopenchange?.(false);} }} onkeydown={closeOnEscape} />

<div class="wrap" bind:this={wrap}>
  <button
    class="filter-trigger"
    class:active
    aria-label={`Filter ${column.label}`}
    title={`Filter ${column.label}`}
    onclick={(event) => { event.stopPropagation(); onopenchange?.(!open); }}
  >
    <i class:codicon-filter-filled={active} class:codicon-filter={!active} class="codicon"></i>
  </button>

  {#if open}
    <div class="menu" class:align-start={align === 'start'}>
      {#if filterKind === 'text'}
        <input
          class="text-input"
          type="search"
          value={filter?.kind === 'text' ? filter.query : ''}
          aria-label={`Filter ${column.label}`}
          placeholder="Contains"
          oninput={(event) => setText(event.currentTarget.value)}
        />
      {:else if filterKind === 'enum'}
        <div class="options">
          {#each column.filter.options ?? [] as option}
            <label class="option">
              <input
                type="checkbox"
                checked={filter?.kind === 'enum' && filter.values.includes(option)}
                onchange={() => toggleOption(option)}
              />
              {option}
            </label>
          {/each}
        </div>
      {:else if filterKind === 'date' || filterKind === 'number'}
        <div class="comparison">
          <select
            aria-label={`Filter operator for ${column.label}`}
            value={filter?.kind === filterKind ? filter.operator : 'equals'}
            onchange={(event) => setComparison('operator', event.currentTarget.value)}
          >
            <option value="equals">Is</option>
            <option value="notEquals">Is not</option>
            {#if filterKind === 'date'}
              <option value="before">Before</option>
              <option value="after">After</option>
            {:else}
              <option value="lessThan">Less than</option>
              <option value="greaterThan">Greater than</option>
            {/if}
          </select>
          <input
            type={filterKind === 'date' ? 'date' : 'number'}
            value={filter?.kind === filterKind ? filter.value : ''}
            aria-label={`Filter value for ${column.label}`}
            oninput={(event) => setComparison('value', event.currentTarget.value)}
          />
        </div>
      {/if}

      {#if active}
        <button class="clear" onclick={() => onchange?.(undefined)}>
          <i class="codicon codicon-clear-all"></i>
          Clear filter
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ==================================================================
     FILTER TRIGGER
     ================================================================== */
  .wrap {
    display: inline-flex;
    position: relative;
  }

  .filter-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--vscee-radius-sm);
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0.55;

    &:hover,
    &.active {
      background: var(--vscode-list-hoverBackground);
      opacity: 1;
    }
    &.active { color: var(--vscode-button-background); }
  }

  /* ==================================================================
     FILTER MENU
     ================================================================== */
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 30;
    min-width: 180px;
    padding: var(--vscee-space-sm);
    background: var(--vscode-editorWidget-background);
    border: var(--vscee-border-sm) solid var(--vscode-widget-border);
    border-radius: var(--vscee-radius-md);
    box-shadow: 0 2px 8px var(--vscode-widget-shadow);

    &.align-start {
      right: auto;
      left: 0;
    }
  }

  .text-input,
  select,
  input[type='date'],
  input[type='number'] {
    width: 100%;
    min-height: 28px;
    padding: var(--vscee-space-xs) var(--vscee-space-sm);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: var(--vscee-border-sm) solid var(--vscode-input-border);
    border-radius: var(--vscee-radius-sm);
    font: inherit;
  }

  .options {
    display: grid;
    gap: var(--vscee-space-xxs);
  }

  .option {
    display: flex;
    align-items: center;
    gap: var(--vscee-space-sm);
    padding: var(--vscee-space-xs);
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: var(--vscee-font-sm);

    &:hover { background: var(--vscode-list-hoverBackground); }
  }

  .comparison {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--vscee-space-xs);
  }

  .clear {
    display: inline-flex;
    align-items: center;
    gap: var(--vscee-space-sm);
    width: 100%;
    margin-top: var(--vscee-space-sm);
    padding: var(--vscee-space-xs);
    background: transparent;
    color: var(--vscode-textLink-foreground);
    border: none;
    border-radius: var(--vscee-radius-sm);
    cursor: pointer;
    font: inherit;
    font-size: var(--vscee-font-sm);

    &:hover { background: var(--vscode-list-hoverBackground); }
  }
</style>