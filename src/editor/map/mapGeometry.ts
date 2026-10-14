/** @module mapGeometry — map-drawn geometries and Earth Engine Python serialization. */

type Position = [number, number];

/** A user-drawn geometry; polygon rings are stored without a duplicate closing vertex. */
export type MapGeometry =
  | { id: string; name: string; visible: boolean; type: 'Point'; coordinates: Position }
  | { id: string; name: string; visible: boolean; type: 'LineString'; coordinates: Position[] }
  | { id: string; name: string; visible: boolean; type: 'Polygon'; coordinates: Position[] };

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

/** Accepts only supported, well-formed geometries from WebView messages or saved workspace state. */
export function parseMapGeometries(value: unknown): MapGeometry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids = new Set<string>();
  const result: MapGeometry[] = [];
  for (const item of value.slice(0, 1000)) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > 100 ||
      ids.has(item.id) ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 100 ||
      typeof item.visible !== 'boolean'
    ) {
      continue;
    }
    const { type, coordinates } = item;
    if (type === 'Point' && isPosition(coordinates)) {
      result.push({
        id: item.id,
        name: item.name,
        visible: item.visible,
        type,
        coordinates: [coordinates[0], coordinates[1]],
      });
    } else if (
      (type === 'LineString' || type === 'Polygon') &&
      Array.isArray(coordinates) &&
      coordinates.length >= (type === 'Polygon' ? 3 : 2) &&
      coordinates.length <= 10000 &&
      coordinates.every(isPosition) &&
      new Set(coordinates.map((point: Position) => JSON.stringify(point))).size >=
        (type === 'Polygon' ? 3 : 2)
    ) {
      result.push({
        id: item.id,
        name: item.name,
        visible: item.visible,
        type,
        coordinates: coordinates.map(([lng, lat]: Position): Position => [lng, lat]),
      });
    } else {
      continue;
    }
    ids.add(item.id);
  }
  return result;
}

/** Formats a geometry as a paste-ready Earth Engine Python expression. */
export function geometryToPython(geometry: MapGeometry): string {
  if (geometry.type === 'Polygon') {
    const ring = [...geometry.coordinates, geometry.coordinates[0]];
    return `ee.Geometry.Polygon(${JSON.stringify([ring])})`;
  }
  return `ee.Geometry.${geometry.type}(${JSON.stringify(geometry.coordinates)})`;
}
