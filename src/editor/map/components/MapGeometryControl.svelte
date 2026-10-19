<!-- MapGeometryControl: draw, edit, and manage user geometries on the map -->
<script>
  import L from 'leaflet';
  import ColorPicker from './ColorPicker.svelte';
  import { vscode } from '../../../shared/vscode.ts';
  import {
    DEFAULT_GEOMETRY_COLOR,
    geometryMapPositions,
    parseMapGeometries,
  } from '../mapGeometry.js';

  let { map, visible = $bindable(false), drawMode = $bindable(null) } = $props();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let geometries = $state([]);
  let selectedId = $state(null);
  let draft = $state([]);
  let copiedId = $state(null);
  let worldCenterLng = $state(0);
  let colorSaveTimer = null;

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

  /** Lowest `Geometry N` number not already taken, so deleted numbers get reused. */
  function nextName() {
    const used = new Set(
      geometries
        .map((item) => /^Geometry (\d+)$/.exec(item.name))
        .filter(Boolean)
        .map((match) => Number(match[1])),
    );
    let number = 1;
    while (used.has(number)) {
      number++;
    }
    return `Geometry ${number}`;
  }

  function addGeometry(type, coordinates) {
    const item = {
      id: crypto.randomUUID(),
      name: nextName(),
      type,
      coordinates,
      visible: true,
      color: DEFAULT_GEOMETRY_COLOR,
    };
    const validated = parseMapGeometries([item]);
    if (!validated.length || geometries.length >= 1000) {
      return;
    }
    save([...geometries, item]);
    cancelDrawing();
    selectedId = item.id;
  }

  function position(latlng) {
    const wrapped = latlng.wrap();
    return [wrapped.lng, Math.max(-90, Math.min(90, wrapped.lat))];
  }

  function displayPoints(coordinates) {
    return geometryMapPositions(coordinates, worldCenterLng);
  }

  function handleMapClick(e) {
    if (!drawMode) {
      return;
    }
    const point = position(e.latlng);
    if (drawMode === 'Point') {
      addGeometry('Point', point);
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

  function remove(id) {
    save(geometries.filter((item) => item.id !== id));
    if (selectedId === id) {
      selectedId = null;
    }
  }

  function select(item) {
    selectedId = item.visible && selectedId !== item.id ? item.id : null;
  }

  function setColor(item, color) {
    geometries = geometries.map((geometry) =>
      geometry.id === item.id ? { ...geometry, color } : geometry,
    );
    // The picker streams a colour per pointer move, so persist once the drag settles.
    clearTimeout(colorSaveTimer);
    colorSaveTimer = setTimeout(() => save(geometries), 200);
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
    const updateWorldCenter = () => {
      worldCenterLng = map.getCenter().lng;
    };
    updateWorldCenter();
    map.on('click', handleMapClick);
    map.on('moveend', updateWorldCenter);
    window.addEventListener('keydown', keydown);
    return () => {
      map.off('click', handleMapClick);
      map.off('moveend', updateWorldCenter);
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
      const points = displayPoints(item.type === 'Point' ? [item.coordinates] : item.coordinates);
      const options = {
        color: item.color,
        weight: 3,
        fillOpacity: 0.2,
        interactive: !drawMode && visible,
        bubblingMouseEvents: false,
      };
      const shape =
        item.type === 'Point'
          ? L.circleMarker(points[0], { ...options, radius: 7 })
          : item.type === 'Polygon'
            ? L.polygon(points, options)
            : L.polyline(points, options);
      shape.addTo(map);
      shape.on('click', () => {
        select(item);
      });
      layers.push(shape);

      if (!visible || selectedId !== item.id) {
        continue;
      }
      const vertices = item.type === 'Point' ? [item.coordinates] : item.coordinates;
      vertices.forEach((_, index) => {
        const handle = L.marker(points[index], { icon: vertexIcon, draggable: true }).addTo(map);
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
          const a = points[index];
          const b = points[(index + 1) % vertices.length];
          const midpoint = L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], {
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
    const points = displayPoints(draft);
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
      <span>Geometries</span>
      <button
        class="map-btn layers-close-btn"
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
      {#each ['Point', 'LineString', 'Polygon'] as type}
        <button
          class:active={drawMode === type}
          title={`Draw ${type === 'LineString' ? 'line' : type.toLowerCase()}`}
          onclick={() => startDrawing(type)}>{type === 'LineString' ? 'Line' : type}</button
        >
      {/each}
    </div>
    {#if drawMode}
      <div class="geometry-hint">
        {drawMode === 'Point' ? 'Click to place a point.' : 'Click to add vertices, then finish.'}
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
          <ColorPicker
            value={item.color}
            label={`Colour of ${item.name}`}
            onChange={(color) => setColor(item, color)}
          />
          <button class="geometry-name" title={`Select ${item.name}`} onclick={() => select(item)}
            >{item.name}</button
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
            title={copiedId === item.id ? 'Copied' : 'Copy as Earth Engine Python'}
            onclick={() => vscode.postMessage({ type: 'copyGeometry', data: { id: item.id } })}
          >
            <i class="codicon {copiedId === item.id ? 'codicon-check' : 'codicon-copy'}"></i>
          </button>
          <button class="geometry-action" title="Delete geometry" onclick={() => remove(item.id)}>
            <i class="codicon codicon-trash"></i>
          </button>
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
      background: var(--vscee-color-editor-background);
      color: var(--vscee-color-foreground);
      border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      border-radius: var(--vscee-radius-md);
      box-shadow: var(--vscee-shadow-md);
      font-size: var(--vscee-font-compact-sm);

      button {
        font-family: inherit;
        font-size: inherit;
      }
      .codicon {
        font-size: var(--vscee-font-icon-sm);
      }
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
      padding: var(--vscee-space-xs) var(--vscee-space-xs) var(--vscee-space-xs)
        var(--vscee-space-lg);
      font-weight: 600;
    }
    .geometry-draw {
      flex-wrap: wrap;
      button {
        background: var(--vscee-color-button-secondary-background);
        color: var(--vscee-color-button-secondary-foreground);
        border: none;
        border-radius: var(--vscee-radius-pill);
        padding: var(--vscee-space-xs) var(--vscee-space-md);
        cursor: pointer;
        &.active,
        &:hover {
          background: var(--vscee-color-button-background);
          color: var(--vscee-color-button-foreground);
        }
      }
    }
    .geometry-hint {
      color: var(--vscee-color-muted);
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
        background: var(--vscee-color-list-selection-background);
        color: var(--vscee-color-list-selection-foreground);
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
    .geometry-action {
      display: flex;
      align-items: center;
    }
    .geometry-action,
    .geometry-name {
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
      border-radius: var(--vscee-radius-sm);
      &:hover {
        background: var(--vscee-color-list-hover);
      }
    }
    .geometry-vertex,
    .geometry-midpoint {
      background: var(--vscee-color-focus);
      border: var(--vscee-border-md) solid var(--vscee-color-editor-background);
      border-radius: 50%;
      box-shadow: var(--vscee-shadow-xs);
    }
    .geometry-midpoint {
      opacity: 0.65;
    }
  }
</style>
