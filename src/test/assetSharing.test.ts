/** @module assetSharing.test */

import { strict as assert } from 'node:assert';
import { applyAssetSharing } from '../sidebar/assets/eeApiClient.js';

describe('asset sharing', () => {
  const policy = {
    etag: 'current',
    version: 3,
    bindings: [
      { role: 'roles/owner', members: ['user:owner@example.com'] },
      {
        role: 'roles/viewer',
        members: ['allUsers', 'user:reader@example.com', 'group:team@example.com'],
      },
      { role: 'roles/editor', members: ['user:writer@example.com'] },
      { role: 'roles/custom', members: ['user:other@example.com'] },
    ],
  };

  it('updates user and public grants without dropping owners, groups or other roles', () => {
    const updated = applyAssetSharing(policy, {
      etag: 'current',
      publicRead: false,
      users: [
        { email: 'reader@example.com', role: 'writer' },
        { email: 'new@example.com', role: 'reader' },
      ],
    });
    assert.deepEqual(updated, {
      etag: 'current',
      version: 3,
      bindings: [
        { role: 'roles/owner', members: ['user:owner@example.com'] },
        {
          role: 'roles/viewer',
          members: ['group:team@example.com', 'user:new@example.com'],
        },
        { role: 'roles/editor', members: ['user:reader@example.com'] },
        { role: 'roles/custom', members: ['user:other@example.com'] },
      ],
    });
    assert.deepEqual(policy.bindings[1].members, [
      'allUsers',
      'user:reader@example.com',
      'group:team@example.com',
    ]);
  });

  it('creates a public reader binding on an empty policy', () => {
    assert.deepEqual(
      applyAssetSharing({}, { etag: '', publicRead: true, users: [] }),
      { bindings: [{ role: 'roles/viewer', members: ['allUsers'] }] },
    );
  });

  it('retains conditional and non-user grants when revoking all direct access', () => {
    const conditional = { role: 'roles/viewer', members: ['user:limited@example.com'], condition: { title: 'limited' } };
    const updated = applyAssetSharing(
      {
        etag: 'v2',
        bindings: [
          { role: 'roles/viewer', members: ['allUsers', 'user:old@example.com'] },
          conditional,
          { role: 'roles/editor', members: ['serviceAccount:worker@example.com'] },
        ],
      },
      { etag: 'v2', publicRead: false, users: [] },
    );
    assert.deepEqual(updated.bindings, [
      conditional,
      { role: 'roles/editor', members: ['serviceAccount:worker@example.com'] },
    ]);
  });

  it('rejects stale policies, duplicate users and invalid grants', () => {
    assert.throws(() => applyAssetSharing(policy, { etag: 'stale', publicRead: false, users: [] }));
    assert.throws(() =>
      applyAssetSharing(policy, {
        etag: 'current',
        publicRead: true,
        users: [
          { email: 'a@example.com', role: 'reader' },
          { email: 'A@example.com', role: 'writer' },
        ],
      }),
    );
    assert.throws(() =>
      applyAssetSharing(policy, {
        etag: 'current',
        publicRead: true,
        users: [{ email: 'invalid', role: 'reader' }],
      }),
    );
  });
});
