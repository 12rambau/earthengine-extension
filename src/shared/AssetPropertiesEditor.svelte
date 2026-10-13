<!-- AssetPropertiesEditor: inline editable Earth Engine property rows -->
<script>
  let { metadata, rows = $bindable([]), editing = false, saving = false } = $props();

  function addProperty() {
    rows = [...rows, { key: '', value: '', kind: 'string' }];
  }

  function removeProperty(row) {
    rows = rows.filter((item) => item !== row);
  }

  function displayValue(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
</script>

{#if editing}
  <div class="properties-editor">
    <div class="property-rows">
      {#each rows as row (row)}
        <div class="property-row">
          <input aria-label="Property name" placeholder="Property" bind:value={row.key} disabled={saving} />
          <input aria-label="Value for {row.key || 'new property'}" placeholder="Value" bind:value={row.value} disabled={saving} />
          <select aria-label="Type for {row.key || 'new property'}" bind:value={row.kind} disabled={saving}>
            <option value="string">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="json">JSON</option>
          </select>
          <button type="button" class="remove-property" title="Remove property" aria-label="Remove property {row.key}" disabled={saving} onclick={() => removeProperty(row)}><i class="codicon codicon-trash" aria-hidden="true"></i></button>
        </div>
      {/each}
    </div>
    <button type="button" class="add-property" disabled={saving} onclick={addProperty}>+ Add property</button>
  </div>
{:else if metadata.propertyEntries.length}
  <table class="props-table">
    <thead><tr><th>Property</th><th>Value</th></tr></thead>
    <tbody>
      {#each metadata.propertyEntries as [key, value]}
        <tr><td>{key}</td><td>{displayValue(value)}</td></tr>
      {/each}
    </tbody>
  </table>
{:else}
  <p class="empty-state">No properties.</p>
{/if}

<style>
  .properties-editor {
    padding-top: var(--vscee-space-xl);
  }
  .property-rows {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-xxs);
  }
  .property-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--vscee-space-xxs);
    padding: var(--vscee-space-xxs);
    border-radius: var(--vscee-radius-sm);
    background: var(--vscee-color-editor-widget-background);
  }
  input, select {
    min-width: 0;
    background: var(--vscee-color-input-background);
    color: var(--vscee-color-input-foreground);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
    border-radius: var(--vscee-radius-md);
    font: inherit;
    padding: var(--vscee-space-xxs) var(--vscee-space-xs);
  }
  input:first-child { flex: 1 1 130px; }
  input:nth-child(2) { flex: 2 1 180px; }
  select { flex: 0 0 86px; }
  .remove-property {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--vscee-color-foreground);
    opacity: 0.65;
    cursor: pointer;
  }
  .add-property {
    margin-top: var(--vscee-space-sm);
    padding: var(--vscee-space-xs) var(--vscee-space-md);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
    border-radius: var(--vscee-radius-md);
    background: var(--vscee-color-button-secondary-background);
    color: var(--vscee-color-button-secondary-foreground);
    cursor: pointer;
  }
  .add-property:hover { background: var(--vscee-color-button-secondary-hover); }
  button:disabled { opacity: 0.5; cursor: default; }
</style>