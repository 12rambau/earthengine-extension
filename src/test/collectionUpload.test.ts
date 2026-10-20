/** @module collectionUpload.test */

import { strict as assert } from 'node:assert';
import { collectionImageNames, collectionMetadata, createImageCollection } from '../sidebar/assets/eeApiClient.js';

describe('image collection creation', () => {
  it('generates unique, valid child asset names from COG and Zarr paths', () => {
    assert.deepEqual(
      collectionImageNames([
        '/tmp/day one.tif',
        '/tmp/day one.tiff',
        '/tmp/day_one.tif',
        '/tmp/day-two.zarr',
        '/tmp/!.tif',
      ]),
      ['day_one', 'day_one_2', 'day_one_3', 'day-two', '_'],
    );
  });

  it('saves title and description without creating empty metadata fields', () => {
    assert.deepEqual(collectionMetadata('  Title ', ' About this collection  '), {
      title: 'Title',
      properties: { description: 'About this collection' },
    });
    assert.deepEqual(collectionMetadata('', '  '), {});
  });

  it('rejects invalid collection paths before sending any API request', async () => {
    await assert.rejects(createImageCollection('projects/p/assets/../outside', '', '', 'token'));
    await assert.rejects(
      createImageCollection('projects/p/assets/name/extra space', '', '', 'token'),
    );
  });
});
