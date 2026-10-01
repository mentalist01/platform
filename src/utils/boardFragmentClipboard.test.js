import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_FRAGMENT_MARKER, BOARD_FRAGMENT_STORAGE, BOARD_FRAGMENT_TTL, cloneBoardFragment, fragmentBounds, normalizeBoardFragment, readBoardFragment, saveBoardFragment } from './boardFragmentClipboard.js';

const text = { id: 'old-text', authorId: 'other-student', type: 'text', x: 10, y: 20, width: 100, height: 30, text: 'Задание 3', fontSize: 24, color: '#7c3aed' };
const stroke = { id: 'old-stroke', type: 'stroke', width: 5, color: '#000', points: [{ x: 20, y: 60, pressure: .3 }, { x: 60, y: 100, pressure: .8 }] };
const payload = { version: 1, items: [text, stroke] };
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; };

test('mixed fragment keeps editable geometry, relative layout and pen pressure with new identities', () => {
  let next = 0;
  const before = structuredClone(payload);
  const entries = cloneBoardFragment(payload, { x: 500, y: 400 }, 'teacher', () => `new-${++next}`);
  assert.deepEqual(fragmentBounds(entries), { x: 450, y: 360, width: 100, height: 80 });
  assert.deepEqual(entries.map(e => e.id), ['new-1', 'new-2']);
  assert.equal(entries[0].authorId, 'teacher');
  assert.equal(entries[0].text, text.text);
  assert.equal(entries[0].fontSize, 24);
  assert.equal(entries[1].points[1].pressure, .8);
  assert.equal(entries[1].points[0].x - entries[0].x, stroke.points[0].x - text.x);
  assert.deepEqual(payload, before);
});

test('line, arrow, shapes and image cropping survive transfer; locks and authors do not', () => {
  const assetUrl = `/uploads/board-asset-${'a'.repeat(64)}.webp`;
  const fragment = { version: 1, items: [
    { type: 'line', start: { x: -10, y: 0 }, end: { x: 5, y: 12 }, width: 4 },
    { type: 'arrow', start: { x: 5, y: 12 }, end: { x: 30, y: 30 }, width: 3 },
    { type: 'shape', shape: 'ellipse', x: 20, y: 20, width: 30, height: 40, strokeWidth: 2 },
    { type: 'image', x: 10, y: 20, width: 80, height: 60, assetUrl: `https://ivan100.ru${assetUrl}?_auth=secret`, assetId: 'source', flipX: true, crop: { x: .1, y: .2, width: .7, height: .6 }, locked: true, votes: 3 },
  ] };
  const entries = cloneBoardFragment(fragment, { x: 0, y: 0 }, 'teacher');
  assert.equal(entries[3].assetUrl, assetUrl);
  assert.equal(JSON.stringify(entries).includes('secret'), false);
  assert.deepEqual(entries[3].crop, fragment.items[3].crop);
  assert.equal(entries[3].flipX, true);
  assert.equal(entries[3].locked, false);
  assert.equal(entries[3].votes, 0);
  assert.equal(entries[2].shape, 'ellipse');
  assert.equal(entries[1].end.x - entries[1].start.x, 25);
});

test('a task becomes an independent attempt without another student answers, code or check result', () => {
  const task = { ...text, type: 'task', questionId: 'q1', questionText: 'Найдите число', answerCount: 2, answerLabels: ['A', 'B'], userAnswers: ['42', '1'], studentAnswers: ['secret'], studentCode: 'private code', sourceStudentId: 'other', checkState: 'correct', screenshots: [] };
  const copy = cloneBoardFragment({ version: 1, items: [task] }, { x: 0, y: 0 }, 'teacher')[0];
  assert.equal(copy.questionId, 'q1');
  assert.deepEqual(copy.answerLabels, ['A', 'B']);
  assert.deepEqual(copy.userAnswers, ['', '']);
  assert.deepEqual(copy.studentAnswers, []);
  assert.equal(copy.studentCode, '');
  assert.equal(copy.sourceStudentId, '');
  assert.equal(copy.checkState, 'idle');
});

test('unsupported or malformed content is rejected as a whole', () => {
  for (const item of [ { type: 'script' }, { ...text, x: Infinity }, { ...stroke, points: [{ x: NaN, y: 1 }] }, { ...text, type: 'task', screenshots: {} }, { ...text, type: 'image', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, { ...text, type: 'image', assetUrl: 'https://evil.example/image.png' } ]) {
    assert.equal(normalizeBoardFragment({ version: 1, items: [text, item] }), null);
  }
  assert.equal(normalizeBoardFragment({ version: 2, items: [text] }), null);
  assert.equal(normalizeBoardFragment({ version: 1, items: Array(2501).fill(text) }), null);
});

test('clipboard marker expires, is owned by the current account and never consumes ordinary pasted text', () => {
  const store = storage();
  const marker = saveBoardFragment(payload, 'teacher', { storage: store, now: 1000, token: 'one' });
  assert.equal(marker, BOARD_FRAGMENT_MARKER + 'one');
  assert.ok(readBoardFragment(marker, 'teacher', { storage: store, now: 1001 }));
  assert.equal(readBoardFragment(marker, 'student', { storage: store, now: 1001 }), null);
  assert.equal(readBoardFragment('hello', 'teacher', { storage: store, now: 1001 }), null);
  assert.equal(readBoardFragment('', 'teacher', { storage: store, now: 1001 }), null);
  assert.equal(readBoardFragment(marker, 'teacher', { storage: store, now: 1000 + BOARD_FRAGMENT_TTL }), null);
});

test('copying in another tab replaces the button buffer while native paste follows its marker', () => {
  const store = storage();
  const marker = saveBoardFragment(payload, 'teacher', { storage: store, now: 2000, token: 'old' });
  store.setItem(BOARD_FRAGMENT_STORAGE, JSON.stringify({ token: 'new', ownerId: 'teacher', expiresAt: 5000, payload: { version: 1, items: [text] } }));
  assert.equal(readBoardFragment(null, 'teacher', { storage: store, now: 2001 }).items.length, 1);
  assert.equal(readBoardFragment(BOARD_FRAGMENT_MARKER + 'new', 'teacher', { storage: store, now: 2001 }).items.length, 1);
  // Native paste follows its marker, independently of the button's latest buffer.
  assert.equal(readBoardFragment(marker, 'teacher', { storage: store, now: 2001 }).items.length, 2);
});

test('same-tab buffer remains usable when local storage is full', () => {
  const store = { setItem: () => { throw Error('quota'); }, getItem: () => null };
  const marker = saveBoardFragment(payload, 'teacher', { storage: store, now: 3000, token: 'fallback' });
  assert.ok(readBoardFragment(marker, 'teacher', { storage: store, now: 3001 }));
  assert.ok(readBoardFragment(null, 'teacher', { storage: store, now: 3001 }));
});
