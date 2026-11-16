<!-- MapButton: reusable themed button for map controls -->
<script>
  let {
    active = false,
    beta = false,
    title,
    'aria-label': ariaLabel,
    class: className = '',
    children,
    ...rest
  } = $props();
</script>

<button
  class="map-btn {className}"
  class:active
  {...rest}
  title={beta ? `${title} (beta)` : title}
  aria-label={beta ? `${ariaLabel ?? title} (beta)` : ariaLabel}
>
  {@render children?.()}
  {#if beta}
    <span class="beta-badge" aria-hidden="true">Beta</span>
  {/if}
</button>

<style>
  .map-btn {
    position: relative;
    width: 32px;
    height: 32px;
    border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    border-radius: var(--vscee-radius-md);
    background: var(--vscee-color-editor-background);
    color: var(--vscee-color-foreground);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--vscee-shadow-sm);
    opacity: 0.85;
    transition: opacity 0.15s;
    .beta-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      padding: 1px 4px;
      border-radius: 999px;
      background: var(--vscee-color-chart-yellow);
      color: var(--vscode-terminal-ansiBlack);
      font-size: 9px;
      line-height: 1.2;
      pointer-events: none;
    }
  }
  .map-btn:hover {
    opacity: 1;
  }
  .map-btn.active {
    background: var(--vscee-color-button-background);
    color: var(--vscee-color-button-foreground);
  }
</style>
