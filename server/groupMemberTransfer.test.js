import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningGroup, addLearningGroupMember } from './learningGroups.js';
import { prepareLearningGroupMemberTransfer, registerLearningGroupMemberTransfer } from './groupMemberTransfer.js';
import { registerGroupAvailability } from './groupAvailability.js';
import { withTeacherCalendarLock, calendarMutationLocks } from './calendarMutations.js';
import { addCalendarDays, moscowDay } from '../src/utils/groupAvailability.js';

const now = Date.parse('2026-10-08T12:00:00Z');
const student = { id: 'student', teacherId: 'transfer-teacher', name: 'Ученик' };
const choices = { '0-720': 'yes', '3-810': 'maybe' };
const answer = (value = choices, version = 1) => ({ choices: structuredClone(value), version, updatedAt: now - 1000 });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function seed() {
  const create = id => createLearningGroup({ name: id }, { id, teacherId: student.teacherId, now: new Date(now - 2000).toISOString() });
  const source = addLearningGroupMember(create('source'), student, { actorId: 'teacher', now: new Date(now - 1000).toISOString() });
  const target = create('target');
  const config = { startDate: addCalendarDays(moscowDay(), 1), durationMinutes: 60,
    startMinute: 600, endMinute: 1380, days: [0, 1, 2, 3, 4, 5, 6], weeks: 8, timezone: 'Europe/Moscow' };
  const poll = id => ({ id, config: structuredClone(config), status: 'open', hoursVersion: 1,
    includeBusyTimes: true, answers: {}, proposal: null, plan: null });
  return { groups: [source, target], polls: { source: poll('source-round'), target: poll('target-round') } };
}

const move = (state, options = {}) => prepareLearningGroupMemberTransfer({ ...state,
  sourceGroupId: 'source', targetGroupId: 'target', student, actorId: 'teacher', now, ...options });

test('a matching former target answer still requires fresh proposal consent in both groups', () => {
  const state = seed();
  state.polls.source.answers = { student: answer(), peer: answer({ '1-720': 'yes' }) };
  state.polls.target.answers = { student: answer({ '3-810': 'maybe', '0-720': 'yes' }, 7) };
  for (const id of ['source', 'target']) state.polls[id].proposal = {
    id: `${id}-proposal`, votes: { student: { choice: 'yes' }, peer: { choice: 'maybe' } },
  };
  state.polls.target.plan = { id: 'approved-historical-plan', slots: ['1-720', '4-720'] };
  const before = structuredClone(state);
  const result = move(state);
  assert.equal(result.polls.source.answers.student, undefined);
  assert.equal(result.polls.source.proposal.votes.student, undefined);
  assert.equal(result.polls.target.proposal.votes.student, undefined);
  assert.deepEqual(result.polls.source.proposal.votes.peer, before.polls.source.proposal.votes.peer);
  assert.deepEqual(result.polls.target.proposal.votes.peer, before.polls.target.proposal.votes.peer);
  assert.deepEqual(result.polls.target.answers.student, before.polls.target.answers.student, 'Matching preferences retain the answer version');
  assert.deepEqual(result.polls.target.plan, before.polls.target.plan, 'A transfer cannot alter an approved schedule');
  assert.deepEqual(result.polls.target.memberTransfers.student.previousTargetAnswer, before.polls.target.answers.student);
  assert.deepEqual(state, before, 'Preparing a transfer must never mutate its input stores');
});

test('without a source answer, old target preferences survive but old proposal consent is cleared', () => {
  const state = seed();
  state.polls.target.answers.student = answer({ '2-900': 'yes' }, 4);
  state.polls.target.proposal = { id: 'target-proposal', votes: { student: { choice: 'yes' } } };
  const before = structuredClone(state);
  const result = move(state);
  assert.deepEqual(result.polls.target.answers.student, before.polls.target.answers.student);
  assert.equal(result.polls.target.proposal.votes.student, undefined);
  assert.deepEqual(result.availabilityTransfer, { copiedCount: 0, skippedCount: 0, createdPoll: false });
  assert.deepEqual(state, before);
});

test('returning to a previous group keeps every transfer receipt and a retry leaves all stores unchanged', () => {
  const state = seed(); state.polls.source.answers.student = answer();
  const first = move(state, { now });
  const firstReceipt = structuredClone(first.polls.target.memberTransfers.student);
  const returned = move(first, { sourceGroupId: 'target', targetGroupId: 'source', now: now + 1000 });
  const third = move(returned, { now: now + 2000 });
  const currentReceipt = third.polls.target.memberTransfers.student;
  assert.equal(currentReceipt.history.length, 1);
  assert.deepEqual(currentReceipt.history[0], firstReceipt);
  assert.deepEqual(currentReceipt.sourceAnswer.choices, choices);
  assert.deepEqual(third.polls.source.memberTransfers.student.sourceAnswer.choices, choices);
  const beforeRetry = structuredClone({ groups: third.groups, polls: third.polls });
  const repeated = move(third, { now: now + 3000 });
  assert.equal(repeated.alreadyTransferred, true);
  assert.deepEqual({ groups: repeated.groups, polls: repeated.polls }, beforeRetry);
  assert.equal(repeated.polls.target.memberTransfers.student.history.length, 1);
});

