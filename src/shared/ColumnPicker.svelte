<!-- ColumnPicker: toggleable dropdown for column visibility -->
<script>
  let { columns, visibleCols = $bindable() } = $props();
  let open = $state(false);

  function toggle(key) {
    if (visibleCols.has(key)) {
      visibleCols.delete(key);
    } else {
      visibleCols.add(key);
    }
    visibleCols = new Set(visibleCols);
  }

  function handleClick(e) {
    e.stopPropagation();
    open = !open;
  }
</script>

<svelte:document onclick={() => open = false} />

<div class="col-picker-wrap">
  <button class="col-picker-btn" title="Choose columns" onclick={handleClick}>⚙</button>
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="col-picker" onclick={(e) => e.stopPropagation()}>
      {#each columns.filter(c => c.label) as col}
        <label class="col-item" class:required={col.required}>
          <input
            type="checkbox"
            checked={visibleCols.has(col.key)}
            disabled={col.required}
            onchange={() => toggle(col.key)}
          />
          {col.label}
        </label>
      {/each}
    </div>
  {/if}
</div>
