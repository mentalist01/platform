import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { addCalendarDays, moscowDay, weekdayIndex } from '../src/utils/groupAvailability.js';

const hash = file => fs.existsSync(file)
  ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan100-group-transfer-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const seed = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const before = new Date(Date.now() - 30 * 86400000).toISOString();
  seed('teachers', ['teacher', 'other-teacher'].map(id => ({ id, code: id, name: id, createdAt: before })));
  const ids = Array.from({ length: 36 }, (_, i) => `student-${i}`);
  seed('students', ids.map(id => ({ id, teacherId: 'teacher', code: id, name: id, nickname: `Private ${id}`, createdAt: before, grade: '11' }))
    .concat([{ id: 'outsider', teacherId: 'other-teacher', code: 'outsider', name: 'Outsider', createdAt: before }]));
  seed('progress', Object.fromEntries(ids.map(id => [id, { schedule: [], homeworks: [], mockAttempts: {} }])));
  seed('tests', {}); seed('mock-exams', []);
  seed('teacher-finances', { teacher: { payments: {}, paymentAllocations: [], lessonLedger: {} } });
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
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${base}/api/client-build-version`)).ok) break; } catch {}
    if (i > 250 || child.exitCode !== null) throw Error(logs || 'Test server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const request = async (route, token, body, method = body ? 'POST' : 'GET', status = 200) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    assert.equal(response.status, status, `${route}: ${JSON.stringify(value)}\n${response.status >= 500 ? logs : ''}`);
    return value;
  };
  const tokens = {};
  for (const id of ['teacher', 'other-teacher', 'outsider', ...ids]) tokens[id] = (await request('/api/login', '', { code: id })).token;
  let next = 0;
  const createPair = async (name, { targetStarted = false } = {}) => {
    const [student, sourcePeer, targetPeer] = ids.slice(next, next += 3);
    const source = (await request('/api/learning-groups', tokens.teacher, { name: `${name} source`, studentIds: [student, sourcePeer] }, 'POST', 201)).group;
    const target = (await request('/api/learning-groups', tokens.teacher, { name: `${name} target`, studentIds: [targetPeer] }, 'POST', 201)).group;
    if (targetStarted) await request(`/api/learning-groups/${target.id}/start`, tokens.teacher, {});
    return { source, target, student, sourcePeer, targetPeer };
  };
  const config = { startDate: addCalendarDays(moscowDay(), 1), durationMinutes: 60, startMinute: 600, endMinute: 1380, days: [0, 1, 2, 3, 4, 5, 6] };
  const open = async (group, patch = {}) => (await request(`/api/learning-groups/${group.id}/availability/open`, tokens.teacher, { ...config, ...patch })).poll;
  const answer = async (group, student, poll, choices, version) => {
    // A normal member addition can now import version 1 from the pupil's
    // personal preferences. Submit against the actual current answer version.
    const currentVersion = version ?? (await request(`/api/learning-groups/${group.id}/availability`, tokens[student]))
      .poll.answers[student]?.version ?? 0;
    return request(`/api/learning-groups/${group.id}/availability/answer`, tokens[student],
      { roundId: poll.id, version: currentVersion, choices });
  };
  const transfer = (pair, body = {}, token = tokens.teacher, status = 200) => request(
    `/api/learning-groups/${pair.source.id}/members/${pair.student}/transfer`, token,
    { targetGroupId: pair.target.id, ...body }, 'POST', status);
  const poll = group => request(`/api/learning-groups/${group.id}/availability`, tokens.teacher);
  const persistedPolls = () => JSON.parse(fs.readFileSync(path.join(data, 'group-availability.json'), 'utf8'));
  const snapshot = () => Object.fromEntries(['learning-groups', 'group-availability', 'learning-lesson-sessions',
    'learning-attendance', 'teacher-finances', 'progress'].map(name => [name, hash(path.join(data, `${name}.json`))]));
  return { data, request, tokens, createPair, config, open, answer, transfer, poll, persistedPolls, snapshot };
}

test('group member transfer keeps availability with its student, preserves history, and rejects unsafe requests without writes', { timeout: 60000 }, async t => {
  const f = await fixture(t);

  await t.test('compatible open rounds move choices but never proposal votes; historical lessons and finances stay unchanged', async () => {
    const pair = await f.createPair('compatible', { targetStarted: true });
    await f.request(`/api/learning-groups/${pair.source.id}/start`, f.tokens.teacher, {});
    const historical = (await f.request(`/api/learning-groups/${pair.source.id}/lessons`, f.tokens.teacher,
      { startAt: new Date(Date.now() - 86400000).toISOString(), durationMinutes: 60, topic: 'Historical lesson' }, 'POST', 201)).lesson;
    await f.request(`/api/learning-groups/${pair.source.id}/lessons/${historical.id}`, f.tokens.teacher, { status: 'completed' }, 'PATCH');
    const current = (await f.request(`/api/learning-groups/${pair.source.id}/lessons`, f.tokens.teacher,
      { startAt: new Date(Date.now() - 5 * 60000).toISOString(), durationMinutes: 60, topic: 'Current lesson' }, 'POST', 201)).lesson;
    await f.request(`/api/learning-groups/${pair.source.id}/lessons/${current.id}`, f.tokens.teacher, { status: 'active' }, 'PATCH');
    const sourceFuture = (await f.request(`/api/learning-groups/${pair.source.id}/lessons`, f.tokens.teacher,
      { startAt: new Date(Date.now() + 2 * 86400000).toISOString(), durationMinutes: 60 }, 'POST', 201)).lesson;
    const targetFuture = (await f.request(`/api/learning-groups/${pair.target.id}/lessons`, f.tokens.teacher,
      { startAt: new Date(Date.now() + 3 * 86400000).toISOString(), durationMinutes: 60 }, 'POST', 201)).lesson;
    const sourcePoll = await f.open(pair.source); const targetPoll = await f.open(pair.target);
    const choices = { '0-720': 'yes', '3-810': 'maybe' };
    await f.answer(pair.source, pair.student, sourcePoll, choices);
    await f.answer(pair.source, pair.sourcePeer, sourcePoll, { '2-780': 'yes' });
    await f.answer(pair.target, pair.targetPeer, targetPoll, { '2-900': 'maybe' });
    const proposal = (await f.request(`/api/learning-groups/${pair.source.id}/availability/propose`, f.tokens.teacher,
      { roundId: sourcePoll.id, slots: ['0-720', '3-810'] })).poll.proposal;
    await f.request(`/api/learning-groups/${pair.source.id}/availability/vote`, f.tokens[pair.student],
      { roundId: sourcePoll.id, proposalId: proposal.id, choice: 'yes' });
    const before = f.persistedPolls(); const financeBefore = hash(path.join(f.data, 'teacher-finances.json'));
    const historicalBefore = JSON.parse(fs.readFileSync(path.join(f.data, 'learning-lesson-sessions.json'), 'utf8'))
      .find(lesson => lesson.id === historical.id);
    const currentBefore = JSON.parse(fs.readFileSync(path.join(f.data, 'learning-lesson-sessions.json'), 'utf8'))
      .find(lesson => lesson.id === current.id);
    const result = await f.transfer(pair, { lateAddReason: 'Перенос для удобного расписания' });
    assert.equal(result.sourceGroup.members.find(member => member.id === pair.student).status, 'removed');
    assert.equal(result.targetGroup.members.filter(member => member.id === pair.student && member.status === 'active').length, 1);
    assert.deepEqual(result.availabilityTransfer, { copiedCount: 2, skippedCount: 0, createdPoll: false });
    const after = f.persistedPolls();
    assert.equal(after[pair.source.id].answers[pair.student], undefined);
    assert.equal(after[pair.source.id].proposal.votes[pair.student], undefined);
    assert.deepEqual(after[pair.target.id].answers[pair.student].choices, choices);
    assert.equal(after[pair.target.id].proposal?.votes?.[pair.student], undefined);
    assert.deepEqual(after[pair.source.id].answers[pair.sourcePeer], before[pair.source.id].answers[pair.sourcePeer]);
    assert.deepEqual(after[pair.target.id].answers[pair.targetPeer], before[pair.target.id].answers[pair.targetPeer]);
    assert.equal(after[pair.target.id].plan, null, 'Moving preferences must not approve any schedule');
    const storedLessons = JSON.parse(fs.readFileSync(path.join(f.data, 'learning-lesson-sessions.json'), 'utf8'));
    assert.deepEqual(storedLessons.find(lesson => lesson.id === historical.id), historicalBefore, 'Past lesson participant snapshot remains intact');
    assert.deepEqual(storedLessons.find(lesson => lesson.id === current.id), currentBefore, 'An already active lesson keeps its participant snapshot');
    assert.ok(!storedLessons.find(lesson => lesson.id === sourceFuture.id).participantIds.includes(pair.student));
    assert.ok(storedLessons.find(lesson => lesson.id === targetFuture.id).participantIds.includes(pair.student));
    assert.equal(hash(path.join(f.data, 'teacher-finances.json')), financeBefore, 'No recalculation or financial transaction during transfer');
    const joinedAt = result.targetGroup.members.find(member => member.id === pair.student).joinedAt;
    const unchanged = f.snapshot(); const retry = await f.transfer(pair, { lateAddReason: 'Перенос для удобного расписания' });
    assert.equal(retry.alreadyTransferred, true);
    assert.equal(retry.targetGroup.members.find(member => member.id === pair.student).joinedAt, joinedAt);
    assert.deepEqual(f.snapshot(), unchanged, 'A retry must not duplicate membership or rewrite store files');
    await f.request(`/api/learning-groups/${pair.source.id}/availability`, f.tokens[pair.student], undefined, 'GET', 403);
    const studentPoll = await f.request(`/api/learning-groups/${pair.target.id}/availability`, f.tokens[pair.student]);
    assert.deepEqual(studentPoll.poll.answers[pair.student].choices, choices);
    assert.ok(!JSON.stringify(studentPoll).includes('Private '), 'Transferred poll respects student name privacy');
  });

  await t.test('missing target poll is opened with the source grid and all choices', async () => {
    const pair = await f.createPair('new-poll'); const source = await f.open(pair.source);
    await f.answer(pair.source, pair.student, source, { '1-780': 'yes', '4-870': 'maybe' });
    const result = await f.transfer(pair);
    assert.deepEqual(result.availabilityTransfer, { copiedCount: 2, skippedCount: 0, createdPoll: true });
    const target = (await f.poll(pair.target)).poll;
    assert.equal(target.status, 'open'); assert.deepEqual(target.config, source.config);
    assert.deepEqual(target.answers[pair.student].choices, { '1-780': 'yes', '4-870': 'maybe' });
    assert.equal(target.proposal, null); assert.equal(target.plan, null);
  });

  await t.test('restricted target weekdays copy only compatible times and report skipped choices', async () => {
    const pair = await f.createPair('restricted-grid'); const source = await f.open(pair.source);
    await f.open(pair.target, { days: [0, 3] });
    await f.answer(pair.source, pair.student, source, { '0-720': 'yes', '3-810': 'maybe', '6-900': 'yes' });
    const result = await f.transfer(pair);
    assert.deepEqual(result.availabilityTransfer, { copiedCount: 2, skippedCount: 1, createdPoll: false });
    assert.deepEqual((await f.poll(pair.target)).poll.answers[pair.student].choices, { '0-720': 'yes', '3-810': 'maybe' });
  });

  await t.test('longer lessons never reinterpret a short slot as consent to a longer lesson', async () => {
    const pair = await f.createPair('different-duration'); const source = await f.open(pair.source);
    await f.open(pair.target, { durationMinutes: 90 });
    await f.answer(pair.source, pair.student, source, { '0-720': 'yes', '3-810': 'maybe' });
    const result = await f.transfer(pair);
    assert.deepEqual(result.availabilityTransfer, { copiedCount: 0, skippedCount: 2, createdPoll: false });
    const choices = (await f.poll(pair.target)).poll.answers[pair.student]?.choices || {};
    assert.deepEqual(choices, {});
    assert.equal(f.persistedPolls()[pair.source.id].answers[pair.student], undefined);
  });

  await t.test('different saved target answer requires explicit replacement and keeps the old answer in transfer history', async () => {
    const pair = await f.createPair('conflicting-answer'); const source = await f.open(pair.source);
    const target = await f.open(pair.target);
    const sourceChoices = { '0-720': 'yes', '3-810': 'maybe' };
    await f.answer(pair.source, pair.student, source, sourceChoices);
    await f.request(`/api/learning-groups/${pair.source.id}/members/${pair.student}`, f.tokens.teacher, undefined, 'DELETE');
    await f.request(`/api/learning-groups/${pair.target.id}/members`, f.tokens.teacher, { studentId: pair.student });
    await f.answer(pair.target, pair.student, target, { '2-900': 'yes' });
    await f.request(`/api/learning-groups/${pair.target.id}/members/${pair.student}`, f.tokens.teacher, undefined, 'DELETE');
    await f.request(`/api/learning-groups/${pair.source.id}/members`, f.tokens.teacher, { studentId: pair.student });
    const previousTargetAnswer = f.persistedPolls()[pair.target.id].answers[pair.student];
    const before = f.snapshot(); const conflict = await f.transfer(pair, {}, f.tokens.teacher, 409);
    assert.equal(conflict.code, 'availability_answer_conflict');
    assert.deepEqual(f.snapshot(), before, 'Conflicting destination answer cannot be silently discarded');
    const result = await f.transfer(pair, { replaceTargetAnswer: true });
    assert.equal(result.availabilityTransfer.copiedCount, 2);
    const after = f.persistedPolls()[pair.target.id];
    assert.deepEqual(after.answers[pair.student].choices, sourceChoices);
    assert.deepEqual(after.memberTransfers[pair.student].previousTargetAnswer, previousTargetAnswer);
  });

  await t.test('busy times remain preferences; transfer cannot silently approve an occupied schedule', async () => {
    const pair = await f.createPair('busy-times', { targetStarted: true });
    const busyDay = weekdayIndex(f.config.startDate);
    const busySlot = `${busyDay}-720`; const otherSlot = `${(busyDay + 3) % 7}-810`;
    const busy = (await f.request(`/api/learning-groups/${pair.source.id}/start`, f.tokens.teacher, {})).group;
    await f.request(`/api/learning-groups/${busy.id}/lessons`, f.tokens.teacher,
      { startAt: `${f.config.startDate}T12:00:00+03:00`, durationMinutes: 60 }, 'POST', 201);
    const source = await f.open(pair.source); await f.open(pair.target);
    await f.answer(pair.source, pair.student, source, { [busySlot]: 'yes', [otherSlot]: 'maybe' });
    const result = await f.transfer(pair, { lateAddReason: 'Перенос в другую учебную группу' });
    assert.equal(result.availabilityTransfer.copiedCount, 2);
    const target = await f.poll(pair.target);
    assert.equal(target.poll.status, 'open'); assert.equal(target.poll.plan, null);
    assert.equal(target.poll.answers[pair.student].choices[busySlot], 'yes');
    assert.ok(target.blocked[busySlot], 'The source group lesson is still busy in the target calendar');
    const proposal = (await f.request(`/api/learning-groups/${pair.target.id}/availability/propose`, f.tokens.teacher,
      { roundId: target.poll.id, slots: [busySlot, otherSlot] })).poll.proposal;
    for (const id of [pair.student, pair.targetPeer]) await f.request(`/api/learning-groups/${pair.target.id}/availability/vote`,
      f.tokens[id], { roundId: target.poll.id, proposalId: proposal.id, choice: 'yes' });
    await f.request(`/api/learning-groups/${pair.target.id}/availability/approve`, f.tokens.teacher,
      { roundId: target.poll.id, proposalId: proposal.id }, 'POST', 409);
    assert.equal((await f.poll(pair.target)).poll.plan, null, 'Availability preferences never bypass occupied time validation');
  });

  await t.test('owner, member, target and active group validation all happen before writes', async () => {
    const pair = await f.createPair('invalid'); const source = await f.open(pair.source);
    await f.answer(pair.source, pair.student, source, { '0-720': 'yes' });
    const foreignGroup = (await f.request('/api/learning-groups', f.tokens['other-teacher'],
      { name: 'Foreign group', studentIds: ['outsider'] }, 'POST', 201)).group;
    const failWithoutWrite = async (action, code) => {
      const before = f.snapshot(); const response = await action();
      if (code) assert.equal(response.code, code);
      assert.deepEqual(f.snapshot(), before, 'Rejected transfer must not mutate groups, answers, lessons, progress or financial journals');
    };
    await failWithoutWrite(() => f.transfer(pair, {}, f.tokens[pair.student], 403));
    await failWithoutWrite(() => f.transfer(pair, {}, f.tokens['other-teacher'], 403));
    await failWithoutWrite(() => f.transfer(pair, { targetGroupId: pair.source.id }, f.tokens.teacher, 400));
    await failWithoutWrite(() => f.transfer(pair, { targetGroupId: 'missing-group' }, f.tokens.teacher, 404));
    await failWithoutWrite(() => f.transfer(pair, { targetGroupId: foreignGroup.id }, f.tokens.teacher, 403));
    await failWithoutWrite(() => f.request(`/api/learning-groups/${pair.source.id}/members/${pair.targetPeer}/transfer`,
      f.tokens.teacher, { targetGroupId: pair.target.id }, 'POST', 404));
    await f.request(`/api/learning-groups/${pair.target.id}/start`, f.tokens.teacher, {});
    await failWithoutWrite(() => f.transfer(pair, {}, f.tokens.teacher, 409), 'late_add_reason_required');
    await f.request(`/api/learning-groups/${pair.target.id}/complete`, f.tokens.teacher, {});
    await failWithoutWrite(() => f.transfer(pair, { lateAddReason: 'Ученику подходит группа' }, f.tokens.teacher, 409));
  });
});
