import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});

const waitForServer = async (baseUrl, child, logs) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited.\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/client-build-version`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start.\n${logs()}`);
};

const login = async (baseUrl, code) => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return `Bearer ${(await response.json()).token}`;
};

test('teacher moves a student note to a Python topic and saves its LibreOffice result back to that student', {
  timeout: 35_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-teacher-notes-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  const now = new Date().toISOString();
  const sourceBytes = Buffer.from('source workbook');
  fs.writeFileSync(path.join(uploadsDir, 'source.ods'), sourceBytes);
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([
    { id: 'teacher-a', name: 'Иван', code: '112233', createdAt: now },
    { id: 'teacher-b', name: 'Другой', code: '445566', createdAt: now },
  ]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{
    id: 'student-a', name: 'Анна', teacherId: 'teacher-a', code: '654321', grade: '11', createdAt: now, deletedAt: null,
  }]));
  fs.writeFileSync(path.join(dataDir, 'files.json'), JSON.stringify([
    {
      id: 'source-a', studentId: 'student-a', taskNumber: 3, category: 'class', folderId: null,
      folderName: null, name: 'Таблица.ods', sizeBytes: sourceBytes.length, createdAt: now,
      url: '/uploads/source.ods', storageName: 'source.ods',
    },
    {
      id: 'group-note-a', studentId: 'learning-group-notes:group-a', teacherId: 'teacher-a',
      taskNumber: 101, category: 'class', folderId: null, folderName: null,
      name: 'Общий конспект.py', sizeBytes: 12, createdAt: now, groupId: 'group-a',
      participantIds: ['student-a'], sharedScope: 'learning-group-notes', isLearningGroupShared: true,
      url: '/uploads/group-note.py', storageName: 'group-note.py',
    },
    {
      id: 'teacher-shared-note-a', studentId: 'lesson-shared:teacher-a', teacherId: 'teacher-a',
      taskNumber: 1, category: 'class', folderId: 'lesson-shared:teacher-a:1',
      folderName: 'файлы к уроку', name: 'Общий материал.py', sizeBytes: 10, createdAt: now,
      sharedScope: 'lesson-files', isLessonShared: true, lessonShareMode: 'common',
      url: '/uploads/teacher-shared.py', storageName: 'teacher-shared.py',
    },
  ]));
  fs.writeFileSync(path.join(dataDir, 'folders.json'), '[]');

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: uploadsDir,
      PLATFORM_JSON_BACKUPS_DIR: path.join(tempRoot, 'backups'),
      COLLAB_PERSISTENCE: '0',
      DISABLE_STARTUP_XP_REBALANCE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  try {
    await waitForServer(baseUrl, child, () => logs);
    const teacherAuth = await login(baseUrl, '112233');
    const otherTeacherAuth = await login(baseUrl, '445566');

    const moveResponse = await fetch(`${baseUrl}/api/files/source-a`, {
      method: 'PATCH',
      headers: { Authorization: teacherAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskNumber: 105, category: 'class', folderId: null }),
    });
    assert.equal(moveResponse.status, 200, await moveResponse.clone().text());
    const moved = await moveResponse.json();
    assert.equal(moved.taskNumber, 105);
    assert.equal(moved.folderId, null);
    assert.equal(moved.memory.taskNumber, 105);

    const moveGroupResponse = await fetch(`${baseUrl}/api/files/group-note-a`, {
      method: 'PATCH',
      headers: { Authorization: teacherAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskNumber: 102, category: 'class', folderId: null }),
    });
    assert.equal(moveGroupResponse.status, 200, await moveGroupResponse.clone().text());
    const movedGroup = await moveGroupResponse.json();
    assert.equal(movedGroup.taskNumber, 102);
    assert.equal(movedGroup.groupId, 'group-a');
    assert.deepEqual(movedGroup.participantIds, ['student-a']);
    assert.equal(movedGroup.sharedScope, 'learning-group-notes');

    const moveSharedResponse = await fetch(`${baseUrl}/api/files/teacher-shared-note-a`, {
      method: 'PATCH',
      headers: { Authorization: teacherAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskNumber: 4, category: 'class', folderId: null }),
    });
    assert.equal(moveSharedResponse.status, 200, await moveSharedResponse.clone().text());
    const movedShared = await moveSharedResponse.json();
    assert.equal(movedShared.taskNumber, 4);
    assert.equal(movedShared.folderId, 'lesson-shared:teacher-a:4');
    assert.equal(movedShared.sharedScope, 'lesson-files');

    const forbiddenLaunch = await fetch(`${baseUrl}/api/workbook-helper/launch`, {
      method: 'POST',
      headers: { Authorization: otherTeacherAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: 'source-a', studentId: 'student-a' }),
    });
    assert.equal(forbiddenLaunch.status, 403);

    const launchResponse = await fetch(`${baseUrl}/api/workbook-helper/launch`, {
      method: 'POST',
      headers: { Authorization: teacherAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: 'source-a', studentId: 'student-a' }),
    });
    assert.equal(launchResponse.status, 201, await launchResponse.clone().text());
    const launch = await launchResponse.json();
    const exchangeResponse = await fetch(`${baseUrl}/workbook-helper/v1/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: launch.ticket }),
    });
    assert.equal(exchangeResponse.status, 200, await exchangeResponse.clone().text());
    const exchange = await exchangeResponse.json();

    const editedBytes = Buffer.from('edited by teacher in LibreOffice');
    const upload = new FormData();
    upload.append('file', new Blob([editedBytes], { type: 'application/vnd.oasis.opendocument.spreadsheet' }), 'Разбор Анны.ods');
    upload.append('revision', String(exchange.revision));
    upload.append('contentHash', sha256(editedBytes));
    upload.append('solutionName', 'Разбор Анны');
    const saveResponse = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      method: 'PUT',
      headers: { Authorization: `Workbook ${exchange.token}` },
      body: upload,
    });
    assert.equal(saveResponse.status, 200, await saveResponse.clone().text());
    const saved = (await saveResponse.json()).file;
    assert.equal(saved.studentId, 'student-a');
    assert.equal(saved.taskNumber, 105);
    assert.equal(saved.savedBy.role, 'teacher');
    assert.equal(saved.savedBy.id, 'teacher-a');
    assert.equal(saved.memory.savedBy.role, 'teacher');
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
