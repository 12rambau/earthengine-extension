<!-- MapButton: reusable themed button for map controls -->
<script>
  let { active = false, class: className = '', children, ...rest } = $props();
</script>

<button class="map-btn {className}" class:active {...rest}>
  {@render children?.()}
</button>

<style>
  .map-btn {
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
  }
  .map-btn:hover {
    opacity: 1;
  }
  .map-btn.active {
    background: var(--vscee-color-button-background);
    color: var(--vscee-color-button-foreground);
  }
</style>
