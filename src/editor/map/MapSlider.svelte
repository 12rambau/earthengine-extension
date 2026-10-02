<!-- MapSlider: reusable styled range input for map controls -->
<script>
  let {
    value = 0,
    min = 0,
    max = 100,
    step = 1,
    class: className = '',
    oninput,
    ...rest
  } = $props();

  let fill = $derived.by(() => {
    const range = Number(max) - Number(min);
    if (range <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, ((Number(value) - Number(min)) / range) * 100));
  });
</script>

<input
  type="range"
  {min}
  {max}
  {step}
  {value}
  class="map-slider {className}"
  style="--slider-fill: {fill}%"
  {oninput}
  {...rest}
/>

<style>
  .map-slider {
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

  .layer-opacity {
    width: 60px;
    flex-shrink: 0;
  }

  .viz-range {
    flex: 1;
    min-width: 0;
  }
</style>
