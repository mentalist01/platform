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
  const salt = 'teacher-content-integration-fixture';
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

test('teacher task banks stay private and only the platform owner can apply a global change', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-teacher-content-test-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  const now = new Date().toISOString();
  write('teachers.json', [
    { id: 'teacher-owner', name: 'Владелец', codeHash: codeHash('owner-content-code'), createdAt: now },
    { id: 'teacher-other', name: 'Другой преподаватель', codeHash: codeHash('other-content-code'), createdAt: now },
  ]);
  write('students.json', [
    { id: 'student-owner', name: 'Ученик владельца', teacherId: 'teacher-owner', code: 'owner-student-code', grade: 11, createdAt: now },
    { id: 'student-other', name: 'Другой ученик', teacherId: 'teacher-other', code: 'other-student-code', grade: 11, createdAt: now },
  ]);
  write('tests.json', {
    1: { basic: [{ id: 'global-1', question: 'Общий вопрос', answer: '1' }], advanced: [], expert: [] },
  });
  write('progress.json', {});

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child;
  let logs = '';
  const request = async (route, auth, method = 'GET', body, expected = 200) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    assert.equal(response.status, expected, JSON.stringify(payload));
    return payload;
  };
  const login = async (code) => `Bearer ${(await request('/api/login', '', 'POST', { code })).token}`;

  try {
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: workspace,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        PLATFORM_DATA_DIR: dataDir,
        PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
        PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
        PLATFORM_OWNER_TEACHER_ID: 'teacher-owner',
        COLLAB_PERSISTENCE: '0',
        DISABLE_STARTUP_XP_REBALANCE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { logs += chunk; });
    child.stderr.on('data', (chunk) => { logs += chunk; });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      assert.equal(child.exitCode, null, logs);
      try {
        if ((await fetch(`${baseUrl}/api/client-build-version`)).ok) break;
      } catch { /* booting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempt === 199) throw new Error(logs);
    }

    const owner = await login('owner-content-code');
    const other = await login('other-content-code');
    const ownerStudent = await login('owner-student-code');
    const otherStudent = await login('other-student-code');

    const ownerCatalog = await request('/api/task-catalog', owner);
    const otherCatalog = await request('/api/task-catalog', other);
    assert.equal(ownerCatalog.canManageGlobal, true);
    assert.equal(otherCatalog.canManageGlobal, false);
    await request('/api/task-catalog?scope=global', other, 'GET', undefined, 403);

    const ownerPrivateCatalog = await request('/api/task-catalog', owner, 'PUT', {
      revision: ownerCatalog.revision,
      tasks: ownerCatalog.tasks.map((task) => (
        task.taskNumber === 1 ? { ...task, title: 'Личная тема владельца' } : task
      )),
    });
    assert.equal(ownerPrivateCatalog.tasks.find((task) => task.taskNumber === 1).title, 'Личная тема владельца');
    assert.notEqual(
      (await request('/api/task-catalog', other)).tasks.find((task) => task.taskNumber === 1).title,
      'Личная тема владельца',
    );
    await request('/api/task-catalog?scope=global', other, 'PUT', {
      revision: otherCatalog.revision,
      tasks: otherCatalog.tasks,
    }, 403);

    const globalCatalog = await request('/api/task-catalog?scope=global', owner);
    await request('/api/task-catalog?scope=global', owner, 'PUT', {
      revision: globalCatalog.revision,
      tasks: globalCatalog.tasks.map((task) => (
        task.taskNumber === 1 ? { ...task, title: 'Новая общая тема' } : task
      )),
    });
    assert.equal((await request('/api/task-catalog', owner)).tasks.find((task) => task.taskNumber === 1).title, 'Новая общая тема');
    assert.equal((await request('/api/task-catalog', other)).tasks.find((task) => task.taskNumber === 1).title, 'Новая общая тема');

    const ownerBank = await request('/api/tests', owner);
    ownerBank['1'].basic = [{ id: 'owner-1', question: 'Личный вопрос владельца', answer: '11' }];
    await request('/api/tests', owner, 'PUT', ownerBank);
    assert.equal((await request('/api/tests', owner))['1'].basic[0].id, 'owner-1');
    assert.equal((await request('/api/tests', other))['1'].basic[0].id, 'global-1');
    assert.equal((await request('/api/tests', ownerStudent))['1'].basic[0].id, 'owner-1');
    assert.equal((await request('/api/tests', otherStudent))['1'].basic[0].id, 'global-1');

    const otherBank = await request('/api/tests', other);
    otherBank['1'].basic = [{ id: 'other-1', question: 'Личный вопрос второго преподавателя', answer: '22' }];
    await request('/api/tests', other, 'PUT', otherBank);
    await request('/api/tests?scope=global', other, 'PUT', otherBank, 403);

    const globalBank = await request('/api/tests?scope=global', owner);
    globalBank['1'].basic = [{ id: 'global-2', question: 'Новый общий вопрос', answer: '33' }];
    await request('/api/tests?scope=global', owner, 'PUT', globalBank);
    assert.equal((await request('/api/tests', owner))['1'].basic[0].id, 'global-2');
    assert.equal((await request('/api/tests', other))['1'].basic[0].id, 'global-2');
    assert.equal((await request('/api/tests', ownerStudent))['1'].basic[0].id, 'global-2');
    assert.equal((await request('/api/tests', otherStudent))['1'].basic[0].id, 'global-2');

    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, 'teacher-task-content.json'), 'utf8'));
    assert.equal(Object.hasOwn(stored.teachers['teacher-owner'].tests, '1'), false);
    assert.equal(Object.hasOwn(stored.teachers['teacher-other'].tests, '1'), false);
  } finally {
    if (child) await stop(child);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
