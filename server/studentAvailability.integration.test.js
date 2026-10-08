import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { addCalendarDays, moscowDay, weekdayIndex, AVAILABILITY_WEEKDAYS } from '../src/utils/groupAvailability.js';

const hash = file => fs.existsSync(file)
  ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan100-personal-availability-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const file = name => path.join(data, `${name}.json`);
  const seed = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value));
  const read = name => JSON.parse(fs.readFileSync(file(name), 'utf8'));
  const createdAt = new Date(Date.now() - 30 * 86400000).toISOString();
  const ids = Array.from({ length: 30 }, (_, i) => `student-${i}`);
  seed('teachers', ['teacher', 'other-teacher'].map(id => ({ id, code: id, name: id, createdAt })));
  seed('students', ids.map(id => ({ id, teacherId: 'teacher', code: id, name: id,
    nickname: `Private ${id}`, createdAt, grade: '11' })).concat([
    { id: 'outsider', teacherId: 'other-teacher', code: 'outsider', name: 'Outsider', createdAt },
  ]));
  const config = { startDate: addCalendarDays(moscowDay(), 1), durationMinutes: 60,
    startMinute: 600, endMinute: 1380, days: [0, 1, 2, 3, 4, 5, 6] };
  const busyDay = weekdayIndex(config.startDate);
  seed('progress', Object.fromEntries(ids.map(id => [id, { schedule: id === 'student-21'
    ? [{ id: 'individual-busy', weekdayKey: AVAILABILITY_WEEKDAYS[busyDay], time: '10:00',
      durationMinutes: 60, subject: 'Private lesson' }] : [], homeworks: [], mockAttempts: {} }])));
  seed('tests', {}); seed('mock-exams', []);
  seed('teacher-finances', { teacher: { payments: {}, paymentAllocations: [], lessonLedger: {} } });
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  let child; let logs = '';
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended;
  };
  t.after(async () => { await stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  const boot = async () => {
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: path.resolve(import.meta.dirname, '..'), windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: data,
        PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
        COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1',
        LEARNING_GROUP_RTC_ENABLED: '0', PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow', BALANCE_MAINTENANCE: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${base}/api/client-build-version`)).ok) return; } catch {}
      if (i > 250 || child.exitCode !== null) throw Error(logs || 'Test server startup timeout');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const request = async (route, token, body, method = body ? 'POST' : 'GET', status = 200) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    assert.equal(response.status, status, `${route}: ${JSON.stringify(value)}\n${response.status >= 500 ? logs : ''}`);
    return value;
  };
  await boot();
  const tokens = {};
  for (const id of ['teacher', 'other-teacher', 'outsider', ...ids]) tokens[id] = (await request('/api/login', '', { code: id })).token;
  let next = 0;
  const create = async (name, studentIds = []) => (await request('/api/learning-groups', tokens.teacher,
    { name, studentIds }, 'POST', 201)).group;
  const pair = async name => {
    const [student, sourcePeer, targetPeer] = ids.slice(next, next += 3);
    return { student, sourcePeer, targetPeer, source: await create(`${name} source`, [student, sourcePeer]),
      target: await create(`${name} target`, [targetPeer]) };
  };
  const poll = group => request(`/api/learning-groups/${group.id}/availability`, tokens.teacher);
  const open = async (group, patch = {}) => {
    const old = (await poll(group)).poll;
    return (await request(`/api/learning-groups/${group.id}/availability/open`, tokens.teacher,
      { ...config, ...(old ? { previousRoundId: old.id } : {}), ...patch })).poll;
  };
  const answer = (group, student, round, choices) => request(`/api/learning-groups/${group.id}/availability/answer`,
    tokens[student], { roundId: round.id, version: round.answers[student]?.version || 0, choices });
  const remove = (group, student) => request(`/api/learning-groups/${group.id}/members/${student}`, tokens.teacher, undefined, 'DELETE');
  const add = (group, student) => request(`/api/learning-groups/${group.id}/members`, tokens.teacher, { studentId: student });
  const choices = (round, student) => round.answers[student]?.choices;
  const snapshot = () => Object.fromEntries(['learning-groups', 'group-availability', 'student-availability',
    'learning-lesson-sessions', 'learning-attendance', 'teacher-finances', 'progress'].map(name => [name, hash(file(name))]));
  return { data, file, seed, read, boot, stop, request, tokens, config, busyDay, pair, create, poll, open,
    answer, remove, add, choices, snapshot };
}

test('personal time choices survive ordinary roster changes and new polls without changing lessons or finances', { timeout: 90000 }, async t => {
  const f = await fixture(t);

  await t.test('ordinary removal and addition followed by first open recover yes/maybe for the new group and survive restart', async () => {
    const p = await f.pair('ordinary move');
    await f.request(`/api/learning-groups/${p.source.id}/start`, f.tokens.teacher, {});
    const historical = (await f.request(`/api/learning-groups/${p.source.id}/lessons`, f.tokens.teacher,
      { startAt: new Date(Date.now() - 86400000).toISOString(), durationMinutes: 60, topic: 'Past lesson' }, 'POST', 201)).lesson;
    await f.request(`/api/learning-groups/${p.source.id}/lessons/${historical.id}`, f.tokens.teacher, { status: 'completed' }, 'PATCH');
    const oldLesson = f.read('learning-lesson-sessions').find(item => item.id === historical.id);
    const finance = hash(f.file('teacher-finances'));
    const source = await f.open(p.source);
    const expected = { '0-720': 'yes', '3-810': 'maybe' };
    await f.answer(p.source, p.student, source, expected);
    await f.remove(p.source, p.student); await f.add(p.target, p.student);
    assert.equal((await f.poll(p.target)).poll, null, 'Adding a member does not silently open a new poll');
    assert.equal((await f.poll(p.source)).poll.answers[p.student], undefined, 'Old roster no longer exposes a former participant');
    const opened = await f.open(p.target);
    assert.deepEqual(f.choices(opened, p.student), expected);
    assert.equal(opened.proposal, null); assert.equal(opened.plan, null, 'Personal choices never approve a schedule');
    assert.deepEqual(f.read('learning-lesson-sessions').find(item => item.id === historical.id), oldLesson);
    assert.equal(hash(f.file('teacher-finances')), finance, 'No balance or payment changes during preference recovery');
    await f.stop(); await f.boot();
    assert.deepEqual((await f.poll(p.target)).poll.answers[p.student], opened.answers[p.student]);
    const studentView = await f.request(`/api/learning-groups/${p.target.id}/availability`, f.tokens[p.student]);
    assert.deepEqual(f.choices(studentView.poll, p.student), expected);
    assert.ok(!JSON.stringify(studentView).includes('Private '));
    await f.request(`/api/learning-groups/${p.source.id}/availability`, f.tokens[p.student], undefined, 'GET', 403);
  });

  await t.test('adding to an already open poll imports personal choices immediately; first open of a newly created roster imports them too', async () => {
    const p = await f.pair('open destination'); const source = await f.open(p.source);
    const expected = { '1-750': 'maybe', '5-900': 'yes' };
    await f.answer(p.source, p.student, source, expected); await f.open(p.target);
    await f.remove(p.source, p.student); await f.add(p.target, p.student);
    assert.deepEqual(f.choices((await f.poll(p.target)).poll, p.student), expected);
    await f.remove(p.target, p.student);
    const third = await f.create('New roster first poll', [p.student]);
    assert.deepEqual(f.choices(await f.open(third), p.student), expected);
  });

  await t.test('new rounds preserve answers but an actual deletion is not resurrected, including an explicit empty answer', async () => {
    const p = await f.pair('new rounds'); let round = await f.open(p.source);
    await f.answer(p.source, p.student, round, { '0-720': 'yes', '3-810': 'maybe' });
    round = await f.open(p.source);
    assert.deepEqual(f.choices(round, p.student), { '0-720': 'yes', '3-810': 'maybe' });
    await f.answer(p.source, p.student, round, { '3-810': 'maybe' });
    round = await f.open(p.source);
    assert.deepEqual(f.choices(round, p.student), { '3-810': 'maybe' });
    await f.answer(p.source, p.student, round, {});
    round = await f.open(p.source);
    assert.ok(round.answers[p.student], 'Known explicit empty availability remains a saved answer');
    assert.deepEqual(f.choices(round, p.student), {});
    await f.remove(p.source, p.student); await f.add(p.target, p.student);
    assert.deepEqual(f.choices(await f.open(p.target), p.student), {}, 'Old source yes choices cannot return after a deliberate uncheck');
  });

  await t.test('temporarily narrower weekdays and hours do not erase choices outside the displayed grid', async () => {
    const p = await f.pair('narrow grid'); let round = await f.open(p.source);
    await f.answer(p.source, p.student, round, { '0-720': 'yes', '3-810': 'maybe', '6-1200': 'yes' });
    round = await f.open(p.source, { days: [0, 1], endMinute: 900 });
    assert.deepEqual(f.choices(round, p.student), { '0-720': 'yes' });
    await f.answer(p.source, p.student, round, { '0-780': 'yes' });
    round = await f.open(p.source);
    assert.deepEqual(f.choices(round, p.student), { '0-780': 'yes', '3-810': 'maybe', '6-1200': 'yes' },
      'Only visible unblocked omitted slots become no; out-of-grid preferences remain stored');
  });

  await t.test('a different lesson duration requires fresh consent rather than copying shorter-lesson choices', async () => {
    const p = await f.pair('duration consent'); const source = await f.open(p.source);
    await f.answer(p.source, p.student, source, { '0-720': 'yes', '3-810': 'maybe' });
    await f.open(p.target, { durationMinutes: 90 });
    await f.remove(p.source, p.student); await f.add(p.target, p.student);
    const target = (await f.poll(p.target)).poll;
    assert.equal(target.answers[p.student], undefined);
    assert.equal(target.plan, null);
  });

  await t.test('ordinary addition never replaces an existing destination answer, even a deliberately empty one', async () => {
    const p = await f.pair('destination answer'); let source = await f.open(p.source);
    await f.answer(p.source, p.student, source, { '0-720': 'yes' });
    await f.open(p.target); await f.remove(p.source, p.student); await f.add(p.target, p.student);
    let target = (await f.poll(p.target)).poll;
    await f.answer(p.target, p.student, target, {});
    target = (await f.poll(p.target)).poll;
    const emptyAnswer = structuredClone(target.answers[p.student]);
    await f.remove(p.target, p.student); await f.add(p.source, p.student);
    source = (await f.poll(p.source)).poll;
    await f.answer(p.source, p.student, source, { '2-900': 'maybe' });
    await f.remove(p.source, p.student); await f.add(p.target, p.student);
    assert.deepEqual((await f.poll(p.target)).poll.answers[p.student], emptyAnswer,
      'The destination round owns its existing answer; personal import only fills an absent answer');
  });

  await t.test('foreign teachers and removed students cannot trigger preference writes or read another group', async () => {
    const p = await f.pair('access control'); const round = await f.open(p.source);
    await f.answer(p.source, p.student, round, { '0-720': 'yes' });
    const before = f.snapshot();
    await f.request(`/api/learning-groups/${p.source.id}/availability/open`, f.tokens['other-teacher'],
      { ...f.config, previousRoundId: round.id }, 'POST', 403);
    await f.request(`/api/learning-groups/${p.source.id}/members/${p.student}`, f.tokens['other-teacher'], undefined, 'DELETE', 403);
    await f.request(`/api/learning-groups/${p.target.id}/members`, f.tokens['other-teacher'], { studentId: p.student }, 'POST', 403);
    assert.deepEqual(f.snapshot(), before, 'Authorization rejection happens before any preference or roster writes');
    await f.remove(p.source, p.student);
    const removedSnapshot = f.snapshot();
    await f.request(`/api/learning-groups/${p.source.id}/availability/answer`, f.tokens[p.student],
      { roundId: round.id, version: 1, choices: {} }, 'POST', 403);
    assert.deepEqual(f.snapshot(), removedSnapshot);
  });

  await t.test('free-hours mode does not reinterpret a temporarily blocked omitted slot as personal no', async () => {
    const p = await f.pair('calendar visibility');
    assert.equal(p.student, 'student-21', 'Fixture assigns the preseeded private busy lesson to this member');
    const busySlot = `${f.busyDay}-600`; const freeSlot = `${(f.busyDay + 2) % 7}-900`;
    let source = await f.open(p.source);
    await f.answer(p.source, p.student, source, { [busySlot]: 'yes', [freeSlot]: 'maybe' });
    await f.request(`/api/learning-groups/${p.source.id}/availability/settings`, f.tokens.teacher,
      { roundId: source.id, previousIncludeBusyTimes: true, includeBusyTimes: false });
    const view = await f.request(`/api/learning-groups/${p.source.id}/availability`, f.tokens[p.student]);
    assert.ok(view.blocked[busySlot]);
    await f.answer(p.source, p.student, view.poll, { [freeSlot]: 'yes' });
    await f.remove(p.source, p.student); await f.add(p.target, p.student);
    source = await f.open(p.target, { includeBusyTimes: true });
    assert.deepEqual(f.choices(source, p.student), { [busySlot]: 'yes', [freeSlot]: 'yes' });
  });

  await t.test('startup migration recovers a prior removed member answer and remains idempotent across restarts', async () => {
    const p = await f.pair('legacy recovery'); const source = await f.open(p.source);
    const expected = { '0-750': 'yes', '4-870': 'maybe' };
    await f.answer(p.source, p.student, source, expected);
    await f.remove(p.source, p.student); await f.add(p.target, p.student);
    await f.stop();
    // Simulate a pre-personal-preferences installation: only the removed
    // member's legacy poll answer exists, and the new group has no poll yet.
    fs.rmSync(f.file('student-availability'), { force: true });
    const originalPolls = f.read('group-availability');
    assert.deepEqual(originalPolls[p.source.id].answers[p.student].choices, expected);
    const groupsBefore = hash(f.file('learning-groups')); const financesBefore = hash(f.file('teacher-finances'));
    const lessonsBefore = hash(f.file('learning-lesson-sessions'));
    await f.boot();
    assert.equal(hash(f.file('group-availability')), hashFromValue(originalPolls), 'Migration only reads historical polls');
    assert.equal(hash(f.file('learning-groups')), groupsBefore); assert.equal(hash(f.file('teacher-finances')), financesBefore);
    assert.equal(hash(f.file('learning-lesson-sessions')), lessonsBefore);
    const recovered = await f.open(p.target);
    assert.deepEqual(f.choices(recovered, p.student), expected);
    const personalBefore = hash(f.file('student-availability'));
    await f.stop(); await f.boot();
    assert.deepEqual((await f.poll(p.target)).poll.answers[p.student], recovered.answers[p.student]);
    assert.equal(hash(f.file('student-availability')), personalBefore, 'Completed migration does not rewrite preferences on each boot');
  });

  await t.test('transfer receipts keep the original grid and round so later source rounds cannot destroy recovery evidence', async () => {
    const p = await f.pair('receipt recovery');
    const source = await f.open(p.source, { days: [0, 1], endMinute: 900 });
    const expected = { '0-720': 'yes', '1-780': 'maybe' };
    await f.answer(p.source, p.student, source, expected);
    const financesBefore = hash(f.file('teacher-finances'));
    const result = await f.request(`/api/learning-groups/${p.source.id}/members/${p.student}/transfer`, f.tokens.teacher,
      { targetGroupId: p.target.id });
    assert.equal(result.availabilityTransfer.copiedCount, 2);
    const receipt = f.read('group-availability')[p.target.id].memberTransfers[p.student];
    assert.deepEqual(receipt.sourceConfig, source.config);
    assert.equal(receipt.sourceRoundId, source.id);
    assert.deepEqual(receipt.sourceAnswer.choices, expected);
    await f.open(p.source, { durationMinutes: 90, days: [5, 6], startMinute: 900 });
    const target = await f.open(p.target);
    assert.deepEqual(f.choices(target, p.student), expected);
    assert.deepEqual(f.read('group-availability')[p.target.id].memberTransfers[p.student], receipt,
      'New destination rounds preserve transfer provenance and original answer');
    await f.stop();
    fs.rmSync(f.file('student-availability'), { force: true });
    const legacy = f.read('group-availability');
    delete legacy[p.target.id].answers[p.student];
    f.seed('group-availability', legacy);
    await f.boot();
    assert.deepEqual(f.choices(await f.open(p.target), p.student), expected,
      'Migration reads the receipt original config instead of the incompatible newer source poll');
    assert.equal(hash(f.file('teacher-finances')), financesBefore);
  });
});

function hashFromValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
