/** @module mapLayerOrdering.test */

import { strict as assert } from 'node:assert';
import { EeLayer } from '../editor/map/eeLayer.js';
import { MapLayerManager } from '../editor/map/mapLayerManager.js';

describe('map layer ordering', () => {
  it('moves adjacent layers without changing their identities, and replays in the new order', () => {
    const manager = new MapLayerManager();
    const layers = manager.layers as Map<number, EeLayer>;
    for (const index of [0, 1, 2]) {
      layers.set(index, new EeLayer(index, '', `Layer ${index}`, `url-${index}`));
    }

    manager.move(0, 1);
    assert.deepEqual([...manager.layers.keys()], [1, 0, 2]);
    manager.move(0, 1);
    assert.deepEqual([...manager.layers.keys()], [1, 2, 0]);

    const messages: unknown[] = [];
    manager.replay((message) => messages.push(message));
    assert.deepEqual(
      messages.map((message) => (message as { data: { layerIndex: number } }).data.layerIndex),
      [1, 2, 0],
    );

    manager.move(0, 1);
    manager.move(1, -1);
    manager.move(42, -1);
    manager.move(2, 0);
    assert.deepEqual([...manager.layers.keys()], [1, 2, 0]);
    manager.move(2, -1);
    assert.deepEqual([...manager.layers.keys()], [2, 1, 0]);
  });
});
