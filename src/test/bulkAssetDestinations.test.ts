/** @module bulkAssetDestinations.test */

import { strict as assert } from 'node:assert';
import { bulkAssetDestinations } from '../sidebar/assets/eeApiClient.js';

describe('bulk asset destinations', () => {
  const source = 'projects/example/assets/source';

  it('preserves each selected asset name in one destination folder', () => {
    assert.deepEqual(
      bulkAssetDestinations(
        [`${source}/image`, `${source}/table`],
        'projects/example/assets/target/',
      ),
      [
        { source: `${source}/image`, destination: 'projects/example/assets/target/image' },
        { source: `${source}/table`, destination: 'projects/example/assets/target/table' },
      ],
    );
  });

  it('rejects moving into itself or a descendant before any operation starts', () => {
    assert.throws(() => bulkAssetDestinations([source], source));
    assert.throws(() => bulkAssetDestinations([source], `${source}/nested`));
  });

  it('rejects duplicate destination names', () => {
    assert.throws(() =>
      bulkAssetDestinations(
        [`${source}/image`, 'projects/example/assets/other/image'],
        'projects/example/assets/target',
      ),
    );
  });
});
