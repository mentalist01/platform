import assert from 'node:assert/strict';
import test from 'node:test';
import { createStudentBalanceReadCoordinator } from './studentBalanceReadCoordinator.js';

function fixture(overrides = {}) {
  let clock = 0;
  const versions = new Map([['teacher', 'initial'], ['other', 'initial']]);
  const queues = new Map();
  const calls = [];
  let implementation = async (teacherId, studentId) => ({ teacherId, studentId });
  const dependencies = {
    now: () => clock,
    version: teacherId => versions.get(teacherId),
    enqueue(teacherId, action) {
      const pending = (queues.get(teacherId) || Promise.resolve()).catch(() => {}).then(action);
      queues.set(teacherId, pending);
      return pending;
    },
    async reconcile(teacherId, studentId) {
      calls.push([teacherId, studentId]);
      return implementation(teacherId, studentId);
    },
    ...overrides,
  };
  return {
    read: createStudentBalanceReadCoordinator(dependencies),
    calls, versions,
    advance: milliseconds => { clock += milliseconds; },
    setImplementation: next => { implementation = next; },
    queueWrite: (teacherId, action) => dependencies.enqueue(teacherId, action),
  };
}

test('one full teacher reconciliation covers subsequent reads by six students', async () => {
  const state = fixture();
  assert.deepEqual(await state.read('teacher'), { teacherId: 'teacher', studentId: '' });
  await Promise.all(Array.from({ length: 6 }, (_, index) => state.read('teacher', `student-${index}`)));
  await state.read('teacher');
  assert.deepEqual(state.calls, [['teacher', '']]);
});

test('concurrent full reads recheck coverage inside the existing teacher queue', async () => {
  const state = fixture();
  await Promise.all(Array.from({ length: 12 }, () => state.read('teacher')));
  assert.deepEqual(state.calls, [['teacher', '']]);
});

test('a student reconciliation covers only that student and teacher', async () => {
  const state = fixture();
  await state.read('teacher', 'a');
  await state.read('teacher', 'a');
  await state.read('teacher', 'b');
  await state.read('other', 'a');
  await state.read('teacher');
  await state.read('teacher', 'b');
  assert.deepEqual(state.calls, [['teacher', 'a'], ['teacher', 'b'], ['other', 'a'], ['teacher', '']]);
});

test('an external source change invalidates all previously covered student scopes', async () => {
  const state = fixture();
  await state.read('teacher', 'a');
  await state.read('teacher', 'b');
  state.versions.set('teacher', 'external-write');
  await state.read('teacher', 'a');
  await state.read('teacher', 'b');
  assert.deepEqual(state.calls, [['teacher', 'a'], ['teacher', 'b'], ['teacher', 'a'], ['teacher', 'b']]);
});

test('successful reconciliation captures the version after its own writes', async () => {
  const state = fixture();
  state.setImplementation(async teacherId => { state.versions.set(teacherId, 'reconciled'); });
  await state.read('teacher');
  await state.read('teacher', 'a');
  assert.deepEqual(state.calls, [['teacher', '']]);
});

test('a changed source during a student reconciliation clears other student coverage', async () => {
  const state = fixture();
  await state.read('teacher', 'a');
  state.setImplementation(async (teacherId, studentId) => {
    if (studentId === 'b') state.versions.set(teacherId, 'changed-by-b');
  });
  await state.read('teacher', 'b');
  await state.read('teacher', 'b');
  await state.read('teacher', 'a');
  assert.deepEqual(state.calls, [['teacher', 'a'], ['teacher', 'b'], ['teacher', 'a']]);
});

test('a queued read observes writes performed before it obtained the teacher lock', async () => {
  const state = fixture();
  await state.read('teacher', 'a');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const write = state.queueWrite('teacher', async () => {
    await gate;
    state.versions.set('teacher', 'queued-write');
  });
  // This new student is not covered before queueing; its queued callback must
  // see the write and avoid retaining the old student's coverage.
  const read = state.read('teacher', 'b');
  release();
  await Promise.all([write, read]);
  await state.read('teacher', 'a');
  assert.deepEqual(state.calls, [['teacher', 'a'], ['teacher', 'b'], ['teacher', 'a']]);
});

test('a cached read still waits for a financial write ahead of it in the queue', async () => {
  const state = fixture();
  await state.read('teacher');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let writeComplete = false;
  let readComplete = false;
  const write = state.queueWrite('teacher', async () => {
    await gate;
    state.versions.set('teacher', 'pending-financial-write');
    writeComplete = true;
  });
  const read = state.read('teacher', 'a').then(() => { readComplete = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(readComplete, false);
  release();
  await Promise.all([write, read]);
  assert.equal(writeComplete, true);
  assert.deepEqual(state.calls, [['teacher', ''], ['teacher', 'a']]);
});

test('coverage expires at the 15-second boundary despite an unchanged file version', async () => {
  const state = fixture();
  await state.read('teacher');
  state.advance(14_999);
  await state.read('teacher', 'a');
  assert.equal(state.calls.length, 1);
  state.advance(1);
  await state.read('teacher', 'a');
  await state.read('teacher');
  assert.deepEqual(state.calls, [['teacher', ''], ['teacher', 'a'], ['teacher', '']]);
});

test('student reads do not extend other student or full teacher TTLs', async () => {
  const state = fixture();
  await state.read('teacher', 'a');
  state.advance(10_000);
  await state.read('teacher', 'b');
  state.advance(5_000);
  await state.read('teacher', 'b');
  await state.read('teacher', 'a');
  assert.deepEqual(state.calls, [['teacher', 'a'], ['teacher', 'b'], ['teacher', 'a']]);
});

test('reconciliation failures evict coverage and do not poison the teacher queue', async () => {
  const state = fixture();
  await state.read('teacher', 'a');
  state.setImplementation(async () => { throw new Error('write failed'); });
  await assert.rejects(state.read('teacher', 'b'), /write failed/);
  state.setImplementation(async () => undefined);
  await state.read('teacher', 'a');
  await state.read('teacher', 'a');
  assert.deepEqual(state.calls, [['teacher', 'a'], ['teacher', 'b'], ['teacher', 'a']]);
});

test('a version read failure evicts prior successful coverage', async () => {
  let failed = false;
  const state = fixture({ version: () => {
    if (failed) throw new Error('stat failed');
    return 'unchanged';
  } });
  await state.read('teacher');
  failed = true;
  await assert.rejects(state.read('teacher'), /stat failed/);
  failed = false;
  await state.read('teacher');
  assert.deepEqual(state.calls, [['teacher', ''], ['teacher', '']]);
});

test('time moving backwards invalidates freshness', async () => {
  const state = fixture();
  state.advance(100);
  await state.read('teacher');
  state.advance(-1);
  await state.read('teacher');
  assert.deepEqual(state.calls, [['teacher', ''], ['teacher', '']]);
});

test('invalid dependencies, TTL, or blank teacher cannot create shared coverage', async () => {
  assert.throws(() => createStudentBalanceReadCoordinator({}), /function dependencies/);
  assert.throws(() => createStudentBalanceReadCoordinator({ now: Date.now, version() {}, enqueue() {}, reconcile() {}, ttlMs: 0 }), /TTL/);
  const state = fixture();
  await assert.rejects(state.read(''), /requires a teacher/);
  assert.equal(state.calls.length, 0);
});
