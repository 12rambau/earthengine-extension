/** @module previewMetadata.test */

import { strict as assert } from 'node:assert';
import {
  classifierDetails,
  featureViewDetails,
  previewMetadata,
} from '../editor/preview/previewMetadata.js';
import { assetMetadataPatch } from '../sidebar/assets/eeApiClient.js';
import { renderPropertiesTable } from '../shared/webviewUtils.js';

describe('asset preview metadata', () => {
  const name = 'projects/example/assets/collection';

  it('updates only changed fields and property keys without replacing system properties', () => {
    assert.deepEqual(
      assetMetadataPatch(
        {
          startTime: '2024-01-01T00:00:00Z',
          properties: { old: 'value', keep: 1, 'system:footprint': 'internal' },
        },
        {
          startTime: '2024-01-02T00:00:00.000Z',
          endTime: null,
          description: '',
          properties: { keep: 1, renamed: 'value', incomplete: '' },
        },
      ),
      {
        asset: { startTime: '2024-01-02T00:00:00.000Z', properties: { renamed: 'value' } },
        updateMask: 'startTime,properties.old,properties.renamed',
      },
    );
  });

  it('shows editable values and UTC dates without losing Markdown', () => {
    const metadata = previewMetadata({
      name,
      type: 'IMAGE_COLLECTION',
      startTime: '2024-01-02T03:04:05Z',
      endTime: '2024-01-03T04:05:06Z',
      properties: {
        description: '# Heading\n\nA **bold** description',
        count: 3,
        'system:footprint': 'internal',
      },
    });
    assert.equal(metadata.name, 'collection');
    assert.equal(metadata.startDate, '2024-01-02 03:04:05 UTC');
    assert.equal(metadata.endDate, '2024-01-03 04:05:06 UTC');
    assert.match(metadata.descriptionHtml, /<strong>bold<\/strong>/);
    assert.deepEqual(metadata.propertyEntries, [['count', 3]]);
  });

  it('does not inject HTML or executable links from edited Markdown', () => {
    const metadata = previewMetadata({
      name,
      type: 'IMAGE',
      properties: { description: '<script>alert(1)</script> [unsafe](javascript:alert(1))' },
    });
    assert.doesNotMatch(metadata.descriptionHtml, /<script|href="javascript:/);
    assert.match(metadata.descriptionHtml, /&lt;script&gt;/);
  });

  it('shows FeatureView feature count, attribute types and ingestion options safely', () => {
    const details = featureViewDetails({
      name,
      type: 'FEATURE_VIEW',
      featureCount: '1234',
      featureViewAssetLocation: {
        assetOptions: {
          featureViewAttributes: [{ name: '<script>', type: 'STRING' }],
          ingestionTimeParameters: { thinningStrategy: 'NONE' },
        },
      },
    });
    assert.equal(details['Number of Features'], '1,234');
    assert.equal(details.Attributes, '<script> (STRING)');
    assert.match(details['Ingestion options'], /thinningStrategy/);
    const html = renderPropertiesTable(details);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/i);
    assert.equal(featureViewDetails({ name, type: 'FEATURE_VIEW' })['Number of Features'], 'N/A');
    assert.equal(
      featureViewDetails({ name, type: 'FEATURE_VIEW', featureCount: 'unknown' })[
        'Number of Features'
      ],
      'N/A',
    );
  });

  it('shows classifier mode and input schema, with fallback when evaluation fails', () => {
    assert.deepEqual(classifierDetails('CLASSIFICATION', ['red', 'green']), {
      Mode: 'CLASSIFICATION',
      'Input schema': '["red","green"]',
    });
    assert.deepEqual(classifierDetails(undefined, undefined), {
      Mode: 'Unavailable',
      'Input schema': 'Unavailable',
    });
    assert.equal(classifierDetails('REGRESSION', null)['Input schema'], 'Unavailable');
  });
});
