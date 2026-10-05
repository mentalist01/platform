import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_TASK_CLIPBOARD_KIND,
  BOARD_TASK_CLIPBOARD_MARKER_PREFIX,
  BOARD_TASK_CLIPBOARD_PACKET_PREFIX,
  BOARD_TASK_CLIPBOARD_MAX_PACKET_LENGTH,
  BOARD_TASK_CLIPBOARD_MIME,
  BOARD_TASK_CLIPBOARD_STORAGE_PREFIX,
  BOARD_TASK_CLIPBOARD_TTL_MS,
  BOARD_TASK_CLIPBOARD_VERSION,
  hasBoardTaskClipboardData,
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
  studentCode: 'print("student solution")\n',
  sourceStudentId: ' student-42 ',
  arbitraryHtml: '<script>alert(1)</script>',
};

const textPasteEvent = (text) => ({
  clipboardData: { getData: (mime) => (mime === 'text/plain' ? text : '') },
});

const envelopeFor = (payload = taskFixture) => ({
  version: BOARD_TASK_CLIPBOARD_VERSION,
  createdAt: 10_000,
  expiresAt: 12_000,
  payload: normalizeBoardTaskClipboardPayload(payload),
});

const packetFor = (envelope) => `${BOARD_TASK_CLIPBOARD_PACKET_PREFIX}${JSON.stringify(envelope)}`;

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
    studentCode: 'print("student solution")\n',
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

test('copies a complete task that a separate desktop profile can paste without source storage', async () => {
  const storage = makeStorage();
  let clipboardText = '';
  const copied = await writeBoardTaskToClipboard(taskFixture, {
    storage,
    clipboard: { writeText: async (value) => { clipboardText = value; } },
    now: 1_000,
    ttlMs: 5_000,
  });

  assert.deepEqual(copied, normalizeBoardTaskClipboardPayload(taskFixture));
  assert.equal(storage.length, 0);
  const envelope = JSON.parse(clipboardText.slice(BOARD_TASK_CLIPBOARD_PACKET_PREFIX.length));
  assert.equal(envelope.createdAt, 1_000);
  assert.equal(envelope.expiresAt, 6_000);
  assert.deepEqual(envelope.payload, copied);
  assert.equal(clipboardText.includes('expectedAnswers'), false);
  assert.equal(clipboardText.includes('arbitraryHtml'), false);
  const desktopStorage = makeStorage();
  assert.deepEqual(readBoardTaskFromPasteEvent(textPasteEvent(clipboardText), {
    storage: desktopStorage, now: 5_999,
  }), copied);
  assert.equal(desktopStorage.length, 0);
  assert.deepEqual(readBoardTaskFromPasteEvent(textPasteEvent(clipboardText), {
    storage: null, now: 5_999,
  }), copied);
});

test('returns null when clipboard access and the copy fallback are unavailable', async () => {
  const storage = makeStorage();
  const copied = await writeBoardTaskToClipboard(taskFixture, {
    storage,
    clipboard: { writeText: async () => { throw new Error('denied'); } },
    document: null,
    now: 1_000,
  });

  assert.equal(copied, null);
  assert.equal(storage.length, 0);
});

test('copy works when storage is disabled and clamps task lifetime to fifteen minutes', async () => {
  let text;
  const storage = { setItem: () => { throw new Error('Storage disabled'); } };
  assert.ok(await writeBoardTaskToClipboard(taskFixture, {
    storage, clipboard: { writeText: async value => { text = value; } },
    now: 10_000, ttlMs: 2 * BOARD_TASK_CLIPBOARD_TTL_MS,
  }));
  assert.ok(readBoardTaskFromPasteEvent(textPasteEvent(text), { storage: null, now: 10_001 }));
  assert.equal(readBoardTaskFromPasteEvent(textPasteEvent(text), {
    storage: null, now: 10_000 + BOARD_TASK_CLIPBOARD_TTL_MS,
  }), null);
});

