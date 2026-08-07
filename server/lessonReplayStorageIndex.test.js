import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeLessonReplayStorageEntry,
  normalizeLessonReplayStorageIndex,
  serializeLessonReplayStorageIndex,
} from './lessonReplayStorageIndex.js';

const HASH = 'a'.repeat(64);

test('normalizes a persisted storage index without trusting malformed entries', () => {
  const entries = normalizeLessonReplayStorageIndex({
    entries: {
      [HASH]: { dataBytes: 12.4, snapshotBytes: -8, audioBytes: 30 },
      invalid: { dataBytes: 999 },
    },
  });

  assert.equal(entries.size, 1);
  assert.deepEqual(entries.get(HASH), {
    dataBytes: 12,
    snapshotBytes: 0,
    audioBytes: 30,
    updatedAt: '',
    totalBytes: 42,
  });
});

test('updates absolute counters and increments completed media exactly once', () => {
  const entry = mergeLessonReplayStorageEntry(
    { dataBytes: 100, snapshotBytes: 50, audioBytes: 20 },
    { dataBytes: 80, updatedAt: '2026-08-07T10:00:00.000Z' },
    { snapshotBytes: 10, audioBytes: 5 }
  );

  assert.deepEqual(entry, {
    dataBytes: 80,
    snapshotBytes: 60,
    audioBytes: 25,
    updatedAt: '2026-08-07T10:00:00.000Z',
    totalBytes: 165,
  });
});

test('serializes stable normalized entries for atomic persistence', () => {
  const serialized = serializeLessonReplayStorageIndex(new Map([
    [HASH, { dataBytes: 10, snapshotBytes: 20, audioBytes: 30 }],
  ]));

  assert.equal(serialized.version, 1);
  assert.equal(serialized.entries[HASH].totalBytes, 60);
});
