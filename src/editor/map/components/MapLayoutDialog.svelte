<!-- MapLayoutDialog: build a map split tree and assign layers to its panes -->
<script>
  import { onMount } from 'svelte';

  let { layers = [], initial = null, onapply, oncancel } = $props();

  const MAP_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
  const DIRECTIONS = [
    { id: 'top', label: 'Above' },
    { id: 'right', label: 'Right' },
    { id: 'bottom', label: 'Below' },
    { id: 'left', label: 'Left' },
  ];

  function mapNumbers(node) {
    return 'map' in node ? [node.map] : [...mapNumbers(node.first), ...mapNumbers(node.second)];
  }

  function getStartingState() {
    const tree = initial?.tree ?? { map: 1 };
    const layerIds = new Set(layers.map((layer) => layer.layerIndex));
    const assigned = new Set();
    const panes = Array.from({ length: MAP_NUMBERS.length }, (_, index) =>
      (initial?.panes?.[initial.mapIds?.indexOf(index + 1) ?? index] ?? []).filter((id) => {
        if (!layerIds.has(id) || assigned.has(id)) {
          return false;
        }
        assigned.add(id);
        return true;
      }),
    );
    panes[0].push(
      ...layers.filter((layer) => !assigned.has(layer.layerIndex)).map((layer) => layer.layerIndex),
    );
    return { tree, panes };
  }

  const starting = getStartingState();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let dialog;
  let tree = $state(starting.tree);
  let panes = $state(starting.panes);
  let selectedLayer = $state(null);
  let selectedMap = $state(null);
  let draggingMap = $state(null);
  let hoveredSplit = $state(null);

  // ----------------------------------------------------------------
  // DERIVED
  // ----------------------------------------------------------------
  let placedMaps = $derived(mapNumbers(tree));

  onMount(() => dialog.showModal());

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function replaceMap(node, target, replacement) {
    if ('map' in node) {
      return node.map === target ? replacement : node;
    }
    return {
      direction: node.direction,
      ratio: node.ratio,
      first: replaceMap(node.first, target, replacement),
      second: replaceMap(node.second, target, replacement),
    };
  }

  function insertMap(node, mapNumber, target, side) {
    const newMap = { map: mapNumber };
    const oldMap = { map: target };
    const before = side === 'top' || side === 'left';
    return replaceMap(node, target, {
      direction: side === 'top' || side === 'bottom' ? 'rows' : 'columns',
      ratio: 0.5,
      first: before ? newMap : oldMap,
      second: before ? oldMap : newMap,
    });
  }

  function largestPane(node, width = 1, height = 1) {
    if ('map' in node) {
      return { map: node.map, width, height };
    }
    const first =
      node.direction === 'rows'
        ? largestPane(node.first, width, height * (node.ratio ?? 0.5))
        : largestPane(node.first, width * (node.ratio ?? 0.5), height);
    const second =
      node.direction === 'rows'
        ? largestPane(node.second, width, height * (1 - (node.ratio ?? 0.5)))
        : largestPane(node.second, width * (1 - (node.ratio ?? 0.5)), height);
    return first.width * first.height >= second.width * second.height ? first : second;
  }

  function setCount(nextCount) {
    let updatedTree = tree;
    const updatedPanes = panes.map((pane) => [...pane]);
    for (let number = placedMaps.length + 1; number <= nextCount; number++) {
      const target = largestPane(updatedTree);
      updatedTree = insertMap(
        updatedTree,
        number,
        target.map,
        target.width >= target.height ? 'right' : 'bottom',
      );
    }
    for (let number = placedMaps.length; number > nextCount; number--) {
      updatedTree = removeMap(updatedTree, number);
      updatedPanes[0].push(...updatedPanes[number - 1]);
      updatedPanes[number - 1] = [];
    }
    tree = updatedTree;
    panes = updatedPanes;
    selectedMap = null;
    draggingMap = null;
    hoveredSplit = null;
  }

  function splitMap(mapNumber, target, side) {
    if (
      mapNumber === 1 ||
      mapNumber === target ||
      !placedMaps.includes(mapNumber) ||
      !placedMaps.includes(target)
    ) {
      return;
    }
    tree = insertMap(removeMap(tree, mapNumber), mapNumber, target, side);
    selectedMap = null;
    draggingMap = null;
    hoveredSplit = null;
  }

  function removeMap(node, mapNumber) {
    if ('map' in node) {
      return node.map === mapNumber ? null : node;
    }
    const first = removeMap(node.first, mapNumber);
    const second = removeMap(node.second, mapNumber);
    if (!first) {
      return second;
    }
    if (!second) {
      return first;
    }
    return { direction: node.direction, ratio: node.ratio, first, second };
  }

  function dropMap(event, target, side) {
    event.preventDefault();
    event.stopPropagation();
    const mapNumber = Number(event.dataTransfer.getData('application/x-vscee-map'));
    if (MAP_NUMBERS.includes(mapNumber)) {
      splitMap(mapNumber, target, side);
    }
  }

  function moveLayer(layerIndex, destination) {
    if (!layers.some((layer) => layer.layerIndex === layerIndex)) {
      return;
    }
    const updated = panes.map((pane) => pane.filter((id) => id !== layerIndex));
    updated[destination - 1].push(layerIndex);
    panes = updated;
    selectedLayer = null;
  }

  function startDrag(event, layerIndex) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(layerIndex));
    selectedLayer = layerIndex;
  }

  function dropLayer(event, destination) {
    event.preventDefault();
    const layerIndex = Number(event.dataTransfer.getData('text/plain'));
    if (event.dataTransfer.types.includes('text/plain')) {
      moveLayer(layerIndex, destination);
    }
  }

  function apply() {
    onapply?.({
      count: placedMaps.length,
      tree: $state.snapshot(tree),
      mapIds: [...placedMaps],
      panes: placedMaps.map((number) => [...panes[number - 1]]),
    });
  }
