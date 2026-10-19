<!-- TableButton: consistent buttons for asset and task tables -->
<script>
  let {
    children,
    variant = 'secondary',
    size = 'default',
    active = false,
    danger = false,
    loading = false,
    class: className = '',
    ...attributes
  } = $props();
</script>

<button
  {...attributes}
  type={attributes.type ?? 'button'}
  class={`table-button ${className}`}
  class:primary={variant === 'primary'}
  class:ghost={variant === 'ghost'}
  class:link={variant === 'link'}
  class:menu={variant === 'menu'}
  class:page={variant === 'page'}
  class:compact={size === 'compact'}
  class:icon={size === 'icon'}
  class:active
  class:danger
  class:loading
>
  {@render children?.()}
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--vscee-space-xs);
    min-height: 24px;
    padding: var(--vscee-space-xxs) var(--vscee-space-md);
    background: var(--vscee-color-button-secondary-background);
    color: var(--vscee-color-button-secondary-foreground);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
    border-radius: var(--vscee-radius-md);
    cursor: pointer;
    font-family: var(--vscee-font-family);
    font-size: var(--vscee-font-sm);
    line-height: 1;
    white-space: nowrap;

    &:hover:not(:disabled) {
      background: var(--vscee-color-button-secondary-hover);
    }
    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
    &.primary,
    &.active {
      background: var(--vscee-color-button-background);
      color: var(--vscee-color-button-foreground);
      border-color: transparent;
    }
    &.primary:hover:not(:disabled),
    &.active:hover:not(:disabled) {
      background: var(--vscee-color-button-hover);
    }
    &.ghost {
      background: transparent;
      color: var(--vscee-color-foreground);
      border-color: transparent;

      &:hover:not(:disabled) {
        background: var(--vscee-color-list-hover);
      }
      &.active {
        background: var(--vscee-color-list-hover);
        color: var(--vscee-color-button-background);

        &:hover:not(:disabled) {
          background: var(--vscee-color-list-hover);
        }
      }
    }
    &.link {
      min-height: 0;
      padding: 0;
      background: transparent;
      border: 0;
      color: var(--vscee-color-link);
      font-size: inherit;
      text-align: left;
      white-space: normal;

      &:hover:not(:disabled) {
        background: transparent;
        text-decoration: underline;
      }
    }
    &.menu {
      width: 100%;
      justify-content: flex-start;
      background: transparent;
      border-color: transparent;
      color: var(--vscee-color-dropdown-foreground);

      &:hover:not(:disabled):not(.active) {
        background: var(--vscee-color-list-hover);
      }
      &.active {
        background: var(--vscee-color-button-background);
        color: var(--vscee-color-button-foreground);
      }
    }
    &.page {
      min-width: 28px;
      padding: 0 var(--vscee-space-xs);
      background: transparent;
      border-color: transparent;
      color: var(--vscee-color-foreground);

      &:hover:not(:disabled):not(.active) {
        background: var(--vscee-color-list-hover);
        border-color: var(--vscee-color-input-border);
      }
      &.active {
        background: var(--vscee-color-button-background);
        color: var(--vscee-color-button-foreground);
        border-color: transparent;
        font-weight: 600;
      }
    }
    &.compact {
      min-height: 22px;
      padding: var(--vscee-space-xxs) var(--vscee-space-sm);
    }
    &.icon {
      width: 22px;
      height: 22px;
      min-height: 22px;
      padding: 0;
    }
    &.danger {
      color: var(--vscee-color-error);

      &:hover:not(:disabled) {
        background: var(--vscee-color-validation-error-background);
      }
    }
    &.loading {
      opacity: 0.75;
      cursor: default;
    }

    :global(.codicon) {
      font-size: var(--vscee-font-icon-sm);
    }
  }
</style>