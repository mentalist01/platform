import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendLessonReplayEvents,
  compareLessonReplayEvents,
  createLessonReplay,
  normalizeLessonReplay,
  normalizeLessonReplayEvent,
  summarizeLessonReplay,
  summarizeLessonReplayStorage,
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

test('keeps a bounded participant snapshot on a shared group replay', () => {
  const replay = normalizeLessonReplay({
    occurrence: {
      ...occurrence,
      key: 'learning-group-replay|lesson-1',
      studentId: '',
      scope: 'learning-group',
      groupId: 'group-1',
      lessonId: 'lesson-1',
      participantIds: ['student-1', 'student-2', 'student-2'],
    },
  });
  assert.equal(replay.occurrence.scope, 'learning-group');
  assert.equal(replay.occurrence.groupId, 'group-1');
  assert.equal(replay.occurrence.lessonId, 'lesson-1');
  assert.deepEqual(replay.occurrence.participantIds, ['student-1', 'student-2']);
});

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
  assert.equal(normalizeLessonReplayEvent({ type: 'camera' }, eventContext), null);
  assert.equal(normalizeLessonReplayEvent({ type: 'audio', payload: {} }, eventContext), null);
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

test('keeps task cards on the replay board without leaking solution fields', () => {
  const assetUrl = `/uploads/board-asset-${'b'.repeat(64)}.png`;
  const event = normalizeLessonReplayEvent({
    type: 'board',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: {
      items: [{
        id: 'task-card-1',
        type: 'task',
        authorId: 'teacher-1',
        x: 25,
        y: 50,
        width: 760,
        height: 820,
        contentWidth: 720,
        contentHeight: 780,
        codePanelLayoutVersion: 3,
        heading: 'Задание 17',
        taskNumber: 17,
        questionNumber: 3,
        questionText: 'Найдите ответ.',
        screenshots: [
          { assetUrl, displayHeight: 260 },
          { dataUrl: 'data:image/png;base64,AAAA', displayHeight: 100 },
        ],
        answerCount: 2,
        answerLabels: ['A', 'B'],
        userAnswers: ['12', '34'],
        studentAnswers: ['12', ''],
        studentCode: 'print(42)',
        checkState: 'wrong',
        expectedAnswers: ['secret', 'secret'],
        solution: 'must not be stored',
      }],
    },
  }, eventContext);

  assert.equal(event.payload.items.length, 1);
  const task = event.payload.items[0];
  assert.equal(task.type, 'task');
  assert.equal(task.authorId, 'teacher-1');
  assert.equal(task.contentWidth, 720);
  assert.equal(task.contentHeight, 780);
  assert.equal(task.codePanelLayoutVersion, 3);
  assert.equal(task.questionText, 'Найдите ответ.');
  assert.deepEqual(task.userAnswers, ['12', '34']);
  assert.deepEqual(task.studentAnswers, ['12', '']);
  assert.equal(task.studentCode, 'print(42)');
  assert.deepEqual(task.screenshots, [{
    assetUrl,
    name: '',
    naturalWidth: 1,
    naturalHeight: 1,
    displayHeight: 260,
  }]);
  assert.equal(task.checkState, 'wrong');
  assert.equal(Object.hasOwn(task, 'expectedAnswers'), false);
  assert.equal(Object.hasOwn(task, 'solution'), false);
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

test('keeps compact board deltas needed for chronological playback', () => {
  const event = normalizeLessonReplayEvent({
    id: 'board-delta',
    type: 'board',
    occurredAt: new Date(START_MS + 15_000).toISOString(),
    payload: {
      mode: 'delta',
      upserts: [{
        index: 2,
        item: {
          id: 'stroke-new',
          type: 'stroke',
          color: '#111827',
          width: 4,
          points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
        },
      }],
      removedIds: ['old-stroke', 'old-stroke'],
    },
  }, eventContext);

  assert.equal(event.payload.mode, 'delta');
  assert.deepEqual(event.payload.removedIds, ['old-stroke']);
  assert.equal(event.payload.upserts.length, 1);
  assert.equal(event.payload.upserts[0].index, 2);
  assert.equal(event.payload.upserts[0].item.id, 'stroke-new');
  assert.equal(event.payload.truncated, false);
  assert.equal(Object.hasOwn(event.payload, 'items'), false);
});

test('preserves the explicit initial board state marker', () => {
  for (const mode of ['snapshot', 'delta']) {
    const boardItem = { id: `initial-${mode}`, type: 'text', text: mode };
    const event = normalizeLessonReplayEvent({
      id: `initial-board-${mode}`,
      type: 'board',
      occurredAt: new Date(START_MS + 87_000).toISOString(),
      payload: {
        mode,
        initialState: true,
        actorVerified: false,
        ...(mode === 'snapshot'
          ? { items: [boardItem] }
          : { upserts: [{ index: 0, item: boardItem }], removedIds: [] }),
      },
    }, eventContext);

    assert.equal(event.payload.initialState, true);
    assert.equal(normalizeLessonReplayEvent(event, eventContext).payload.initialState, true);
  }
});

test('keeps delta indexes for the full 2500-item board capacity', () => {
  const event = normalizeLessonReplayEvent({
    id: 'board-delta-last-index',
    type: 'board',
    occurredAt: new Date(START_MS + 15_000).toISOString(),
    payload: {
      mode: 'delta',
      upserts: [{
        index: 2499,
        item: {
          id: 'stroke-2499',
          type: 'stroke',
          points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
        },
      }],
      removedIds: [],
    },
  }, eventContext);

  assert.equal(event.payload.upserts[0].index, 2499);
  assert.equal(event.payload.truncated, false);
});

test('preserves truncation evidence when persisted board events are normalized again', () => {
  for (const mode of ['snapshot', 'delta']) {
    const item = { id: 'surviving-stroke', type: 'stroke', points: [{ x: 10, y: 20 }] };
    const event = normalizeLessonReplayEvent({
      id: `already-truncated-${mode}`,
      type: 'board',
      occurredAt: new Date(START_MS + 15_000).toISOString(),
      payload: {
        mode,
        truncated: true,
        ...(mode === 'snapshot' ? { items: [item] } : { upserts: [{ index: 2, item }], removedIds: [] }),
      },
    }, eventContext);
    assert.equal(event.payload.truncated, true);
    assert.equal(normalizeLessonReplayEvent(event, eventContext).payload.truncated, true);
  }
});

test('retains a full hour of 5-second board checkpoints without hitting the replay limit', () => {
  const events = [{
    id: 'board-initial',
    type: 'board',
    occurredAt: new Date(START_MS).toISOString(),
    payload: { mode: 'snapshot', items: [] },
  }];
  for (let index = 1; index <= 720; index += 1) {
    events.push({
      id: `board-delta-${index}`,
      type: 'board',
      occurredAt: new Date(START_MS + index * 5_000).toISOString(),
      payload: {
        mode: 'delta',
        upserts: [{
          index: index - 1,
          item: {
            id: `stroke-${index}`,
            type: 'stroke',
            points: [{ x: index, y: index }, { x: index + 5, y: index + 8 }],
          },
        }],
        removedIds: [],
      },
    });
  }

  let result = { replay: createLessonReplay(occurrence, START_MS) };
  for (let index = 0; index < events.length; index += 48) {
    result = appendLessonReplayEvents(result.replay, events.slice(index, index + 48), eventContext);
  }

  assert.equal(result.replay.events.filter((event) => event.type === 'board').length, 721);
  assert.ok(result.bytes < 1024 * 1024);
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

test('shared code snapshots dedupe across actors while viewports stay actor-scoped', () => {
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
  assert.equal(teacher.added, 0);
  assert.equal(otherTeacher.added, 0);
  assert.equal(duplicateOtherTeacher.added, 0);
  assert.deepEqual(
    duplicateOtherTeacher.replay.events.map((entry) => [entry.actor.role, entry.actor.id]),
    [['student', 'student-1']]
  );

  const teacherViewport = appendLessonReplayEvents(student.replay, [{
    id: 'teacher-view',
    type: 'viewport',
    occurredAt: new Date(START_MS + 2000).toISOString(),
    payload: { surface: 'code', scrollTopRatio: 0.5 },
  }], teacherContext);
  const studentViewport = appendLessonReplayEvents(teacherViewport.replay, [{
    id: 'student-view',
    type: 'viewport',
    occurredAt: new Date(START_MS + 3000).toISOString(),
    payload: { surface: 'code', scrollTopRatio: 0.5 },
  }], studentContext);
  assert.equal(teacherViewport.added, 1);
  assert.equal(studentViewport.added, 1);
});

test('normalizes compact actor viewport and audio segment metadata', () => {
  const boardViewport = normalizeLessonReplayEvent({
    type: 'viewport',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: {
      surface: 'board',
      zoom: 999,
      offset: { x: 125.5, y: -80 },
      width: 1280,
      height: 720,
      privateValue: 'drop me',
    },
  }, eventContext);
  assert.deepEqual(boardViewport.payload, {
    surface: 'board',
    zoom: 32,
    offset: { x: 125.5, y: -80 },
    width: 1280,
    height: 720,
  });

  const audio = normalizeLessonReplayEvent({
    type: 'audio',
    occurredAt: new Date(START_MS + 2000).toISOString(),
    payload: {
      audioId: 'segment_01-safe',
      durationMs: 30_100,
      sizeBytes: 121_000,
      storage: 'local',
      mimeType: 'audio/webm;codecs=opus',
      objectKey: 'must-not-leak',
    },
  }, eventContext);
  assert.deepEqual(audio.payload, {
    audioId: 'segment_01-safe',
    durationMs: 30_100,
    sizeBytes: 121_000,
    storage: 'local',
    mimeType: 'audio/webm;codecs=opus',
  });
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
    sharedByRole: '',
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

test('rebases pre-start events and preserves source order for exact ties', () => {
  // Early joins belong to the recording timeline instead of being collapsed
  // into one unseekable point at 0:00.
  const replay = normalizeLessonReplay({
    occurrence,
    events: [
      {
        id: 'z-delta',
        type: 'board',
        occurredAt: new Date(START_MS - 500).toISOString(),
        payload: {
          mode: 'delta',
          upserts: [{ index: 0, item: { id: 'stroke-2', type: 'stroke', points: [{ x: 2, y: 2 }] } }],
        },
      },
      {
        id: 'a-snapshot',
        type: 'board',
        occurredAt: new Date(START_MS - 1000).toISOString(),
        payload: { mode: 'snapshot', items: [] },
      },
      {
        id: 'same-time-first',
        type: 'navigation',
        occurredAt: new Date(START_MS).toISOString(),
        payload: { label: 'first' },
      },
      {
        id: 'same-time-second',
        type: 'navigation',
        occurredAt: new Date(START_MS).toISOString(),
        payload: { label: 'second' },
      },
    ],
  });

  assert.deepEqual(
    replay.events.map((event) => event.id),
    ['a-snapshot', 'z-delta', 'same-time-first', 'same-time-second']
  );
  assert.equal(replay.timelineStartMs, START_MS - 1000);
  assert.equal(replay.events[0].offsetMs, 0);
  assert.equal(replay.events[1].offsetMs, 500);
  assert.equal(replay.events[2].offsetMs, 1000);
  assert.equal(replay.events[3].offsetMs, 1000);
  assert.ok(compareLessonReplayEvents(replay.events[0], replay.events[1]) < 0);
  assert.equal(compareLessonReplayEvents(replay.events[2], replay.events[3]), 0);
  assert.ok(compareLessonReplayEvents(
    { offsetMs: 0, occurredAt: new Date(START_MS - 1000).toISOString() },
    { offsetMs: 0, occurredAt: new Date(START_MS - 500).toISOString() }
  ) < 0);
});

test('keeps the code action used by replay narration', () => {
  const event = normalizeLessonReplayEvent({
    id: 'code-edit',
    type: 'code',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: { action: 'snapshot', actorVerified: false, code: 'print(1)' },
  }, eventContext);

  assert.equal(event.payload.action, 'snapshot');
  assert.equal(event.payload.actorVerified, false);
  assert.equal(event.payload.code, 'print(1)');
});

test('does not invent a student actor for an unauthored replay checkpoint', () => {
  const event = normalizeLessonReplayEvent({
    id: 'neutral-code-checkpoint',
    type: 'code',
    occurredAt: new Date(START_MS + 1000).toISOString(),
    payload: { action: 'snapshot', code: 'print(1)' },
  }, {
    startMs: START_MS,
    timelineStartMs: START_MS,
    endMs: occurrence.endMs,
  });

  assert.equal(event.actor.role, '');
  assert.equal(event.payload.actorVerified, false);
});

test('moves an existing live timeline when an earlier participant event arrives', () => {
  const initial = appendLessonReplayEvents(createLessonReplay(occurrence, START_MS), [{
    id: 'at-start',
    type: 'navigation',
    occurredAt: new Date(START_MS).toISOString(),
    payload: { view: 'board' },
  }], eventContext);
  const withEarlyJoin = appendLessonReplayEvents(initial.replay, [{
    id: 'early-join',
    type: 'navigation',
    occurredAt: new Date(START_MS - 20_000).toISOString(),
    payload: { view: 'collab' },
  }], eventContext);

  assert.equal(withEarlyJoin.replay.timelineStartMs, START_MS - 20_000);
  assert.deepEqual(
    withEarlyJoin.replay.events.map((event) => [event.id, event.offsetMs]),
    [['early-join', 0], ['at-start', 20_000]]
  );
});

test('count compaction always retains a board keyframe before retained deltas', () => {
  const events = [{
    id: 'board-keyframe',
    type: 'board',
    occurredAt: new Date(START_MS).toISOString(),
    payload: { mode: 'snapshot', items: [] },
  }];
  for (let index = 0; index < 2500; index += 1) {
    events.push({
      id: `navigation-${index}`,
      type: 'navigation',
      occurredAt: new Date(START_MS + (index + 1) * 1000).toISOString(),
      payload: { view: `view-${index}`, label: `Экран ${index}` },
    });
  }
  events.push({
    id: 'board-delta-last',
    type: 'board',
    occurredAt: new Date(START_MS + 2_501_000).toISOString(),
    payload: {
      mode: 'delta',
      upserts: [{ index: 0, item: { id: 'stroke-last', type: 'stroke', points: [{ x: 1, y: 1 }] } }],
      removedIds: [],
    },
  });

  const replay = normalizeLessonReplay({ occurrence, events });
  const boardEvents = replay.events.filter((event) => event.type === 'board');
  assert.ok(boardEvents.length >= 2);
  assert.equal(boardEvents[0].payload.mode, 'snapshot');
  assert.equal(boardEvents.at(-1).id, 'board-delta-last');
});

test('adds replay data, screen snapshots and audio to the full storage size', () => {
  const replay = normalizeLessonReplay({
    occurrence,
    events: [
      { id: 'screen', type: 'screen', occurredAt: new Date(START_MS + 1000).toISOString(), payload: { snapshotId: '12345678-1234-4123-8123-123456789abc', sizeBytes: 1200 } },
      { id: 'audio', type: 'audio', occurredAt: new Date(START_MS + 2000).toISOString(), payload: { audioId: 'audio-1', durationMs: 1000, sizeBytes: 3400, storage: 'local' } },
    ],
  });
  const storage = summarizeLessonReplayStorage(replay, {
    normalized: true,
    dataBytes: 500,
    snapshotBytes: 1100,
  });

  assert.deepEqual(storage, {
    dataBytes: 500,
    snapshotBytes: 1100,
    audioBytes: 3400,
    totalBytes: 5000,
  });
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

test('byte compaction preserves board and code history before a final clear', () => {
  const events = [];
  for (let index = 0; index < 48; index += 1) {
    events.push({
      id: `board-${index}`,
      type: 'board',
      occurredAt: new Date(START_MS + index * 2000).toISOString(),
      payload: {
        items: [{
          id: `text-${index}`,
          type: 'text',
          text: `${index}:${'x'.repeat(1800)}`,
          x: index,
          y: index,
          width: 300,
          height: 80,
        }],
      },
    });
    events.push({
      id: `code-${index}`,
      type: 'code',
      occurredAt: new Date(START_MS + index * 2000 + 1000).toISOString(),
      payload: { code: `# ${index}\n${'x'.repeat(1200)}` },
    });
  }
  events.push({
    id: 'board-cleared',
    type: 'board',
    occurredAt: new Date(START_MS + 100_000).toISOString(),
    payload: { items: [] },
  }, {
    id: 'code-cleared',
    type: 'code',
    occurredAt: new Date(START_MS + 101_000).toISOString(),
    payload: { code: '' },
  });

  let result = { replay: createLessonReplay(occurrence, START_MS) };
  for (let index = 0; index < events.length; index += 48) {
    result = appendLessonReplayEvents(result.replay, events.slice(index, index + 48), {
      ...eventContext,
      maxBytes: 32 * 1024,
    });
  }
  const boardEvents = result.replay.events.filter((event) => event.type === 'board');
  const codeEvents = result.replay.events.filter((event) => event.type === 'code');

  assert.ok(Buffer.byteLength(JSON.stringify(result.replay), 'utf8') <= 32 * 1024);
  assert.ok(boardEvents.some((event) => event.payload.items.length > 0));
  assert.ok(codeEvents.some((event) => event.payload.code.length > 0));
  assert.equal(boardEvents.at(-1)?.payload.items.length, 0);
  assert.equal(codeEvents.at(-1)?.payload.code, '');
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
  assert.equal(event.payload.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(event), 'utf8') <= 512 * 1024);
});

test('event-count compaction preserves the start and latest surface states', () => {
  const events = [{
    id: 'lesson-start',
    type: 'session',
    occurredAt: new Date(START_MS).toISOString(),
    payload: { action: 'start' },
  }];
  for (let index = 0; index < 6005; index += 1) {
    events.push({
      id: `navigation-${index}`,
      type: 'navigation',
      occurredAt: new Date(START_MS + index * 1000).toISOString(),
      payload: { view: `view-${index}`, label: `Экран ${index}` },
    });
  }
  const replay = normalizeLessonReplay({ occurrence, events });

  assert.equal(replay.events.length, 6000);
  assert.ok(replay.events.some((event) => event.id === 'lesson-start'));
  assert.ok(replay.events.some((event) => event.id === 'navigation-6004'));
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
