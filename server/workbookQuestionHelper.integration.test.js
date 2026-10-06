import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '..');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    probe.close((error) => (error ? reject(error) : resolve(port)));
  });
});

const waitForServer = async (baseUrl, child, getLogs) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before startup.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/client-build-version`);
      if (response.ok) return;
    } catch {
      // The socket is expected to refuse connections while the server boots.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start in time.\n${getLogs()}`);
};

const stopServer = async (child) => {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const assertStatus = async (response, expectedStatus) => {
  if (response.status === expectedStatus) return;
  const body = await response.text();
  assert.equal(response.status, expectedStatus, body);
};

const exchangeLaunch = async (baseUrl, launch) => {
  const response = await fetch(`${baseUrl}/workbook-helper/v1/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket: launch.ticket }),
  });
  await assertStatus(response, 200);
  const exchange = await response.json();
  return {
    exchange,
    authorization: `Workbook ${exchange.token}`,
  };
};

const putWorkbook = async ({ baseUrl, authorization, bytes, revision, fileName }) => {
  const body = new FormData();
  body.append('file', new Blob([bytes], {
    type: 'application/vnd.oasis.opendocument.spreadsheet',
  }), fileName);
  body.append('revision', String(revision));
  body.append('contentHash', sha256(bytes));
  return fetch(`${baseUrl}/workbook-helper/v1/content`, {
    method: 'PUT',
    headers: { Authorization: authorization },
    body,
  });
};

test('teacher question solutions are immediately readable and isolated from student solutions', { timeout: 60_000 }, async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-teacher-question-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  const now = new Date().toISOString();
  write('teachers', ['a', 'b'].map((id, i) => ({ id: `teacher-${id}`, name: `Teacher ${id}`, code: `11223${i}`, createdAt: now })));
  write('students', ['a', 'b', 'c'].map((id, i) => ({ id: `student-${id}`, name: `Student ${id}`, teacherId: i === 1 ? 'teacher-b' : 'teacher-a', code: `65432${i}`, createdAt: now, deletedAt: null })));
  write('files', []); write('folders', []);
  write('progress', { 'student-a': { solvedByTask: { 9: { basic: ['q-a'] } }, nextLesson: { homeWork: 'Fixture homework' }, questionAnswers: { 'q-a': '17' }, coinsTotal: 42 } });
  const original = Buffer.from('original question workbook');
  fs.writeFileSync(path.join(uploadsDir, 'question.ods'), original);
  fs.writeFileSync(path.join(uploadsDir, 'task26.txt'), '1;2;3\n');
  write('tests', {
    9: { basic: ['a', 'b'].map((id) => ({ id: `q-${id}`, question: 'Fixture', files: [{ id: 'attachment', name: 'source.ods', storageName: 'question.ods' }] })) },
    26: { basic: [{ id: 'text-q', question: 'Fixture', files: [{ id: 'text-file', name: 'source.txt', storageName: 'task26.txt' }] }] },
  });
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], { cwd: workspaceDir, env: {
    ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir,
    PLATFORM_UPLOADS_DIR: uploadsDir, PLATFORM_JSON_BACKUPS_DIR: path.join(tempRoot, 'backups'),
    COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  try {
    await waitForServer(baseUrl, child, () => logs);
    const login = async (code) => {
      const res = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      await assertStatus(res, 200); return `Bearer ${(await res.json()).token}`;
    };
    const teacher = await login('112230'), otherTeacher = await login('112231'), student = await login('654320');
    const context = { studentId: 'student-a', taskNumber: 9, levelId: 'basic', questionId: 'q-a', attachmentId: 'attachment' };
    const request = (authorization, route, method = 'GET', body) => fetch(baseUrl + route, {
      method, headers: { Authorization: authorization, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const launch = async (authorization, extra = {}, status = 201) => {
      const res = await request(authorization, '/api/workbook-helper/question-launch', 'POST', { ...context, ...extra });
      await assertStatus(res, status); return res.json();
    };
    const list = async (authorization = student, extra = {}) => {
      const params = new URLSearchParams({ ...context, ...extra });
      const res = await request(authorization, `/api/workbook-helper/question-solutions?${params}`);
      await assertStatus(res, 200); return res.json();
    };
    let teacherSession, studentSaved, teacherLaunch;
    await t.test('ownership and exact attachment checks', async () => {
      await launch(otherTeacher, {}, 403);
      await launch(teacher, { studentId: 'student-b' }, 403);
      await launch(teacher, { studentId: '' }, 400);
      await launch(teacher, { attachmentId: 'unrelated' }, 404);
    });
    await t.test('teacher and student receive distinct bindings for the same task', async () => {
      const studentLaunch = await launch(student);
      teacherLaunch = await launch(teacher);
      assert.notEqual(teacherLaunch.sourceFileId, studentLaunch.sourceFileId);
      assert.notEqual(teacherLaunch.workbookKey, studentLaunch.workbookKey);
      const studentSession = await exchangeLaunch(baseUrl, studentLaunch);
      teacherSession = await exchangeLaunch(baseUrl, teacherLaunch);
      const content = await fetch(`${baseUrl}/workbook-helper/v1/content`, { headers: { Authorization: teacherSession.authorization } });
      await assertStatus(content, 200);
      assert.deepEqual(Buffer.from(await content.arrayBuffer()), original);
      const res = await putWorkbook({ baseUrl, authorization: studentSession.authorization, bytes: Buffer.from('student solution'), revision: 0, fileName: 'source.ods' });
      await assertStatus(res, 200); studentSaved = await res.json();
    });
    const progressSnapshot = () => fs.readdirSync(dataDir).filter((name) => /progress|homework|answer|student-data/.test(name)).map((name) => [name, sha256(fs.readFileSync(path.join(dataDir, name)))]);
    const beforeProgress = progressSnapshot();
    await t.test('teacher save is immediately downloadable by student and leaves student file intact', async () => {
      const res = await putWorkbook({ baseUrl, authorization: teacherSession.authorization, bytes: Buffer.from('teacher solution'), revision: 0, fileName: 'source.ods' });
      await assertStatus(res, 200);
      const payload = await list();
      assert.equal(payload.solutions.length, 1); assert.equal(payload.teacherSolutions.length, 1);
      assert.match(payload.teacherSolutions[0].name, /^Преподаватель/);
      assert.equal(payload.teacherSolutions[0].authorName, 'Teacher a');
      assert.equal(payload.teacherSolutions[0].canEdit, false);
      assert.equal((await list(teacher)).teacherSolutions[0].canEdit, true);
      const download = await request(student, payload.teacherSolutions[0].url);
      await assertStatus(download, 200); assert.equal(await download.text(), 'teacher solution');
      const files = JSON.parse(fs.readFileSync(path.join(dataDir, 'files.json')));
      const studentFile = files.find((entry) => entry.id === studentSaved.file.id);
      assert.equal(studentFile.workbookRevision, 1);
      assert.equal(studentFile.workbookContentHash, sha256(Buffer.from('student solution')));
      assert.deepEqual(progressSnapshot(), beforeProgress);
      const helperDownload = await fetch(`${baseUrl}/workbook-helper/v1/content`, { headers: { Authorization: teacherSession.authorization } });
      await assertStatus(helperDownload, 200);
      assert.equal(await helperDownload.text(), 'teacher solution');
    });
    await t.test('student cannot continue, overwrite, rename, delete, or use generic helper to alter teacher file', async () => {
      const solution = (await list()).teacherSolutions[0];
      await launch(student, { solutionFileId: solution.fileId }, 404);
      await assertStatus(await request(student, '/api/workbook-helper/launch', 'POST', { fileId: solution.fileId }), 403);
      await assertStatus(await request(student, `/api/files/${solution.fileId}`, 'PATCH', { name: 'changed.ods' }), 403);
      await assertStatus(await request(student, `/api/files/${solution.fileId}`, 'DELETE'), 403);
      for (const route of [`/api/files/${solution.fileId}/content`, `/api/workbook-solutions/${solution.sourceFileId}/content`]) {
        const form = new FormData(); form.append('file', new Blob(['bad']), 'source.ods'); form.append('revision', '1');
        await assertStatus(await fetch(baseUrl + route, { method: 'PUT', headers: { Authorization: student }, body: form }), 403);
      }
      await assertStatus(await request(otherTeacher, '/api/workbook-helper/launch', 'POST', { fileId: solution.fileId, studentId: 'student-a' }), 403);
    });
    await t.test('teacher continues own exact file; stale revision cannot overwrite it', async () => {
      const solution = (await list()).teacherSolutions[0];
      const next = await launch(teacher, { solutionFileId: solution.fileId });
      await launch(teacher, { solutionFileId: studentSaved.file.id }, 404);
      const session = await exchangeLaunch(baseUrl, next);
      assert.equal(session.exchange.revision, 1);
      const res = await putWorkbook({ baseUrl, authorization: session.authorization, bytes: Buffer.from('teacher revision 2'), revision: 1, fileName: 'source.ods' });
      await assertStatus(res, 200);
      await assertStatus(await putWorkbook({ baseUrl, authorization: teacherSession.authorization, bytes: Buffer.from('stale'), revision: 1, fileName: 'source.ods' }), 409);
      assert.equal((await list()).teacherSolutions[0].revision, 2);
    });
    await t.test('fresh copies and three-slot limit are independent of student slots', async () => {
      for (let i = 2; i <= 3; i++) {
        const grant = await launch(teacher, { startFresh: true });
        const session = await exchangeLaunch(baseUrl, grant);
        await assertStatus(await putWorkbook({ baseUrl, authorization: session.authorization, bytes: Buffer.from(`teacher ${i}`), revision: 0, fileName: 'source.ods' }), 200);
      }
      await launch(teacher, { startFresh: true }, 409);
      assert.equal((await list()).solutions.length, 1);
      await launch(student, { startFresh: true });
    });
    await t.test('other questions and students cannot continue a teacher solution; deletion frees only its slot', async () => {
      const solution = (await list()).teacherSolutions[0];
      await launch(teacher, { questionId: 'q-b', solutionFileId: solution.fileId }, 404);
      await launch(teacher, { studentId: 'student-c', solutionFileId: solution.fileId }, 404);
      await assertStatus(await request(teacher, `/api/files/${solution.fileId}`, 'DELETE'), 200);
      await launch(teacher, { startFresh: true });
      assert.equal((await list()).solutions.length, 1);
    });
    await t.test('text-to-workbook tasks retain original text and separate teacher blank sheet', async () => {
      const grant = await launch(teacher, { taskNumber: 26, questionId: 'text-q', attachmentId: 'text-file' });
      const session = await exchangeLaunch(baseUrl, grant);
      assert.equal(session.exchange.sourceText.fileName, 'source.txt');
      const res = await fetch(`${baseUrl}/workbook-helper/v1/content`, { headers: { Authorization: session.authorization } });
      await assertStatus(res, 200); assert.match(await res.text(), /office:spreadsheet/);
      assert.deepEqual(progressSnapshot(), beforeProgress);
    });
  } finally {
    await stopServer(child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('question workbook helper binds exact attachments and creates blank task 26/27 sheets', {
  timeout: 40_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-question-workbook-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const workbookBytes = Buffer.from('exact question workbook bytes');
  const otherWorkbookBytes = Buffer.from('another question workbook bytes');
  const task26TextBytes = Buffer.from('1;2;3\n4;5;6\n');
  const task27TextBytes = Buffer.from('word,count\nalpha,3\n');
  const workbookStorageName = 'question-source.ods';
  const otherStorageName = 'other-question.ods';
  const textStorageName = 'task-26-source.txt';
  const task27TextStorageName = 'task-27-source.csv';
  fs.writeFileSync(path.join(uploadsDir, workbookStorageName), workbookBytes);
  fs.writeFileSync(path.join(uploadsDir, otherStorageName), otherWorkbookBytes);
  fs.writeFileSync(path.join(uploadsDir, textStorageName), task26TextBytes);
  fs.writeFileSync(path.join(uploadsDir, task27TextStorageName), task27TextBytes);

  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
    id: 'teacher-a',
    name: 'Teacher',
    code: '112233',
    createdAt: now,
  }]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{
    id: 'student-a',
    name: 'Student',
    teacherId: 'teacher-a',
    code: '654321',
    grade: '11',
    createdAt: now,
    deletedAt: null,
  }]));
  fs.writeFileSync(path.join(dataDir, 'files.json'), '[]');
  fs.writeFileSync(path.join(dataDir, 'folders.json'), '[]');
  fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify({
    9: {
      basic: [
        {
          id: 'question-9-a',
          question: 'Solve the table',
          files: [{
            id: 'attachment-ods',
            name: 'source.ods',
            size: `${workbookBytes.length} B`,
            sizeBytes: workbookBytes.length,
            storageName: workbookStorageName,
            url: `/uploads/${workbookStorageName}`,
          }],
        },
        {
          id: 'question-9-b',
          question: 'Other question',
          files: [{
            id: 'attachment-from-other-question',
            name: 'other.ods',
            size: `${otherWorkbookBytes.length} B`,
            sizeBytes: otherWorkbookBytes.length,
            storageName: otherStorageName,
            url: `/uploads/${otherStorageName}`,
          }],
        },
      ],
    },
    26: {
      basic: [{
        id: 'question-26-a',
        question: 'Copy the text into a spreadsheet',
        files: [{
          id: 'attachment-txt',
          name: 'source.txt',
          size: `${task26TextBytes.length} B`,
          sizeBytes: task26TextBytes.length,
          storageName: textStorageName,
          url: `/uploads/${textStorageName}`,
        }],
      }],
    },
    27: {
      basic: [{
        id: 'question-27-a',
        question: 'Copy the text into a spreadsheet',
        files: [{
          id: 'attachment-27-csv',
          name: 'source-27.csv',
          size: `${task27TextBytes.length} B`,
          sizeBytes: task27TextBytes.length,
          storageName: task27TextStorageName,
          url: `/uploads/${task27TextStorageName}`,
        }],
      }],
    },
  }));

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverLogs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: uploadsDir,
      PLATFORM_JSON_BACKUPS_DIR: path.join(tempRoot, 'json-backups'),
      COLLAB_PERSISTENCE: '0',
      DISABLE_STARTUP_XP_REBALANCE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });

  try {
    await waitForServer(baseUrl, child, () => serverLogs);
    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '654321' }),
    });
    await assertStatus(loginResponse, 200);
    const login = await loginResponse.json();
    const userAuthorization = `Bearer ${login.token}`;

    const launchQuestion = (payload) => fetch(`${baseUrl}/api/workbook-helper/question-launch`, {
      method: 'POST',
      headers: {
        Authorization: userAuthorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const foreignAttachmentResponse = await launchQuestion({
      taskNumber: 9,
      levelId: 'basic',
      questionId: 'question-9-a',
      attachmentId: 'attachment-from-other-question',
    });
    await assertStatus(foreignAttachmentResponse, 404);

    const launchResponse = await launchQuestion({
      taskNumber: 9,
      levelId: 'basic',
      questionId: 'question-9-a',
      attachmentId: 'attachment-ods',
    });
    await assertStatus(launchResponse, 201);
    const launch = await launchResponse.json();
    assert.equal(launch.revision, 0);
    assert.equal(launch.contentHash, sha256(workbookBytes));
    assert.equal(launch.nameRequired, false);
    assert.equal(launch.requiresName, false);
    assert.equal(launch.hasSolution, false);

    const filesBeforeSaveResponse = await fetch(`${baseUrl}/api/files`, {
      headers: { Authorization: userAuthorization },
    });
    await assertStatus(filesBeforeSaveResponse, 200);
    const filesBeforeSave = await filesBeforeSaveResponse.json();
    assert.deepEqual(filesBeforeSave, []);

    const firstSession = await exchangeLaunch(baseUrl, launch);
    assert.equal(firstSession.exchange.revision, 0);
    assert.equal(firstSession.exchange.nameRequired, false);
    const initialContentResponse = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: firstSession.authorization },
    });
    await assertStatus(initialContentResponse, 200);
    assert.equal(initialContentResponse.headers.get('x-workbook-revision'), '0');
    assert.deepEqual(Buffer.from(await initialContentResponse.arrayBuffer()), workbookBytes);

    const solutionBytes = Buffer.from('student solution without a requested name');
    const saveResponse = await putWorkbook({
      baseUrl,
      authorization: firstSession.authorization,
      bytes: solutionBytes,
      revision: 0,
      fileName: 'source.ods',
    });
    await assertStatus(saveResponse, 200);
    const saved = await saveResponse.json();
    assert.equal(saved.revision, 1);
    assert.equal(saved.file.workbookQuestionSolution, true);
    assert.deepEqual(saved.file.workbookQuestionContext, {
      taskNumber: 9,
      levelId: 'basic',
      questionId: 'question-9-a',
      questionNumber: 1,
      attachmentId: 'attachment-ods',
      attachmentName: 'source.ods',
      mode: 'workbook',
    });

    const teacherLoginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '112233' }),
    });
    await assertStatus(teacherLoginResponse, 200);
    const teacherLogin = await teacherLoginResponse.json();
    const teacherAuthorization = `Bearer ${teacherLogin.token}`;
    const teacherSolutionsResponse = await fetch(
      `${baseUrl}/api/workbook-helper/question-solutions?studentId=student-a&taskNumber=9&levelId=basic&questionId=question-9-a`,
      { headers: { Authorization: teacherAuthorization } }
    );
    await assertStatus(teacherSolutionsResponse, 200);
    const teacherSolutions = await teacherSolutionsResponse.json();
    assert.equal(teacherSolutions.solutions.length, 1);
    assert.equal(teacherSolutions.solutions[0].fileId, saved.file.id);
    assert.equal(teacherSolutions.solutions[0].name, saved.file.name);
    assert.equal(teacherSolutions.solutions[0].url, saved.file.url);
    assert.equal(teacherSolutions.solutions[0].sizeBytes, solutionBytes.length);

    const teacherDownloadResponse = await fetch(
      `${baseUrl}${teacherSolutions.solutions[0].url}?download=1&studentId=student-a`,
      { headers: { Authorization: teacherAuthorization } }
    );
    await assertStatus(teacherDownloadResponse, 200);
    assert.match(teacherDownloadResponse.headers.get('content-disposition') || '', /^attachment;/i);
    assert.deepEqual(Buffer.from(await teacherDownloadResponse.arrayBuffer()), solutionBytes);

    const filesAfterSaveResponse = await fetch(`${baseUrl}/api/files`, {
      headers: { Authorization: userAuthorization },
    });
    await assertStatus(filesAfterSaveResponse, 200);
    const filesAfterSave = await filesAfterSaveResponse.json();
    assert.equal(filesAfterSave.some((entry) => entry.workbookQuestionVirtualSource === true), false);
    assert.equal(filesAfterSave.some((entry) => entry.id === launch.sourceFileId), false);
    assert.equal(filesAfterSave.some((entry) => entry.id === saved.file.id), true);

    const resumedLaunchResponse = await launchQuestion({
      taskNumber: 9,
      levelId: 'basic',
      questionId: 'question-9-a',
      attachmentId: 'attachment-ods',
    });
    await assertStatus(resumedLaunchResponse, 201);
    const resumedLaunch = await resumedLaunchResponse.json();
    assert.equal(resumedLaunch.hasSolution, true);
    assert.equal(resumedLaunch.revision, 1);
    assert.equal(resumedLaunch.solution.fileId, saved.file.id);
    assert.equal(resumedLaunch.contentHash, sha256(solutionBytes));
    const resumedSession = await exchangeLaunch(baseUrl, resumedLaunch);
    assert.equal(resumedSession.exchange.revision, 1);
    const resumedContentResponse = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: resumedSession.authorization },
    });
    await assertStatus(resumedContentResponse, 200);
    assert.deepEqual(Buffer.from(await resumedContentResponse.arrayBuffer()), solutionBytes);

    const freshLaunchResponse = await launchQuestion({
      taskNumber: 9,
      levelId: 'basic',
      questionId: 'question-9-a',
      attachmentId: 'attachment-ods',
      startFresh: true,
    });
    await assertStatus(freshLaunchResponse, 201);
    const freshLaunch = await freshLaunchResponse.json();
    assert.equal(freshLaunch.hasSolution, true);
    assert.equal(freshLaunch.startsFresh, true);
    assert.equal(freshLaunch.revision, 0);
    assert.equal(freshLaunch.contentHash, sha256(workbookBytes));
    const freshSession = await exchangeLaunch(baseUrl, freshLaunch);
    assert.equal(freshSession.exchange.revision, 0);
    assert.equal(freshSession.exchange.contentHash, sha256(workbookBytes));
    const freshContentResponse = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: freshSession.authorization },
    });
    await assertStatus(freshContentResponse, 200);
    assert.equal(freshContentResponse.headers.get('x-workbook-revision'), '0');
    assert.deepEqual(Buffer.from(await freshContentResponse.arrayBuffer()), workbookBytes);

    const freshSolutionBytes = Buffer.from('student restarted this workbook from its source');
    const freshSaveResponse = await putWorkbook({
      baseUrl,
      authorization: freshSession.authorization,
      bytes: freshSolutionBytes,
      revision: 0,
      fileName: 'source.ods',
    });
    await assertStatus(freshSaveResponse, 200);
    const freshSaved = await freshSaveResponse.json();
    assert.equal(freshSaved.revision, 1);
    assert.notEqual(freshSaved.file.id, saved.file.id);
    assert.equal(freshSaved.file.workbookQuestionSolutionSlot, 2);
    assert.deepEqual(fs.readFileSync(path.join(uploadsDir, workbookStorageName)), workbookBytes);

    const selectedLaunchResponse = await launchQuestion({
      taskNumber: 9,
      levelId: 'basic',
      questionId: 'question-9-a',
      attachmentId: 'attachment-ods',
      solutionFileId: saved.file.id,
    });
    await assertStatus(selectedLaunchResponse, 201);
    const selectedSession = await exchangeLaunch(baseUrl, await selectedLaunchResponse.json());
    const selectedContentResponse = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: selectedSession.authorization },
    });
    await assertStatus(selectedContentResponse, 200);
    assert.deepEqual(Buffer.from(await selectedContentResponse.arrayBuffer()), solutionBytes);

    const thirdLaunchResponse = await launchQuestion({
      taskNumber: 9,
      levelId: 'basic',
      questionId: 'question-9-a',
      attachmentId: 'attachment-ods',
      startFresh: true,
    });
    await assertStatus(thirdLaunchResponse, 201);
    const thirdSession = await exchangeLaunch(baseUrl, await thirdLaunchResponse.json());
    const thirdSaveResponse = await putWorkbook({
      baseUrl,
      authorization: thirdSession.authorization,
      bytes: Buffer.from('third independent workbook solution'),
      revision: 0,
      fileName: 'source.ods',
    });
    await assertStatus(thirdSaveResponse, 200);
    const thirdSaved = await thirdSaveResponse.json();
    assert.equal(thirdSaved.file.workbookQuestionSolutionSlot, 3);

    const fourthLaunchResponse = await launchQuestion({
      taskNumber: 9,
      levelId: 'basic',
      questionId: 'question-9-a',
      attachmentId: 'attachment-ods',
      startFresh: true,
    });
    assert.equal(fourthLaunchResponse.status, 409);

    const task26LaunchResponse = await launchQuestion({
      taskNumber: 26,
      levelId: 'basic',
      questionId: 'question-26-a',
      attachmentId: 'attachment-txt',
    });
    await assertStatus(task26LaunchResponse, 201);
    const task26Launch = await task26LaunchResponse.json();
    assert.equal(task26Launch.opensSourceText, true);
    assert.equal(task26Launch.nameRequired, false);
    assert.match(task26Launch.fileName, /\.fods$/i);
    const task26Session = await exchangeLaunch(baseUrl, task26Launch);
    assert.deepEqual(task26Session.exchange.sourceText, {
      fileName: 'source.txt',
      sizeBytes: task26TextBytes.length,
      contentHash: sha256(task26TextBytes),
      contentPath: '/workbook-helper/v1/source-text',
    });
    const task26SourceTextResponse = await fetch(`${baseUrl}/workbook-helper/v1/source-text`, {
      headers: { Authorization: task26Session.authorization },
    });
    await assertStatus(task26SourceTextResponse, 200);
    assert.equal(task26SourceTextResponse.headers.get('x-source-text-content-hash'), sha256(task26TextBytes));
    assert.equal(task26SourceTextResponse.headers.get('x-source-text-size'), String(task26TextBytes.length));
    assert.deepEqual(Buffer.from(await task26SourceTextResponse.arrayBuffer()), task26TextBytes);
    const task26ContentResponse = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: task26Session.authorization },
    });
    await assertStatus(task26ContentResponse, 200);
    const fodsBytes = Buffer.from(await task26ContentResponse.arrayBuffer());
    const fodsText = fodsBytes.toString('utf8');
    assert.equal(sha256(fodsBytes), task26Launch.contentHash);
    assert.match(fodsText, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(fodsText, /office:mimetype="application\/vnd\.oasis\.opendocument\.spreadsheet"/);
    assert.match(fodsText, /<office:spreadsheet>/);
    assert.match(fodsText, /<table:table table:name="Лист1">/);

    const task27LaunchResponse = await launchQuestion({
      taskNumber: 27,
      levelId: 'basic',
      questionId: 'question-27-a',
      attachmentId: 'attachment-27-csv',
    });
    await assertStatus(task27LaunchResponse, 201);
    const task27Launch = await task27LaunchResponse.json();
    assert.equal(task27Launch.opensSourceText, true);
    assert.match(task27Launch.fileName, /Задание 27.*\.fods$/i);
    const task27Session = await exchangeLaunch(baseUrl, task27Launch);
    assert.equal(task27Session.exchange.sourceText.fileName, 'source-27.csv');
    assert.equal(task27Session.exchange.sourceText.contentHash, sha256(task27TextBytes));
    const task27SourceTextResponse = await fetch(`${baseUrl}/workbook-helper/v1/source-text`, {
      headers: { Authorization: task27Session.authorization },
    });
    await assertStatus(task27SourceTextResponse, 200);
    assert.deepEqual(Buffer.from(await task27SourceTextResponse.arrayBuffer()), task27TextBytes);
  } finally {
    await stopServer(child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
