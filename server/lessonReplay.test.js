import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendLessonReplayEvents,
  createLessonReplay,
  normalizeLessonReplay,
  normalizeLessonReplayEvent,
  summarizeLessonReplay,
} from './lessonReplay.js';

const START_MS = Date.parse('2026-08-01T10:00:00.000Z');
const occurrence = {
  key: 'student-1|2026-08-01|13:00|60',
  studentId: 'student-1',
  dayKey: '2026-08-01',
  time: '13:00',
  durationMinutes: 60,
  startMs: START_MS,
  endMs: START_MS + 60 * 60 * 1000,
};

const eventContext = {
  startMs: occurrence.startMs,
  endMs: occurrence.endMs,
  actorRole: 'teacher',
  actorId: 'teacher-1',
  actorName: 'Иван',
  nowMs: START_MS,
};

test('normalizes a replay event and drops unsupported event types', () => {
  const event = normalizeLessonReplayEvent({
    id: 'event-1',
    type: 'navigation',
    occurredAt: new Date(START_MS + 5000).toISOString(),
    payload: { view: 'board', label: 'Доска', privateValue: 'drop me' },
  }, eventContext);

  assert.equal(event.type, 'navigation');
  assert.equal(event.offsetMs, 5000);
  assert.deepEqual(event.actor, { role: 'teacher', id: 'teacher-1', name: 'Иван' });
  assert.deepEqual(event.payload, { view: 'board', label: 'Доска' });
  assert.equal(normalizeLessonReplayEvent({ type: 'audio' }, eventContext), null);
});

test('keeps board assets as references and never stores inline images', () => {
  const event = normalizeLessonReplayEvent({
    type: 'board',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: {
      items: [
        {
          id: 'asset-image',
          type: 'image',
          assetUrl: `/uploads/board-asset-${'a'.repeat(64)}.webp`,
          dataUrl: `data:image/png;base64,${'x'.repeat(1000)}`,
          x: 10,
          y: 20,
          width: 300,
          height: 200,
        },
        {
          id: 'inline-only',
          type: 'image',
          dataUrl: 'data:image/png;base64,AAAA',
          x: 0,
          y: 0,
          width: 20,
          height: 20,
        },
      ],
    },
  }, eventContext);

  assert.equal(event.payload.items.length, 1);
  assert.equal(event.payload.items[0].assetUrl, `/uploads/board-asset-${'a'.repeat(64)}.webp`);
  assert.equal(Object.hasOwn(event.payload.items[0], 'dataUrl'), false);
});

test('compacts very long board strokes without losing endpoints', () => {
  const points = Array.from({ length: 2000 }, (_, index) => ({ x: index, y: index * 2 }));
  const event = normalizeLessonReplayEvent({
    type: 'board',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: { items: [{ id: 'stroke-1', type: 'stroke', points }] },
  }, eventContext);

  const compacted = event.payload.items[0].points;
  assert.equal(compacted.length, 900);
  assert.deepEqual(compacted[0], { x: 0, y: 0 });
  assert.deepEqual(compacted.at(-1), { x: 1999, y: 3998 });
});

test('append is idempotent by event id and suppresses identical rapid snapshots', () => {
  const replay = createLessonReplay(occurrence, START_MS);
  const event = {
    id: 'same-event',
    type: 'code',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: { code: 'print(1)' },
  };
  const first = appendLessonReplayEvents(replay, [event], eventContext);
  const second = appendLessonReplayEvents(first.replay, [
    event,
    {
      id: 'different-id-same-state',
      type: 'code',
      occurredAt: new Date(START_MS + 2000).toISOString(),
      payload: { code: 'print(1)' },
    },
  ], eventContext);

  assert.equal(first.added, 1);
  assert.equal(second.added, 0);
  assert.equal(second.replay.events.length, 1);
});

test('rapid snapshot dedupe is scoped to the actor role and id', () => {
  const event = (id, occurredAtMs) => ({
    id,
    type: 'code',
    occurredAt: new Date(occurredAtMs).toISOString(),
    payload: { code: 'print(1)' },
  });
  const studentContext = {
    ...eventContext,
    actorRole: 'student',
    actorId: 'student-1',
  };
  const teacherContext = {
    ...eventContext,
    actorRole: 'teacher',
    actorId: 'teacher-1',
  };
  const otherTeacherContext = {
    ...eventContext,
    actorRole: 'teacher',
    actorId: 'teacher-2',
  };

  const student = appendLessonReplayEvents(
    createLessonReplay(occurrence, START_MS),
    [event('student-code', START_MS + 1000)],
    studentContext
  );
  const teacher = appendLessonReplayEvents(
    student.replay,
    [event('teacher-code', START_MS + 2000)],
    teacherContext
  );
  const otherTeacher = appendLessonReplayEvents(
    teacher.replay,
    [event('other-teacher-code', START_MS + 3000)],
    otherTeacherContext
  );
  const duplicateOtherTeacher = appendLessonReplayEvents(
    otherTeacher.replay,
    [event('other-teacher-code-duplicate', START_MS + 4000)],
    otherTeacherContext
  );

  assert.equal(student.added, 1);
  assert.equal(teacher.added, 1);
  assert.equal(otherTeacher.added, 1);
  assert.equal(duplicateOtherTeacher.added, 0);
  assert.deepEqual(
    duplicateOtherTeacher.replay.events.map((entry) => [entry.actor.role, entry.actor.id]),
    [
      ['student', 'student-1'],
      ['teacher', 'teacher-1'],
      ['teacher', 'teacher-2'],
    ]
  );
});

