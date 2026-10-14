/** @module mapGeometry.test */

import { strict as assert } from 'node:assert';
import { geometryToPython, parseMapGeometries } from '../editor/map/mapGeometry.js';

describe('map geometries', () => {
  it('serializes points, lines, and closed polygon rings as Python EE expressions', () => {
    const geometries = parseMapGeometries([
      { id: '1', name: 'Point 1', visible: true, type: 'Point', coordinates: [-122.5, 37.7] },
      {
        id: '2',
        name: 'Line 1',
        visible: true,
        type: 'LineString',
        coordinates: [[0, 0], [1, 2]],
      },
      {
        id: '3',
        name: 'Polygon 1',
        visible: false,
        type: 'Polygon',
        coordinates: [[0, 0], [1, 0], [1, 1]],
      },
    ]);
    assert.equal(geometries.length, 3);
    assert.equal(geometryToPython(geometries[0]), 'ee.Geometry.Point([-122.5,37.7])');
    assert.equal(geometryToPython(geometries[1]), 'ee.Geometry.LineString([[0,0],[1,2]])');
    assert.equal(
      geometryToPython(geometries[2]),
      'ee.Geometry.Polygon([[[0,0],[1,0],[1,1],[0,0]]])',
    );
  });

  it('rejects malformed, out-of-bounds, duplicate, and insufficient vertices', () => {
    assert.deepEqual(parseMapGeometries(null), []);
    assert.deepEqual(
      parseMapGeometries([
        { id: 'x', name: 'Outside', visible: true, type: 'Point', coordinates: [181, 0] },
        { id: 'x', name: 'Valid', visible: true, type: 'Point', coordinates: [180, -90] },
        { id: 'x', name: 'Duplicate', visible: true, type: 'Point', coordinates: [0, 0] },
        { id: 'y', name: 'Short', visible: true, type: 'LineString', coordinates: [[0, 0]] },
        {
          id: 'z',
          name: 'Degenerate',
          visible: true,
          type: 'Polygon',
          coordinates: [[0, 0], [0, 0], [1, 1]],
        },
      ]),
      [{ id: 'x', name: 'Valid', visible: true, type: 'Point', coordinates: [180, -90] }],
    );
  });
});
