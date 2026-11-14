<!-- MapSplitView: recursive map panes with independently resizable dividers -->
<script>
  let { tree, pane, onratio, onratioend } = $props();

  let drag = null;

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
    const center = {
      fraction: start.fraction + extent.fraction * ratio,
      pixels: start.pixels + extent.pixels * ratio + 3 - 6 * ratio,
    };
    const position = `calc(${center.fraction * 100}% ${center.pixels < 0 ? '-' : '+'} ${Math.abs(center.pixels)}px)`;
    return [
      { path, edge, position },
      ...edgeCorners(node.first, direction, edge, [...path, 'first'], start, {
        fraction: extent.fraction * ratio,
        pixels: (extent.pixels - 6) * ratio,
      }),
      ...edgeCorners(
        node.second,
        direction,
        edge,
        [...path, 'second'],
        {
          fraction: center.fraction,
          pixels: center.pixels + 3,
        },
        {
          fraction: extent.fraction * (1 - ratio),
          pixels: (extent.pixels - 6) * (1 - ratio),
        },
      ),
    ];
  }

  function cornerTargets(node) {
    const start = { fraction: 0, pixels: 0 };
    const extent = { fraction: 1, pixels: 0 };
    const first = edgeCorners(node.first, node.direction, 'first', ['first'], start, extent);
    const second = edgeCorners(node.second, node.direction, 'second', ['second'], start, extent);
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
    <div class="leaf">{@render pane(node.map)}</div>
  {:else}
    {@const ratio = node.ratio ?? 0.5}
    {@const corners = cornerTargets(node)}
    <div
      class="split"
      data-split-path={path.join('.')}
      class:rows={node.direction === 'rows'}
      style={node.direction === 'rows'
        ? `grid-template-rows: minmax(0, ${ratio}fr) 6px minmax(0, ${1 - ratio}fr)`
        : `grid-template-columns: minmax(0, ${ratio}fr) 6px minmax(0, ${1 - ratio}fr)`}
    >
      <div class="child">{@render renderNode(node.first, [...path, 'first'])}</div>
      <div
        class="divider"
        style:z-index={800 - path.length}
        role="slider"
        tabindex="0"
        aria-label={node.direction === 'rows'
          ? 'Resize maps vertically'
          : 'Resize maps horizontally'}
        aria-orientation={node.direction === 'rows' ? 'horizontal' : 'vertical'}
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
            title="Resize both map dividers"
            aria-label="Resize both map dividers; use arrow keys to adjust either direction"
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

<div class="split-view">{@render renderNode(tree, [])}</div>

<style>
  .split-view,
  .split,
  .leaf,
  .child {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .split {
    display: grid;
  }
  .divider {
    position: relative;
    z-index: 800;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: col-resize;
    touch-action: none;
    &::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      width: 1px;
      transform: translateX(-50%);
      background: var(--vscode-editorGroup-border);
    }
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 5px;
      height: 15px;
      transform: translate(-50%, -50%);
      background: radial-gradient(
          circle,
          var(--vscode-descriptionForeground) 1px,
          transparent 1.5px
        )
        center top / 5px 5px repeat-y var(--vscode-editor-background);
    }
    &:hover,
    &:focus-visible {
      &::before {
        background: var(--vscode-sash-hoverBorder);
      }
    }
    &:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
    }
  }
  .rows > .divider {
    cursor: row-resize;
    &::before {
      top: 50%;
      bottom: auto;
      left: 0;
      width: 100%;
      height: 1px;
      transform: translateY(-50%);
    }
    &::after {
      width: 15px;
      height: 5px;
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
    &:hover,
    &:focus-visible {
      background: var(--vscode-editor-background);
      outline: 1px solid var(--vscode-sash-hoverBorder);
    }
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
