import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAccessCodeLookupHash,
  getAccessCodeCandidates,
  getAccessCodeRecoveryCandidates,
} from './accessCodeLookup.js';

test('access-code lookup is deterministic and secret-specific', () => {
  const first = createAccessCodeLookupHash(' 123456 ', 'secret-a');
  assert.equal(first, createAccessCodeLookupHash('123456', 'secret-a'));
  assert.notEqual(first, createAccessCodeLookupHash('123456', 'secret-b'));
  assert.notEqual(first, createAccessCodeLookupHash('654321', 'secret-a'));
});

test('access-code candidates skip indexed non-matches but keep legacy records', () => {
  const lookupHash = createAccessCodeLookupHash('123456', 'secret');
  const records = [
    { id: 'match', codeLookupHash: lookupHash },
    { id: 'different', codeLookupHash: createAccessCodeLookupHash('654321', 'secret') },
    { id: 'legacy' },
    { id: 'deleted', deletedAt: '2026-01-01T00:00:00.000Z' },
  ];
  assert.deepEqual(
    getAccessCodeCandidates(records, lookupHash, (record) => !record.deletedAt).map((record) => record.id),
    ['match', 'legacy']
  );
});

test('access-code recovery candidates include records indexed with an old secret', () => {
  const currentLookupHash = createAccessCodeLookupHash('123456', 'new-secret');
  const records = [
    { id: 'current', codeLookupHash: currentLookupHash },
    { id: 'old-secret', codeLookupHash: createAccessCodeLookupHash('123456', 'old-secret') },
    { id: 'legacy' },
    {
      id: 'deleted-old-secret',
      codeLookupHash: createAccessCodeLookupHash('654321', 'old-secret'),
      deletedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  assert.deepEqual(
    getAccessCodeRecoveryCandidates(
      records,
      currentLookupHash,
      (record) => !record.deletedAt
    ).map((record) => record.id),
    ['old-secret']
  );
});