test('the document fallback copies the complete packet and removes its temporary field', async () => {
  let copiedText;
  let removed = false;
  const textarea = { style: {}, select() {}, remove() { removed = true; } };
  const document = {
    createElement: () => textarea,
    body: { appendChild() {} },
    execCommand: (command) => { assert.equal(command, 'copy'); copiedText = textarea.value; return true; },
  };
  const copied = await writeBoardTaskToClipboard(taskFixture, {
    clipboard: { writeText: async () => { throw new Error('Denied'); } },
    storage: null, document, now: 10_000,
  });
  assert.equal(removed, true);
  assert.deepEqual(readBoardTaskFromPasteEvent(textPasteEvent(copiedText), { storage: null, now: 10_001 }), copied);
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

test('keeps old text markers readable in the original profile while fresh', () => {
  const storage = makeStorage();
  const copied = normalizeBoardTaskClipboardPayload(taskFixture);
  storage.setItem(`${BOARD_TASK_CLIPBOARD_STORAGE_PREFIX}fresh-token-123`, JSON.stringify(envelopeFor()));
  const marker = `${BOARD_TASK_CLIPBOARD_MARKER_PREFIX}fresh-token-123`;
  const event = {
    clipboardData: {
      getData: (mime) => (mime === 'text/plain' ? marker : ''),
    },
  };

  assert.deepEqual(readBoardTaskFromPasteEvent(event, { storage, now: 11_999 }), copied);
});

test('rejects and removes expired old marker payloads', () => {
  const storage = makeStorage();
  const storageKey = `${BOARD_TASK_CLIPBOARD_STORAGE_PREFIX}stale-token-123`;
  storage.setItem(storageKey, JSON.stringify(envelopeFor()));
  const marker = `${BOARD_TASK_CLIPBOARD_MARKER_PREFIX}stale-token-123`;
  const event = {
    clipboardData: {
      getData: (mime) => (mime === 'text/plain' ? marker : ''),
    },
  };

  assert.equal(readBoardTaskFromPasteEvent(event, { storage, now: 12_000 }), null);
  assert.equal(storage.getItem(storageKey), null);
});

test('rejects expired, future, malformed and unsupported portable tasks', () => {
  for (const envelope of [
    { ...envelopeFor(), expiresAt: 11_000 },
    { ...envelopeFor(), createdAt: 11_001 },
    { ...envelopeFor(), createdAt: '10000' },
    { ...envelopeFor(), expiresAt: 10_000 + BOARD_TASK_CLIPBOARD_TTL_MS + 1 },
    { ...envelopeFor(), version: 999 },
    { ...envelopeFor(), payload: { ...envelopeFor().payload, kind: 'other-kind' } },
    { ...envelopeFor(), payload: { ...envelopeFor().payload, version: 999 } },
    { ...envelopeFor(), payload: null },
  ]) {
    assert.equal(readBoardTaskFromPasteEvent(textPasteEvent(packetFor(envelope)), { storage: null, now: 11_000 }), null);
  }
  assert.equal(readBoardTaskFromPasteEvent(textPasteEvent(`${BOARD_TASK_CLIPBOARD_PACKET_PREFIX}{bad json`)), null);
  assert.equal(readBoardTaskFromPasteEvent(textPasteEvent(`${BOARD_TASK_CLIPBOARD_PACKET_PREFIX}${' '.repeat(BOARD_TASK_CLIPBOARD_MAX_PACKET_LENGTH)}`)), null);
});

test('recognizes unreadable task data for a helpful board error without claiming ordinary images or text', () => {
  assert.equal(hasBoardTaskClipboardData(textPasteEvent(packetFor(envelopeFor()))), true);
  assert.equal(hasBoardTaskClipboardData(textPasteEvent(`${BOARD_TASK_CLIPBOARD_MARKER_PREFIX}missing-token-123`)), true);
  assert.equal(hasBoardTaskClipboardData(textPasteEvent('Обычный текст')), false);
  assert.equal(hasBoardTaskClipboardData({ clipboardData: { getData: () => '', items: [{ type: 'image/png' }] } }), false);
  assert.equal(hasBoardTaskClipboardData(null), false);
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
