/** @module tasksApiClient.test */

import { strict as assert } from 'node:assert';
import { canPreviewTask, getPreviewAssetName, type Operation } from '../sidebar/tasks/tasksApiClient.js';

describe('task asset preview', () => {
  const assetName = 'projects/example/assets/folder/imported';

  function operation(type: string, state: string, destinationUris: string[]): Operation {
    return {
      name: 'projects/example/operations/task',
      metadata: { type, state, destinationUris },
    };
  }

  it('previews successful image and table imports using their destination asset names', () => {
    for (const type of ['INGEST_IMAGE', 'INGEST_TABLE', 'IMPORT_IMAGE']) {
      const task = operation(type, 'SUCCEEDED', [assetName]);
      assert.equal(getPreviewAssetName(task), assetName);
      assert.equal(canPreviewTask(task), true);
    }
  });

  it('does not preview unfinished or failed imports', () => {
    for (const state of ['PENDING', 'RUNNING', 'FAILED', 'CANCELLED']) {
      assert.equal(getPreviewAssetName(operation('INGEST_TABLE', state, [assetName])), undefined);
    }
  });

  it('does not preview imports without a destination asset', () => {
    assert.equal(getPreviewAssetName(operation('INGEST_IMAGE', 'SUCCEEDED', [])), undefined);
    assert.equal(
      getPreviewAssetName(operation('INGEST_IMAGE', 'SUCCEEDED', ['gs://bucket/file.tif'])),
      undefined,
    );
  });

  it('retains export asset URI previews without treating bare paths as export destinations', () => {
    const exportTask = operation('EXPORT_IMAGE', 'SUCCEEDED', [
      `https://earthengine.googleapis.com/v1/projects/example/exports?asset=${assetName}`,
    ]);
    assert.equal(getPreviewAssetName(exportTask), assetName);
    assert.equal(getPreviewAssetName(operation('EXPORT_IMAGE', 'SUCCEEDED', [assetName])), undefined);
  });
});
