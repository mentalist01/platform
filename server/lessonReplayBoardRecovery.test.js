import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLessonReplayBoardRecovery } from './lessonReplayBoardRecovery.js';
import { getLessonReplayStateAt } from '../src/utils/lessonReplayTimeMachine.js';

const item = (index, authorId = 'teacher-1') => ({
  id: `item-${index}`,
  type: 'stroke',
  authorId,
  points: [{ x: index, y: index }],
});

const boardEvent = (id, offsetMs, items, truncated = false) => ({
  id,
  type: 'board',
  occurredAt: new Date(1_000_000 + offsetMs).toISOString(),
  offsetMs,
  actor: { id: 'teacher-1', role: 'teacher', name: 'Иван' },
  payload: { mode: 'snapshot', items, truncated },
});

test('recovers omitted middle objects when a truncated snapshot exposes the later frontier', () => {
  const finalItems = Array.from({ length: 11 }, (_, index) => item(index));
  const replay = {
    timelineStartMs: 1_000_000,
    occurrence: { startMs: 1_000_000, studentId: 'student-1' },
    events: [
      boardEvent('initial', 0, [item(0), item(1)]),
      boardEvent('truncated', 100, [item(0), item(1), item(8), item(9)], true),
      {
        id: 'lesson-end',
        type: 'session',
        occurredAt: new Date(1_001_000).toISOString(),
        offsetMs: 1000,
        actor: { id: 'teacher-1', role: 'teacher', name: 'Иван' },
        payload: { action: 'end', via: 'platform' },
      },
    ],
  };

  const recovery = buildLessonReplayBoardRecovery(replay, finalItems);
  const repaired = { ...replay, events: [...replay.events, ...recovery.events] };
  const stateAfterFrontier = getLessonReplayStateAt(repaired, 102).board.items;
  const stateAtEnd = getLessonReplayStateAt(repaired, 1002).board.items;

  assert.equal(recovery.stats.knownFinalItemCount, 4);
  assert.equal(recovery.stats.inferredItemCount, 6);
  assert.equal(recovery.stats.recoveredAtEndCount, 1);
  assert.deepEqual(stateAfterFrontier.map((entry) => entry.id), finalItems.slice(0, 10).map((entry) => entry.id));
  assert.deepEqual(stateAtEnd.map((entry) => entry.id), finalItems.map((entry) => entry.id));
});
