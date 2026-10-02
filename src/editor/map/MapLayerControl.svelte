<!-- MapLayerControl: layer list, visibility, opacity and visualization actions -->
<script>
  import MapSlider from './MapSlider.svelte';
  import { vscode } from '../../shared/vscode.ts';
  import {
    mdiClose,
    mdiEye,
    mdiEyeOff,
    mdiRuler,
    mdiTrashCan,
    mdiTune,
  } from '../../shared/icons.ts';

  let {
    map,
    overlays = $bindable([]),
    visible = $bindable(false),
    activeScaleIndex = $bindable(-1),
    nativeLayerControl,
  } = $props();

  function toggleLayerVisibility(index) {
    const entry = overlays[index];
    if (!entry) {
      return;
    }
    entry.visible = !entry.visible;
    if (entry.visible) {
      entry.tileLayer.addTo(map);
    } else {
      map.removeLayer(entry.tileLayer);
    }
    overlays = overlays;
    vscode.postMessage({
      type: 'layerVisibility',
      data: { layerIndex: entry.layerIndex, shown: entry.visible },
    });
  }

  function setLayerOpacity(index, value) {
    const entry = overlays[index];
    if (!entry) {
      return;
    }
    entry.opacity = value / 100;
    entry.tileLayer.setOpacity(entry.opacity);
    overlays = overlays;
    vscode.postMessage({
      type: 'layerOpacity',
      data: { layerIndex: entry.layerIndex, opacity: entry.opacity },
    });
  }

  function removeLayer(index) {
    const entry = overlays[index];
    if (!entry) {
      return;
    }
    if (entry.visible) {
      map.removeLayer(entry.tileLayer);
    }
    nativeLayerControl?.removeLayer(entry.tileLayer);
    overlays = overlays.filter((_, overlayIndex) => overlayIndex !== index);
    if (activeScaleIndex === index) {
      activeScaleIndex = -1;
    } else if (activeScaleIndex > index) {
      activeScaleIndex--;
    }
    vscode.postMessage({ type: 'removeLayer', data: { layerIndex: entry.layerIndex } });
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
      <button class="map-btn layers-close-btn" title="Close" onclick={close}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"
          ><path d={mdiClose} /></svg
        >
      </button>
    </div>
    <div class="layers-list">
      {#if overlays.length === 0}
        <p class="layers-empty">No layers yet.</p>
      {:else}
        {#each overlays as entry, index}
          <div class="layer-row">
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
                class:active={entry.visible}
                title="Toggle visibility"
                onclick={() => toggleLayerVisibility(index)}
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
      position: absolute;
      top: 10px;
      left: 48px;
      z-index: 1000;
      width: 240px;
      background: var(--vscee-color-editor-background);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-md);
      box-shadow: var(--vscee-shadow-md);
    }
    .layers-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-xs)
        var(--vscee-space-lg);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      font-size: var(--vscee-font-compact-sm);
      font-weight: 600;
      color: var(--vscee-color-foreground);
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
    .layer-row {
      padding: var(--vscee-space-xs) var(--vscee-space-md);
      border-bottom: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      display: flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      min-width: 0;
    }
    .layer-row:last-child {
      border-bottom: none;
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
