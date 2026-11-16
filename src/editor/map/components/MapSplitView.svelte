<!-- MapSplitView: recursive map panes with independently resizable dividers -->
<script>
  let { tree, mode = 'grid', pane, onratio, onratioend } = $props();

  let dotsVisible = $state(false);
  let hoveredCornerPath = $state(null);
  let draggingPaths = $state([]);
  let drag = null;

  function leafBounds(node, bounds = { top: 0, left: 0, width: 1, height: 1 }) {
    if ('map' in node) {
      return [{ id: node.map, ...bounds }];
    }
    const ratio = node.ratio ?? 0.5;
    const rows = node.direction === 'rows';
    const first = {
      ...bounds,
      width: rows ? bounds.width : bounds.width * ratio,
      height: rows ? bounds.height * ratio : bounds.height,
    };
    const second = {
      top: rows ? bounds.top + first.height : bounds.top,
      left: rows ? bounds.left : bounds.left + first.width,
      width: rows ? bounds.width : bounds.width * (1 - ratio),
      height: rows ? bounds.height * (1 - ratio) : bounds.height,
    };
    return [...leafBounds(node.first, first), ...leafBounds(node.second, second)];
  }

  let stackPanes = $derived(mode === 'stack' ? leafBounds(tree) : []);

  $effect(() => {
    let hideDotsTimer;
    const showDots = () => {
      dotsVisible = true;
      clearTimeout(hideDotsTimer);
      hideDotsTimer = setTimeout(() => (dotsVisible = false), 3000);
    };
    window.addEventListener('pointermove', showDots, true);
    return () => {
      window.removeEventListener('pointermove', showDots, true);
      clearTimeout(hideDotsTimer);
    };
  });

  function clampRatio(value, size) {
    const minimum = Math.min(0.45, Math.max(0.1, 100 / size));
    return Math.max(minimum, Math.min(1 - minimum, value));
  }

  function edgeCorners(node, direction, edge, path, start, extent) {
    if ('map' in node) {
      return [];
    }
    if (node.direction === direction) {
      const touching = edge === 'first' ? 'second' : 'first';
      return edgeCorners(node[touching], direction, edge, [...path, touching], start, extent);
    }
    const ratio = node.ratio ?? 0.5;
    const center = start + extent * ratio;
    return [
      { path, edge, position: `${center * 100}%` },
      ...edgeCorners(node.first, direction, edge, [...path, 'first'], start, extent * ratio),
      ...edgeCorners(
        node.second,
        direction,
        edge,
        [...path, 'second'],
        center,
        extent * (1 - ratio),
      ),
    ];
  }

  function cornerTargets(node) {
    const first = edgeCorners(node.first, node.direction, 'first', ['first'], 0, 1);
    const second = edgeCorners(node.second, node.direction, 'second', ['second'], 0, 1);
    return [...first, ...second].map((corner) => ({
      ...corner,
      offset: first.length && second.length ? corner.edge : null,
    }));
  }

  function findSplit(container, path) {
    return [...container.querySelectorAll('[data-split-path]')].find(
      (element) => element.dataset.splitPath === path.join('.'),
    );
  }

  function startResize(event, path, direction) {
    const bounds = event.currentTarget.parentElement.getBoundingClientRect();
    drag = { path, direction, bounds };
    draggingPaths = [path.join('.')];
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function startCornerResize(event, path, direction, corner) {
    event.stopPropagation();
    const container = event.currentTarget.parentElement.parentElement;
    const targetPath = [...path, ...corner.path];
    const target = findSplit(container, targetPath);
    if (!target) {
      return;
    }
    drag = { path, direction, bounds: container.getBoundingClientRect(), targetPath, target };
    draggingPaths = [path.join('.'), targetPath.join('.')];
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveResize(event) {
    if (!drag) {
      return;
    }
    const { path, direction, bounds, targetPath, target } = drag;
    const horizontal = direction === 'columns';
    const size = horizontal ? bounds.width : bounds.height;
    const offset = horizontal ? event.clientX - bounds.left : event.clientY - bounds.top;
    onratio(path, clampRatio(offset / size, size));
    if (target) {
      const targetBounds = target.getBoundingClientRect();
      const crossSize = horizontal ? targetBounds.height : targetBounds.width;
      const crossOffset = horizontal
        ? event.clientY - targetBounds.top
        : event.clientX - targetBounds.left;
      onratio(targetPath, clampRatio(crossOffset / crossSize, crossSize));
    }
  }

  function endResize() {
    if (!drag) {
      return;
    }
    drag = null;
    draggingPaths = [];
    onratioend?.();
  }

  function resizeByKey(event, path, direction, ratio) {
    const decrement = direction === 'columns' ? 'ArrowLeft' : 'ArrowUp';
    const increment = direction === 'columns' ? 'ArrowRight' : 'ArrowDown';
    if (
      event.key !== decrement &&
      event.key !== increment &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    event.preventDefault();
    const size =
      direction === 'columns'
        ? event.currentTarget.parentElement.clientWidth
        : event.currentTarget.parentElement.clientHeight;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 1
          : ratio + (event.key === increment ? 0.05 : -0.05);
    onratio(path, clampRatio(next, size));
    onratioend?.();
  }

  function resizeCornerByKey(event, path, node, corner) {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 0.05 : -0.05;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const container = event.currentTarget.parentElement.parentElement;
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'columns' : 'rows';
    if (direction === node.direction) {
      const size = direction === 'columns' ? container.clientWidth : container.clientHeight;
      onratio(path, clampRatio(node.ratio + delta, size));
    } else {
      const targetPath = [...path, ...corner.path];
      const target = findSplit(container, targetPath);
      if (target) {
        const branch = corner.path.reduce((current, side) => current[side], node);
        const size = direction === 'columns' ? target.clientWidth : target.clientHeight;
        onratio(targetPath, clampRatio(branch.ratio + delta, size));
      }
    }
    onratioend?.();
  }
</script>

{#snippet renderNode(node, path)}
  {#if 'map' in node}
    <div class="leaf">
      {#if mode === 'grid'}
        {#key node.map}{@render pane(node.map)}{/key}
      {/if}
    </div>
  {:else}
    {@const ratio = node.ratio ?? 0.5}
    {@const corners = cornerTargets(node)}
    <div
      class="split"
      data-split-path={path.join('.')}
      class:rows={node.direction === 'rows'}
      style={node.direction === 'rows'
        ? `grid-template-rows: minmax(0, ${ratio}fr) 0px minmax(0, ${1 - ratio}fr)`
        : `grid-template-columns: minmax(0, ${ratio}fr) 0px minmax(0, ${1 - ratio}fr)`}
    >
      <div class="child">{@render renderNode(node.first, [...path, 'first'])}</div>
      <div
        class="divider"
        class:dragging={draggingPaths.includes(path.join('.'))}
        class:corner-hover={hoveredCornerPath === path.join('.')}
        style:z-index={1200 - path.length}
        role="slider"
        tabindex="0"
        aria-label={node.direction === 'rows'
          ? 'Resize maps vertically'
          : 'Resize maps horizontally'}
        aria-orientation={node.direction === 'rows' ? 'vertical' : 'horizontal'}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(ratio * 100)}
        onpointerdown={(event) => startResize(event, path, node.direction)}
        onpointermove={moveResize}
        onpointerup={endResize}
        onpointercancel={endResize}
        onkeydown={(event) => resizeByKey(event, path, node.direction, ratio)}
      >
        {#each corners as corner}
          <button
            type="button"
            class="corner"
            class:offset-first={corner.offset === 'first'}
            class:offset-second={corner.offset === 'second'}
            style:--corner-position={corner.position}
            aria-label="Resize both map dividers; use arrow keys to adjust either direction"
            onpointerenter={() => (hoveredCornerPath = [...path, ...corner.path].join('.'))}
            onpointerleave={() => (hoveredCornerPath = null)}
            onpointerdown={(event) => startCornerResize(event, path, node.direction, corner)}
            onpointermove={(event) => {
              event.stopPropagation();
              moveResize(event);
            }}
            onpointerup={(event) => {
              event.stopPropagation();
              endResize();
            }}
            onpointercancel={(event) => {
              event.stopPropagation();
              endResize();
            }}
            onkeydown={(event) => resizeCornerByKey(event, path, node, corner)}
          ></button>
        {/each}
      </div>
      <div class="child">{@render renderNode(node.second, [...path, 'second'])}</div>
    </div>
  {/if}
{/snippet}

<div class="split-view" class:dots-visible={dotsVisible} class:stack={mode === 'stack'}>
  {#each stackPanes as region (region.id)}
    <div
      class="stack-pane"
      style:clip-path={`inset(${region.top * 100}% ${Math.max(0, 1 - region.left - region.width) * 100}% ${Math.max(0, 1 - region.top - region.height) * 100}% ${region.left * 100}%)`}
    >
      {@render pane(region.id)}
    </div>
  {/each}
  <div class="split-tree" class:stack={mode === 'stack'}>
    {@render renderNode(tree, [])}
  </div>
</div>

<style>
  .split-view,
  .split-tree,
  .split,
  .leaf,
  .child {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .split-view {
    isolation: isolate;
  }
  .split {
    display: grid;
  }
  .split-view.stack {
    position: relative;
  }
  .stack-pane,
  .split-tree.stack {
    position: absolute;
    inset: 0;
  }
  .split-tree.stack {
    z-index: 1;
    pointer-events: none;
    .divider,
    .corner {
      pointer-events: auto;
    }
  }
  .divider {
    position: relative;
    left: -2px;
    width: 4px;
    border: 0;
    padding: 0;
    background: var(--vscee-color-editor-background);
    cursor: ew-resize;
    touch-action: none;
    &::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      width: 4px;
      transform: translateX(-50%);
      background: var(--vscode-sash-hoverBorder);
      opacity: 0;
      transition: opacity 0s;
    }
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 4px;
      height: 12px;
      transform: translate(-50%, -50%);
      color: var(--vscode-modernSash-gripForeground);
      background: radial-gradient(circle, currentColor 0.65px, transparent 0.9px) center top / 4px
        4px repeat-y;
      opacity: 0;
      transition:
        opacity 150ms ease,
        color 0s;
    }
    &:hover,
    &.corner-hover {
      &::before {
        opacity: 1;
        transition-delay: 0.5s;
      }
      &::after {
        color: var(--vscee-color-editor-background);
        transition-delay: 0s, 0.5s;
      }
    }
    &.dragging,
    &:focus-within {
      &::before {
        opacity: 1;
        transition-delay: 0s;
      }
      &::after {
        color: var(--vscee-color-editor-background);
        opacity: 1;
        transition-delay: 0s;
      }
    }
    &:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
    }
  }
  .split-view.dots-visible .divider {
    &::after {
      opacity: 1;
    }
  }
  .split-view:not(.dots-visible) .divider:not(:focus-within):not(.dragging) {
    &::after {
      opacity: 0;
    }
  }
  .rows > .divider {
    top: -2px;
    left: 0;
    width: 100%;
    height: 4px;
    cursor: ns-resize;
    &::before {
      top: 50%;
      bottom: auto;
      left: 0;
      width: 100%;
      height: 4px;
      transform: translateY(-50%);
    }
    &::after {
      width: 12px;
      height: 4px;
      background-position: left center;
      background-repeat: repeat-x;
    }
  }
  .corner {
    position: absolute;
    z-index: 1;
    top: var(--corner-position);
    left: 50%;
    transform: translate(-50%, -50%);
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: move;
    touch-action: none;
    outline: none;
  }
  .corner.offset-first {
    margin-left: -10px;
  }
  .corner.offset-second {
    margin-left: 10px;
  }
  .rows > .divider .corner {
    top: 50%;
    left: var(--corner-position);
  }
  .rows > .divider .corner.offset-first {
    margin: -10px 0 0;
  }
  .rows > .divider .corner.offset-second {
    margin: 10px 0 0;
  }
</style>
