/** @module previewMetadata.test */

import { strict as assert } from 'node:assert';
import { previewMetadata } from '../editor/preview/previewMetadata.js';

describe('asset preview metadata', () => {
  const name = 'projects/example/assets/collection';

  it('shows editable values and UTC dates without losing Markdown', () => {
    const metadata = previewMetadata({
      name, type: 'IMAGE_COLLECTION',
      startTime: '2024-01-02T03:04:05Z',
      endTime: '2024-01-03T04:05:06Z',
      properties: { description: '# Heading\n\nA **bold** description' },
    });
    assert.equal(metadata.name, 'collection');
    assert.equal(metadata.startDate, '2024-01-02 03:04:05 UTC');
    assert.equal(metadata.endDate, '2024-01-03 04:05:06 UTC');
    assert.match(metadata.descriptionHtml, /<strong>bold<\/strong>/);
  });

  it('does not inject HTML or executable links from edited Markdown', () => {
    const metadata = previewMetadata({
      name, type: 'IMAGE',
      properties: { description: '<script>alert(1)</script> [unsafe](javascript:alert(1))' },
    });
    assert.doesNotMatch(metadata.descriptionHtml, /<script|href="javascript:/);
    assert.match(metadata.descriptionHtml, /&lt;script&gt;/);
  });
});
