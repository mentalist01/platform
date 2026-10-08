import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commitGroupTransferTransaction, recoverGroupTransferTransaction } from './groupTransferTransaction.js';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-transfer-atomic-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const put = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value));
  const get = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  put('learning-groups.json', ['old-roster']);
  put('group-availability.json', { old: 'answers' });
  return { directory, put, get };
}

test('a group transfer commits both stores and keeps unrelated monetary files untouched', t => {
  const f = fixture(t);
  const money = '{ "payments": { "preserved": 3600 } }';
  fs.writeFileSync(path.join(f.directory, 'teacher-finances.json'), money);
  commitGroupTransferTransaction(f.directory, ['new-roster'], { new: 'answers' });
  assert.deepEqual(f.get('learning-groups.json'), ['new-roster']);
  assert.deepEqual(f.get('group-availability.json'), { new: 'answers' });
  assert.equal(fs.readFileSync(path.join(f.directory, 'teacher-finances.json'), 'utf8'), money);
  assert.equal(recoverGroupTransferTransaction(f.directory), false);
});

test('a failed second-store write rolls back both stores before returning the failure', t => {
  const f = fixture(t);
  assert.throws(() => commitGroupTransferTransaction(f.directory, ['new-roster'], { new: 'answers' }, {
    afterWrite: name => { if (name === 'learning-groups.json') throw new Error('simulated disk failure'); },
  }), /simulated disk failure/);
  assert.deepEqual(f.get('learning-groups.json'), ['old-roster']);
  assert.deepEqual(f.get('group-availability.json'), { old: 'answers' });
  assert.equal(recoverGroupTransferTransaction(f.directory), false);
});

for (const state of ['commit', 'rollback']) test(`startup recovers a crash halfway through ${state} without mixing membership and answers`, t => {
  const f = fixture(t);
  const before = { 'learning-groups.json': ['old-roster'], 'group-availability.json': { old: 'answers' } };
  const after = { 'learning-groups.json': ['new-roster'], 'group-availability.json': { new: 'answers' } };
  f.put('learning-groups.json', after['learning-groups.json']);
  f.put('group-member-transfer.transaction.json', { version: 1, state,
    entries: Object.keys(before).map(name => ({ name, before: JSON.stringify(before[name]), after: JSON.stringify(after[name]) })) });
  assert.equal(recoverGroupTransferTransaction(f.directory), true);
  for (const name of Object.keys(before)) assert.deepEqual(f.get(name), (state === 'commit' ? after : before)[name]);
  assert.equal(recoverGroupTransferTransaction(f.directory), false);
});

test('recovery rejects a journal that references an unrelated or outside file', t => {
  const f = fixture(t);
  f.put('group-member-transfer.transaction.json', { version: 1, state: 'commit', entries: [
    { name: 'learning-groups.json', before: '[]', after: '[]' },
    { name: '../teacher-finances.json', before: '{}', after: '{}' },
  ] });
  assert.throws(() => recoverGroupTransferTransaction(f.directory), /Invalid group transfer/);
  assert.deepEqual(f.get('learning-groups.json'), ['old-roster']);
});
