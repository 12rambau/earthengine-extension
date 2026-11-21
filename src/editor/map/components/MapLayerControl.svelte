<!-- MapLayerControl: layer list, visibility, opacity and visualization actions -->
<script>
  import { onDestroy, tick } from 'svelte';
  import MapSlider from './MapSlider.svelte';
  import { vscode } from '../../../shared/vscode.ts';
  import {
    mdiClose,
    mdiEye,
    mdiEyeOff,
    mdiRuler,
    mdiTrashCan,
    mdiTune,
  } from '../../../shared/icons.ts';

  let {
    overlays = [],
    panes = [],
    mapIds = [],
    visible = $bindable(false),
    activeScaleIndex = $bindable(-1),
    onvisibility,
    onzoom,
    onopacity,
    onremove,
    onmove,
  } = $props();

  const pendingVisibilityClicks = new Map();
  let draggedLayer = $state(null);
  let dropTarget = $state(null);

  onDestroy(() => {
    for (const timer of pendingVisibilityClicks.values()) {
      clearTimeout(timer);
    }
  });

  function setLayerVisibility(index, shown) {
    const entry = overlays[index];
    if (!entry || entry.visible === shown) {
      return;
    }
    onvisibility(entry.layerIndex, shown);
  }

  function toggleLayerVisibility(index) {
    const entry = overlays[index];
    if (entry) {
      setLayerVisibility(index, !entry.visible);
    }
  }

  function queueLayerVisibility(layerIndex) {
    clearTimeout(pendingVisibilityClicks.get(layerIndex));
    pendingVisibilityClicks.set(
      layerIndex,
      setTimeout(() => {
        pendingVisibilityClicks.delete(layerIndex);
        toggleLayerVisibility(overlays.findIndex((entry) => entry.layerIndex === layerIndex));
      }, 300),
    );
  }

  function toggleExclusiveVisibility(layerIndex) {
    for (const timer of pendingVisibilityClicks.values()) {
      clearTimeout(timer);
    }
    pendingVisibilityClicks.clear();
    const index = overlays.findIndex((entry) => entry.layerIndex === layerIndex);
    if (index < 0) {
      return;
    }
    const showAll =
      overlays[index].visible &&
      !overlays.some(
        (entry) =>
          entry.layerIndex !== layerIndex &&
          entry.visible &&
          panes.some((pane) => pane.includes(layerIndex) && pane.includes(entry.layerIndex)),
      );
    for (let i = 0; i < overlays.length; i++) {
      if (
        panes.some((pane) => pane.includes(layerIndex) && pane.includes(overlays[i].layerIndex))
      ) {
        setLayerVisibility(i, showAll || i === index);
      }
    }
  }

  function setLayerOpacity(index, value) {
    const entry = overlays[index];
    if (!entry) {
      return;
    }
    onopacity(entry.layerIndex, value / 100);
  }

  function removeLayer(index) {
    const entry = overlays[index];
    if (!entry) {
      return;
    }
    onremove(entry.layerIndex);
  }

  function startLayerDrag(event, layerIndex) {
    draggedLayer = layerIndex;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-vscee-layer', String(layerIndex));
  }

  function dragOver(event, paneIndex, insertIndex, rowIndex = null) {
    if (draggedLayer === null) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dropTarget = { paneIndex, insertIndex, rowIndex };
  }

  function rowInsertIndex(event, paneIndex, reverseIndex) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const above = event.clientY < bounds.top + bounds.height / 2;
    return panes[paneIndex].length - reverseIndex - (above ? 0 : 1);
  }

  function dropLayer(event, paneIndex, insertIndex) {
    if (draggedLayer === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onmove(draggedLayer, paneIndex, insertIndex);
    draggedLayer = null;
    dropTarget = null;
  }

  async function moveWithKeyboard(event, layerIndex, paneIndex, reverseIndex) {
    const pane = panes[paneIndex];
    const position = pane.length - reverseIndex - 1;
    const layerList = event.currentTarget.closest('.layers-list');
    if (event.key === 'ArrowUp' && reverseIndex > 0) {
      onmove(layerIndex, paneIndex, position + 2);
    } else if (event.key === 'ArrowDown' && reverseIndex < pane.length - 1) {
      onmove(layerIndex, paneIndex, position - 1);
    } else if (event.key === 'ArrowLeft' && paneIndex > 0) {
      onmove(layerIndex, paneIndex - 1, panes[paneIndex - 1].length);
    } else if (event.key === 'ArrowRight' && paneIndex < panes.length - 1) {
      onmove(layerIndex, paneIndex + 1, panes[paneIndex + 1].length);
    } else {
      return;
    }
    event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      await tick();
      layerList?.querySelector(`[data-layer-index="${layerIndex}"]`)?.focus();
    }
  }

  function toggleScale(index) {
    if (activeScaleIndex === index) {
      activeScaleIndex = -1;
    } else {
      if (!overlays[index].visible) {
        toggleLayerVisibility(index);
      }
      activeScaleIndex = index;
    }
  }

  function openVizEditor(layerIndex) {
    vscode.postMessage({ type: 'openVizEditor', data: { layerIndex } });
  }

  function close() {
    visible = false;
  }
