import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codeHash = (code) => {
  const salt = 'catalog-integration-fixture';
  return `scrypt$${salt}$${crypto.scryptSync(code, salt, 64).toString('base64')}`;
};
const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});
const stop = async (child) => {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
};

test('catalog changes preserve homework history and support assignment, solving, review and restart', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-catalog-test-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
  const now = new Date().toISOString();
  write('teachers.json', [{ id: 'teacher-catalog', name: 'Тестовый преподаватель', codeHash: codeHash('catalog-teacher-test'), createdAt: now }]);
  write('students.json', [{ id: 'student-catalog', name: 'Тестовый ученик', teacherId: 'teacher-catalog', code: 'catalog-student-test', grade: 11, createdAt: now }]);
  write('tests.json', {
    10: { basic: [{ id: 'word-1', question: 'Архивная задача', answer: '10' }], advanced: [], expert: [] },
    13: { basic: [{ id: 'graph-1', question: 'Перенесённая задача', answer: '13' }], advanced: [], expert: [] },
    23: { basic: [{ id: 'executor-1', question: 'Исполнитель', answer: '23' }], advanced: [], expert: [] },
  });
  write('mock-exams.json', [{
    id: 'source-format', title: 'Формат ответов', rewardsDisabled: true,
    access: { all: true, students: [], mode: 'classic' },
    tasks: {
      10: { sourceTaskNumber: 17, answers: ['a', 'b'] },
      6: { sourceTaskNumber: 25, answers: ['42', ...Array(19).fill('')] },
    },
  }]);
  const historicHomework = {
    id: 'old-homework', issuedAt: now, dueAt: new Date(Date.now() + 86400000).toISOString(),
    homeWork: 'Решить задания', goals: [
      { type: 'task', taskNumber: 10, levelId: 'basic', targetQuestions: [1], targetQuestionIds: ['word-1'] },
      { type: 'task', taskNumber: 13, levelId: 'basic', targetQuestions: [1], targetQuestionIds: ['graph-1'] },
    ],
  };
  write('progress.json', { 'student-catalog': {
    homeworks: [historicHomework], nextLesson: historicHomework,
    progress: { 23: 35 }, notesByTask: { 13: 'Сохранить заметку' },
    solvedByTask: { 23: { basic: { solved: ['executor-1'], solvedCode: { 'executor-1': '23' } } } },
    solvedEvents: [{ id: 'old-solve', taskNumber: 23, questionId: 'executor-1', levelId: 'basic', solvedAt: now, xpGained: 150 }],
    xpTotal: 150, coinsTotal: 0,
  } });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child;
  let logs = '';
  const start = async () => {
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: workspace,
      env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir,
        PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
        COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { logs += chunk; });
    child.stderr.on('data', (chunk) => { logs += chunk; });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      assert.equal(child.exitCode, null, logs);
      try { if ((await fetch(`${baseUrl}/api/client-build-version`)).ok) return; } catch { /* booting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(logs);
  };
  const request = async (route, auth, method = 'GET', body, expected = 200) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    assert.equal(response.status, expected, JSON.stringify(payload));
    return payload;
  };
  const login = async (code) => `Bearer ${(await request('/api/login', '', 'POST', { code })).token}`;
  try {
    await start();
    let teacher = await login('catalog-teacher-test');
    let student = await login('catalog-student-test');
    const catalog = await request('/api/task-catalog', teacher);
    const originalProgress = read('progress.json');
    const originalTests = read('tests.json');
    const changedTasks = catalog.tasks.filter((task) => task.number !== 10).map((task) => ({
      ...task, slotNumber: task.number === 13 ? 10 : task.number === 23 ? 13 : task.slotNumber,
    })).concat({ taskNumber: null, slotNumber: 23, title: 'Новое задание', xpReward: 200 });
    await request('/api/task-catalog', student, 'PUT', { revision: catalog.revision, tasks: changedTasks }, 403);
    const changed = await request('/api/task-catalog', teacher, 'PUT', { revision: catalog.revision, tasks: changedTasks });
    assert.equal(changed.tasks.find((task) => task.slotNumber === 10).number, 13);
    assert.equal(changed.tasks.find((task) => task.slotNumber === 13).number, 23);
    assert.equal(changed.tasks.find((task) => task.slotNumber === 23).number, 28);
    assert.equal(changed.archivedTasks[0].taskNumber, 10);
    assert.deepEqual(read('progress.json'), originalProgress, 'catalog operation must not rewrite any student data');
    assert.deepEqual(read('tests.json')['13'], originalTests['13']);
    assert.deepEqual(read('tests.json')['10'], originalTests['10']);
    await request('/api/task-catalog', teacher, 'PUT', { revision: catalog.revision, tasks: changedTasks }, 409);

    // Restart verifies the on-disk catalog is authoritative, not just an in-memory map.
    await stop(child);
    await start();
    teacher = await login('catalog-teacher-test');
    student = await login('catalog-student-test');
    const restarted = await request('/api/task-catalog', teacher);
    assert.deepEqual(
      {
        version: restarted.version,
        tasks: restarted.tasks,
        archivedTasks: restarted.archivedTasks,
        revision: restarted.revision,
      },
      { version: changed.version, tasks: changed.tasks, archivedTasks: changed.archivedTasks, revision: changed.revision },
    );
    assert.equal(restarted.scope, 'teacher');
    assert.equal(restarted.teacherId, 'teacher-catalog');

    const homework = await request('/api/student-next-lesson?studentId=student-catalog', teacher);
    const old = homework.homeworks.find((item) => item.id === 'old-homework');
    assert.deepEqual(old.goals.map((goal) => goal.taskNumber), [10, 13]);
    assert.deepEqual(old.goals.map((goal) => goal.targetQuestionIds), [['word-1'], ['graph-1']]);
    for (const [taskNumber, questionId] of [[10, 'word-1'], [13, 'graph-1']]) {
      const correct = await request('/api/questions/check', student, 'POST', { taskNumber, levelId: 'basic', questionId, answers: [String(taskNumber)] });
      assert.equal(correct.correct, true);
      await request('/api/progress/solve', student, 'POST', { taskNumber, levelId: 'basic', questionId, code: 'wrong' }, 400);
      const result = await request('/api/progress/solve', student, 'POST', { taskNumber, levelId: 'basic', questionId, code: String(taskNumber) });
      assert.ok(result.xpGained > 0);
      const solved = await request(`/api/progress/solved?studentId=student-catalog&taskNumber=${taskNumber}&levelId=basic&includeCode=1`, teacher);
      assert.ok(solved.ids.includes(questionId));
      assert.equal(solved.codeById[questionId], String(taskNumber));
      const history = await request(`/api/progress/answer-history?studentId=student-catalog&taskNumber=${taskNumber}&levelId=basic`, teacher);
      assert.ok(history[questionId].length >= 2, 'teacher sees both incorrect and correct attempts');
    }

    const bank = await request('/api/tests', teacher);
    bank['28'] = { basic: [{ id: 'new-23', question: 'Новая задача', answer: '42' }], advanced: [], expert: [] };
    await request('/api/tests', teacher, 'PUT', bank);
    // A stale tab that never saw bank 28 must not erase it on full-bank save.
    await request('/api/tests', teacher, 'PUT', originalTests);
    assert.equal(read('teacher-task-content.json').teachers['teacher-catalog'].tests['28'].basic[0].id, 'new-23');
    await request('/api/student-next-lesson', teacher, 'PATCH', {
      studentId: 'student-catalog', homeWork: '', daysToComplete: 7,
      goals: [{ type: 'task', taskNumber: 28, levelId: 'basic', targetQuestions: [1] }],
    });
    const newHomework = await request('/api/student-next-lesson?studentId=student-catalog', teacher);
    assert.equal(newHomework.latest.goals[0].taskNumber, 28);
    assert.deepEqual(newHomework.latest.goals[0].targetQuestionIds, ['new-23']);
    const newSolve = await request('/api/progress/solve', student, 'POST', { taskNumber: 28, levelId: 'basic', questionId: 'new-23', code: '42' });
    assert.equal(newSolve.xpGained, 200);
    const finalData = read('progress.json')['student-catalog'];
    assert.equal(finalData.notesByTask['13'], 'Сохранить заметку');
    assert.ok(finalData.solvedEvents.some((entry) => entry.id === 'old-solve' && entry.taskNumber === 23));
    assert.deepEqual(finalData.homeworks.find((entry) => entry.id === 'old-homework').goals.map((goal) => goal.taskNumber), [10, 13]);
    const mockResult = await request('/api/mock-exams/attempt', student, 'PUT', {
      studentId: 'student-catalog', examId: 'source-format', mode: 'classic',
      answers: { 10: ['a', 'b'], 6: ['42', ...Array(19).fill('')] },
    });
    assert.equal(mockResult.solved['10'], true, 'two-answer card retains both fields after moving');
    assert.equal(mockResult.solved['6'], true, 'partial-answer rule follows the source card');
    const newExam = await request('/api/mock-exams', teacher, 'POST', { title: 'Новый формат ЕГЭ' });
    assert.equal(newExam.taskTitleSnapshot['10'], 'Графы');
    assert.equal(newExam.taskTitleSnapshot['23'], 'Новое задание');
  } finally {
    if (child) await stop(child);
    if (process.env.KEEP_TASK_CATALOG_FIXTURE === '1') console.log(`Catalog UI fixture: ${root}`);
    else fs.rmSync(root, { recursive: true, force: true });
  }
});
