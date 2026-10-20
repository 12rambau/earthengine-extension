/** @module imageVisualizations.test */

import { strict as assert } from 'node:assert';
import { resolveDiscreteImageVis } from '../editor/map/mapLayerManager.js';
import { parseSepalVisualizations, selectImageVisualizations } from '../shared/sepalViz.js';

describe('image collection visualization fallback', () => {
  const image = {
    visualization_0_type: 'rgb',
    visualization_0_bands: 'red,green,blue',
  };
  const collection = {
    visualization_1_type: 'continuous',
    visualization_1_bands: 'temperature',
  };

  it('prefers image presets when both assets have presets', () => {
    assert.equal(selectImageVisualizations(image, collection)[0].type, 'rgb');
  });

  it('uses collection presets when the image has none', () => {
    const presets = selectImageVisualizations({}, collection);
    assert.equal(presets[0].type, 'continuous');
    assert.deepEqual(presets[0].bands, ['temperature']);
  });

  it('returns no presets when neither asset has a usable preset', () => {
    assert.deepEqual(selectImageVisualizations({}, {}), []);
    assert.deepEqual(selectImageVisualizations({ visualization_0_name: 'Incomplete' }, {}), []);
  });
});

describe('feature collection visualization presets', () => {
  it('reads a uniform style from asset properties', () => {
    const presets = parseSepalVisualizations({
      visualization_0_name: 'Demo collection',
      visualization_0_type: 'uniform',
      visualization_0_color: '008000',
      visualization_0_fillColor: 'FFFFFF',
      visualization_0_width: '2',
    });
    assert.deepEqual(presets, [
      {
        index: 0,
        name: 'Demo collection',
        type: 'uniform',
        bands: [],
        min: undefined,
        max: undefined,
        palette: undefined,
        gamma: undefined,
        inverted: undefined,
        labels: undefined,
        values: undefined,
        breaks: undefined,
        color: '008000',
        fillColor: 'FFFFFF',
        width: 2,
      },
    ]);
  });
});

describe('explicit image visualizations', () => {
  it('remaps categorical values to exact palette indices and preserves the legend', () => {
    const calls: { bands?: string[]; from?: number[]; to?: number[] } = {};
    const remapped = { byte: () => 'rendered classes' };
    const image = {
      select: (bands: string[]) => {
        calls.bands = bands;
        return {
          remap: (from: number[], to: number[]) => {
            calls.from = from;
            calls.to = to;
            return remapped;
          },
        };
      },
    };
    const result = resolveDiscreteImageVis(
      {
        bands: ['classification'],
        values: [-2, 1.5, 42],
        palette: ['red', '#abdda4', '#d7191c'],
        labels: ['Other', 'Crop', 'Water'],
      },
      image,
      { List: (values: number[]) => values },
    );

    assert.deepEqual(calls, {
      bands: ['classification'],
      from: [-2, 1.5, 42],
      to: [0, 1, 2],
    });
    assert.equal(result.image, 'rendered classes');
    assert.deepEqual(result.visParams, {
      min: 0,
      max: 2,
      palette: ['red', '#abdda4', '#d7191c'],
    });
    assert.deepEqual(result.displayVisParams, {
      ...result.visParams,
      bands: ['classification'],
      labels: ['Other', 'Crop', 'Water'],
      values: [-2, 1.5, 42],
    });
  });

  it('rejects invalid categorical mappings rather than rendering a gradient', () => {
    const base = { bands: ['classification'], values: [0, 1], palette: ['red', 'green'] };
    for (const invalid of [
      { values: [] },
      { values: [0, 0] },
      { values: [0, '1'] },
      { values: [0, Infinity] },
      { palette: ['red'] },
      { bands: ['a', 'b'] },
      { bands: [] },
    ]) {
      assert.throws(
        () => resolveDiscreteImageVis({ ...base, ...invalid }, {}, {}),
        /Categorical visualization requires/,
      );
    }
    assert.throws(
      () => resolveDiscreteImageVis({ ...base, breaks: [0, 1, 2] }, {}, {}),
      /either categorical values or interval breaks/,
    );
  });

  it('retains interval styling for breaks', () => {
    let style = '';
    const image = {
      select: (_bands: string[]) => ({
        sldStyle: (sld: string) => {
          style = sld;
          return 'styled intervals';
        },
      }),
    };
    const result = resolveDiscreteImageVis(
      { bands: ['B8'], breaks: [0, 1000, 2000], palette: ['#2b83ba', '#d7191c'] },
      image,
      {},
    );
    assert.equal(result.image, 'styled intervals');
    assert.match(style, /ColorMap type="intervals"/);
    assert.deepEqual(result.visParams, {});
    assert.deepEqual(result.displayVisParams?.['breaks'], [0, 1000, 2000]);
  });
});
