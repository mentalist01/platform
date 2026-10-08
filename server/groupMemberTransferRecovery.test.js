import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createLearningGroup, addLearningGroupMember, createLearningLessonSession,
  normalizeLearningLessonSession } from './learningGroups.js';
import { createAvailabilityStore } from './groupAvailability.js';
import { commitGroupTransferTransaction } from './groupTransferTransaction.js';
import { prepareLearningGroupMemberTransfer, registerLearningGroupMemberTransfer } from './groupMemberTransfer.js';
import { addCalendarDays, moscowDay } from '../src/utils/groupAvailability.js';

const student = { id: 'student', teacherId: 'teacher', name: 'Ученик' };
const peer = { id: 'peer', teacherId: 'teacher', name: 'Другой ученик' };
const config = () => ({ startDate: addCalendarDays(moscowDay(), 1), durationMinutes: 60,
  startMinute: 600, endMinute: 1380, days: [0, 1, 2, 3, 4, 5, 6], weeks: 8, timezone: 'Europe/Moscow' });
function seed() {
  const stamp = new Date(Date.now() - 86400000).toISOString();
  const create = id => createLearningGroup({ name: id }, { id, teacherId: 'teacher', now: stamp });
  const source = addLearningGroupMember(create('source'), student, { now: stamp });
  const target = addLearningGroupMember(create('target'), peer, { now: stamp });
  const poll = id => ({ id, config: config(), status: 'open', hoursVersion: 1,
    includeBusyTimes: true, answers: {}, proposal: null, plan: null });
  const polls = { source: poll('source-round'), target: poll('target-round') };
  polls.source.answers.student = { choices: { '0-720': 'yes', '3-810': 'maybe' }, version: 1 };
  return { groups: [source, target], polls };
}
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan100-transfer-recovery-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const state = seed();
  fs.writeFileSync(path.join(directory, 'learning-groups.json'), JSON.stringify(state.groups));
  fs.writeFileSync(path.join(directory, 'group-availability.json'), JSON.stringify(state.polls));
  const store = createAvailabilityStore(path.join(directory, 'group-availability.json'));
  let handler; let effects = 0;
  const deps = {
    handle: value => value,
    manageGroup: (_req, _res, id) => state.groups.find(group => group.id === id),
    findStudent: id => id === student.id ? student : peer,
    readGroups: () => state.groups,
    store,
    serializeGroup: group => group,
    commit: (groups, polls) => {
      commitGroupTransferTransaction(directory, groups, polls);
      state.groups = groups; store.acceptCommitted(polls);
    },
    afterTransfer: (...args) => { effects += 1; return options.afterTransfer?.(...args); },
    completeTransfer: ({ targetGroup, transferReceipt }, id) => {
      const poll = store.get(targetGroup.id); const receipt = poll.memberTransfers[id];
      assert.equal(receipt.targetJoinedAt, transferReceipt.targetJoinedAt);
      receipt.sideEffectsPending = false; store.put(targetGroup.id, poll);
    },
    retryDelayMs: options.retryDelayMs ?? 60000,
  };
  const controller = registerLearningGroupMemberTransfer({ post: (_route, route) => { handler = route; } }, deps);
  t.after(() => controller.dispose());
  const invoke = async () => {
    let body;
    await handler({ params: { groupId: 'source', studentId: 'student' }, auth: { id: 'teacher', role: 'teacher' },
      body: { targetGroupId: 'target' } }, { json: value => { body = value; } });
    return body;
  };
  return { directory, state, store, controller, invoke, effects: () => effects };
}

test('a postcommit failure reports the completed move and an idempotent retry finishes pending synchronization', async t => {
  let fail = true;
  const f = fixture(t, { afterTransfer: () => { if (fail) throw Error('simulated lesson store failure'); } });
  const first = await f.invoke();
  assert.equal(first.alreadyTransferred, false);
  assert.equal(first.synchronizationPending, true);
  assert.equal(f.state.groups.find(group => group.id === 'source').members[0].status, 'removed');
  assert.ok(f.state.groups.find(group => group.id === 'target').members.some(member => member.studentId === 'student'));
  assert.equal(f.store.get('source').answers.student, undefined);
  assert.deepEqual(f.store.get('target').answers.student.choices, { '0-720': 'yes', '3-810': 'maybe' });
  assert.equal(f.store.get('target').memberTransfers.student.sideEffectsPending, true);
  const roster = fs.readFileSync(path.join(f.directory, 'learning-groups.json'), 'utf8');
  fail = false;
  const retry = await f.invoke();
  assert.equal(retry.alreadyTransferred, true);
  assert.equal(retry.synchronizationPending, undefined);
  assert.equal(f.store.get('target').memberTransfers.student.sideEffectsPending, false);
  assert.equal(fs.readFileSync(path.join(f.directory, 'learning-groups.json'), 'utf8'), roster);
  await f.invoke();
  assert.equal(f.effects(), 2, 'A completed receipt must not replay side effects on every request');
});

