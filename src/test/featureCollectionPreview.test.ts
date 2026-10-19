/** @module featureCollectionPreview.test */

import { strict as assert } from 'node:assert';
import { formatFeatureCount } from '../editor/preview/featureCollectionPreview/featureCollectionPreviewPanel.js';

describe('feature collection preview', () => {
  it('formats evaluated feature counts, including empty collections', () => {
    assert.equal(formatFeatureCount(0), '0');
    assert.equal(formatFeatureCount(1234), '1,234');
  });

  it('shows unavailable when the feature count is missing or invalid', () => {
    assert.equal(formatFeatureCount(undefined), 'N/A');
    assert.equal(formatFeatureCount('not-a-count'), 'N/A');
  });
});