test('session events preserve an explicit transport switch action', () => {
  const event = normalizeLessonReplayEvent({
    id: 'switch-to-telemost',
    type: 'session',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: { action: 'switch', via: 'telemost' },
  }, eventContext);

  assert.deepEqual(event.payload, { action: 'switch', via: 'telemost' });
});

test('screen snapshots keep only a safe compact reference', () => {
  const event = normalizeLessonReplayEvent({
    id: 'screen-frame',
    type: 'screen',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: {
      snapshotId: 'frame_123-safe',
      width: 1280,
      height: 720,
      sizeBytes: 84_000,
      mimeType: 'image/webp',
      dataUrl: `data:image/webp;base64,${'x'.repeat(10_000)}`,
    },
  }, eventContext);

  assert.deepEqual(event.payload, {
    active: true,
    snapshotId: 'frame_123-safe',
    width: 1280,
    height: 720,
    sizeBytes: 84_000,
    mimeType: 'image/webp',
    checksum: '',
    sharedByRole: 'student',
    sharedByName: '',
  });
  assert.equal(normalizeLessonReplayEvent({
    type: 'screen',
    payload: { snapshotId: '../bad' },
  }, eventContext)?.payload.snapshotId, 'bad');
  assert.equal(normalizeLessonReplayEvent({ type: 'screen', payload: {} }, eventContext), null);
  assert.equal(normalizeLessonReplayEvent({
    type: 'screen',
    payload: { active: false },
  }, eventContext)?.payload.active, false);
});

test('sorts events by lesson offset and measures UTF-8 bytes', () => {
  const replay = normalizeLessonReplay({
    occurrence,
    events: [
      { id: 'later', type: 'navigation', occurredAt: new Date(START_MS + 9000).toISOString(), payload: { label: 'Позже' } },
      { id: 'earlier', type: 'navigation', occurredAt: new Date(START_MS + 1000).toISOString(), payload: { label: 'Раньше' } },
    ],
  });
  const summary = summarizeLessonReplay(replay);

  assert.deepEqual(replay.events.map((event) => event.id), ['earlier', 'later']);
  assert.equal(summary.durationMs, 9000);
  assert.ok(summary.bytes > JSON.stringify(replay).length, 'Russian UTF-8 text must take more than one byte per letter');
});

test('rejects events far outside the lesson window', () => {
  const tooEarly = normalizeLessonReplayEvent({
    type: 'task',
    occurredAt: new Date(START_MS - 31 * 60 * 1000).toISOString(),
    payload: { taskNumber: 1 },
  }, eventContext);
  const tooLate = normalizeLessonReplayEvent({
    type: 'task',
    occurredAt: new Date(occurrence.endMs + 121 * 60 * 1000).toISOString(),
    payload: { taskNumber: 1 },
  }, eventContext);

  assert.equal(tooEarly, null);
  assert.equal(tooLate, null);
});

test('strictly bounds a replay even when one snapshot is larger than the requested limit', () => {
  const replay = createLessonReplay(occurrence, START_MS);
  const result = appendLessonReplayEvents(replay, [{
    id: 'large-code',
    type: 'code',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: { code: 'x'.repeat(80_000) },
  }], { ...eventContext, maxBytes: 1000 });

  assert.ok(Buffer.byteLength(JSON.stringify(result.replay), 'utf8') <= 1000);
});

test('caps a full board snapshot before it can dominate the replay file', () => {
  const points = Array.from({ length: 900 }, (_, index) => ({ x: index, y: index * 2 }));
  const items = Array.from({ length: 240 }, (_, index) => ({
    id: `stroke-${index}`,
    type: 'stroke',
    points,
  }));
  const event = normalizeLessonReplayEvent({
    id: 'large-board',
    type: 'board',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: { items },
  }, eventContext);

  assert.ok(event.payload.items.length > 0);
  assert.ok(event.payload.items.length < items.length);
  assert.ok(Buffer.byteLength(JSON.stringify(event), 'utf8') <= 512 * 1024);
});

test('event-count compaction preserves the start and latest surface states', () => {
  const events = [{
    id: 'lesson-start',
    type: 'session',
    occurredAt: new Date(START_MS).toISOString(),
    payload: { action: 'start' },
  }];
  for (let index = 0; index < 2405; index += 1) {
    events.push({
      id: `navigation-${index}`,
      type: 'navigation',
      occurredAt: new Date(START_MS + index * 1000).toISOString(),
      payload: { view: `view-${index}`, label: `Экран ${index}` },
    });
  }
  const replay = normalizeLessonReplay({ occurrence, events });

  assert.equal(replay.events.length, 2400);
  assert.ok(replay.events.some((event) => event.id === 'lesson-start'));
  assert.ok(replay.events.some((event) => event.id === 'navigation-2404'));
});

test('task events keep an explicit close state and stable question number', () => {
  const event = normalizeLessonReplayEvent({
    id: 'task-close',
    type: 'task',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: { active: false, taskNumber: 7, questionIndex: 2, questionNumber: 18 },
  }, eventContext);

  assert.deepEqual(event.payload, {
    active: false,
    taskNumber: 7,
    questionIndex: 2,
    questionNumber: 18,
    levelId: '',
    label: '',
  });
});