test('one bounded background retry finishes synchronization without requiring another teacher action', async t => {
  let attempts = 0;
  const f = fixture(t, { retryDelayMs: 10, afterTransfer: () => { if (++attempts === 1) throw Error('temporary write failure'); } });
  assert.equal((await f.invoke()).synchronizationPending, true);
  for (let i = 0; f.store.get('target').memberTransfers.student.sideEffectsPending; i++) {
    if (i > 100) throw Error('Deferred synchronization did not finish');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(f.effects(), 2);
});

test('startup does not replay an obsolete pending receipt after a later manual membership change', async t => {
  const f = fixture(t);
  const prepared = prepareLearningGroupMemberTransfer({ groups: f.state.groups, polls: f.store.all(),
    sourceGroupId: 'source', targetGroupId: 'target', student, actorId: 'teacher' });
  commitGroupTransferTransaction(f.directory, prepared.groups, prepared.polls);
  f.state.groups = prepared.groups; f.store.acceptCommitted(prepared.polls);
  f.state.groups.find(group => group.id === 'target').members.find(member => member.studentId === 'student').status = 'removed';
  const before = JSON.stringify(f.store.all());
  assert.deepEqual(await f.controller.recoverPending(), { recovered: 0, pending: 0, skipped: 1 });
  assert.equal(f.effects(), 0);
  assert.equal(JSON.stringify(f.store.all()), before);
});

test('real server startup completes durable pending lesson rosters while preserving historical lessons and money', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan100-transfer-startup-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const put = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const get = name => JSON.parse(fs.readFileSync(path.join(data, `${name}.json`), 'utf8'));
  const original = seed();
  const before = new Date(Date.now() - 86400000).toISOString();
  put('teachers', [{ id: 'teacher', code: 'teacher', name: 'Учитель', createdAt: before }]);
  put('students', [student, peer].map(value => ({ ...value, code: value.id, grade: '11', createdAt: before })));
  put('progress', { student: { schedule: [], homeworks: [], mockAttempts: {} }, peer: { schedule: [], homeworks: [], mockAttempts: {} } });
  put('tests', {}); put('mock-exams', []);
  const finance = { teacher: { payments: {}, paymentAllocations: [], lessonLedger: {} } };
  put('teacher-finances', finance);
  const money = fs.readFileSync(path.join(data, 'teacher-finances.json'), 'utf8');
  const lesson = (group, id, startAt) => createLearningLessonSession(group, { startAt, durationMinutes: 60 }, { id, allowBeforeStart: true });
  const historical = normalizeLearningLessonSession({ ...lesson(original.groups[0], 'historical', before), status: 'completed', completedAt: before });
  put('learning-lesson-sessions', [historical,
    lesson(original.groups[0], 'source-future', new Date(Date.now() + 2 * 86400000).toISOString()),
    lesson(original.groups[1], 'target-future', new Date(Date.now() + 3 * 86400000).toISOString())]);
  const prepared = prepareLearningGroupMemberTransfer({ ...original,
    sourceGroupId: 'source', targetGroupId: 'target', student, actorId: 'teacher' });
  commitGroupTransferTransaction(data, prepared.groups, prepared.polls);
  assert.equal(get('group-availability').target.memberTransfers.student.sideEffectsPending, true);
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: data,
      PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
      COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1',
      LEARNING_GROUP_RTC_ENABLED: '0', PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow', BALANCE_MAINTENANCE: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended; }
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/client-build-version`)).ok) break; } catch {}
    if (i > 250 || child.exitCode !== null) throw Error(logs || 'Test server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(get('group-availability').target.memberTransfers.student.sideEffectsPending, false, logs);
  const sessions = get('learning-lesson-sessions');
  assert.deepEqual(sessions.find(value => value.id === 'historical'), historical);
  assert.ok(!sessions.find(value => value.id === 'source-future').participantIds.includes('student'));
  assert.ok(sessions.find(value => value.id === 'target-future').participantIds.includes('student'));
  assert.equal(fs.readFileSync(path.join(data, 'teacher-finances.json'), 'utf8'), money);
});
