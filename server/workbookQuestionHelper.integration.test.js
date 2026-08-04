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

test('question workbook helper binds exact attachments and creates a blank task 26 sheet', {
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
  const workbookStorageName = 'question-source.ods';
  const otherStorageName = 'other-question.ods';
  const textStorageName = 'task-26-source.txt';
  fs.writeFileSync(path.join(uploadsDir, workbookStorageName), workbookBytes);
  fs.writeFileSync(path.join(uploadsDir, otherStorageName), otherWorkbookBytes);
  fs.writeFileSync(path.join(uploadsDir, textStorageName), task26TextBytes);

  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
    id: 'teacher-a',
    name: 'Teacher',
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
  } finally {
    await stopServer(child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
