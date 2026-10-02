<!-- MapPanel: Leaflet-based map with EE tile layers, inspector, scale bar and viz editor -->
<script>
  import L from 'leaflet';
  import MapButton from './MapButton.svelte';
  import MapInspector from './MapInspector.svelte';
  import MapLayerControl from './MapLayerControl.svelte';
  import MapScale from './MapScale.svelte';
  import MapVisualizationEditor from './MapVisualizationEditor.svelte';
  import { vscode } from '../../shared/vscode.ts';
  import { trackViewportChanges } from '../../shared/viewportAnchor.ts';
  import {
    mdiAlertCircleOutline,
    mdiCrosshairsGps,
    mdiLayers,
    mdiMap,
    mdiSatelliteVariant,
    mdiTrashCan,
  } from '../../shared/icons.ts';

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------

  let map = $state(null);
  let overlays = $state([]);
  let layersPanelVisible = $state(false);
  let inspectorActive = $state(false);
  let activeScaleIndex = $state(-1);
  let coords = $state('0.0000, 0.0000');
  let zoomLevel = $state(2);

  let activeMode = $state('theme');
  // Message shown when the Google Maps API key is missing or createSession failed.
  let basemapError = $state('');

  // Internal refs
  let basemapTileLayers = {};
  let basemapIsFallback = {};
  let pendingBasemaps = new Set();
  let currentBasemap = null;
  let currentBasemapId = 'light';
  let googleCopyright = '';
  let attributionTimer = null;
  let nativeLayerControl = $state(null);

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------

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

  function initMap() {
    map = L.map('map', { center: [0, 0], zoom: 2, zoomControl: false });

    // Set per basemap: Google's terms require the "Google Maps" mark, the
    // keyless fallbacks must not carry it.
    map.attributionControl.setPrefix('');

    nativeLayerControl = L.control.layers({}, {}, { collapsed: true }).addTo(map);
    nativeLayerControl.getContainer().style.display = 'none';

    setBasemap(resolveBasemapId());

    // Theme sync
    new MutationObserver(() => {
      setBasemap(resolveBasemapId());
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Status bar events
    map.on('mousemove', (e) => {
      coords = e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
    });
    map.on('zoomend', () => {
      zoomLevel = map.getZoom();
    });
    map.on('moveend zoomend', requestAttribution);

    // Signal the extension host that the map is ready to receive layers.
    // The host uses this to replay any layer added before the panel was (re)opened.
    vscode.postMessage({ type: 'ready' });
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
    const next = basemapTileLayers[id];
    if (next) {
      applyBasemap(next);
    } else if (!pendingBasemaps.has(id)) {
      pendingBasemaps.add(id);
      vscode.postMessage({ type: 'requestBasemap', data: { id } });
    }
  }

  function applyBasemap(next) {
    if (next === currentBasemap) {
      return;
    }
    if (currentBasemap) {
      map.removeLayer(currentBasemap);
    }
    next.addTo(map);
    // Leaflet stacks tile layers in DOM order, so a freshly added basemap would
    // otherwise sit on top of the Earth Engine overlays.
    next.bringToBack();
    currentBasemap = next;
    basemapError = '';
    if (basemapIsFallback[currentBasemapId]) {
      setCopyright('');
      map.attributionControl.setPrefix('');
    } else {
      map.attributionControl.setPrefix('Google Maps');
      requestAttribution();
    }
  }

  // Drops every cached basemap: the API key or a basemap setting changed.
  function resetBasemaps() {
    if (currentBasemap) {
      map.removeLayer(currentBasemap);
    }
    currentBasemap = null;
    basemapTileLayers = {};
    basemapIsFallback = {};
    pendingBasemaps = new Set();
    setBasemap(currentBasemapId);
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Google requires the copyright string for the visible extent, which changes
  // as the user pans; debounce so a drag costs one viewport call.
  function requestAttribution() {
    if (!map || !currentBasemap) {
      return;
    }
    clearTimeout(attributionTimer);
    attributionTimer = setTimeout(() => {
      const b = map.getBounds();
      vscode.postMessage({
        type: 'requestAttribution',
        data: {
          id: currentBasemapId,
          zoom: map.getZoom(),
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

  function setCopyright(text) {
    if (text === googleCopyright) {
      return;
    }
    if (googleCopyright) {
      map.attributionControl.removeAttribution(googleCopyright);
    }
    googleCopyright = text;
    if (text) {
      map.attributionControl.addAttribution(text);
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
      // Leaflet upscales past `maxNativeZoom` so the basemap does not vanish
      // under a deeply zoomed Earth Engine layer.
      basemapTileLayers[d.id] = L.tileLayer(d.url, {
        maxZoom: 24,
        maxNativeZoom: d.maxNativeZoom,
        attribution: d.attribution,
        crossOrigin: 'anonymous',
      });
      if (d.id === currentBasemapId) {
        applyBasemap(basemapTileLayers[d.id]);
      }
    } else if (msg.type === 'basemapError') {
      pendingBasemaps.delete(msg.data.id);
      if (msg.data.id === currentBasemapId) {
        basemapError = msg.data.message;
      }
    } else if (msg.type === 'basemapReset') {
      resetBasemaps();
    } else if (msg.type === 'attribution') {
      if (msg.data.id === currentBasemapId && !basemapIsFallback[msg.data.id]) {
        setCopyright(msg.data.copyright);
      }
    } else if (msg.type === 'addTileLayer') {
      const d = msg.data;
      const opacity = d.opacity ?? 1.0;
      const tileLayer = L.tileLayer(d.url, {
        maxZoom: 24,
        opacity,
        attribution: 'Google Earth Engine',
        crossOrigin: 'anonymous',
      });
      nativeLayerControl.addOverlay(tileLayer, d.name || 'Layer');
      const entry = {
        tileLayer,
        name: d.name || 'Layer',
        visible: d.shown !== false,
        opacity,
        visParams: d.visParams || null,
        layerIndex: d.layerIndex,
      };
      overlays = [...overlays, entry];
      if (d.shown !== false) {
        tileLayer.addTo(map);
      }
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
        if (entry.visible) {
          map.removeLayer(entry.tileLayer);
        }
        nativeLayerControl.removeLayer(entry.tileLayer);
        entry.tileLayer = L.tileLayer(d.url, {
          maxZoom: 24,
          opacity,
          attribution: 'Google Earth Engine',
          crossOrigin: 'anonymous',
        });
        entry.opacity = opacity;
        entry.visible = visible;
        nativeLayerControl.addOverlay(entry.tileLayer, entry.name);
        entry.visParams = d.visParams;
        if (visible) {
          entry.tileLayer.addTo(map);
        }
        overlays = [...overlays];
        if (activeScaleIndex === idx) {
          if (entry.visParams && (entry.visParams.palette || entry.visParams.bands)) {
            activeScaleIndex = idx;
          } else {
            activeScaleIndex = -1;
          }
        }
      }
    } else if (msg.type === 'clearLayers') {
      for (const entry of overlays) {
        if (entry.visible) {
          map.removeLayer(entry.tileLayer);
        }
        nativeLayerControl.removeLayer(entry.tileLayer);
      }
      overlays = [];
      activeScaleIndex = -1;
    }
  });

  // ----------------------------------------------------------------
  // LIFECYCLE
  // ----------------------------------------------------------------

  // Use $effect to run after first render
  $effect(() => {
    if (!map && document.getElementById('map')) {
      initMap();
    }
  });
</script>

<!-- MAP -->
<div id="map"></div>
<MapInspector
  {map}
  bind:active={inspectorActive}
  cursor={activeScaleIndex >= 0 ? 'crosshair' : ''}
/>
<MapLayerControl
  {map}
  bind:overlays
  bind:visible={layersPanelVisible}
  bind:activeScaleIndex
  {nativeLayerControl}
/>
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

<MapScale {map} {overlays} {activeScaleIndex} />

<!-- CONTROLS -->
<div class="map-controls">
  <MapButton
    active={layersPanelVisible}
    title="Manage layers"
    onclick={() => {
      layersPanelVisible = !layersPanelVisible;
      if (layersPanelVisible) {
        inspectorActive = false;
      }
    }}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"
      ><path d={mdiLayers} /></svg
    >
  </MapButton>
  <MapButton
    active={inspectorActive}
    title="Pixel inspector"
    onclick={() => {
      inspectorActive = !inspectorActive;
      layersPanelVisible = false;
    }}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"
      ><path d={mdiCrosshairsGps} /></svg
    >
  </MapButton>
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

<div class="map-controls map-controls-right">
  <MapButton
    title="Clear all layers"
    onclick={() => vscode.postMessage({ type: 'clearAllLayers' })}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"
      ><path d={mdiTrashCan} /></svg
    >
  </MapButton>
</div>

<!-- STATUS BAR -->
<div class="status-bar">
  <span>{coords}</span>
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
    #map {
      width: 100%;
      height: calc(100% - 20px);
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
    .map-controls-right {
      left: auto;
      right: 10px;
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
    .leaflet-control-attribution {
      background: var(--vscee-color-editor-background) !important;
      color: var(--vscee-color-foreground) !important;
      opacity: 0.8;
    }
    .leaflet-control-attribution a {
      color: var(--vscee-color-link) !important;
    }

    /* ==================================================================
       RANGE SLIDERS
       ================================================================== */
    .range-slider {
      height: 12px;
      cursor: pointer;
      appearance: none;
      background: transparent;

      /* Track is painted up to --slider-fill so the filled side survives the custom thumb. */
      &::-webkit-slider-runnable-track {
        height: 3px;
        border-radius: var(--vscee-radius-sm);
        background: linear-gradient(
          to right,
          var(--vscee-color-button-background) 0 var(--slider-fill),
          var(--vscee-color-scrollbar-slider) var(--slider-fill)
        );
      }
      &::-moz-range-track {
        height: 3px;
        border-radius: var(--vscee-radius-sm);
        background: linear-gradient(
          to right,
          var(--vscee-color-button-background) 0 var(--slider-fill),
          var(--vscee-color-scrollbar-slider) var(--slider-fill)
        );
      }
      &::-webkit-slider-thumb {
        appearance: none;
        width: 12px;
        height: 12px;
        margin-top: -4.5px;
        box-sizing: border-box;
        border: var(--vscee-border-sm) solid var(--vscee-color-button-background);
        border-radius: 50%;
        background: var(--vscee-color-button-background);
        /* Carves the ring out of the disc, leaving a round dot in the middle. */
        box-shadow:
          inset 0 0 0 3px var(--vscee-color-editor-background),
          var(--vscee-shadow-xs);
      }
      &::-moz-range-thumb {
        width: 12px;
        height: 12px;
        box-sizing: border-box;
        border: var(--vscee-border-sm) solid var(--vscee-color-button-background);
        border-radius: 50%;
        background: var(--vscee-color-button-background);
        box-shadow:
          inset 0 0 0 3px var(--vscee-color-editor-background),
          var(--vscee-shadow-xs);
      }
      &:focus {
        outline: none;
      }
      &:focus-visible::-webkit-slider-thumb {
        box-shadow:
          inset 0 0 0 3px var(--vscee-color-editor-background),
          var(--vscee-shadow-sm);
      }
      &:focus-visible::-moz-range-thumb {
        box-shadow:
          inset 0 0 0 3px var(--vscee-color-editor-background),
          var(--vscee-shadow-sm);
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
      background: var(--vscee-color-statusbar-background);
      color: var(--vscee-color-statusbar-foreground);
      padding: var(--vscee-space-xxs) var(--vscee-space-lg);
      font-size: var(--vscee-font-compact-sm);
      display: flex;
      justify-content: space-between;
    }
  }
</style>
