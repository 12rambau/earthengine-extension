/** @module imageVisualizations.test */

import { strict as assert } from 'node:assert';
import {
  parseSepalVisualizations,
  selectImageVisualizations,
  vectorVisParams,
} from '../shared/sepalViz.js';

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

  it('maps property-based presets to the vector renderer parameters', () => {
    const [preset] = parseSepalVisualizations({
      visualization_0_type: 'categorical',
      visualization_0_bands: 'landcover',
      visualization_0_palette: '00FF00,0000FF',
      visualization_0_values: '1,2',
      visualization_0_labels: 'Land,Water',
    });
    assert.deepEqual(vectorVisParams(preset), {
      vizType: 'categorical',
      property: 'landcover',
      palette: ['00FF00', '0000FF'],
      min: undefined,
      max: undefined,
      values: [1, 2],
      breaks: undefined,
      labels: ['Land', 'Water'],
    });
  });
});
