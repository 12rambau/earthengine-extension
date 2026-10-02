<!-- ColorPicker: swatch button opening a saturation/value square with a hue bar -->
<script>
  const POPUP_WIDTH = 208;
  const POPUP_HEIGHT = 190;
  const GAP = 4;

  let {
    value = $bindable('#000000'),
    label = 'Choose a colour',
    onChange,
  } = $props();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------

  let open = $state(false);
  // The popup owns h/s/v while open: re-deriving them from the hex on every
  // commit would lose the hue on greyscale stops, where it is not encoded.
  let hue = $state(0);
  let sat = $state(0);
  let val = $state(0);
  let dragging = $state('');
  let triggerEl = $state(null);

  // ----------------------------------------------------------------
  // DERIVED
  // ----------------------------------------------------------------

  const hueHex = $derived(hsvToHex(hue, 1, 1));

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------

  const clamp01 = (n) => Math.min(1, Math.max(0, n));

  function normalizeHex(color) {
    let hex = String(color ?? '').trim();
    if (!hex.startsWith('#')) {hex = '#' + hex;}
    if (hex.length === 4) {hex = '#' + hex.slice(1).split('').map((c) => c + c).join('');}
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : '#000000';
  }

  function hexToHsv(color) {
    const n = parseInt(normalizeHex(color).slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === r) {h = ((g - b) / d) % 6;}
      else if (max === g) {h = (b - r) / d + 2;}
      else {h = (r - g) / d + 4;}
      h = (h * 60 + 360) % 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  }

  function hsvToHex(h, s, v) {
    const channel = (n) => {
      const k = (n + h / 60) % 6;
      const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return '#' + channel(5) + channel(3) + channel(1);
  }

  /** Pins the popup to its trigger in viewport space, so a scrolling list cannot clip it. */
  function anchor(node) {
    const place = () => {
      const rect = triggerEl?.getBoundingClientRect();
      if (!rect) {return;}
      const flipUp = window.innerHeight - rect.bottom - GAP < POPUP_HEIGHT && rect.top > POPUP_HEIGHT;
      const left = Math.min(rect.left, window.innerWidth - POPUP_WIDTH - GAP);
      node.style.left = Math.round(Math.max(GAP, left)) + 'px';
      node.style.top = flipUp ? 'auto' : Math.round(rect.bottom + GAP) + 'px';
      node.style.bottom = flipUp ? Math.round(window.innerHeight - rect.top + GAP) + 'px' : 'auto';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return {
      destroy() {
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
      },
    };
  }

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------

  function toggle() {
    if (!open) {
      const hsv = hexToHsv(value);
      hue = hsv.h;
      sat = hsv.s;
      val = hsv.v;
    }
    open = !open;
  }

  function commit() {
    value = hsvToHex(hue, sat, val);
    onChange?.(value);
  }

  function pick(event, node, axis) {
    const rect = node.getBoundingClientRect();
    if (axis === 'hue') {
      hue = clamp01((event.clientX - rect.left) / rect.width) * 360;
    } else {
      sat = clamp01((event.clientX - rect.left) / rect.width);
      val = 1 - clamp01((event.clientY - rect.top) / rect.height);
    }
    commit();
  }

  function startDrag(event, axis) {
    dragging = axis;
    event.currentTarget.setPointerCapture(event.pointerId);
    pick(event, event.currentTarget, axis);
  }

  function moveDrag(event, axis) {
    if (dragging === axis) {pick(event, event.currentTarget, axis);}
  }

  function endDrag() {
    dragging = '';
  }

  function nudgeArea(event) {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves = {
      ArrowLeft: () => { sat = clamp01(sat - step); },
      ArrowRight: () => { sat = clamp01(sat + step); },
      ArrowUp: () => { val = clamp01(val + step); },
      ArrowDown: () => { val = clamp01(val - step); },
    };
    if (!moves[event.key]) {return;}
    event.preventDefault();
    moves[event.key]();
    commit();
  }

  function nudgeHue(event) {
    const step = event.shiftKey ? 10 : 2;
    const moves = {
      ArrowLeft: () => { hue = (hue - step + 360) % 360; },
      ArrowDown: () => { hue = (hue - step + 360) % 360; },
      ArrowRight: () => { hue = (hue + step) % 360; },
      ArrowUp: () => { hue = (hue + step) % 360; },
      Home: () => { hue = 0; },
      End: () => { hue = 359; },
    };
    if (!moves[event.key]) {return;}
    event.preventDefault();
    moves[event.key]();
    commit();
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') {open = false;} }} />

<div class="cp">
  <button type="button" class="cp-swatch" style="background:{normalizeHex(value)}"
    title={label} aria-label={label} aria-haspopup="dialog" aria-expanded={open}
    bind:this={triggerEl} onclick={toggle}></button>
  {#if open}
    <!-- Swallows the next click so the popup closes when focus goes elsewhere. -->
    <div class="cp-backdrop" role="presentation" onclick={() => { open = false; }}></div>
    <div class="cp-popup" role="dialog" aria-label={label} use:anchor>
      <!-- A button rather than a div: the surface is genuinely operable, so it earns
           focus and keyboard handling without borrowing a non-interactive role. -->
      <button type="button" class="cp-area" style="--cp-hue: {hueHex}"
        aria-label="Saturation and brightness"
        onpointerdown={(e) => startDrag(e, 'area')}
        onpointermove={(e) => moveDrag(e, 'area')}
        onpointerup={endDrag}
        onpointercancel={endDrag}
        onkeydown={nudgeArea}>
        <span class="cp-area-thumb" style="left:{sat * 100}%;top:{(1 - val) * 100}%"></span>
      </button>
      <div class="cp-hue" role="slider" tabindex="0"
        aria-label="Hue" aria-valuemin="0" aria-valuemax="359" aria-valuenow={Math.round(hue)}
        onpointerdown={(e) => startDrag(e, 'hue')}
        onpointermove={(e) => moveDrag(e, 'hue')}
        onpointerup={endDrag}
        onpointercancel={endDrag}
        onkeydown={nudgeHue}>
        <span class="cp-hue-thumb" style="left:{(hue / 360) * 100}%"></span>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ==================================================================
     TRIGGER
     ================================================================== */
  .cp { position: relative; flex-shrink: 0; display: flex; }
  .cp-swatch {
    width: 28px; height: 22px; padding: 0; cursor: pointer;
    border: var(--vscee-border-sm) solid var(--vscode-widget-border);
    border-radius: var(--vscee-radius-md);

    &:focus-visible { outline: var(--vscee-border-md) solid var(--vscode-focusBorder); outline-offset: 1px; }
  }

  /* ==================================================================
     POPUP
     ================================================================== */
  .cp-backdrop { position: fixed; inset: 0; z-index: 3000; }
  .cp-popup {
    position: fixed; z-index: 3001; width: 208px;
    display: flex; flex-direction: column; gap: var(--vscee-space-sm);
    padding: var(--vscee-space-sm);
    background: var(--vscode-dropdown-background);
    border: var(--vscee-border-sm) solid var(--vscode-dropdown-border);
    border-radius: var(--vscee-radius-md); box-shadow: var(--vscee-shadow-lg);
  }

  /* The gradients below paint the colour space itself, so they are literal
     colours rather than theme tokens. */
  .cp-area {
    position: relative; display: block; width: 100%; height: 140px;
    padding: 0; border: none; appearance: none;
    cursor: crosshair; touch-action: none;
    border-radius: var(--vscee-radius-sm);
    background:
      linear-gradient(to top, #000, rgb(0 0 0 / 0%)),
      linear-gradient(to right, #fff, rgb(255 255 255 / 0%)),
      var(--cp-hue);

    &:focus-visible { outline: var(--vscee-border-md) solid var(--vscode-focusBorder); outline-offset: 1px; }
  }
  .cp-hue {
    position: relative; height: 12px; cursor: pointer; touch-action: none;
    border-radius: var(--vscee-radius-sm);
    background: linear-gradient(to right,
      #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);

    &:focus-visible { outline: var(--vscee-border-md) solid var(--vscode-focusBorder); outline-offset: 1px; }
  }
  .cp-area-thumb, .cp-hue-thumb {
    position: absolute; pointer-events: none; border-radius: 50%;
    border: var(--vscee-border-md) solid #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 45%);
  }
  .cp-area-thumb { width: 12px; height: 12px; transform: translate(-50%, -50%); }
  .cp-hue-thumb { width: 12px; height: 12px; top: 0; transform: translateX(-50%); }
</style>
