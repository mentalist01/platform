import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { participationDay } from '../src/utils/groupParticipation.js';

test('finance and student schedule browsing reuse supporting snapshots and preserve lesson prices', { timeout: 120000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-read-load-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const seed = (name, value) => fs.writeFileSync(path.join(data, name + '.json'), JSON.stringify(value));
  const createdAt = '2025-01-01T00:00:00Z';
  const students = Array.from({ length: 16 }, (_, n) => ({ id: 's' + n, name: 'Ученик ' + n, teacherId: 't', grade: '11', code: String(780100 + n), createdAt }));
  seed('teachers', [{ id: 't', name: 'Teacher', code: '780001', createdAt }]); seed('students', students); seed('progress', {});
  const group = { id: 'g', teacherId: 't', name: 'Группа 1', status: 'active', startedAt: createdAt, createdAt, pricePerLesson: 900,
    members: students.map(student => ({ studentId: student.id, status: 'active', joinedAt: createdAt })) };
  seed('learning-groups', [group]);
  const lessons = Array.from({ length: 160 }, (_, n) => ({ id: 'l' + n, teacherId: 't', groupId: 'g',
    startAt: new Date(Date.now() + (n - 80) * 3 * 86400000).toISOString(), durationMinutes: 60,
    status: n < 80 ? 'completed' : 'scheduled', participantIds: students.map(student => student.id), source: 'availability-plan', createdAt }));
  seed('learning-lesson-sessions', lessons);
  seed('learning-subscriptions', { version: 1, tariffs: {}, blocks: [{ id: 'block', teacherId: 't', studentId: 's15', groupId: 'g', startsAt: lessons[0].startAt,
    tariff: { kind: 'group', price: 3600, lessonCount: 4 }, createdAt, cancelledAt: '', lessonIds: [] }] });
  seed('teacher-finances', { t: { studentProfiles: Object.fromEntries(students.map(student => [student.id, { lessonPrice: 900, pricingMode: 'perLesson' }])) } });
  const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const preload = path.join(root, 'counters.mjs');
  fs.writeFileSync(preload, `import {LearningSubscriptionStore} from ${JSON.stringify(pathToFileURL(path.join(workspace, 'server/learningSubscriptions.js')).href)};
    const counts={reads:0,reconciles:0};for(const [method,key] of [['read','reads'],['reconcile','reconciles']]){const original=LearningSubscriptionStore.prototype[method];LearningSubscriptionStore.prototype[method]=function(...args){counts[key]++;return original.apply(this,args);};}
    process.on('message',value=>{if(value==='finance-counts')process.send({...counts});});`);
  const port = await new Promise(resolve => { const server = net.createServer().listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); });
  let logs = '';
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, process.env.FINANCE_READ_BASELINE_ENTRY || 'server/index.js'], { cwd: workspace,
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  t.after(async () => { if (child.exitCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done; } fs.rmSync(root, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + port;
  for (let n = 0; ; n++) { try { if ((await fetch(base + '/api/client-build-version')).ok) break; } catch { /* startup */ } if (n > 200 || child.exitCode !== null) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 100)); }
  const login = await (await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '780001' }) })).json();
  const counts = () => new Promise(resolve => { child.once('message', resolve); child.send('finance-counts'); });
  const before = await counts(), started = Date.now();
  const months = [...new Set([0, 2, 5].map(offset => { const date = new Date(); date.setUTCMonth(date.getUTCMonth() + offset, 15); return date.toISOString().slice(0, 7); }))];
  for (const month of months) {
    const response = await fetch(base + '/api/teacher-finance?month=' + month, { headers: { Authorization: 'Bearer ' + login.token } });
    assert.equal(response.status, 200, logs.slice(-1000)); const snapshot = await response.json();
    const expected = lessons.filter(lesson => participationDay(lesson.startAt).startsWith(month)).length * students.length;
    assert.equal(snapshot.calendarPlan.total.lessonCount, expected);
    assert.equal(snapshot.calendarPlan.total.revenue, expected * 900);
  }
  const calendar = await (await fetch(base + '/api/teacher-schedule', { headers: { Authorization: 'Bearer ' + login.token } })).json();
  assert.equal(calendar.length, lessons.length);
  assert.ok(calendar.every(entry => entry.memberPaymentStatuses.length === students.length));
  assert.ok(calendar.every(entry => entry.memberPaymentStatuses.every(member => member.lessonPrice === 900)));
  for (const studentId of ['s0', 's15']) {
    const response = await fetch(base + '/api/student-schedule?studentId=' + studentId, { headers: { Authorization: 'Bearer ' + login.token } });
    assert.equal(response.status, 200);
    const schedule = await response.json();
    assert.ok(schedule.some(entry => entry.groupId === 'g'));
    const states = schedule.flatMap(entry => Object.values(entry.payment?.statesByDate || {}));
    assert.ok(states.length > 40);
    assert.ok(states.every(state => state.amount === 900), 'student schedule retains the historical personal lesson price');
    const next = await fetch(base + '/api/student-next-lesson?studentId=' + studentId, { headers: { Authorization: 'Bearer ' + login.token } });
    assert.equal(next.status, 200);
  }
  const after = await counts(), reads = after.reads - before.reads, reconciles = after.reconciles - before.reconciles;
  t.diagnostic(JSON.stringify({ months: months.length, reads, reconciles, elapsedMs: Date.now() - started }));
  assert.ok(reads <= 30, `Finance reread subscriptions ${reads} times while browsing ${months.length} months`);
  assert.ok(reconciles <= 15, `Finance reconciled subscriptions ${reconciles} times`);
});
