/** @module collectionUpload.test */

import { strict as assert } from 'node:assert';
import { buildManifest } from '../editor/assets/assetUpload.js';
import {
  collectionImageNames,
  collectionMetadata,
  createImageCollection,
} from '../sidebar/assets/eeApiClient.js';

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

  it('saves description, dates and typed properties without empty metadata fields', () => {
    assert.deepEqual(
      collectionMetadata({
        description: ' About this collection  ',
        startTime: '2025-01-01T00:00:00.000Z',
        endTime: '2025-12-31T23:59:59.000Z',
        properties: [
          { key: 'year', value: '2025' },
          { key: 'status', value: 'complete' },
        ],
      }),
      {
        properties: { description: 'About this collection', year: 2025, status: 'complete' },
        startTime: '2025-01-01T00:00:00.000Z',
        endTime: '2025-12-31T23:59:59.000Z',
      },
    );
    assert.deepEqual(
      collectionMetadata({ description: '  ', properties: [{ key: ' ', value: 'x' }] }),
      {},
    );
  });

  it('applies the selected bands and pyramiding policy to an ingested image', () => {
    const manifest = buildManifest(
      {
        kind: 'image',
        assetId: 'projects/p/assets/collection/image_b2',
        filePath: '/tmp/image.vrt',
        bandIndex: 2,
        bucket: 'staging',
        bandNames: ['temperature'],
        pyramidingPolicy: 'MODE',
        description: '',
        startTime: '',
        endTime: '',
        properties: [],
      },
      ['gs://staging/image.tif'],
    );
    assert.deepEqual(manifest.bands, [{ id: 'temperature', tilesetBandIndex: 0 }]);
    assert.equal(manifest.pyramidingPolicy, 'MODE');
  });

  it('rejects invalid collection paths before sending any API request', async () => {
    const metadata = { description: '', properties: [] };
    await assert.rejects(createImageCollection('projects/p/assets/../outside', metadata, 'token'));
    await assert.rejects(
      createImageCollection('projects/p/assets/name/extra space', metadata, 'token'),
    );
  });
});
