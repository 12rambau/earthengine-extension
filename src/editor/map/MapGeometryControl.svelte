<!-- MapGeometryControl: draw, edit, and manage user geometries on the map -->
<script>
  import L from 'leaflet';
  import { vscode } from '../../shared/vscode.ts';
  import { parseMapGeometries } from './mapGeometry.js';

  let { map, visible = $bindable(false), drawMode = $bindable(null) } = $props();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let geometries = $state([]);
  let selectedId = $state(null);
  let draft = $state([]);
  let editingId = $state(null);
  let nameInput = $state('');
  let deleteId = $state(null);
  let copiedId = $state(null);
  let nextName = 1;

  const vertexIcon = L.divIcon({
    className: 'geometry-vertex',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
  const midpointIcon = L.divIcon({
    className: 'geometry-midpoint',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

  let selectedGeometry = $derived(geometries.find((item) => item.id === selectedId));

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  window.addEventListener('message', (e) => {
    if (e.data.type === 'geometries') {
      geometries = parseMapGeometries(e.data.data);
      nextName = geometries.length + 1;
    } else if (e.data.type === 'geometryCopied') {
      copiedId = e.data.data.id;
      setTimeout(() => {
        if (copiedId === e.data.data.id) {
          copiedId = null;
        }
      }, 1500);
    }
  });

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function save(items) {
    const validated = parseMapGeometries(items);
    if (validated.length !== items.length) {
      return;
    }
    geometries = validated;
    vscode.postMessage({ type: 'saveGeometries', data: validated });
  }

  function startDrawing(type) {
    selectedId = null;
    draft = [];
    drawMode = type;
  }

  function cancelDrawing() {
    drawMode = null;
    draft = [];
  }

  function addGeometry(type, coordinates, label = type) {
    const item = {
      id: crypto.randomUUID(),
      name: `${label === 'LineString' ? 'Line' : label} ${nextName}`,
      type,
      coordinates,
      visible: true,
    };
    const validated = parseMapGeometries([item]);
    if (!validated.length || geometries.length >= 1000) {
      return;
    }
    nextName++;
    save([...geometries, item]);
    cancelDrawing();
    selectedId = item.id;
  }

  function position(latlng) {
    const wrapped = latlng.wrap();
    return [wrapped.lng, Math.max(-90, Math.min(90, wrapped.lat))];
  }

  function handleMapClick(e) {
    if (!drawMode) {
      return;
    }
    const point = position(e.latlng);
    if (drawMode === 'Point') {
      addGeometry('Point', point);
    } else if (drawMode === 'Rectangle' && draft.length === 1) {
      const first = draft[0];
      addGeometry(
        'Polygon',
        [first, [point[0], first[1]], point, [first[0], point[1]]],
        'Rectangle',
      );
    } else if (draft.length < 10000) {
      draft = [...draft, point];
    }
  }

  function finishDrawing() {
    if (drawMode === 'LineString' && draft.length >= 2) {
      addGeometry('LineString', draft);
    } else if (drawMode === 'Polygon' && draft.length >= 3) {
      addGeometry('Polygon', draft);
    }
  }

  function updateVertices(id, vertices) {
    save(geometries.map((item) => (item.id === id ? { ...item, coordinates: vertices } : item)));
  }

  function toggleVisibility(item) {
    save(
      geometries.map((geometry) =>
        geometry.id === item.id ? { ...geometry, visible: !item.visible } : geometry,
      ),
    );
    if (item.visible) {
      selectedId = null;
    }
  }

  function rename(item) {
    const name = nameInput.trim();
    if (name) {
      save(
        geometries.map((geometry) => (geometry.id === item.id ? { ...geometry, name } : geometry)),
      );
      editingId = null;
    }
  }

  function remove(id) {
    save(geometries.filter((item) => item.id !== id));
    if (selectedId === id) {
      selectedId = null;
    }
    deleteId = null;
  }

  function zoomTo(item) {
    const points = item.type === 'Point' ? [item.coordinates] : item.coordinates;
    if (item.type === 'Point') {
      map.setView([points[0][1], points[0][0]], Math.max(12, map.getZoom()));
    } else {
      map.fitBounds(L.latLngBounds(points.map(([lng, lat]) => [lat, lng])));
    }
    if (item.visible) {
      selectedId = item.id;
    }
  }

  function keydown(e) {
    if (e.key === 'Escape' && drawMode) {
      cancelDrawing();
    }
  }

  // ----------------------------------------------------------------
  // MAP LAYERS
  // ----------------------------------------------------------------
  $effect(() => {
    if (!map) {
      return;
    }
    map.on('click', handleMapClick);
    window.addEventListener('keydown', keydown);
    return () => {
      map.off('click', handleMapClick);
      window.removeEventListener('keydown', keydown);
    };
  });

  $effect(() => {
    if (!map || !drawMode) {
      return;
    }
    map.doubleClickZoom.disable();
    return () => map.doubleClickZoom.enable();
  });

  $effect(() => {
    if (!map) {
      return;
    }
    const layers = [];
    for (const item of geometries) {
      if (!item.visible) {
        continue;
      }
      const points =
        item.type === 'Point'
          ? [item.coordinates[1], item.coordinates[0]]
          : item.coordinates.map(([lng, lat]) => [lat, lng]);
      const options = {
        color: 'var(--vscode-focusBorder)',
        weight: 3,
        fillOpacity: 0.2,
        interactive: !drawMode && visible,
        bubblingMouseEvents: false,
      };
      const shape =
        item.type === 'Point'
          ? L.circleMarker(points, { ...options, radius: 7 })
          : item.type === 'Polygon'
            ? L.polygon(points, options)
            : L.polyline(points, options);
      shape.addTo(map);
      shape.on('click', () => {
        selectedId = item.id;
      });
      layers.push(shape);

      if (!visible || selectedId !== item.id) {
        continue;
      }
      const vertices = item.type === 'Point' ? [item.coordinates] : item.coordinates;
      vertices.forEach(([lng, lat], index) => {
        const handle = L.marker([lat, lng], { icon: vertexIcon, draggable: true }).addTo(map);
        handle.on('dragend', () => {
          const updated = [...vertices];
          updated[index] = position(handle.getLatLng());
          if (item.type === 'Point') {
            save(
              geometries.map((geometry) =>
                geometry.id === item.id ? { ...geometry, coordinates: updated[0] } : geometry,
              ),
            );
          } else {
            updateVertices(item.id, updated);
          }
        });
        if (item.type !== 'Point' && vertices.length > (item.type === 'Polygon' ? 3 : 2)) {
          handle.bindTooltip('Drag to move; right-click to remove');
          handle.on('contextmenu', () => {
            updateVertices(
              item.id,
              vertices.filter((_, i) => i !== index),
            );
          });
        } else {
          handle.bindTooltip('Drag to move');
        }
        layers.push(handle);
      });
      if (item.type !== 'Point') {
        const edges = item.type === 'Polygon' ? vertices.length : vertices.length - 1;
        for (let index = 0; index < edges; index++) {
          const a = vertices[index];
          const b = vertices[(index + 1) % vertices.length];
          const midpoint = L.marker([(a[1] + b[1]) / 2, (a[0] + b[0]) / 2], {
            icon: midpointIcon,
            draggable: true,
          }).addTo(map);
          midpoint.bindTooltip('Click or drag to add a vertex');
          const insert = () => {
            if (vertices.length >= 10000) {
              return;
            }
            const updated = [...vertices];
            updated.splice(index + 1, 0, position(midpoint.getLatLng()));
            updateVertices(item.id, updated);
          };
          midpoint.on('click', insert);
          midpoint.on('dragend', insert);
          layers.push(midpoint);
        }
      }
    }
    return () => layers.forEach((layer) => map.removeLayer(layer));
  });

  $effect(() => {
    if (!map || !drawMode || draft.length === 0) {
      return;
    }
    const points = draft.map(([lng, lat]) => [lat, lng]);
    const layer = L.polyline(points, {
      color: 'var(--vscode-focusBorder)',
      dashArray: '6 4',
      interactive: false,
    });
    layer.addTo(map);
    const markers = points.map((point) =>
      L.circleMarker(point, {
        radius: 4,
        color: 'var(--vscode-focusBorder)',
        interactive: false,
      }).addTo(map),
    );
    return () => {
      map.removeLayer(layer);
      markers.forEach((marker) => map.removeLayer(marker));
    };
  });
</script>

{#if visible}
  <!-- GEOMETRY LIST -->
  <div class="geometry-panel">
    <div class="geometry-header">
      <strong>Geometries</strong>
      <button
        class="geometry-action"
        title="Close"
        onclick={() => {
          visible = false;
          cancelDrawing();
        }}
      >
        <i class="codicon codicon-close"></i>
      </button>
    </div>
    <div class="geometry-draw">
      {#each ['Point', 'LineString', 'Polygon', 'Rectangle'] as type}
        <button
          class:active={drawMode === type}
          title={`Draw ${type === 'LineString' ? 'line' : type.toLowerCase()}`}
          onclick={() => startDrawing(type)}>{type === 'LineString' ? 'Line' : type}</button
        >
      {/each}
    </div>
    {#if drawMode}
      <div class="geometry-hint">
        {drawMode === 'Point'
          ? 'Click to place a point.'
          : drawMode === 'Rectangle'
            ? 'Click two opposite corners.'
            : 'Click to add vertices, then finish.'}
        {#if drawMode === 'LineString' || drawMode === 'Polygon'}
          <button disabled={draft.length < (drawMode === 'Polygon' ? 3 : 2)} onclick={finishDrawing}
            >Finish</button
          >
        {/if}
        <button onclick={cancelDrawing}>Cancel</button>
      </div>
    {/if}
    <div class="geometry-list">
      {#if geometries.length === 0}
        <p class="geometry-hint">No geometries yet. Choose a drawing tool to start.</p>
      {/if}
      {#each geometries as item (item.id)}
        <div class="geometry-row" class:selected={selectedId === item.id}>
          {#if editingId === item.id}
            <form
              onsubmit={(e) => {
                e.preventDefault();
                rename(item);
              }}
            >
              <input aria-label="Geometry name" maxlength="100" bind:value={nameInput} />
              <button class="geometry-action" title="Save name" type="submit"
                ><i class="codicon codicon-check"></i></button
              >
              <button
                class="geometry-action"
                title="Cancel rename"
                type="button"
                onclick={() => (editingId = null)}><i class="codicon codicon-close"></i></button
              >
            </form>
          {:else if deleteId === item.id}
            <span>Delete {item.name}?</span>
            <button class="geometry-action" title="Confirm deletion" onclick={() => remove(item.id)}
              >Delete</button
            >
            <button
              class="geometry-action"
              title="Cancel deletion"
              onclick={() => (deleteId = null)}>Cancel</button
            >
          {:else}
            <button
              class="geometry-name"
              title={`Select and zoom to ${item.name}`}
              onclick={() => zoomTo(item)}>{item.name}</button
            >
            <button
              class="geometry-action"
              title={item.visible ? 'Hide geometry' : 'Show geometry'}
              onclick={() => toggleVisibility(item)}
            >
              <i class="codicon {item.visible ? 'codicon-eye' : 'codicon-eye-closed'}"></i>
            </button>
            <button
              class="geometry-action"
              title="Rename geometry"
              onclick={() => {
                editingId = item.id;
                nameInput = item.name;
              }}
            >
              <i class="codicon codicon-edit"></i>
            </button>
            <button
              class="geometry-action"
              title={copiedId === item.id ? 'Copied' : 'Copy as Earth Engine Python'}
              onclick={() => vscode.postMessage({ type: 'copyGeometry', data: { id: item.id } })}
            >
              <i class="codicon {copiedId === item.id ? 'codicon-check' : 'codicon-copy'}"></i>
            </button>
            <button
              class="geometry-action"
              title="Delete geometry"
              onclick={() => (deleteId = item.id)}
            >
              <i class="codicon codicon-trash"></i>
            </button>
          {/if}
        </div>
      {/each}
    </div>
    {#if selectedGeometry?.visible}
      <p class="geometry-hint">
        Drag handles to edit; drag edge handles to add a vertex. Right-click a vertex to remove it.
      </p>
    {/if}
  </div>
{/if}

<style>
  :global {
    /* ==================================================================
       GEOMETRY MANAGER
       ================================================================== */
    .geometry-panel {
      position: absolute;
      top: 10px;
      left: 48px;
      z-index: 1000;
      width: min(410px, calc(100vw - 60px));
      max-height: calc(100vh - 40px);
      overflow-y: auto;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-widget-border);
      border-radius: var(--vscee-radius-md);
      box-shadow: var(--vscode-widget-shadow);
      font-size: var(--vscee-font-compact-sm);
    }
    .geometry-header,
    .geometry-draw,
    .geometry-row,
    .geometry-hint {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-xs);
      padding: var(--vscee-space-xs) var(--vscee-space-sm);
    }
    .geometry-header {
      justify-content: space-between;
    }
    .geometry-draw {
      flex-wrap: wrap;
      button {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: none;
        border-radius: var(--vscee-radius-sm);
        padding: var(--vscee-space-xs);
        cursor: pointer;
        &.active,
        &:hover {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }
      }
    }
    .geometry-hint {
      color: var(--vscode-descriptionForeground);
      flex-wrap: wrap;
      button {
        cursor: pointer;
        &:disabled {
          cursor: default;
          opacity: 0.5;
        }
      }
    }
    .geometry-list {
      max-height: 320px;
      overflow-y: auto;
    }
    .geometry-row {
      &.selected {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
      }
      form {
        display: flex;
        min-width: 0;
        input {
          min-width: 0;
          width: 100%;
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
        }
      }
    }
    .geometry-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }
    .geometry-action,
    .geometry-name {
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      padding: 4px;
      &:hover {
        background: var(--vscode-toolbar-hoverBackground);
      }
    }
    .geometry-vertex,
    .geometry-midpoint {
      background: var(--vscode-focusBorder);
      border: 2px solid var(--vscode-editor-background);
      border-radius: 50%;
      box-shadow: var(--vscode-widget-shadow);
    }
    .geometry-midpoint {
      opacity: 0.65;
    }
  }
</style>