</script>

<dialog bind:this={dialog} onclose={oncancel} aria-labelledby="map-layout-title">
  <header class="dialog-header">
    <h2 id="map-layout-title">Map layout</h2>
    <button class="icon-button" title="Close" aria-label="Close" onclick={() => dialog.close()}>
      <i class="codicon codicon-close" aria-hidden="true"></i>
    </button>
  </header>

  <div class="dialog-body">
    <!-- MAP COUNT -->
    <div class="map-count" role="group" aria-label="Number of maps">
      {#each MAP_NUMBERS as number}
        <button
          class:chosen={placedMaps.length === number}
          aria-pressed={placedMaps.length === number}
          title={`${number} ${number === 1 ? 'map' : 'maps'}`}
          onclick={() => setCount(number)}>{number}</button
        >
      {/each}
    </div>

    <!-- SPLIT CANVAS -->
    <div class="workspace">
      {#snippet renderNode(node)}
        {#if 'map' in node}
          <section
            class="pane"
            aria-label={`Map ${node.map}`}
            ondragover={(event) => {
              if (event.dataTransfer.types.includes('text/plain')) {
                event.preventDefault();
              }
            }}
            ondrop={(event) => dropLayer(event, node.map)}
          >
            <div class="pane-heading">
              {#if node.map === 1}
                <span>Map 1</span>
              {:else}
                <button
                  class="pane-title"
                  class:selected={selectedMap === node.map}
                  aria-pressed={selectedMap === node.map}
                  draggable="true"
                  title={`Move map ${node.map} to split another map`}
                  ondragstart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/x-vscee-map', String(node.map));
                    draggingMap = node.map;
                  }}
                  ondragend={() => {
                    draggingMap = null;
                    hoveredSplit = null;
                  }}
                  onclick={() => (selectedMap = selectedMap === node.map ? null : node.map)}
                >
                  <i class="codicon codicon-gripper" aria-hidden="true"></i>
                  Map {node.map}
                </button>
              {/if}
              {#if selectedLayer !== null}
                <button
                  class="place-button"
                  title={`Move selected layer to map ${node.map}`}
                  onclick={() => moveLayer(selectedLayer, node.map)}
                >
                  <i class="codicon codicon-add" aria-hidden="true"></i>
                </button>
              {/if}
            </div>
            {#each panes[node.map - 1] as layerIndex (layerIndex)}
              {@const layer = layers.find((item) => item.layerIndex === layerIndex)}
              {#if layer}
                <button
                  class="layer"
                  class:selected={selectedLayer === layerIndex}
                  draggable="true"
                  aria-pressed={selectedLayer === layerIndex}
                  title={layer.name}
                  ondragstart={(event) => startDrag(event, layerIndex)}
                  onclick={() => (selectedLayer = layerIndex)}
                >
                  <i class="codicon codicon-gripper" aria-hidden="true"></i>
                  <span>{layer.name}</span>
                </button>
              {/if}
            {/each}
            {#if (draggingMap !== null && draggingMap !== node.map) || (selectedMap !== null && selectedMap !== node.map)}
              <div
                class="split-preview {hoveredSplit?.map === node.map ? hoveredSplit.side : 'right'}"
                class:active={hoveredSplit?.map === node.map}
                aria-hidden="true"
              >
                <span>Map {draggingMap ?? selectedMap}</span>
              </div>
              <div class="split-targets">
                {#each DIRECTIONS as side}
                  <button
                    class="split-target {side.id}"
                    title={`Split map ${node.map}: ${side.label.toLowerCase()}`}
                    aria-label={`Add map ${selectedMap ?? draggingMap} ${side.label.toLowerCase()} map ${node.map}`}
                    ondragover={(event) => {
                      if (event.dataTransfer.types.includes('application/x-vscee-map')) {
                        event.preventDefault();
                        hoveredSplit = { map: node.map, side: side.id };
                      }
                    }}
                    ondragleave={(event) => {
                      if (event.target === event.currentTarget) {
                        hoveredSplit = null;
                      }
                    }}
                    ondrop={(event) => dropMap(event, node.map, side.id)}
                    onpointerenter={() => {
                      if (selectedMap !== null && draggingMap === null) {
                        hoveredSplit = { map: node.map, side: side.id };
                      }
                    }}
                    onpointerleave={() => {
                      if (draggingMap === null) {
                        hoveredSplit = null;
                      }
                    }}
                    onfocus={() => {
                      if (selectedMap !== null && draggingMap === null) {
                        hoveredSplit = { map: node.map, side: side.id };
                      }
                    }}
                    onblur={() => (hoveredSplit = null)}
                    onclick={() => selectedMap !== null && splitMap(selectedMap, node.map, side.id)}
                  ></button>
                {/each}
              </div>
            {/if}
          </section>
        {:else}
          <div class="split" class:rows={node.direction === 'rows'}>
            <div class="split-child" style:flex-grow={node.ratio ?? 0.5}>
              {@render renderNode(node.first)}
            </div>
            <div class="split-child" style:flex-grow={1 - (node.ratio ?? 0.5)}>
              {@render renderNode(node.second)}
            </div>
          </div>
        {/if}
      {/snippet}
      <div class="preview">{@render renderNode(tree)}</div>
    </div>
  </div>

  <footer>
    <button class="secondary" onclick={() => dialog.close()}>Cancel</button>
    <button class="primary" onclick={apply}>Apply</button>
  </footer>
</dialog>

<style>
  dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(820px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 6px;
    background: var(--vscode-editorWidget-background);
    color: var(--vscode-editorWidget-foreground);
    box-shadow: 0 8px 24px var(--vscode-widget-shadow);
    overflow: auto;
  }
  dialog::backdrop {
    background: var(--vscode-editor-background);
    opacity: 0.75;
  }
  .dialog-header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
  }
  .dialog-header {
    border-bottom: 1px solid var(--vscode-editorWidget-border);
  }
  h2 {
    font-size: 15px;
    font-weight: 600;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .icon-button,
  .place-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 0;
    background: transparent;
    color: inherit;
    &:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
  }
  .dialog-body {
    padding: 16px;
  }
  .map-count {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 16px;
  }
  .map-count button {
    min-width: 36px;
    height: 32px;
    border: 1px solid var(--vscode-button-secondaryBackground);
    border-radius: 4px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    &.chosen {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
  }
  .workspace {
    min-width: 0;
  }
  .preview {
    height: 400px;
    min-width: 0;
    min-height: 0;
  }
  .split {
    display: flex;
    gap: 4px;
    width: 100%;
    height: 100%;
    &.rows {
      flex-direction: column;
    }
  }
  .split-child {
    flex-basis: 0;
    min-width: 0;
    min-height: 0;
  }
  .pane {
    position: relative;
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--vscode-editorWidget-border);
    background: var(--vscode-editor-background);
    overflow: auto;
  }
  .pane {
    height: 100%;
  }
  .pane-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 26px;
    font-weight: 600;
  }
  .pane-title {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: grab;
    &.selected {
      outline: 1px solid var(--vscode-focusBorder);
    }
  }
  .split-preview {
    position: absolute;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 50%;
    height: 100%;
    background: var(--vscode-editor-selectionBackground);
    box-shadow: inset 0 0 0 2px var(--vscode-focusBorder);
    color: var(--vscode-editor-foreground);
    pointer-events: none;
    opacity: 0;
    transform: scale(0.94);
    transition:
      opacity 160ms ease-out,
      transform 160ms ease-out;
    &.active {
      opacity: 1;
      transform: scale(1);
    }
    &.left {
      top: 0;
      left: 0;
    }
    &.right {
      top: 0;
      right: 0;
    }
    &.top {
      top: 0;
      left: 0;
      width: 100%;
      height: 50%;
    }
    &.bottom {
      bottom: 0;
      left: 0;
      width: 100%;
      height: 50%;
    }
    span {
      padding: 4px 8px;
      background: var(--vscode-editorWidget-background);
    }
  }
  .split-targets {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    grid-template: repeat(3, 1fr) / repeat(3, 1fr);
    pointer-events: none;
  }
  .split-target {
    pointer-events: auto;
    border: 0;
    background: transparent;
    &:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
    }
    &.top {
      grid-area: 1 / 1 / 2 / 4;
    }
    &.right {
      grid-area: 2 / 3;
    }
    &.bottom {
      grid-area: 3 / 1 / 4 / 4;
    }
    &.left {
      grid-area: 2 / 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .split-preview {
      transition: none;
    }
  }
  .layer {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: 6px;
    padding: 5px 6px;
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 3px;
    background: var(--vscode-list-hoverBackground);
    color: var(--vscode-editor-foreground);
    text-align: left;
    &.selected {
      outline: 1px solid var(--vscode-focusBorder);
    }
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  footer {
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--vscode-editorWidget-border);
  }
  footer button {
    padding: 5px 12px;
    border-radius: 4px;
  }
  .secondary {
    border: 1px solid var(--vscode-button-secondaryBackground);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .primary {
    border: 1px solid var(--vscode-button-background);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  @media (max-width: 580px) {
    .preview {
      height: 320px;
    }
  }
</style>
