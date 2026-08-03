import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNamedWorkbookSolutionName,
  buildWorkbookSolutionKey,
  buildWorkbookSolutionName,
  createWorkbookHelperToken,
  createWorkbookSolutionBindingKey,
  hashWorkbookHelperToken,
  isWorkbookFileName,
  normalizeWorkbookContentHash,
  normalizeWorkbookHelperSessions,
  parseWorkbookHelperAuthorization,
  resolveWorkbookRevisionWrite,
  workbookHelperTokenMatchesHash,
} from './workbookHelper.js';

test('accepts Excel and LibreOffice workbook extensions only', () => {
  assert.equal(isWorkbookFileName('workbook.fods'), true);
  assert.equal(isWorkbookFileName('template.xlt'), false);
  assert.equal(isWorkbookFileName('template.xltx'), false);
  assert.equal(isWorkbookFileName('template.ots'), false);
  assert.equal(isWorkbookFileName('Задание.ods'), true);
  assert.equal(isWorkbookFileName('Задание.XLSX'), true);
  assert.equal(isWorkbookFileName('Задание.xlsm'), true);
  assert.equal(isWorkbookFileName('Задание.pdf'), false);
  assert.equal(isWorkbookFileName('../Задание.ods.exe'), false);
});

test('builds stable solution keys scoped to both student and source', () => {
  const key = buildWorkbookSolutionKey('student-a', 'file-a');
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(buildWorkbookSolutionKey('student-a', 'file-a'), key);
  assert.notEqual(buildWorkbookSolutionKey('student-b', 'file-a'), key);
  assert.notEqual(buildWorkbookSolutionKey('student-a', 'file-b'), key);
});

test('creates unique result bindings and validates user-facing solution names', () => {
  const firstKey = createWorkbookSolutionBindingKey();
  const secondKey = createWorkbookSolutionBindingKey();
  assert.match(firstKey, /^[0-9a-f]{64}$/);
  assert.match(secondKey, /^[0-9a-f]{64}$/);
  assert.notEqual(firstKey, secondKey);
  assert.equal(buildNamedWorkbookSolutionName('Вариант 1', 'Задание.ods'), 'Вариант 1.ods');
  assert.equal(buildNamedWorkbookSolutionName('Вариант 1.ods', 'Задание.ods'), 'Вариант 1.ods');
  assert.equal(buildNamedWorkbookSolutionName('../escape', 'Задание.ods'), '');
  assert.equal(buildNamedWorkbookSolutionName('CON', 'Задание.xlsx'), '');
  assert.equal(buildNamedWorkbookSolutionName('Вариант.xls', 'Задание.ods'), '');
  assert.equal(buildNamedWorkbookSolutionName('x'.repeat(101), 'Задание.ods'), '');
});

test('creates opaque tokens and stores only their hash', () => {
  const token = createWorkbookHelperToken();
  assert.match(token, /^[A-Za-z0-9_-]{32,160}$/);
  const tokenHash = hashWorkbookHelperToken(token);
  assert.match(tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(workbookHelperTokenMatchesHash(token, tokenHash), true);
  assert.equal(workbookHelperTokenMatchesHash(createWorkbookHelperToken(), tokenHash), false);
  assert.equal(hashWorkbookHelperToken('short'), '');
});

test('accepts helper credentials only from the dedicated authorization scheme', () => {
  const token = createWorkbookHelperToken();
  assert.equal(parseWorkbookHelperAuthorization(`Workbook ${token}`), token);
  assert.equal(parseWorkbookHelperAuthorization(`Bearer ${token}`), '');
  assert.equal(parseWorkbookHelperAuthorization(`Workbook short`), '');
});

test('normalizes sha256 workbook content hashes', () => {
  assert.equal(normalizeWorkbookContentHash('A'.repeat(64)), 'a'.repeat(64));
  assert.equal(normalizeWorkbookContentHash('abc'), '');
});

test('advances workbook revisions and makes identical retries idempotent', () => {
  const firstHash = 'a'.repeat(64);
  const secondHash = 'b'.repeat(64);
  assert.deepEqual(resolveWorkbookRevisionWrite({
    currentRevision: 2,
    currentContentHash: firstHash,
    expectedRevision: 2,
    incomingContentHash: secondHash,
  }), {
    action: 'write',
    revision: 3,
    contentHash: secondHash,
  });
  assert.deepEqual(resolveWorkbookRevisionWrite({
    currentRevision: 3,
    currentContentHash: secondHash,
    expectedRevision: 2,
    incomingContentHash: secondHash,
  }), {
    action: 'unchanged',
    revision: 3,
    contentHash: secondHash,
  });
  assert.equal(resolveWorkbookRevisionWrite({
    currentRevision: 3,
    currentContentHash: secondHash,
    expectedRevision: 2,
    incomingContentHash: 'c'.repeat(64),
  }).action, 'conflict');
});

test('keeps a solution suffix idempotent', () => {
  assert.equal(buildWorkbookSolutionName('Таблица.ods'), 'Таблица — решение.ods');
  assert.equal(buildWorkbookSolutionName('Таблица — решение.xlsx'), 'Таблица — решение.xlsx');
});

test('drops expired, revoked and duplicate helper sessions', () => {
  const nowMs = Date.parse('2026-08-03T12:00:00.000Z');
  const tokenHash = 'a'.repeat(64);
  const base = {
    id: 'session-a',
    tokenHash,
    studentId: 'student-a',
    sourceFileId: 'source-a',
    launchFileId: 'source-a',
    solutionKey: 'b'.repeat(64),
    solutionFileId: '',
    nameRequired: true,
    revision: 2,
    contentHash: 'e'.repeat(64),
    createdAtMs: nowMs - 1000,
    lastUsedAtMs: nowMs - 500,
    expiresAtMs: nowMs + 1000,
  };
  const normalized = normalizeWorkbookHelperSessions([
    base,
    { ...base, id: 'duplicate-token' },
    { ...base, id: 'expired', tokenHash: 'c'.repeat(64), expiresAtMs: nowMs - 1 },
    { ...base, id: 'revoked', tokenHash: 'd'.repeat(64), revokedAt: new Date(nowMs).toISOString() },
  ], { nowMs });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, 'session-a');
  assert.equal(normalized[0].revision, 2);
  assert.equal(normalized[0].contentHash, 'e'.repeat(64));
  assert.equal(normalized[0].nameRequired, true);

  const [legacy] = normalizeWorkbookHelperSessions([{
    ...base,
    id: 'legacy-session',
    tokenHash: 'f'.repeat(64),
    nameRequired: undefined,
  }], { nowMs });
  assert.equal(legacy.nameRequired, false);
});