</script>

{#if visible}
  <div class="layers-panel visible">
    <div class="layers-panel-header">
      <span>Layers</span>
      <div class="layers-header-actions">
        <button
          class="map-btn layers-clear-btn"
          title="Delete all layers"
          disabled={overlays.length === 0}
          onclick={() => vscode.postMessage({ type: 'clearAllLayers' })}>delete all</button
        >
        <button class="map-btn layers-close-btn" title="Close" onclick={close}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"
            ><path d={mdiClose} /></svg
          >
        </button>
      </div>
    </div>
    <div class="layers-list">
      {#if overlays.length === 0}
        <p class="layers-empty">No layers yet.</p>
      {:else}
        {#each panes as pane, paneIndex}
          <div
            class="pane-group"
            role="heading"
            aria-level="3"
            class:drop-target={dropTarget?.paneIndex === paneIndex && dropTarget?.rowIndex === null}
            ondragover={(event) => dragOver(event, paneIndex, pane.length)}
            ondrop={(event) => dropLayer(event, paneIndex, pane.length)}
          >
            Map {mapIds[paneIndex]}
          </div>
          {#each pane.slice().reverse() as layerIndex, reverseIndex (layerIndex)}
            {@const entry = overlays.find((item) => item.layerIndex === layerIndex)}
            {@const index = overlays.indexOf(entry)}
            {#if entry}
              <div
                class="layer-row"
                role="group"
                aria-label={entry.name}
                class:drop-above={dropTarget?.paneIndex === paneIndex &&
                  dropTarget?.rowIndex === reverseIndex &&
                  dropTarget?.insertIndex === pane.length - reverseIndex}
                class:drop-below={dropTarget?.paneIndex === paneIndex &&
                  dropTarget?.rowIndex === reverseIndex &&
                  dropTarget?.insertIndex === pane.length - reverseIndex - 1}
                ondragover={(event) =>
                  dragOver(
                    event,
                    paneIndex,
                    rowInsertIndex(event, paneIndex, reverseIndex),
                    reverseIndex,
                  )}
                ondrop={(event) =>
                  dropLayer(event, paneIndex, rowInsertIndex(event, paneIndex, reverseIndex))}
              >
                <button
                  class="map-btn layer-drag-handle"
                  data-layer-index={entry.layerIndex}
                  draggable="true"
                  title={`Drag ${entry.name} to reorder or move to another map`}
                  aria-label={`Move ${entry.name}; use arrow keys to reorder or change maps`}
                  ondragstart={(event) => startLayerDrag(event, entry.layerIndex)}
                  ondragend={() => {
                    draggedLayer = null;
                    dropTarget = null;
                  }}
                  onkeydown={(event) =>
                    moveWithKeyboard(event, entry.layerIndex, paneIndex, reverseIndex)}
                >
                  <i class="codicon codicon-gripper" aria-hidden="true"></i>
                </button>
                <span class="layer-name" title={entry.name}>{entry.name}</span>
                <div class="layer-controls">
                  <MapSlider
                    class="layer-opacity"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(entry.opacity * 100)}
                    oninput={(event) => setLayerOpacity(index, Number(event.target.value))}
                  />
                  <button
                    class="map-btn layer-vis-btn"
                    title="Zoom to layer"
                    aria-label={`Zoom to ${entry.name}`}
                    onclick={() => onzoom(entry.layerIndex)}
                  >
                    <i class="codicon codicon-target" aria-hidden="true"></i>
                  </button>
                  <button
                    class="map-btn layer-vis-btn"
                    class:active={entry.visible}
                    title="Toggle visibility; double-click to isolate or restore layers"
                    onclick={() => queueLayerVisibility(entry.layerIndex)}
                    ondblclick={() => toggleExclusiveVisibility(entry.layerIndex)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      aria-hidden="true"
                      fill="currentColor"><path d={entry.visible ? mdiEye : mdiEyeOff} /></svg
                    >
                  </button>
                  {#if entry.visParams && (entry.visParams.palette || entry.visParams.bands)}
                    <button
                      class="map-btn layer-vis-btn"
                      class:active={activeScaleIndex === index}
                      title="Toggle scale"
                      onclick={() => toggleScale(index)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        aria-hidden="true"
                        fill="currentColor"><path d={mdiRuler} /></svg
                      >
                    </button>
                  {:else}
                    <button
                      class="map-btn layer-vis-btn"
                      style="visibility:hidden"
                      title="Toggle scale"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        aria-hidden="true"
                        fill="currentColor"><path d={mdiRuler} /></svg
                      >
                    </button>
                  {/if}
                  <button
                    class="map-btn layer-vis-btn"
                    title="Edit visualization"
                    onclick={() => openVizEditor(entry.layerIndex)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      aria-hidden="true"
                      fill="currentColor"><path d={mdiTune} /></svg
                    >
                  </button>
                  <button
                    class="map-btn layer-vis-btn"
                    title="Remove layer"
                    onclick={() => removeLayer(index)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      aria-hidden="true"
                      fill="currentColor"><path d={mdiTrashCan} /></svg
                    >
                  </button>
                </div>
              </div>
            {/if}
          {/each}
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  :global {
    .map-btn {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: var(--vscee-radius-md);
      background: var(--vscee-color-editor-background);
      color: var(--vscee-color-foreground);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--vscee-shadow-sm);
      opacity: 0.85;
      transition: opacity 0.15s;
    }
    .map-btn:hover {
      opacity: 1;
    }
    .map-btn.active {
      background: var(--vscee-color-button-background);
      color: var(--vscee-color-button-foreground);
    }
    .layers-panel {
      position: fixed;
      top: 10px;
      left: 48px;
      z-index: 1000;
      width: fit-content;
      max-width: min(600px, calc(100vw - 60px));
      background: var(--vscee-color-editor-background);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-md);
      box-shadow: var(--vscee-shadow-md);
    }
    .layers-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--vscee-space-md);
      padding: var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-xs)
        var(--vscee-space-lg);
      font-size: var(--vscee-font-compact-sm);
      font-weight: 600;
      color: var(--vscee-color-foreground);
    }
    .layers-header-actions {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-xs);
    }
    .layers-clear-btn {
      width: auto;
      height: 22px;
      padding: 0 var(--vscee-space-sm);
      box-shadow: none;
      background: var(--vscee-color-button-secondary-background);
      color: var(--vscee-color-button-secondary-foreground);
      font-size: var(--vscee-font-compact-sm);
      white-space: nowrap;
      &:hover:not(:disabled) {
        background: var(--vscee-color-button-secondary-hover);
      }
      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }
    .layers-close-btn {
      width: 22px;
      height: 22px;
      box-shadow: none;
      opacity: 0.6;
    }
    .layers-list {
      max-height: 320px;
      overflow-y: auto;
    }
    .layers-empty {
      padding: var(--vscee-space-lg);
      font-size: var(--vscee-font-compact-sm);
      color: var(--vscee-color-muted);
      text-align: center;
    }
    .pane-group {
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      border-top: 1px solid var(--vscee-color-widget-border);
      font-size: var(--vscee-font-compact-sm);
      font-weight: 600;
      color: var(--vscee-color-foreground);
      &.drop-target {
        background: var(--vscee-color-list-hover);
        box-shadow: inset 0 -2px var(--vscee-color-focus);
      }
    }
    .layer-row {
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      display: flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      min-width: 0;
      &.drop-above {
        box-shadow: inset 0 2px var(--vscee-color-focus);
      }
      &.drop-below {
        box-shadow: inset 0 -2px var(--vscee-color-focus);
      }
    }
    .layer-drag-handle {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      box-shadow: none;
      opacity: 0.6;
      cursor: grab;
      &:active {
        cursor: grabbing;
      }
    }
    .layer-vis-btn {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      box-shadow: none;
      opacity: 0.5;
    }
    .layer-vis-btn.active {
      opacity: 1;
      background: transparent;
      color: var(--vscee-color-foreground);
    }
    .layer-name {
      flex: 1;
      min-width: 0;
      max-width: 30ch;
      font-size: var(--vscee-font-compact-sm);
      color: var(--vscee-color-foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .layer-controls {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-xs);
      flex-shrink: 0;
      margin-left: auto;
    }
  }
</style>
