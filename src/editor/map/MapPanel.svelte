<!-- MapPanel: Leaflet-based map with EE tile layers, inspector, scale bar and viz editor -->
<script>
  import L from 'leaflet';
  import MapButton from './components/MapButton.svelte';
  import MapGeometryControl from './components/MapGeometryControl.svelte';
  import MapInspector from './components/MapInspector.svelte';
  import MapLayerControl from './components/MapLayerControl.svelte';
  import MapLayoutDialog from './components/MapLayoutDialog.svelte';
  import MapPane from './components/MapPane.svelte';
  import MapSplitView from './components/MapSplitView.svelte';
  import MapMenu from './components/MapMenu.svelte';
  import MapScale from './components/MapScale.svelte';
  import MapVisualizationEditor from './components/MapVisualizationEditor.svelte';
  import { vscode } from '../../shared/vscode.ts';
  vscode.setState({});
  import { trackViewportChanges } from '../../shared/viewportAnchor.ts';
  import { normalizeMapLayout, setSplitRatio } from './mapLayout.js';
  import {
    mdiAlertCircleOutline,
    mdiCrosshairsGps,
    mdiLayers,
    mdiMap,
    mdiSatelliteVariant,
    mdiShapeOutline,
  } from '../../shared/icons.ts';

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------

  let paneMaps = $state({});
  let activePaneId = $state(1);
  let hoveredPaneId = $state(null);
  let map = $derived(paneMaps[activePaneId] ?? paneMaps[1] ?? null);
  let overlays = $state([]);
  let layersPanelVisible = $state(false);
  let mapLayoutVisible = $state(false);
  let mapLayout = $state(normalizeMapLayout(null));
  let geometriesPanelVisible = $state(false);
  let drawMode = $state(null);
  let inspectorActive = $state(false);
  let activeScaleIndex = $state(-1);
  let coords = $state('0.0000, 0.0000');
  let zoomLevel = $state(2);
  let attributionFooter = $state(null);

  let activeMode = $state('theme');
  // Message shown when the Google Maps API key is missing or createSession failed.
  let basemapError = $state('');

  // Internal refs
  let basemapTileLayers = {};
  let paneBasemaps = {};
  let basemapIsFallback = {};
  let pendingBasemaps = new Set();
  let currentBasemapId = 'light';
  let googleCopyright = {};
  let attributionTimer = {};
  let attributionRequests = {};
  let syncingView = false;
  let readySent = false;
  let lastView = $state({ center: [0, 0], zoom: 2 });
  let pointerLatLng = null;
  const ghostMarkers = {};
  const ghostIcon = L.divIcon({
    className: 'grid-ghost-cursor',
    html: '<i class="codicon codicon-target" aria-hidden="true"></i>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------

  function openMenu(menu) {
    if (menu !== 'layers') {
      layersPanelVisible = false;
    }
    if (menu !== 'geometries') {
      geometriesPanelVisible = false;
      drawMode = null;
    }
    if (menu !== 'inspector') {
      inspectorActive = false;
    }
  }

  function isDarkTheme() {
    return (
      document.body.classList.contains('vscode-dark') ||
      document.body.classList.contains('vscode-high-contrast')
    );
  }

  /** Hard-edged bands, so a discrete scheme never reads as a smooth ramp. */
  function paletteBlocks(colors) {
    const step = 100 / colors.length;
    return (
      'linear-gradient(to right, ' +
      colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ') +
      ')'
    );
  }

  /** Preview strip shown under a palette name in the palette dropdown. */
  function palettePreview(pal, discrete) {
    if (pal.colors) {
      return paletteBlocks(pal.colors.map(normalizeHex));
    }
    const colors = sample(pal.interpolate, PALETTE_PREVIEW_STOPS);
    return discrete ? paletteBlocks(colors) : paletteGradient(colors);
  }

  /** Pins the palette menu to its trigger in viewport space, so the dialog cannot clip it. */
  function anchorMenu(node) {
    const place = () => {
      const trigger = node.parentElement?.querySelector('.viz-palette-trigger');
      if (!trigger) {
        return;
      }
      const r = trigger.getBoundingClientRect();
      const gap = 4;
      const below = window.innerHeight - r.bottom - gap * 2;
      const above = r.top - gap * 2;
      const flipUp = below < Math.min(MENU_MAX_HEIGHT, above);
      node.style.left = Math.round(r.left) + 'px';
      node.style.width = Math.round(Math.max(r.width, MENU_MIN_WIDTH)) + 'px';
      node.style.maxHeight = Math.round(Math.min(MENU_MAX_HEIGHT, flipUp ? above : below)) + 'px';
      node.style.top = flipUp ? 'auto' : Math.round(r.bottom + gap) + 'px';
      node.style.bottom = flipUp ? Math.round(window.innerHeight - r.top + gap) + 'px' : 'auto';
    };
    return trackViewportChanges(place);
  }

  function fmtVal(v) {
    if (v == null) {
      return '';
    }
    const n = Number(v);
    if (Number.isNaN(n)) {
      return String(v);
    }
    if (Number.isInteger(n)) {
      return String(n);
    }
    return n.toPrecision(4);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ----------------------------------------------------------------
  // MAP INIT (called from onMount equivalent)
  // ----------------------------------------------------------------

  function clearGridPointer() {
    pointerLatLng = null;
    hoveredPaneId = null;
    for (const [id, marker] of Object.entries(ghostMarkers)) {
      marker.remove();
      delete ghostMarkers[id];
    }
  }

  function syncGridPointer() {
    if (mapLayout.mode !== 'grid' || !pointerLatLng || hoveredPaneId === null) {
      return;
    }
    for (const [id, pane] of Object.entries(paneMaps)) {
      if (Number(id) === hoveredPaneId) {
        ghostMarkers[id]?.remove();
        delete ghostMarkers[id];
      } else if (ghostMarkers[id]) {
        ghostMarkers[id].setLatLng(pointerLatLng);
      } else {
        ghostMarkers[id] = L.marker(pointerLatLng, {
          icon: ghostIcon,
          interactive: false,
          keyboard: false,
        }).addTo(pane);
      }
    }
  }

  function hoverMap(id) {
    activePaneId = id;
    if (hoveredPaneId !== id) {
      clearGridPointer();
      hoveredPaneId = id;
    }
  }

  function leaveMap(id) {
    if (hoveredPaneId === id) {
      clearGridPointer();
    }
  }

  function initMap(id, leafletMap) {
    paneMaps = { ...paneMaps, [id]: leafletMap };
    if (id === 1 && !readySent) {
      readySent = true;
      vscode.postMessage({ type: 'ready' });
    }
    setBasemap(resolveBasemapId());
    leafletMap.on('mousemove', (event) => {
      coords = event.latlng.lng.toFixed(4) + ', ' + event.latlng.lat.toFixed(4);
      if (mapLayout.mode === 'grid') {
        hoverMap(id);
        pointerLatLng = event.latlng;
        syncGridPointer();
      }
    });
    leafletMap.on('move zoom', () => {
      if (!syncingView) {
        syncingView = true;
        try {
          const center = leafletMap.getCenter();
          const zoom = leafletMap.getZoom();
          for (const [otherId, otherMap] of Object.entries(paneMaps)) {
            if (Number(otherId) !== id) {
              otherMap.setView(center, zoom, { animate: false });
            }
          }
        } finally {
          syncingView = false;
        }
      }
    });
    leafletMap.on('moveend zoomend', () => {
      lastView = {
        center: [leafletMap.getCenter().lat, leafletMap.getCenter().lng],
        zoom: leafletMap.getZoom(),
      };
      if (id === activePaneId) {
        zoomLevel = leafletMap.getZoom();
      }
      requestAttribution(id);
    });
    for (const entry of overlays) {
      syncOverlay(entry);
    }
    syncGridPointer();
  }

  function removeMap(id, leafletMap) {
    if (paneMaps[id] !== leafletMap) {
      return;
    }
    lastView = {
      center: [leafletMap.getCenter().lat, leafletMap.getCenter().lng],
      zoom: leafletMap.getZoom(),
    };
    for (const entry of overlays) {
      delete entry.tileLayers?.[id];
    }
    clearTimeout(attributionTimer[id]);
    attributionRequests[id] = (attributionRequests[id] ?? 0) + 1;
    ghostMarkers[id]?.remove();
    delete ghostMarkers[id];
    leaveMap(id);
    delete paneBasemaps[id];
    delete googleCopyright[id];
    const remaining = { ...paneMaps };
    delete remaining[id];
    paneMaps = remaining;
    if (activePaneId === id) {
      activePaneId = 1;
    }
  }

  function saveLayout() {
    vscode.postMessage({ type: 'saveMapLayout', data: $state.snapshot(mapLayout) });
  }

  function changeRatio(path, ratio) {
    mapLayout = { ...mapLayout, tree: setSplitRatio(mapLayout.tree, path, ratio) };
  }

  function syncOverlay(entry) {
    const paneId =
      mapLayout.mapIds.find((id, index) => mapLayout.panes[index]?.includes(entry.layerIndex)) ?? 1;
    for (const [id, pane] of Object.entries(paneMaps)) {
      const current = entry.tileLayers[id];
      if (Number(id) !== paneId || !entry.visible) {
        if (current) {
          pane.removeLayer(current);
        }
        delete entry.tileLayers[id];
        continue;
      }
      if (!current) {
        entry.tileLayers[id] = L.tileLayer(entry.url, {
          maxZoom: 24,
          opacity: entry.opacity,
          attribution: 'Google Earth Engine',
          crossOrigin: 'anonymous',
        }).addTo(pane);
      } else {
        current.setOpacity(entry.opacity);
      }
      const order =
        mapLayout.panes[mapLayout.mapIds.indexOf(paneId)]?.indexOf(entry.layerIndex) ?? 0;
      entry.tileLayers[id].setZIndex(order + 1);
    }
  }

  function refreshLayers() {
    for (const entry of overlays) {
      syncOverlay(entry);
    }
  }

  function setLayout(selection) {
    mapLayout = normalizeMapLayout(
      selection,
      overlays.map((entry) => entry.layerIndex),
    );
    refreshLayers();
    saveLayout();
    mapLayoutVisible = false;
  }

  function assignLayerToMap(layerIndex, mapId) {
    const paneIndex = mapLayout.mapIds.indexOf(mapId);
    const destinationIndex = paneIndex < 0 ? mapLayout.mapIds.indexOf(1) : paneIndex;
    mapLayout = {
      ...mapLayout,
      panes: mapLayout.panes.map((pane, index) => {
        const remaining = pane.filter((id) => id !== layerIndex);
        return index === destinationIndex ? [...remaining, layerIndex] : remaining;
      }),
    };
    saveLayout();
  }

  function setLayerVisibility(layerIndex, shown) {
    const entry = overlays.find((item) => item.layerIndex === layerIndex);
    if (!entry) {
      return;
    }
    entry.visible = shown;
    syncOverlay(entry);
    overlays = [...overlays];
    vscode.postMessage({ type: 'layerVisibility', data: { layerIndex, shown } });
  }

  function setLayerOpacity(layerIndex, opacity) {
    const entry = overlays.find((item) => item.layerIndex === layerIndex);
    if (!entry) {
      return;
    }
    entry.opacity = opacity;
    entry.tileLayer.setOpacity(opacity);
    overlays = [...overlays];
    vscode.postMessage({ type: 'layerOpacity', data: { layerIndex, opacity } });
  }

  function removeLayer(layerIndex) {
    const index = overlays.findIndex((entry) => entry.layerIndex === layerIndex);
    if (index < 0) {
      return;
    }
    for (const [id, layer] of Object.entries(overlays[index].tileLayers)) {
      paneMaps[id]?.removeLayer(layer);
    }
    overlays = overlays.filter((entry) => entry.layerIndex !== layerIndex);
    if (activeScaleIndex === index) {
      activeScaleIndex = -1;
    } else if (activeScaleIndex > index) {
      activeScaleIndex--;
    }
    mapLayout = normalizeMapLayout(
      mapLayout,
      overlays.map((entry) => entry.layerIndex),
    );
    saveLayout();
    vscode.postMessage({ type: 'removeLayer', data: { layerIndex } });
  }

  function moveLayer(layerIndex, targetPaneIndex, insertIndex) {
    const sourcePaneIndex = mapLayout.panes.findIndex((pane) => pane.includes(layerIndex));
    if (
      sourcePaneIndex < 0 ||
      !mapLayout.panes[targetPaneIndex] ||
      !Number.isInteger(insertIndex)
    ) {
      return;
    }
    const sourcePosition = mapLayout.panes[sourcePaneIndex].indexOf(layerIndex);
    const targetPosition = Math.max(
      0,
      Math.min(insertIndex, mapLayout.panes[targetPaneIndex].length),
    );
    const adjustedPosition =
      sourcePaneIndex === targetPaneIndex && sourcePosition < targetPosition
        ? targetPosition - 1
        : targetPosition;
    if (sourcePaneIndex === targetPaneIndex && sourcePosition === adjustedPosition) {
      return;
    }
    const panes = mapLayout.panes.map((items) => items.filter((index) => index !== layerIndex));
    panes[targetPaneIndex].splice(adjustedPosition, 0, layerIndex);
    mapLayout = {
      ...mapLayout,
      panes,
    };
    refreshLayers();
    saveLayout();
  }

  // ----------------------------------------------------------------
  // BASEMAP
  // ----------------------------------------------------------------

  // Maps the two toggles plus the VS Code colour theme onto a basemap slot.
  function resolveBasemapId() {
    if (activeMode === 'satellite') {
      return 'satellite';
    }
    if (activeMode === 'plan') {
      return isDarkTheme() ? 'planDark' : 'planLight';
    }
    return isDarkTheme() ? 'dark' : 'light';
  }

  // Tile URLs carry a session token minted by the extension host, so they are
  // fetched on demand rather than all five up front.
  function setBasemap(id) {
    currentBasemapId = id;
    if (basemapTileLayers[id]) {
      for (const paneId of Object.keys(paneMaps)) {
        applyBasemap(Number(paneId), id);
      }
    } else if (!pendingBasemaps.has(id)) {
      pendingBasemaps.add(id);
      vscode.postMessage({ type: 'requestBasemap', data: { id } });
    }
  }

  function applyBasemap(paneId, id) {
    const pane = paneMaps[paneId];
    const config = basemapTileLayers[id];
    if (!pane || !config || paneBasemaps[paneId]?.id === id) {
      return;
    }
    if (paneBasemaps[paneId]) {
      pane.removeLayer(paneBasemaps[paneId].layer);
    }
    const next = L.tileLayer(config.url, {
      maxZoom: 24,
      maxNativeZoom: config.maxNativeZoom,
      attribution: config.attribution,
      crossOrigin: 'anonymous',
    }).addTo(pane);
    next.bringToBack();
    paneBasemaps[paneId] = { id, layer: next };
    basemapError = '';
    if (basemapIsFallback[id]) {
      setCopyright(paneId, '');
      pane.attributionControl.setPrefix('');
    } else {
      pane.attributionControl.setPrefix('Google Maps');
      requestAttribution(paneId);
    }
  }

  // Drops every cached basemap: the API key or a basemap setting changed.
  function resetBasemaps() {
    for (const [paneId, current] of Object.entries(paneBasemaps)) {
      paneMaps[paneId]?.removeLayer(current.layer);
      attributionRequests[paneId] = (attributionRequests[paneId] ?? 0) + 1;
    }
    paneBasemaps = {};
    basemapTileLayers = {};
    basemapIsFallback = {};
    pendingBasemaps = new Set();
    setBasemap(currentBasemapId);
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Google requires the copyright string for the visible extent, which changes
  // as the user pans; debounce so a drag costs one viewport call.
  function requestAttribution(paneId) {
    const pane = paneMaps[paneId];
    if (!pane || !paneBasemaps[paneId]) {
      return;
    }
    clearTimeout(attributionTimer[paneId]);
    const requestId = (attributionRequests[paneId] ?? 0) + 1;
    attributionRequests[paneId] = requestId;
    attributionTimer[paneId] = setTimeout(() => {
      if (paneMaps[paneId] !== pane) {
        return;
      }
      const b = pane.getBounds();
      vscode.postMessage({
        type: 'requestAttribution',
        data: {
          id: currentBasemapId,
          paneId,
          requestId,
          zoom: pane.getZoom(),
          bounds: {
            north: clamp(b.getNorth(), -85, 85),
            south: clamp(b.getSouth(), -85, 85),
            east: clamp(b.getEast(), -180, 180),
            west: clamp(b.getWest(), -180, 180),
          },
        },
      });
    }, 600);
  }

  function setCopyright(paneId, text) {
    const pane = paneMaps[paneId];
    if (!pane || text === googleCopyright[paneId]) {
      return;
    }
    if (googleCopyright[paneId]) {
      pane.attributionControl.removeAttribution(googleCopyright[paneId]);
    }
    googleCopyright[paneId] = text;
    if (text) {
      pane.attributionControl.addAttribution(text);
    }
  }

  function activateMode(mode) {
    activeMode = activeMode === mode ? 'theme' : mode;
    setBasemap(resolveBasemapId());
  }

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------

  window.addEventListener('message', (e) => {
    const msg = e.data;

    if (msg.type === 'basemapUrl') {
      const d = msg.data;
      pendingBasemaps.delete(d.id);
      basemapIsFallback[d.id] = d.fallback === true;
      basemapTileLayers[d.id] = d;
      if (d.id === currentBasemapId) {
        for (const paneId of Object.keys(paneMaps)) {
          applyBasemap(Number(paneId), d.id);
        }
      }
    } else if (msg.type === 'basemapError') {
      pendingBasemaps.delete(msg.data.id);
      if (msg.data.id === currentBasemapId) {
        basemapError = msg.data.message;
      }
    } else if (msg.type === 'basemapReset') {
      resetBasemaps();
    } else if (msg.type === 'attribution') {
      if (
        msg.data.id === currentBasemapId &&
        !basemapIsFallback[msg.data.id] &&
        msg.data.requestId === attributionRequests[msg.data.paneId ?? 1]
      ) {
        setCopyright(msg.data.paneId ?? 1, msg.data.copyright);
      }
    } else if (msg.type === 'mapLayout') {
      mapLayout = msg.data;
      refreshLayers();
    } else if (msg.type === 'addTileLayer') {
      const d = msg.data;
      const opacity = d.opacity ?? 1.0;
      const existing = overlays.find((entry) => entry.layerIndex === d.layerIndex);
      if (existing) {
        for (const [id, layer] of Object.entries(existing.tileLayers)) {
          paneMaps[id]?.removeLayer(layer);
        }
        existing.tileLayers = {};
        existing.url = d.url;
        existing.name = d.name || 'Layer';
        existing.visible = d.shown !== false;
        existing.opacity = opacity;
        existing.visParams = d.visParams || null;
      }
      const entry = existing ?? {
        url: d.url,
        tileLayers: {},
        tileLayer: {
          setOpacity(value) {
            const current = overlays.find((item) => item.layerIndex === d.layerIndex);
            for (const layer of Object.values(current?.tileLayers ?? {})) {
              layer.setOpacity(value);
            }
          },
        },
        name: d.name || 'Layer',
        visible: d.shown !== false,
        opacity,
        visParams: d.visParams || null,
        layerIndex: d.layerIndex,
      };
      overlays = existing ? [...overlays] : [...overlays, entry];
      if (d.mapId !== undefined) {
        assignLayerToMap(d.layerIndex, d.mapId);
      } else if (!mapLayout.panes.some((pane) => pane.includes(d.layerIndex))) {
        mapLayout = {
          ...mapLayout,
          panes: mapLayout.panes.map((pane, index) =>
            mapLayout.mapIds[index] === 1 ? [...pane, d.layerIndex] : pane,
          ),
        };
        saveLayout();
      }
      syncOverlay(entry);
    } else if (msg.type === 'centerObject') {
      const d = msg.data;
      if (d.bounds) {
        const bounds = L.latLngBounds(
          L.latLng(d.bounds[0], d.bounds[1]),
          L.latLng(d.bounds[2], d.bounds[3]),
        );
        if (d.zoom) {
          map.setView(bounds.getCenter(), d.zoom);
        } else {
          map.fitBounds(bounds);
        }
      }
    } else if (msg.type === 'setCenter') {
      const d = msg.data;
      map.setView([d.lat, d.lon], d.zoom || map.getZoom());
    } else if (msg.type === 'replaceTileLayer') {
      const d = msg.data;
      const idx = overlays.findIndex((o) => o.layerIndex === d.layerIndex);
      if (idx >= 0) {
        const entry = overlays[idx];
        // `shown`/`opacity` are only sent by addLayer replacements; updateLayer omits them.
        const opacity = d.opacity ?? entry.opacity;
        const visible = d.shown === undefined ? entry.visible : d.shown !== false;
        for (const [id, layer] of Object.entries(entry.tileLayers)) {
          paneMaps[id]?.removeLayer(layer);
        }
        entry.tileLayers = {};
        entry.url = d.url;
        entry.opacity = opacity;
        entry.visible = visible;
        entry.visParams = d.visParams;
        if (d.mapId !== undefined) {
          assignLayerToMap(d.layerIndex, d.mapId);
        }
        syncOverlay(entry);
        overlays = [...overlays];
        if (activeScaleIndex === idx) {
          if (entry.visParams && (entry.visParams.palette || entry.visParams.bands)) {
            activeScaleIndex = idx;
          } else {
            activeScaleIndex = -1;
          }
        }
      }
    } else if (msg.type === 'removeTileLayer') {
      const idx = overlays.findIndex((o) => o.layerIndex === msg.data.layerIndex);
      if (idx >= 0) {
        const entry = overlays[idx];
        for (const [id, layer] of Object.entries(entry.tileLayers)) {
          paneMaps[id]?.removeLayer(layer);
        }
        overlays = overlays.filter((_, i) => i !== idx);
        mapLayout = normalizeMapLayout(
          mapLayout,
          overlays.map((item) => item.layerIndex),
        );
        saveLayout();
        if (activeScaleIndex === idx) {
          activeScaleIndex = -1;
        } else if (activeScaleIndex > idx) {
          activeScaleIndex--;
        }
      }
    } else if (msg.type === 'clearLayers') {
      for (const entry of overlays) {
        for (const [id, layer] of Object.entries(entry.tileLayers)) {
          paneMaps[id]?.removeLayer(layer);
        }
      }
      overlays = [];
      mapLayout = normalizeMapLayout(mapLayout);
      saveLayout();
      activeScaleIndex = -1;
    }
  });

  // ----------------------------------------------------------------
  // LIFECYCLE
  // ----------------------------------------------------------------

  $effect(() => {
    const observer = new MutationObserver(() => setBasemap(resolveBasemapId()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  });

  $effect(() => {
    if (mapLayout.mode !== 'grid') {
      clearGridPointer();
    }
  });

  $effect(() => {
    if (!attributionFooter) {
      return;
    }
    const controls = Object.values(paneMaps)
      .map((pane) => pane.attributionControl.getContainer())
      .filter(Boolean);
    const update = () => {
      const seen = new Set();
      const items = [];
      for (const control of controls) {
        const text = control.textContent.trim();
        if (!text || seen.has(text)) {
          continue;
        }
        seen.add(text);
        const item = document.createElement('span');
        item.className = 'attribution-item';
        for (const child of control.childNodes) {
          item.appendChild(child.cloneNode(true));
        }
        items.push(item);
      }
      attributionFooter.replaceChildren(...items);
    };
    const observer = new MutationObserver(update);
    for (const control of controls) {
      observer.observe(control, { childList: true, characterData: true, subtree: true });
    }
    update();
    return () => observer.disconnect();
  });
</script>

<!-- MAP -->
<div class="map-viewport">
  <MapSplitView
    tree={mapLayout.tree}
    mode={mapLayout.mode}
    onratio={changeRatio}
    onratioend={saveLayout}
  >
    {#snippet pane(id)}
      <MapPane
        {id}
        center={map ? [map.getCenter().lat, map.getCenter().lng] : lastView.center}
        zoom={map?.getZoom() ?? lastView.zoom}
        oncreate={initMap}
        onremove={removeMap}
        onactive={(paneId) => (activePaneId = paneId)}
        onhover={hoverMap}
        onleave={leaveMap}
      />
    {/snippet}
  </MapSplitView>
</div>
<MapVisualizationEditor {map} bind:overlays />

{#if basemapError}
  <div class="basemap-error">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"
      ><path d={mdiAlertCircleOutline} /></svg
    >
    <span class="basemap-error-text">{basemapError}</span>
    <button class="basemap-error-btn" onclick={() => vscode.postMessage({ type: 'setApiKey' })}>
      Set API key
    </button>
    <MapButton
      class="basemap-error-close"
      title="Dismiss"
      onclick={() => {
        basemapError = '';
      }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"
        ><path d={mdiClose} /></svg
      >
    </MapButton>
  </div>
{/if}

<MapScale maps={paneMaps} {overlays} {activeScaleIndex} />

<!-- CONTROLS -->
<div class="map-controls">
  <MapMenu
    title="Manage layers"
    bind:visible={layersPanelVisible}
    onopen={() => openMenu('layers')}
  >
    {#snippet icon()}
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"
        ><path d={mdiLayers} /></svg
      >
    {/snippet}
    {#snippet panel()}
      <MapLayerControl
        {overlays}
        panes={mapLayout.panes}
        mapIds={mapLayout.mapIds}
        bind:visible={layersPanelVisible}
        bind:activeScaleIndex
        onvisibility={setLayerVisibility}
        onopacity={setLayerOpacity}
        onremove={removeLayer}
        onmove={moveLayer}
      />
    {/snippet}
  </MapMenu>
  <MapMenu
    title="Manage geometries"
    beta
    bind:visible={geometriesPanelVisible}
    onopen={() => openMenu('geometries')}
    onclose={() => (drawMode = null)}
  >
    {#snippet icon()}
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"
        ><path d={mdiShapeOutline} /></svg
      >
    {/snippet}
    {#snippet panel()}
      <MapGeometryControl
        {map}
        maps={paneMaps}
        bind:visible={geometriesPanelVisible}
        bind:drawMode
      />
    {/snippet}
  </MapMenu>
  <MapMenu
    title="Pixel inspector"
    bind:visible={inspectorActive}
    onopen={() => openMenu('inspector')}
    onclose={() => (drawMode = null)}
  >
    {#snippet icon()}
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"
        ><path d={mdiCrosshairsGps} /></svg
      >
    {/snippet}
    {#snippet panel()}
      <MapInspector
        maps={paneMaps}
        panes={mapLayout.panes}
        mapIds={mapLayout.mapIds}
        bind:active={inspectorActive}
        onactive={(paneId) => (activePaneId = paneId)}
        cursor={drawMode || activeScaleIndex >= 0 ? 'crosshair' : ''}
      />
    {/snippet}
  </MapMenu>
  <MapButton
    active={activeMode === 'plan'}
    title="Toggle plan view"
    onclick={() => activateMode('plan')}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"
      ><path d={mdiMap} /></svg
    >
  </MapButton>
  <MapButton
    active={activeMode === 'satellite'}
    title="Toggle satellite view"
    onclick={() => activateMode('satellite')}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"
      ><path d={mdiSatelliteVariant} /></svg
    >
  </MapButton>
</div>

<div class="map-layout-controls">
  <MapButton
    title="Configure map layout"
    beta
    aria-haspopup="dialog"
    aria-expanded={mapLayoutVisible}
    active={mapLayoutVisible}
    onclick={() => {
      openMenu('layout');
      mapLayoutVisible = true;
    }}
  >
    <i class="codicon codicon-layout" aria-hidden="true"></i>
  </MapButton>
</div>

{#if mapLayoutVisible}
  <MapLayoutDialog
    layers={overlays}
    initial={mapLayout}
    onapply={setLayout}
    oncancel={() => (mapLayoutVisible = false)}
  />
{/if}

<!-- STATUS BAR -->
<div class="status-bar">
  <span>lon, lat: {coords}</span>
  <span class="status-attribution" aria-label="Map attribution" bind:this={attributionFooter}
  ></span>
  <span>Zoom: {zoomLevel}</span>
</div>

<style>
  :global {
    /* ==================================================================
       RESET & LAYOUT
       ================================================================== */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      font-family: var(--vscee-font-family, sans-serif);
    }
    #app {
      width: 100%;
      height: 100%;
    }
    .map-viewport {
      width: 100%;
      height: calc(100% - 20px);
      overflow: auto;
    }

    /* ==================================================================
       MAP CONTROLS
       ================================================================== */
    .map-controls {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: var(--vscee-space-sm);
    }
    .map-layout-controls {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
    }
    /* ==================================================================
       BASEMAP ERROR BANNER
       ================================================================== */
    .basemap-error {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1100;
      display: flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      max-width: min(640px, calc(100% - 120px));
      padding: var(--vscee-space-sm) var(--vscee-space-md);
      border: 1px solid var(--vscee-color-validation-warning-border);
      border-radius: var(--vscee-radius-md);
      background: var(--vscee-color-validation-warning-background);
      color: var(--vscee-color-foreground);
      box-shadow: var(--vscee-shadow-sm);
    }
    .basemap-error-text {
      flex: 1;
      font-size: var(--vscee-font-sm);
    }
    .basemap-error-btn {
      flex-shrink: 0;
      border: none;
      border-radius: var(--vscee-radius-sm);
      padding: 2px 10px;
      cursor: pointer;
      background: var(--vscee-color-button-background);
      color: var(--vscee-color-button-foreground);
      font-size: var(--vscee-font-sm);
    }
    .basemap-error-btn:hover {
      background: var(--vscee-color-button-hover);
    }
    .basemap-error-close {
      width: 22px;
      height: 22px;
      box-shadow: none;
      background: transparent;
    }

    /* ==================================================================
       LEAFLET ATTRIBUTION
       ================================================================== */
    .map-viewport .leaflet-control-attribution {
      display: none;
    }
    .grid-ghost-cursor {
      display: grid;
      place-items: center;
      background: transparent;
      border: 0;
      color: var(--vscode-editor-foreground);
      opacity: 0.7;
      pointer-events: none;
      .codicon {
        font-size: 20px;
      }
    }

    /* ==================================================================
       STATUS BAR
       ================================================================== */
    .status-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      background: var(--vscee-color-editor-background);
      color: var(--vscee-color-statusbar-foreground);
      padding: var(--vscee-space-xxs) var(--vscee-space-lg);
      font-size: var(--vscee-font-compact-sm);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--vscee-space-sm);
      white-space: nowrap;
    }
    .status-attribution {
      display: flex;
      justify-content: center;
      gap: var(--vscee-space-sm);
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
      .attribution-item {
        flex-shrink: 0;
        & + .attribution-item::before {
          content: '| ';
        }
      }
      a {
        color: var(--vscee-color-link);
      }
    }
  }
</style>
