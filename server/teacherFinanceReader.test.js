import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTeacherFinanceReader } from './teacherFinanceReader.js';
import { createBalanceAccount, normalizeStudentBalances } from './studentPaymentBalances.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-reader-'));
  assert.ok(dir.startsWith(path.resolve(os.tmpdir()) + path.sep));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'finance.json');
  let validations = 0;
  const reader = createTeacherFinanceReader(file, value => {
    validations++;
    return Object.fromEntries(Object.entries(value).map(([id, entry]) => [id,
      { ...entry, studentPaymentBalances: normalizeStudentBalances(entry.studentPaymentBalances) }]));
  }, () => Object.assign(new Error('corrupt'), { code: 'balance_corrupt', status: 503 }));
  const account = createBalanceAccount({ openingByMonth: { '2026-10': 900 }, now: '2026-10-18T16:00:00Z' });
  const value = { teacher: { studentPaymentBalances: { version: 1, accounts: { pupil: account } }, note: 'keep' } };
  const write = data => { fs.writeFileSync(file + '.next', JSON.stringify(data)); fs.renameSync(file + '.next', file); };
  write(value);
  return { reader, file, value, write, validations: () => validations };
}

test('unchanged reads validate once and return independent complete financial snapshots', t => {
  const f = fixture(t);
  const first = f.reader.read();
  first.teacher.studentPaymentBalances.accounts.pupil.entries[0].creditCents = 1;
  first.teacher.note = 'changed';
  assert.deepEqual(f.reader.read(), f.value);
  assert.equal(f.validations(), 1);
});

test('atomic same-sized replacement is observed and explicitly invalidating revalidates', t => {
  const f = fixture(t);
  f.reader.read();
  const next = structuredClone(f.value); next.teacher.note = 'next';
  f.write(next);
  assert.deepEqual(f.reader.read(), next);
  assert.equal(f.validations(), 2);
  f.reader.invalidate(); f.reader.read();
  assert.equal(f.validations(), 3);
});

test('invalid JSON and corrupt money never fall back to a previously valid cache', t => {
  const f = fixture(t);
  f.reader.read();
  for (const raw of ['{', '[]', 'null']) {
    fs.writeFileSync(f.file, raw);
    assert.throws(() => f.reader.read(), { code: 'balance_corrupt', status: 503 });
  }
  const corrupt = structuredClone(f.value);
  corrupt.teacher.studentPaymentBalances.accounts.pupil.allocations.bad = {
    markKey: 'bad', cents: 100000, dayKey: '2026-10-18', time: '19:00',
  };
  f.write(corrupt);
  assert.throws(() => f.reader.read(), { code: 'balance_corrupt' });
  f.write(f.value);
  assert.deepEqual(f.reader.read(), f.value);
});

test('missing journals return separate empty snapshots and a later file is validated', t => {
  const f = fixture(t); f.reader.read(); fs.unlinkSync(f.file);
  const missing = f.reader.read(); missing.teacher = 'must not persist';
  assert.deepEqual(f.reader.read(), {});
  f.write(f.value);
  assert.deepEqual(f.reader.read(), f.value);
});
