<!-- MapInspector: map click inspection, marker and pixel values panel -->
<script>
  import L from 'leaflet';
  import MapButton from './MapButton.svelte';
  import { vscode } from '../../shared/vscode.ts';
  import { mdiClose, mdiLoading, mdiMapMarker } from '../../shared/icons.ts';

  let { map, active = $bindable(false), cursor = '' } = $props();

  let inspectorMarker = $state(null);
  let inspectorContent = $state({ type: 'hint' });
  let pendingInspect = $state(null);

  const inspectorMarkerIcon = L.divIcon({
    className: 'inspector-marker',
    html: `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="${mdiMapMarker}"/></svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });

  function removeMarker() {
    if (inspectorMarker && map) {
      map.removeLayer(inspectorMarker);
      inspectorMarker = null;
    }
  }

  function handleMapClick(e) {
    if (!active) {
      return;
    }
    const { lat, lng } = e.latlng;
    if (inspectorMarker) {
      inspectorMarker.setLatLng([lat, lng]);
    } else {
      inspectorMarker = L.marker([lat, lng], { icon: inspectorMarkerIcon }).addTo(map);
    }
    inspectorContent = { type: 'loading' };
    pendingInspect = { lat, lng };
    vscode.postMessage({ type: 'inspect', data: { lat, lng, zoom: map.getZoom() } });
  }

  function closeInspector() {
    active = false;
    removeMarker();
  }

  $effect(() => {
    if (!map) {
      return;
    }
    map.getContainer().style.cursor = active ? 'crosshair' : cursor;
    if (!active) {
      removeMarker();
    }

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
      map.getContainer().style.cursor = '';
    };
  });

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (
      msg.type === 'inspectResult' &&
      pendingInspect &&
      msg.data.lat === pendingInspect.lat &&
      msg.data.lng === pendingInspect.lng
    ) {
      inspectorContent = { type: 'result', data: msg.data };
    }
  });
</script>

{#if active}
  <div class="inspector-panel visible">
    <div class="inspector-panel-header">
      <span>Inspector</span>
      <MapButton class="layers-close-btn" title="Close" onclick={closeInspector}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"
          ><path d={mdiClose} /></svg
        >
      </MapButton>
    </div>
    <div class="inspector-content">
      {#if inspectorContent.type === 'hint'}
        <p class="inspector-hint">Activate then click on the map.</p>
      {:else if inspectorContent.type === 'loading'}
        <p class="inspector-loading">
          <svg
            class="mdi-spin"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
            fill="currentColor"><path d={mdiLoading} /></svg
          > Loading…
        </p>
      {:else if inspectorContent.type === 'result'}
        {@const d = inspectorContent.data}
        <p class="inspector-coords">{d.lng.toFixed(4)}, {d.lat.toFixed(4)} @ {d.scale}m</p>
        {#each d.results as layer}
          <div class="inspector-layer">
            <span class="inspector-layer-name">{layer.name}</span>
            {#if layer.error}
              <p class="inspector-error">{layer.error}</p>
            {:else}
              {@const entries = Object.entries(layer.values || {})}
              {#if entries.length === 0}
                <p class="inspector-no-data">No data at this location.</p>
              {:else}
                <table class="inspector-table">
                  <tbody>
                    {#each entries as [key, value]}
                      <tr>
                        <td class="inspector-band">{key}</td>
                        <td class="inspector-val"
                          >{value === null
                            ? '—'
                            : typeof value === 'number'
                              ? value.toFixed(4)
                              : String(value)}</td
                        >
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            {/if}
          </div>
        {/each}
        {#if d.results.length === 0}
          <p class="inspector-hint">No layers to inspect.</p>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  :global {
    .inspector-marker {
      background: none;
      border: none;

      svg {
        display: block;
        fill: var(--vscee-color-button-background);
        stroke: var(--vscee-color-button-foreground);
        stroke-width: 0.7;
        filter: drop-shadow(0 1px 2px var(--vscee-color-widget-shadow));
      }
    }
    .inspector-panel {
      position: absolute;
      top: 10px;
      left: 48px;
      z-index: 1000;
      width: 220px;
      background: var(--vscee-color-editor-background);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-md);
      box-shadow: var(--vscee-shadow-md);
    }
    .inspector-panel-header {
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
    .inspector-content {
      max-height: 360px;
      overflow-y: auto;
      padding: var(--vscee-space-sm) var(--vscee-space-md);
    }
    .inspector-hint {
      font-size: var(--vscee-font-compact-sm);
      color: var(--vscee-color-muted);
      text-align: center;
      padding: var(--vscee-space-xs) 0;
    }
    .inspector-coords {
      font-size: var(--vscee-font-compact-sm);
      color: var(--vscee-color-muted);
      margin-bottom: var(--vscee-space-sm);
    }
    .inspector-loading {
      font-size: var(--vscee-font-compact-sm);
      color: var(--vscee-color-muted);
      text-align: center;
      padding: var(--vscee-space-xs) 0;
    }
    .inspector-layer {
      margin-bottom: var(--vscee-space-md);
    }
    .inspector-layer-name {
      display: block;
      font-size: var(--vscee-font-compact-sm);
      font-weight: 600;
      color: var(--vscee-color-foreground);
      margin-bottom: var(--vscee-space-xs);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .inspector-no-data {
      font-size: var(--vscee-font-compact-sm);
      color: var(--vscee-color-muted);
      font-style: italic;
    }
    .inspector-error {
      font-size: var(--vscee-font-compact-xs);
      color: var(--vscee-color-error);
      word-break: break-all;
    }
    .inspector-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--vscee-font-compact-sm);
    }
    .inspector-band {
      color: var(--vscee-color-muted);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs) var(--vscee-space-xxs) 0;
    }
    .inspector-val {
      color: var(--vscee-color-foreground);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  }
</style>
