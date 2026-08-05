import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_TASK_CLIPBOARD_KIND,
  BOARD_TASK_CLIPBOARD_MARKER_PREFIX,
  BOARD_TASK_CLIPBOARD_MIME,
  BOARD_TASK_CLIPBOARD_STORAGE_PREFIX,
  BOARD_TASK_CLIPBOARD_VERSION,
  normalizeBoardTaskClipboardPayload,
  readBoardTaskFromPasteEvent,
  writeBoardTaskToClipboard,
} from './boardTaskClipboard.js';

const makeStorage = () => {
  const values = new Map();
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index) => Array.from(values.keys())[index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const taskFixture = {
  metadata: {
    taskNumber: '19',
    taskDisplayNumber: '19–21',
    taskTitle: ' Теория игр ',
    levelId: ' advanced ',
    levelTitle: ' Сложный ',
    questionId: ' question-7 ',
    questionNumber: '7',
    questionLabel: ' Домашняя работа ',
    ignored: 'not copied',
  },
  questionText: '  Найдите выигрышную стратегию.  ',
  screenshots: [
    {
      url: ' /uploads/task.png?studentId=42 ',
      originalName: ' condition.png ',
      width: '1280',
      height: 720,
      fileSize: '45678',
      ignored: true,
    },
    { url: 'javascript:alert(1)', name: 'unsafe.png' },
  ],
  answerCount: 4,
  answerLabels: ['19', '20.1', '20.2', '21'],
  expectedAnswers: ['7', ' 8 ', '9', '10'],
  studentAnswers: ['7', '11'],
  sourceStudentId: ' student-42 ',
  arbitraryHtml: '<script>alert(1)</script>',
};

test('normalizes a board task into a bounded, allow-listed payload', () => {
  const normalized = normalizeBoardTaskClipboardPayload(taskFixture);

  assert.deepEqual(normalized, {
    kind: BOARD_TASK_CLIPBOARD_KIND,
    version: BOARD_TASK_CLIPBOARD_VERSION,
    metadata: {
      taskNumber: 19,
      taskDisplayNumber: '19–21',
      taskTitle: 'Теория игр',
      levelId: 'advanced',
      levelTitle: 'Сложный',
      questionId: 'question-7',
      questionNumber: 7,
      questionLabel: 'Домашняя работа',
    },
    questionText: 'Найдите выигрышную стратегию.',
    screenshots: [{
      url: '/uploads/task.png?studentId=42',
      name: 'condition.png',
      width: 1280,
      height: 720,
      size: 45678,
    }],
    answerCount: 4,
    answerLabels: ['19', '20.1', '20.2', '21'],
    studentAnswers: ['7', '11', '', ''],
    sourceStudentId: 'student-42',
  });
  assert.equal('arbitraryHtml' in normalized, false);
  assert.equal('expectedAnswers' in normalized, false);
  assert.equal('ignored' in normalized.metadata, false);
});

test('infers answer fields and rejects empty tasks', () => {
  assert.equal(normalizeBoardTaskClipboardPayload({ answerCount: 1 }), null);
  assert.equal(normalizeBoardTaskClipboardPayload(null), null);

  const normalized = normalizeBoardTaskClipboardPayload({
    question: 'Question',
    studentAnswers: ['a', 'b'],
  });
  assert.equal(normalized.answerCount, 2);
  assert.deepEqual(normalized.answerLabels, ['1', '2']);
  assert.deepEqual(normalized.studentAnswers, ['a', 'b']);
});

test('writes an opaque marker and a payload with a storage TTL', async () => {
  const storage = makeStorage();
  let clipboardText = '';
  const copied = await writeBoardTaskToClipboard(taskFixture, {
    storage,
    clipboard: { writeText: async (value) => { clipboardText = value; } },
    now: 1_000,
    ttlMs: 5_000,
    createToken: () => 'fixed-token-123',
  });

  assert.deepEqual(copied, normalizeBoardTaskClipboardPayload(taskFixture));
  assert.equal(clipboardText, `${BOARD_TASK_CLIPBOARD_MARKER_PREFIX}fixed-token-123`);
  const stored = JSON.parse(storage.getItem(`${BOARD_TASK_CLIPBOARD_STORAGE_PREFIX}fixed-token-123`));
  assert.equal(stored.createdAt, 1_000);
  assert.equal(stored.expiresAt, 6_000);
  assert.deepEqual(stored.payload, copied);
  assert.equal('expectedAnswers' in stored.payload, false);
  assert.equal(JSON.stringify(stored).includes('expectedAnswers'), false);
});

test('returns null and rolls storage back when the clipboard write fails', async () => {
  const storage = makeStorage();
  const copied = await writeBoardTaskToClipboard(taskFixture, {
    storage,
    clipboard: { writeText: async () => { throw new Error('denied'); } },
    document: null,
    now: 1_000,
    createToken: () => 'failed-token-123',
  });

  assert.equal(copied, null);
  assert.equal(storage.getItem(`${BOARD_TASK_CLIPBOARD_STORAGE_PREFIX}failed-token-123`), null);
});

test('reads a normalized payload directly from custom clipboard MIME data', () => {
  const raw = JSON.stringify(taskFixture);
  const event = {
    clipboardData: {
      getData: (mime) => (mime === BOARD_TASK_CLIPBOARD_MIME ? raw : ''),
    },
  };

  assert.deepEqual(
    readBoardTaskFromPasteEvent(event, { storage: null, now: 1_000 }),
    normalizeBoardTaskClipboardPayload(taskFixture)
  );
});

test('resolves a text marker through storage while its payload is fresh', async () => {
  const storage = makeStorage();
  let marker = '';
  const copied = await writeBoardTaskToClipboard(taskFixture, {
    storage,
    clipboard: { writeText: async (value) => { marker = value; } },
    now: 10_000,
    ttlMs: 2_000,
    createToken: () => 'fresh-token-123',
  });
  const event = {
    clipboardData: {
      getData: (mime) => (mime === 'text/plain' ? marker : ''),
    },
  };

  assert.deepEqual(readBoardTaskFromPasteEvent(event, { storage, now: 11_999 }), copied);
});

test('rejects and removes expired marker payloads', async () => {
  const storage = makeStorage();
  let marker = '';
  await writeBoardTaskToClipboard(taskFixture, {
    storage,
    clipboard: { writeText: async (value) => { marker = value; } },
    now: 10_000,
    ttlMs: 2_000,
    createToken: () => 'stale-token-123',
  });
  const storageKey = `${BOARD_TASK_CLIPBOARD_STORAGE_PREFIX}stale-token-123`;
  const event = {
    clipboardData: {
      getData: (mime) => (mime === 'text/plain' ? marker : ''),
    },
  };

  assert.equal(readBoardTaskFromPasteEvent(event, { storage, now: 12_000 }), null);
  assert.equal(storage.getItem(storageKey), null);
});

test('ignores ordinary pasted text and malformed custom payloads', () => {
  const ordinaryTextEvent = {
    clipboardData: { getData: (mime) => (mime === 'text/plain' ? 'hello' : '') },
  };
  const malformedEvent = {
    clipboardData: { getData: (mime) => (mime === BOARD_TASK_CLIPBOARD_MIME ? '{bad json' : '') },
  };

  assert.equal(readBoardTaskFromPasteEvent(ordinaryTextEvent, { storage: makeStorage() }), null);
  assert.equal(readBoardTaskFromPasteEvent(malformedEvent, { storage: makeStorage() }), null);
  assert.equal(readBoardTaskFromPasteEvent(null), null);
});
