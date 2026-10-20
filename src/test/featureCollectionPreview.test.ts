/** @module featureCollectionPreview.test */

import { strict as assert } from 'node:assert';
import {
  buildSquareGrid,
  formatFeatureCount,
} from '../editor/preview/featureCollectionPreview/featureCollectionPreviewPanel.js';
import { styleFeatureCollection } from '../editor/map/mapLayerManager.js';
import { parseSepalVisualizations, selectSepalViz, vectorVisParams } from '../shared/sepalViz.js';

describe('feature collection preview', () => {
  it('formats evaluated feature counts, including empty collections', () => {
    assert.equal(formatFeatureCount(0), '0');
    assert.equal(formatFeatureCount(1234), '1,234');
  });

  it('shows unavailable when the feature count is missing or invalid', () => {
    assert.equal(formatFeatureCount(undefined), 'N/A');
    assert.equal(formatFeatureCount('not-a-count'), 'N/A');
  });

  it('uses the first preset for uniform styling, including its fill and width', () => {
    const presets = parseSepalVisualizations({
      visualization_2_type: 'uniform',
      visualization_2_color: '008000',
      visualization_2_fillColor: 'FFFFFF',
      visualization_2_width: '2',
      visualization_3_type: 'uniform',
      visualization_3_color: 'FF0000',
    });
    const style = vectorVisParams(selectSepalViz(presets, 0)!);
    let applied: Record<string, unknown> = {};
    const image = {};
    const ee = {
      FeatureCollection: (_source: unknown) => ({
        style: (params: Record<string, unknown>) => {
          applied = params;
          return image;
        },
      }),
    };

    assert.equal(styleFeatureCollection('table', style, ee), image);
    assert.equal(style['vizType'], 'uniform');
    assert.deepEqual(applied, {
      color: '008000',
      fillColor: 'FFFFFF',
      width: 2,
      pointSize: 3,
    });
  });

  it('frames all collection bounds with padding instead of a global or cropped view', () => {
    const grid = buildSquareGrid({
      coordinates: [[[-5, 42], [8, 42], [8, 51], [-5, 51], [-5, 42]]],
    });
    assert.deepEqual(grid, {
      dimensions: { width: 256, height: 256 },
      affineTransform: {
        scaleX: 15.6 / 256,
        shearX: 0,
        translateX: -6.3,
        shearY: 0,
        scaleY: -15.6 / 256,
        translateY: 54.3,
      },
      crsCode: 'EPSG:4326',
    });
    assert.equal(
      (buildSquareGrid(undefined).affineTransform as { scaleX: number }).scaleX,
      178 / 256,
    );
    assert.ok(
      (buildSquareGrid({ coordinates: [2, 48] }).affineTransform as { scaleX: number }).scaleX > 0,
    );
  });
});
