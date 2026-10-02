<!-- MapPanel: Leaflet-based map with EE tile layers, inspector, scale bar and viz editor -->
<script>
  import L from 'leaflet';
  import MapButton from './MapButton.svelte';
  import MapInspector from './MapInspector.svelte';
  import MapLayerControl from './MapLayerControl.svelte';
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

  // Floating tooltip that follows the mouse while a colour-scale layer is active.
  let cursorTooltipText = $state('');
  let cursorTooltipX = $state(0);
  let cursorTooltipY = $state(0);
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
  let _sampleCanvas = null;
  // Opacity the edited layer had when the dialog opened, restored on Cancel.

  // ----------------------------------------------------------------
  // DERIVED
  // ----------------------------------------------------------------

  let scaleData = $derived.by(() => {
    if (activeScaleIndex < 0) {
      return null;
    }
    const entry = overlays[activeScaleIndex];
    if (!entry || !entry.visParams) {
      return null;
    }
    const vp = entry.visParams;
    const bands = vp.bands || [];
    const palette = vp.palette || null;
    const minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
    const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];
    const isCategorical = Array.isArray(vp.values) && vp.values.length > 0;

    if (isCategorical) {
      return {
        type: 'categorical',
        palette: palette || [],
        labels: vp.labels || [],
        values: vp.values,
      };
    } else if (palette && bands.length <= 1) {
      return {
        type: 'gradient',
        rows: [
          {
            label: bands[0] || 'b0',
            min: minArr[0],
            max: maxArr[0],
            gradient: paletteGradient(palette),
          },
        ],
      };
    } else if (bands.length === 3) {
      const ch = ['#ff0000', '#00ff00', '#0000ff'];
      return {
        type: 'gradient',
        rows: bands.map((b, i) => ({
          label: b || 'b' + i,
          min: minArr[i] != null ? minArr[i] : minArr[0],
          max: maxArr[i] != null ? maxArr[i] : maxArr[0],
          gradient: `linear-gradient(to right, #000, ${ch[i]})`,
        })),
      };
    } else if (palette) {
      return {
        type: 'gradient',
        rows: [{ label: 'b0', min: minArr[0], max: maxArr[0], gradient: paletteGradient(palette) }],
      };
    }
    return {
      type: 'gradient',
      rows: [
        {
          label: 'b0',
          min: minArr[0],
          max: maxArr[0],
          gradient: 'linear-gradient(to right, #000, #fff)',
        },
      ],
    };
  });

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------

  function isDarkTheme() {
    return (
      document.body.classList.contains('vscode-dark') ||
      document.body.classList.contains('vscode-high-contrast')
    );
  }

  function paletteGradient(palette) {
    if (!palette || palette.length === 0) {
      return 'linear-gradient(to right, #000, #fff)';
    }
    const colors = palette.map((c) => (c.startsWith('#') ? c : '#' + c));
    return 'linear-gradient(to right, ' + colors.join(', ') + ')';
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
      cursorTooltipX = e.originalEvent.clientX;
      cursorTooltipY = e.originalEvent.clientY;
      updateScaleFromMap(e.latlng);
    });
    map.on('mouseout', () => {
      cursorTooltipText = '';
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
  // SCALE BAR — pixel tracking
  // ----------------------------------------------------------------

  function sampleOverlayPixel(latlng, idx) {
    const entry = overlays[idx];
    if (!entry || !entry.visible) {
      return null;
    }
    const container = entry.tileLayer.getContainer();
    if (!container) {
      return null;
    }
    const pt = map.latLngToContainerPoint(latlng);
    const mapRect = map.getContainer().getBoundingClientRect();
    const tiles = container.querySelectorAll('img');
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const r = tile.getBoundingClientRect();
      const tx = r.left - mapRect.left;
      const ty = r.top - mapRect.top;
      if (pt.x >= tx && pt.x < tx + r.width && pt.y >= ty && pt.y < ty + r.height) {
        try {
          if (!_sampleCanvas) {
            _sampleCanvas = document.createElement('canvas');
          }
          _sampleCanvas.width = tile.naturalWidth || 256;
          _sampleCanvas.height = tile.naturalHeight || 256;
          const ctx = _sampleCanvas.getContext('2d');
          ctx.drawImage(tile, 0, 0);
          const sx = ((pt.x - tx) / r.width) * _sampleCanvas.width;
          const sy = ((pt.y - ty) / r.height) * _sampleCanvas.height;
          return ctx.getImageData(Math.floor(sx), Math.floor(sy), 1, 1).data;
        } catch (_) {
          return null;
        }
      }
    }
    return null;
  }

  function updateScaleFromMap(latlng) {
    if (activeScaleIndex < 0) {
      return;
    }
    const rgba = sampleOverlayPixel(latlng, activeScaleIndex);
    if (!rgba || rgba[3] === 0) {
      document.querySelectorAll('.scale-pointer').forEach((p) => {
        p.style.display = 'none';
      });
      cursorTooltipText = '';
      return;
    }
    const entry = overlays[activeScaleIndex];
    if (!entry || !entry.visParams) {
      return;
    }
    const vp = entry.visParams;
    const bands = vp.bands || [];
    const palette = vp.palette || null;
    const minArr = Array.isArray(vp.min) ? vp.min : [vp.min != null ? vp.min : 0];
    const maxArr = Array.isArray(vp.max) ? vp.max : [vp.max != null ? vp.max : 1];
    const isCategorical = Array.isArray(vp.values) && vp.values.length > 0;

    const parts = [];
    if (isCategorical && palette) {
      const bestIdx = findClosestPaletteIndex(rgba, palette);
      const label = highlightCategoryDOM(bestIdx);
      if (label) {
        parts.push(label);
      }
      cursorTooltipText = parts.join('\n');
      return;
    }

    const rows = document.querySelectorAll('.scale-row');
    if (palette && bands.length <= 1 && rows[0]) {
      const bestIdx = findClosestPaletteIndex(rgba, palette);
      const pct = palette.length > 1 ? bestIdx / (palette.length - 1) : 0;
      const t = setPointerDOM(rows[0], pct, minArr[0], maxArr[0]);
      if (t) {
        parts.push(t);
      }
    } else if (bands.length === 3) {
      if (rows[0]) {
        const t = setPointerDOM(rows[0], rgba[0] / 255, minArr[0], maxArr[0]);
        if (t) {
          parts.push(`${bands[0] || 'R'}: ${t}`);
        }
      }
      if (rows[1]) {
        const t = setPointerDOM(
          rows[1],
          rgba[1] / 255,
          minArr[1] ?? minArr[0],
          maxArr[1] ?? maxArr[0],
        );
        if (t) {
          parts.push(`${bands[1] || 'G'}: ${t}`);
        }
      }
      if (rows[2]) {
        const t = setPointerDOM(
          rows[2],
          rgba[2] / 255,
          minArr[2] ?? minArr[0],
          maxArr[2] ?? maxArr[0],
        );
        if (t) {
          parts.push(`${bands[2] || 'B'}: ${t}`);
        }
      }
    }
    cursorTooltipText = parts.join('\n');
  }

  function findClosestPaletteIndex(rgba, palette) {
    let bestIdx = 0,
      bestDist = Infinity;
    for (let pi = 0; pi < palette.length; pi++) {
      const hex = palette[pi].startsWith('#') ? palette[pi].slice(1) : palette[pi];
      const len = hex.length === 3 ? 1 : 2;
      const pr = parseInt(hex.slice(0, len).padStart(2, hex[0]), 16);
      const pg = parseInt(hex.slice(len, len * 2).padStart(2, hex[len]), 16);
      const pb = parseInt(hex.slice(len * 2, len * 3).padStart(2, hex[len * 2]), 16);
      const dist = (rgba[0] - pr) ** 2 + (rgba[1] - pg) ** 2 + (rgba[2] - pb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = pi;
      }
    }
    return bestIdx;
  }

  function setPointerDOM(row, pct, min, max) {
    const pointer = row.querySelector('.scale-pointer');
    const maxEl = row.querySelector('.scale-max');
    if (!pointer) {
      return null;
    }
    const c = Math.max(0, Math.min(1, pct));
    pointer.style.left = c * 100 + '%';
    pointer.style.display = 'block';
    const val = min + c * (max - min);
    const text = fmtVal(val);
    if (maxEl) {
      maxEl.textContent = text;
    }
    return text;
  }

  function highlightCategoryDOM(index) {
    const segments = document.querySelectorAll('.scale-cat-segment');
    const pointer = document.querySelector('.scale-cat-pointer');
    const maxEl = document.querySelector('.scale-bar .scale-max');
    const n = segments.length;
    if (!pointer || n === 0) {
      return null;
    }
    const pct = ((index + 0.5) / n) * 100;
    pointer.style.left = pct + '%';
    pointer.style.display = 'block';
    const seg = segments[index];
    if (!seg) {
      return null;
    }
    const label = seg.dataset.catLabel || 'Class ' + index;
    if (maxEl) {
      maxEl.textContent = label;
    }
    return label;
  }

  function handleScaleRowHover(e, min, max) {
    const wrap = e.currentTarget;
    const rect = wrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const val = min + pct * (max - min);
    const pointer = wrap.querySelector('.scale-pointer');
    if (pointer) {
      pointer.style.left = pct * 100 + '%';
      pointer.style.display = 'block';
    }
    const maxEl = wrap.parentElement?.querySelector('.scale-max');
    if (maxEl) {
      maxEl.textContent = fmtVal(val);
    }
  }

  function handleScaleRowLeave(e) {
    const wrap = e.currentTarget;
    const pointer = wrap.querySelector('.scale-pointer');
    if (pointer) {
      pointer.style.display = 'none';
    }
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

{#if activeScaleIndex >= 0 && cursorTooltipText}
  <div
    class="cursor-value-tooltip"
    style="left: {cursorTooltipX + 12}px; top: {cursorTooltipY + 12}px;"
  >
    {cursorTooltipText}
  </div>
{/if}

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

<!-- SCALE BAR -->
{#if scaleData}
  <div class="scale-bar visible">
    {#if scaleData.type === 'categorical'}
      <div class="scale-row">
        <span class="scale-label"></span>
        <div class="scale-gradient-wrap scale-cat-wrap">
          {#each scaleData.palette as color, i}
            {@const catLabel =
              (scaleData.labels[i] || 'Class ' + i) +
              (scaleData.values[i] != null ? ' (' + scaleData.values[i] + ')' : '')}
            <div
              class="scale-cat-segment"
              style="background:{color.startsWith('#') ? color : '#' + color};width:{100 /
                scaleData.palette.length}%"
              data-index={i}
              data-cat-label={catLabel}
            ></div>
          {/each}
          <div class="scale-pointer scale-cat-pointer"></div>
        </div>
        <span class="scale-max">{scaleData.palette.length} classes</span>
      </div>
    {:else}
      {#each scaleData.rows as row}
        <div class="scale-row">
          <span class="scale-label" title={row.label}>{row.label}</span>
          <div
            class="scale-gradient-wrap"
            role="slider"
            tabindex="0"
            aria-valuenow={row.min}
            aria-valuemin={row.min}
            aria-valuemax={row.max}
            onmousemove={(e) => handleScaleRowHover(e, row.min, row.max)}
            onmouseleave={handleScaleRowLeave}
          >
            <div class="scale-gradient" style="background:{row.gradient}"></div>
            <div class="scale-pointer"></div>
          </div>
          <span class="scale-max">{fmtVal(row.min)}–{fmtVal(row.max)}</span>
        </div>
      {/each}
    {/if}
  </div>
{/if}

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
       SCALE BAR
       ================================================================== */
    .scale-bar {
      position: absolute;
      bottom: 20px;
      left: 0;
      right: 0;
      z-index: 1000;
      display: none;
      background: var(--vscee-color-statusbar-background);
      padding: var(--vscee-space-xxs) var(--vscee-space-lg);
      gap: var(--vscee-space-xs);
      flex-direction: column;
    }
    .scale-bar.visible {
      display: flex;
    }
    .scale-row {
      display: flex;
      align-items: center;
      gap: var(--vscee-space-sm);
      height: 16px;
    }
    .scale-label {
      font-size: var(--vscee-font-compact-xxs);
      color: var(--vscee-color-muted);
      width: 28px;
      flex-shrink: 0;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .scale-gradient-wrap {
      flex: 1;
      height: 12px;
      position: relative;
      border-radius: var(--vscee-radius-sm);
      overflow: visible;
      cursor: crosshair;
    }
    .scale-gradient {
      width: 100%;
      height: 100%;
      border-radius: var(--vscee-radius-sm);
    }
    .scale-max {
      font-size: var(--vscee-font-compact-xxs);
      color: var(--vscee-color-muted);
      flex-shrink: 0;
      width: 70px;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .scale-pointer {
      position: absolute;
      top: 0;
      width: 2px;
      height: 100%;
      background: var(--vscee-color-foreground);
      pointer-events: none;
      display: none;
      opacity: 0.9;
      transition: left 0.1s ease-out;
    }
    .scale-tooltip {
      display: none;
    }
    .cursor-value-tooltip {
      position: fixed;
      pointer-events: none;
      z-index: 1000;
      background: var(--vscee-color-editor-background);
      color: var(--vscee-color-foreground);
      font-size: var(--vscee-font-compact-xxs);
      padding: var(--vscee-space-xxs) var(--vscee-space-xs);
      border-radius: var(--vscee-radius-sm);
      white-space: pre-line;
      box-shadow: var(--vscee-shadow-xs);
      font-variant-numeric: tabular-nums;
    }
    .scale-cat-wrap {
      display: flex;
      overflow: visible;
      gap: 0;
      cursor: pointer;
    }
    .scale-cat-segment {
      height: 100%;
      position: relative;
      transition: opacity 0.1s;
    }
    .scale-cat-segment:first-child {
      border-radius: var(--vscee-radius-sm) 0 0 var(--vscee-radius-sm);
    }
    .scale-cat-segment:last-child {
      border-radius: 0 var(--vscee-radius-sm) var(--vscee-radius-sm) 0;
    }
    .scale-cat-pointer {
      left: 50%;
      transform: translateX(-50%);
      transition: left 0.1s ease-out;
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
