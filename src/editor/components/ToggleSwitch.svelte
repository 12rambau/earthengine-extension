<!-- ToggleSwitch: accessible, reusable switch control -->
<script>
  let {
    id,
    ariaLabel,
    checked = $bindable(false),
    disabled = false,
    onchange,
    className = '',
  } = $props();
</script>

<span class={`switch ${className}`}>
  <input
    {id}
    type="checkbox"
    role="switch"
    aria-label={ariaLabel}
    bind:checked
    {disabled}
    {onchange}
  />
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
</span>

<style>
  .switch {
    position: relative;
    display: inline-flex;
    flex: none;
    width: 32px;
    height: 18px;
    vertical-align: middle;

    input {
      position: absolute;
      inset: 0;
      z-index: 1;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: pointer;

      &:checked + .track {
        background: var(--vscee-color-button-background);

        .knob {
          background: var(--vscee-color-button-foreground);
          transform: translateX(14px);
        }
      }
      &:focus-visible + .track {
        outline: 2px solid var(--vscee-color-focus);
        outline-offset: 2px;
      }
      &:disabled {
        cursor: default;
        + .track {
          opacity: 0.6;
        }
      }
    }

    .track {
      display: inline-flex;
      align-items: center;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: 0 2px;
      border-radius: 999px;
      background: var(--vscee-color-button-secondary-background);
      transition: background 0.15s;
    }
    .knob {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--vscee-color-foreground);
      transition: transform 0.15s;
    }
  }
</style>