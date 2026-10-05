import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

test('Python review persists incorrect first attempts, advances small-topic schedule and awards no repeat coins', { timeout: 30000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-python-review-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name + '.json'), JSON.stringify(value));
  const now = new Date(); const today = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  const old = new Date(now.getTime() - 31 * 86400000).toISOString();
  write('teachers', [{ id: 'teacher-review', name: 'Review fixture', code: 'fixture-teacher' }]);
  write('students', [{ id: 'student-review', name: 'Review fixture', teacherId: 'teacher-review', code: 'fixture-review', grade: '11', deletedAt: null }]);
  write('tests', { 103: { python: ['a','b','c'].map(id => ({ id, question: 'Print ok', tests: [{ input: '', output: 'ok' }] })) } });
  write('progress', { 'student-review': { progress: { 103: 100 }, solvedByTask: { 103: { python: { solved: ['a','b','c'] } } }, solvedEvents: [], coinsTotal: 55, xpTotal: 777, weeklyTaskPracticeMilestones: { 103: { tracked: true, established: true, initialQualifiedAt: old, qualifiedAt: old, intervalDays: 30, srsLevel: 0, nextDueDay: today - 1 } } } });
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); });
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' }, stdio: ['ignore','pipe','pipe'] });
  let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  t.after(async () => { if (child.exitCode === null) { const exit = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exit; } fs.rmSync(root, { recursive: true, force: true }); });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base + '/api/client-build-version')).ok) break; } catch {}
    if (child.exitCode !== null || attempt === 99) throw Error(logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ code: 'fixture-review' }) });
  assert.equal(login.status, 200); const auth = 'Bearer ' + (await login.json()).token;
  const solve = async (questionId, output) => {
    const res = await fetch(base + '/api/progress/solve', { method: 'POST', headers: { Authorization: auth, 'Content-Type':'application/json' }, body: JSON.stringify({ studentId: 'student-review', taskNumber: 103, levelId: 'python', questionId, code: "print('ok')", pythonResults: [{ input: '', output, error: '' }], totalQuestions: 3, levelMax: 100 }) });
    const value = await res.json(); return { status: res.status, value };
  };
  assert.equal((await solve('a', 'wrong')).status, 400);
  for (const id of ['a','b','c']) {
    const result = await solve(id, 'ok'); assert.equal(result.status, 200, JSON.stringify(result.value)); assert.equal(result.value.coinsGained, 0); assert.equal(result.value.taskProgress, 100);
  }
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json')))['student-review'];
  assert.equal(saved.weeklyTaskPracticeMilestones['103'].reviewCount, 1);
  assert.equal(saved.weeklyTaskPracticeMilestones['103'].lastReviewScore, 2);
  assert.equal(saved.weeklyTaskPracticeMilestones['103'].lastReviewRating, 'medium');
  assert.equal(saved.weeklyTaskPracticeMilestones['103'].nextDueDay, today + 30);
  assert.equal(saved.coinsTotal, 55); assert.equal(saved.solvedByTask['103'].python.solved.length, 3);
  assert.deepEqual(saved.solvedByTask['103'].python.answerHistory.a.map(entry => entry.correct), [false, true]);
  await solve('c', 'ok');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json')))['student-review'].weeklyTaskPracticeMilestones['103'].reviewCount, 1);
});