function routesFixture() {
  const state = seed(); const handlers = new Map();
  const app = { get: (route, handler) => handlers.set(`GET ${route}`, handler), post: (route, handler) => handlers.set(`POST ${route}`, handler) };
  const getGroup = id => state.groups.find(group => group.id === id);
  const store = {
    get: id => state.polls[id] ? structuredClone(state.polls[id]) : null,
    all: () => structuredClone(state.polls),
    put: (id, value) => { state.polls[id] = structuredClone(value); },
  };
  state.commitCount = 0;
  state.calendar = async () => [];
  state.failCommit = false;
  registerGroupAvailability(app, { store, getGroup, canManage: auth => auth.role === 'teacher',
    getStudentName: id => id, getBusyEntries: (...args) => state.calendar(...args), materialize() {} });
  registerLearningGroupMemberTransfer(app, {
    handle: handler => async (req, res) => {
      try { await handler(req, res); }
      catch (error) { res.status(error.statusCode || 503).json({ error: error.message, code: error.code }); }
    },
    manageGroup: (req, res, id) => {
      const group = getGroup(id);
      if (req.auth.role !== 'teacher' || !group) { res.status(group ? 403 : 404).json({ error: 'No access' }); return null; }
      return group;
    },
    findStudent: id => id === student.id ? student : null,
    readGroups: () => structuredClone(state.groups), store,
    commit: (groups, polls) => {
      if (state.failCommit) throw Error('simulated durable commit failure');
      state.groups = groups; state.polls = polls; state.commitCount++;
    },
    serializeGroup: group => group,
  });
  async function call(route, auth, params, body) {
    let result; let status = 200;
    const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { result = { status, value }; return this; } };
    await handlers.get(`POST ${route}`)({ auth, params, body }, res);
    assert.ok(result, 'The route must respond');
    return result;
  }
  const transfer = () => call('/api/learning-groups/:groupId/members/:studentId/transfer',
    { id: 'teacher', role: 'teacher' }, { groupId: 'source', studentId: student.id }, { targetGroupId: 'target' });
  const save = value => call('/api/learning-groups/:groupId/availability/answer',
    { id: student.id, role: 'student' }, { groupId: 'source' }, { roundId: 'source-round', version: 0, choices: value });
  return { state, transfer, save };
}

test('an answer already being saved completes before transfer and its newest choices move', async () => {
  const f = routesFixture(); const entered = deferred(); const resume = deferred();
  f.state.polls.source.includeBusyTimes = false;
  f.state.calendar = async () => { entered.resolve(); await resume.promise; return []; };
  const answerPromise = f.save(choices); await entered.promise;
  const transferPromise = f.transfer();
  await Promise.resolve();
  assert.equal(f.state.commitCount, 0, 'Transfer must wait for the in-flight answer');
  resume.resolve();
  const [saved, transferred] = await Promise.all([answerPromise, transferPromise]);
  assert.equal(saved.status, 200); assert.equal(transferred.status, 200);
  assert.deepEqual(f.state.polls.target.answers.student.choices, choices);
  assert.equal(f.state.polls.source.answers.student, undefined);
  assert.equal(calendarMutationLocks.has(student.teacherId), false);
});

test('an old-group answer queued behind transfer is rejected rather than resurrected', async () => {
  const f = routesFixture(); const entered = deferred(); const resume = deferred();
  const blocker = withTeacherCalendarLock(student.teacherId, async () => { entered.resolve(); await resume.promise; });
  await entered.promise;
  const transferPromise = f.transfer(); const answerPromise = f.save(choices);
  resume.resolve(); await blocker;
  const [transferred, rejected] = await Promise.all([transferPromise, answerPromise]);
  assert.equal(transferred.status, 200); assert.equal(rejected.status, 403);
  assert.equal(f.state.polls.source.answers.student, undefined);
  assert.equal(f.state.polls.target.answers.student, undefined, 'An answer rejected after departure cannot be silently added to another group');
  assert.equal(f.state.commitCount, 1);
  assert.equal(calendarMutationLocks.has(student.teacherId), false);
});

test('a failed transfer releases the lock and queued source-group answers remain usable', async () => {
  const f = routesFixture(); const beforeGroups = structuredClone(f.state.groups);
  const entered = deferred(); const resume = deferred();
  f.state.failCommit = true;
  const blocker = withTeacherCalendarLock(student.teacherId, async () => { entered.resolve(); await resume.promise; });
  await entered.promise;
  const transferPromise = f.transfer(); const answerPromise = f.save(choices);
  resume.resolve(); await blocker;
  const [failed, saved] = await Promise.all([transferPromise, answerPromise]);
  assert.equal(failed.status, 503); assert.match(failed.value.error, /durable commit failure/);
  assert.equal(saved.status, 200);
  assert.deepEqual(f.state.groups, beforeGroups);
  assert.deepEqual(f.state.polls.source.answers.student.choices, choices);
  assert.equal(f.state.polls.target.answers.student, undefined);
  assert.equal(f.state.commitCount, 0);
  assert.equal(calendarMutationLocks.has(student.teacherId), false);
});
