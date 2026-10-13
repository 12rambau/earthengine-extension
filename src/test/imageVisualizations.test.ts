/** @module imageVisualizations.test */

import { strict as assert } from 'node:assert';
import { selectImageVisualizations } from '../shared/sepalViz.js';

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
