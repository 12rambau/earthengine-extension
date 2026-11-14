/** @module mapLayout Shared split-tree and layer-assignment state for the map WebView. */

/** One Leaflet pane or a resizable split of two pane groups. */
export type MapLayoutNode =
  | { map: number }
  | { direction: 'rows' | 'columns'; ratio: number; first: MapLayoutNode; second: MapLayoutNode };

/** Layout serialised between the dialog, WebView and extension host. */
export interface MapLayout {
  tree: MapLayoutNode;
  mapIds: number[];
  panes: number[][];
}

/** Returns the map IDs in display order. */
export function layoutMapIds(node: MapLayoutNode): number[] {
  return 'map' in node ? [node.map] : [...layoutMapIds(node.first), ...layoutMapIds(node.second)];
}

function parseTree(value: unknown, seen: Set<number>): MapLayoutNode | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const node = value as Record<string, unknown>;
  if (Number.isInteger(node.map) && Number(node.map) >= 1 && Number(node.map) <= 8) {
    const id = Number(node.map);
    if (seen.has(id)) {
      return null;
    }
    seen.add(id);
    return { map: id };
  }
  if (node.direction !== 'rows' && node.direction !== 'columns') {
    return null;
  }
  const first = parseTree(node.first, seen);
  const second = parseTree(node.second, seen);
  if (!first || !second) {
    return null;
  }
  const ratio =
    typeof node.ratio === 'number' && Number.isFinite(node.ratio)
      ? Math.max(0.1, Math.min(0.9, node.ratio))
      : 0.5;
  return { direction: node.direction, ratio, first, second };
}

/** Sanitises saved layout data and routes newly added layers to Map 1. */
export function normalizeMapLayout(
  value: unknown,
  layerIndices: readonly number[] = [],
): MapLayout {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const seen = new Set<number>();
  const parsed = parseTree(input.tree, seen);
  const tree = parsed && seen.has(1) && seen.size <= 8 ? parsed : { map: 1 };
  const mapIds = layoutMapIds(tree);
  const previousIds = Array.isArray(input.mapIds) ? input.mapIds : [];
  const previousPanes = Array.isArray(input.panes) ? input.panes : [];
  const validLayers = new Set(layerIndices);
  const assigned = new Set<number>();
  const panes = mapIds.map((id) => {
    const entries = previousPanes[previousIds.indexOf(id)];
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries.filter((index): index is number => {
      if (typeof index !== 'number' || !validLayers.has(index) || assigned.has(index)) {
        return false;
      }
      assigned.add(index);
      return true;
    });
  });
  panes[mapIds.indexOf(1)].push(...layerIndices.filter((index) => !assigned.has(index)));
  return { tree, mapIds, panes };
}

/** Updates only the requested split, preserving the identity of every map pane. */
export function setSplitRatio(
  node: MapLayoutNode,
  path: readonly string[],
  ratio: number,
): MapLayoutNode {
  if ('map' in node) {
    return node;
  }
  if (path.length === 0) {
    return { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
  }
  const [side, ...rest] = path;
  if (side === 'first') {
    return { ...node, first: setSplitRatio(node.first, rest, ratio) };
  }
  if (side === 'second') {
    return { ...node, second: setSplitRatio(node.second, rest, ratio) };
  }
  return node;
}
