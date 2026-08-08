import test from 'node:test';
import assert from 'node:assert/strict';

import { createAccessCodeLookupHash, getAccessCodeCandidates } from './accessCodeLookup.js';

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
