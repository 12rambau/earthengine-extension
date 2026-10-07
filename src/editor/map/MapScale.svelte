<!-- MapScale: visualization scale bar and pixel-value tracking -->
<script>
  import { intervalStops } from '../../shared/sepalViz.ts';

  let { map, overlays = [], activeScaleIndex = -1 } = $props();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------

  let cursorTooltipText = $state('');
  let cursorTooltipX = $state(0);
  let cursorTooltipY = $state(0);
  let _sampleCanvas = null;

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
    const isCategorical = (Array.isArray(vp.values) && vp.values.length > 0) ||
      (vp.vizType === 'intervals' && Array.isArray(vp.breaks));

    if (isCategorical) {
      return {
        type: 'categorical',
        palette: palette || [],
        labels: vp.labels || [],
        values: vp.values || [],
        breaks: vp.breaks || [],
        stops: intervalStops(vp.breaks || [], (palette || []).length),
      };
    }
    if (palette && bands.length <= 1) {
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
    }
    if (bands.length === 3) {
      const channels = ['#ff0000', '#00ff00', '#0000ff'];
      return {
        type: 'gradient',
        rows: bands.map((band, index) => ({
          label: band || 'b' + index,
          min: minArr[index] != null ? minArr[index] : minArr[0],
          max: maxArr[index] != null ? maxArr[index] : maxArr[0],
          gradient: `linear-gradient(to right, #000, ${channels[index]})`,
        })),
      };
    }
    return {
      type: 'gradient',
      rows: [
        {
          label: 'b0',
          min: minArr[0],
          max: maxArr[0],
          gradient: palette ? paletteGradient(palette) : 'linear-gradient(to right, #000, #fff)',
        },
      ],
    };
  });

  // ----------------------------------------------------------------
  // EFFECTS
  // ----------------------------------------------------------------

  $effect(() => {
    if (!map) {
      return;
    }
    const handleMouseMove = (event) => {
      cursorTooltipX = event.originalEvent.clientX;
      cursorTooltipY = event.originalEvent.clientY;
      updateScaleFromMap(event.latlng);
    };
    const handleMouseOut = () => {
      cursorTooltipText = '';
    };
    map.on('mousemove', handleMouseMove);
    map.on('mouseout', handleMouseOut);
    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mouseout', handleMouseOut);
    };
  });

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------

  function paletteGradient(palette) {
    if (!palette || palette.length === 0) {
      return 'linear-gradient(to right, #000, #fff)';
    }
    const colors = palette.map((color) => (color.startsWith('#') ? color : '#' + color));
    return 'linear-gradient(to right, ' + colors.join(', ') + ')';
  }

  function fmtVal(value) {
    if (value == null) {
      return '';
    }
    const number = Number(value);
    if (Number.isNaN(number)) {
      return String(value);
    }
    if (Number.isInteger(number)) {
      return String(number);
    }
    return number.toPrecision(4);
  }

  function sampleOverlayPixel(latlng, index) {
    const entry = overlays[index];
    if (!entry || !entry.visible) {
      return null;
    }
    const container = entry.tileLayer.getContainer();
    if (!container) {
      return null;
    }
    const point = map.latLngToContainerPoint(latlng);
    const mapRect = map.getContainer().getBoundingClientRect();
    const tiles = container.querySelectorAll('img');
    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
      const tile = tiles[tileIndex];
      const rect = tile.getBoundingClientRect();
      const tileX = rect.left - mapRect.left;
      const tileY = rect.top - mapRect.top;
      if (
        point.x >= tileX &&
        point.x < tileX + rect.width &&
        point.y >= tileY &&
        point.y < tileY + rect.height
      ) {
        try {
          if (!_sampleCanvas) {
            _sampleCanvas = document.createElement('canvas');
          }
          _sampleCanvas.width = tile.naturalWidth || 256;
          _sampleCanvas.height = tile.naturalHeight || 256;
          const context = _sampleCanvas.getContext('2d');
          context.drawImage(tile, 0, 0);
          const sampleX = ((point.x - tileX) / rect.width) * _sampleCanvas.width;
          const sampleY = ((point.y - tileY) / rect.height) * _sampleCanvas.height;
          return context.getImageData(Math.floor(sampleX), Math.floor(sampleY), 1, 1).data;
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
      document.querySelectorAll('.scale-pointer').forEach((pointer) => {
        pointer.style.display = 'none';
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
    const isCategorical = (Array.isArray(vp.values) && vp.values.length > 0) ||
      (vp.vizType === 'intervals' && Array.isArray(vp.breaks));
    const parts = [];

    if (isCategorical && palette) {
      const label = highlightCategoryDOM(findClosestPaletteIndex(rgba, palette));
      if (label) {
        parts.push(label);
      }
      cursorTooltipText = parts.join('\n');
      return;
    }

    const rows = document.querySelectorAll('.scale-row');
    if (palette && bands.length <= 1 && rows[0]) {
      const bestIndex = findClosestPaletteIndex(rgba, palette);
      const percent = palette.length > 1 ? bestIndex / (palette.length - 1) : 0;
      const text = setPointerDOM(rows[0], percent, minArr[0], maxArr[0]);
      if (text) {
        parts.push(text);
      }
    } else if (bands.length === 3) {
      const channelValues = [rgba[0], rgba[1], rgba[2]];
      for (let index = 0; index < 3; index++) {
        if (rows[index]) {
          const text = setPointerDOM(
            rows[index],
            channelValues[index] / 255,
            minArr[index] ?? minArr[0],
            maxArr[index] ?? maxArr[0],
          );
          if (text) {
            parts.push(`${bands[index] || ['R', 'G', 'B'][index]}: ${text}`);
          }
        }
      }
    }
    cursorTooltipText = parts.join('\n');
  }

  function findClosestPaletteIndex(rgba, palette) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < palette.length; index++) {
      const hex = palette[index].startsWith('#') ? palette[index].slice(1) : palette[index];
      const length = hex.length === 3 ? 1 : 2;
      const red = parseInt(hex.slice(0, length).padStart(2, hex[0]), 16);
      const green = parseInt(hex.slice(length, length * 2).padStart(2, hex[length]), 16);
      const blue = parseInt(hex.slice(length * 2, length * 3).padStart(2, hex[length * 2]), 16);
      const distance = (rgba[0] - red) ** 2 + (rgba[1] - green) ** 2 + (rgba[2] - blue) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function setPointerDOM(row, percent, min, max) {
    const pointer = row.querySelector('.scale-pointer');
    const maxElement = row.querySelector('.scale-max');
    if (!pointer) {
      return null;
    }
    const clamped = Math.max(0, Math.min(1, percent));
    pointer.style.left = clamped * 100 + '%';
    pointer.style.display = 'block';
    const text = fmtVal(min + clamped * (max - min));
    if (maxElement) {
      maxElement.textContent = text;
    }
    return text;
  }

  function highlightCategoryDOM(index) {
    const segments = document.querySelectorAll('.scale-cat-segment');
    const pointer = document.querySelector('.scale-cat-pointer');
    const maxElement = document.querySelector('.scale-bar .scale-max');
    const count = segments.length;
    if (!pointer || count === 0) {
      return null;
    }
    const segment = segments[index];
    if (!segment) {
      return null;
    }
    pointer.style.left = segment.offsetLeft + segment.offsetWidth / 2 + 'px';
    pointer.style.display = 'block';
    const label = segment.dataset.catLabel || 'Class ' + index;
    if (maxElement) {
      maxElement.textContent = label;
    }
    return label;
  }

  function handleScaleRowHover(event, min, max) {
    const wrap = event.currentTarget;
    const rect = wrap.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const pointer = wrap.querySelector('.scale-pointer');
    if (pointer) {
      pointer.style.left = percent * 100 + '%';
      pointer.style.display = 'block';
    }
    const maxElement = wrap.parentElement?.querySelector('.scale-max');
    if (maxElement) {
      maxElement.textContent = fmtVal(min + percent * (max - min));
    }
  }

  function handleScaleRowLeave(event) {
    const pointer = event.currentTarget.querySelector('.scale-pointer');
    if (pointer) {
      pointer.style.display = 'none';
    }
  }
</script>

{#if scaleData}
  <div class="scale-bar visible">
    {#if scaleData.type === 'categorical'}
      <div class="scale-row">
        <span class="scale-label"></span>
        <div class="scale-gradient-wrap scale-cat-wrap">
          {#each scaleData.palette as color, i}
            {@const catLabel = scaleData.breaks.length > i + 1
              ? (scaleData.labels[i] ? scaleData.labels[i] + ' ' : '') +
                '[' + fmtVal(scaleData.breaks[i]) + ', ' + fmtVal(scaleData.breaks[i + 1]) + ')'
              : (scaleData.labels[i] || 'Class ' + i) +
                (scaleData.values[i] != null ? ' (' + scaleData.values[i] + ')' : '')}
            <div
              class="scale-cat-segment"
              style="background:{color.startsWith('#') ? color : '#' + color};width:{(scaleData.stops[i + 1] - scaleData.stops[i]) * 100}%"
              data-index={i}
              data-cat-label={catLabel}
            ></div>
          {/each}
          <div class="scale-pointer scale-cat-pointer"></div>
        </div>
        <span class="scale-max">{scaleData.palette.length} {scaleData.breaks.length > 0 ? 'intervals' : 'classes'}</span>
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
            onmousemove={(event) => handleScaleRowHover(event, row.min, row.max)}
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

{#if activeScaleIndex >= 0 && cursorTooltipText}
  <div
    class="cursor-value-tooltip"
    style="left: {cursorTooltipX + 12}px; top: {cursorTooltipY + 12}px;"
  >
    {cursorTooltipText}
  </div>
{/if}

<style>
  :global {
    .scale-bar {
      position: absolute;
      bottom: 20px;
      left: 0;
      right: 0;
      z-index: 1000;
      display: none;
      background: var(--vscee-color-editor-background);
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
  }
</style>
