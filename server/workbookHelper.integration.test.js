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
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const assertStatus = async (response, expectedStatus) => {
  if (response.status === expectedStatus) return;
  const body = await response.text();
  assert.equal(response.status, expectedStatus, body);
};

const putWorkbook = async ({
  url,
  authorization,
  bytes,
  revision,
  contentHash = sha256(bytes),
  solutionName,
}) => {
  const body = new FormData();
  body.append('file', new Blob([bytes], {
    type: 'application/vnd.oasis.opendocument.spreadsheet',
  }), 'Таблица — решение.ods');
  if (typeof revision !== 'undefined') body.append('revision', String(revision));
  if (contentHash) body.append('contentHash', contentHash);
  if (typeof solutionName !== 'undefined') body.append('solutionName', String(solutionName));
  return fetch(url, {
    method: 'PUT',
    headers: { Authorization: authorization },
    body,
  });
};

test('workbook helper keeps multiple named solutions bound to their exact result', {
  timeout: 45_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-workbook-helper-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const sourceBytes = Buffer.from('source workbook bytes');
  const task26TextBytes = Buffer.from('1;2;3\n4;5;6\n');
  const foreignSourceBytes = Buffer.from('another student workbook bytes');
  const foreignSourceStorageName = 'source-b-foreign.ods';
  const sourceStorageName = 'source-a-Таблица.ods';
  fs.writeFileSync(path.join(uploadsDir, sourceStorageName), sourceBytes);
  fs.writeFileSync(path.join(uploadsDir, 'task26-material.txt'), task26TextBytes);
  fs.writeFileSync(path.join(uploadsDir, foreignSourceStorageName), foreignSourceBytes);
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
    id: 'teacher-a',
    name: 'Учитель',
    createdAt: new Date().toISOString(),
  }]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{
    id: 'student-a',
    name: 'Ученик',
    teacherId: 'teacher-a',
    code: '654321',
    grade: '11',
    createdAt: new Date().toISOString(),
    deletedAt: null,
  }]));
  fs.writeFileSync(path.join(dataDir, 'files.json'), JSON.stringify([{
    id: 'source-a',
    studentId: 'student-a',
    taskNumber: 9,
    category: 'class',
    folderId: null,
    folderName: null,
    name: 'Таблица.ods',
    size: `${sourceBytes.length} Б`,
    sizeBytes: sourceBytes.length,
    createdAt: new Date().toISOString(),
    url: `/uploads/${sourceStorageName}`,
    storageName: sourceStorageName,
  }, {
    id: 'task26-text-a',
    studentId: 'student-a',
    taskNumber: 26,
    category: 'class',
    name: '26_1.txt',
    sizeBytes: task26TextBytes.length,
    createdAt: new Date().toISOString(),
    url: '/uploads/task26-material.txt',
    storageName: 'task26-material.txt',
  }]));
  const studentsFixture = JSON.parse(fs.readFileSync(path.join(dataDir, 'students.json'), 'utf8'));
  studentsFixture.push({
    id: 'student-b',
    name: 'Other student',
    teacherId: 'teacher-a',
    code: '123456',
    grade: '11',
    createdAt: new Date().toISOString(),
    deletedAt: null,
  });
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify(studentsFixture));

  const filesFixture = JSON.parse(fs.readFileSync(path.join(dataDir, 'files.json'), 'utf8'));
  filesFixture.push({
    id: 'source-b',
    studentId: 'student-b',
    taskNumber: 9,
    category: 'class',
    folderId: null,
    folderName: null,
    name: 'Foreign.ods',
    size: `${foreignSourceBytes.length} B`,
    sizeBytes: foreignSourceBytes.length,
    createdAt: new Date().toISOString(),
    url: `/uploads/${foreignSourceStorageName}`,
    storageName: foreignSourceStorageName,
  });
  fs.writeFileSync(path.join(dataDir, 'files.json'), JSON.stringify(filesFixture));
  fs.writeFileSync(path.join(dataDir, 'folders.json'), '[]');

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverLogs = '';
  let child = null;
  const startServer = async () => {
    const nextChild = spawn(process.execPath, ['server/index.js'], {
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
    nextChild.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    nextChild.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    child = nextChild;
    await waitForServer(baseUrl, child, () => serverLogs);
  };

  try {
    await startServer();
    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '654321' }),
    });
    await assertStatus(loginResponse, 200);
    const login = await loginResponse.json();
    const userAuthorization = `Bearer ${login.token}`;

    const task26LaunchResponse = await fetch(`${baseUrl}/api/workbook-helper/launch`, {
      method: 'POST',
      headers: { Authorization: userAuthorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: 'task26-text-a' }),
    });
    await assertStatus(task26LaunchResponse, 201);
    const task26Launch = await task26LaunchResponse.json();
    assert.equal(task26Launch.opensSourceText, true);
    assert.match(task26Launch.fileName, /\.fods$/i);
    const task26ExchangeResponse = await fetch(`${baseUrl}/workbook-helper/v1/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: task26Launch.ticket }),
    });
    await assertStatus(task26ExchangeResponse, 200);
    const task26Exchange = await task26ExchangeResponse.json();
    const task26ContentResponse = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: `Workbook ${task26Exchange.token}` },
    });
    await assertStatus(task26ContentResponse, 200);
    assert.match(Buffer.from(await task26ContentResponse.arrayBuffer()).toString('utf8'), /office:spreadsheet/);

    const foreignLaunchResponse = await fetch(`${baseUrl}/api/workbook-helper/launch`, {
      method: 'POST',
      headers: {
        Authorization: userAuthorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: 'source-b' }),
    });
    assert.ok([403, 404].includes(foreignLaunchResponse.status));

    const launchResponse = await fetch(`${baseUrl}/api/workbook-helper/launch`, {
      method: 'POST',
      headers: {
        Authorization: userAuthorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: 'source-a' }),
    });
    await assertStatus(launchResponse, 201);
    const launch = await launchResponse.json();
    assert.equal(launch.revision, 0);
    assert.equal(launch.contentHash, sha256(sourceBytes));
    assert.equal(launch.suggestedName, '');
    assert.equal(launch.requiresName, true);
    assert.equal(launch.nameRequired, true);

    const initialBrowserContent = await fetch(
      `${baseUrl}/api/workbook-solutions/source-a/content`,
      {
        headers: {
          Authorization: userAuthorization,
          Origin: 'http://localhost',
        },
      }
    );
    await assertStatus(initialBrowserContent, 200);
    assert.match(
      initialBrowserContent.headers.get('access-control-expose-headers') || '',
      /X-Workbook-Revision/i
    );
    assert.equal(initialBrowserContent.headers.get('x-workbook-revision'), '0');
    assert.equal(initialBrowserContent.headers.get('x-workbook-content-hash'), sha256(sourceBytes));
    assert.deepEqual(Buffer.from(await initialBrowserContent.arrayBuffer()), sourceBytes);

    const exchangeResponse = await fetch(`${baseUrl}/workbook-helper/v1/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: launch.ticket }),
    });
    await assertStatus(exchangeResponse, 200);
    const exchange = await exchangeResponse.json();
    const workbookAuthorization = `Workbook ${exchange.token}`;
    assert.equal(exchange.workbookKey, launch.workbookKey);
    assert.equal(exchange.revision, 0);
    assert.equal(exchange.requiresName, true);
    assert.equal(exchange.nameRequired, true);

    const scopedTokenEscape = await fetch(`${baseUrl}/api/files?studentId=student-a`, {
      headers: { Authorization: workbookAuthorization },
    });
    assert.equal(scopedTokenEscape.status, 401);

    const repeatedExchange = await fetch(`${baseUrl}/workbook-helper/v1/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: launch.ticket }),
    });
    assert.equal(repeatedExchange.status, 410);

    const sessionsOnDisk = JSON.parse(fs.readFileSync(
      path.join(dataDir, 'workbook-helper-sessions.json'),
      'utf8'
    ));
    assert.equal(sessionsOnDisk.length, 2);
    assert.equal(JSON.stringify(sessionsOnDisk).includes(exchange.token), false);
    assert.match(sessionsOnDisk[0].tokenHash, /^[0-9a-f]{64}$/);

    const initialContent = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: workbookAuthorization },
    });
    assert.equal(initialContent.status, 200);
    assert.equal(initialContent.headers.get('x-workbook-revision'), '0');
    assert.equal(initialContent.headers.get('x-workbook-content-hash'), sha256(sourceBytes));
    assert.deepEqual(Buffer.from(await initialContent.arrayBuffer()), sourceBytes);

    const firstSolutionBytes = Buffer.from('first solved workbook version');
    const missingNameWrite = await putWorkbook({
      url: `${baseUrl}/workbook-helper/v1/content`,
      authorization: workbookAuthorization,
      bytes: Buffer.from('missing name must not save'),
      revision: 0,
    });
    await assertStatus(missingNameWrite, 400);

    const invalidNameWrite = await putWorkbook({
      url: `${baseUrl}/workbook-helper/v1/content`,
      authorization: workbookAuthorization,
      bytes: Buffer.from('invalid name must not save'),
      revision: 0,
      solutionName: '../escape',
    });
    await assertStatus(invalidNameWrite, 400);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dataDir, 'files.json'), 'utf8'))
        .filter((entry) => entry.workbookSourceFileId === 'source-a').length,
      0
    );

    const firstWrite = await putWorkbook({
      url: `${baseUrl}/workbook-helper/v1/content`,
      authorization: workbookAuthorization,
      bytes: firstSolutionBytes,
      revision: 0,
      solutionName: 'First result',
    });
    await assertStatus(firstWrite, 200);
    const firstWritePayload = await firstWrite.json();
    assert.equal(firstWritePayload.revision, 1);
    assert.equal(firstWritePayload.contentHash, sha256(firstSolutionBytes));
    assert.equal(firstWritePayload.unchanged, false);
    assert.equal(firstWritePayload.file.name, 'First result.ods');
    assert.equal(firstWritePayload.nameRequired, false);
    const solutionFileId = firstWritePayload.file.id;

    const solvedBrowserContent = await fetch(
      `${baseUrl}/api/workbook-solutions/source-a/content`,
      { headers: { Authorization: userAuthorization } }
    );
    await assertStatus(solvedBrowserContent, 200);
    assert.equal(solvedBrowserContent.headers.get('x-workbook-revision'), '0');
    assert.equal(
      solvedBrowserContent.headers.get('x-workbook-content-hash'),
      sha256(sourceBytes)
    );
    assert.deepEqual(Buffer.from(await solvedBrowserContent.arrayBuffer()), sourceBytes);

    const exactFirstContent = await fetch(
      `${baseUrl}/api/workbook-solutions/${solutionFileId}/content`,
      { headers: { Authorization: userAuthorization } }
    );
    await assertStatus(exactFirstContent, 200);
    assert.equal(exactFirstContent.headers.get('x-workbook-revision'), '1');
    assert.equal(
      exactFirstContent.headers.get('x-workbook-content-hash'),
      sha256(firstSolutionBytes)
    );
    assert.deepEqual(Buffer.from(await exactFirstContent.arrayBuffer()), firstSolutionBytes);

    const identicalRetry = await putWorkbook({
      url: `${baseUrl}/workbook-helper/v1/content`,
      authorization: workbookAuthorization,
      bytes: firstSolutionBytes,
      revision: 0,
    });
    await assertStatus(identicalRetry, 200);
    const identicalPayload = await identicalRetry.json();
    assert.equal(identicalPayload.revision, 1);
    assert.equal(identicalPayload.unchanged, true);

    const staleWrite = await putWorkbook({
      url: `${baseUrl}/workbook-helper/v1/content`,
      authorization: workbookAuthorization,
      bytes: Buffer.from('conflicting version'),
      revision: 0,
    });
    await assertStatus(staleWrite, 409);
    const stalePayload = await staleWrite.json();
    assert.equal(stalePayload.revision, 1);
    assert.equal(stalePayload.contentHash, sha256(firstSolutionBytes));

    const secondLaunchResponse = await fetch(`${baseUrl}/api/workbook-helper/launch`, {
      method: 'POST',
      headers: {
        Authorization: userAuthorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: 'source-a' }),
    });
    await assertStatus(secondLaunchResponse, 201);
    const secondLaunch = await secondLaunchResponse.json();
    assert.equal(secondLaunch.nameRequired, true);
    assert.equal(secondLaunch.requiresName, true);
    assert.equal(secondLaunch.revision, 0);
    assert.notEqual(secondLaunch.workbookKey, launch.workbookKey);

    const secondExchangeResponse = await fetch(`${baseUrl}/workbook-helper/v1/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: secondLaunch.ticket }),
    });
    await assertStatus(secondExchangeResponse, 200);
    const secondExchange = await secondExchangeResponse.json();
    const secondWorkbookAuthorization = `Workbook ${secondExchange.token}`;
    assert.equal(secondExchange.nameRequired, true);

    const secondSolutionBytes = Buffer.from('second independently solved workbook');
    const secondWrite = await putWorkbook({
      url: `${baseUrl}/workbook-helper/v1/content`,
      authorization: secondWorkbookAuthorization,
      bytes: secondSolutionBytes,
      revision: 0,
      solutionName: 'Second result',
    });
    await assertStatus(secondWrite, 200);
    const secondWritePayload = await secondWrite.json();
    const secondSolutionFileId = secondWritePayload.file.id;
    assert.notEqual(secondSolutionFileId, solutionFileId);
    assert.equal(secondWritePayload.file.name, 'Second result.ods');
    assert.equal(secondWritePayload.file.workbookSolutionKey, secondLaunch.workbookKey);

    const firstSessionAfterSecondSave = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: workbookAuthorization },
    });
    await assertStatus(firstSessionAfterSecondSave, 200);
    assert.equal(firstSessionAfterSecondSave.headers.get('x-workbook-revision'), '1');
    assert.deepEqual(
      Buffer.from(await firstSessionAfterSecondSave.arrayBuffer()),
      firstSolutionBytes
    );

    const continueLaunchResponse = await fetch(`${baseUrl}/api/workbook-helper/launch`, {
      method: 'POST',
      headers: {
        Authorization: userAuthorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: solutionFileId }),
    });
    await assertStatus(continueLaunchResponse, 201);
    const continueLaunch = await continueLaunchResponse.json();
    assert.equal(continueLaunch.workbookKey, launch.workbookKey);
    assert.equal(continueLaunch.revision, 1);
    assert.equal(continueLaunch.requiresName, false);
    assert.equal(continueLaunch.solutionName, 'First result.ods');

    const continueExchangeResponse = await fetch(`${baseUrl}/workbook-helper/v1/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: continueLaunch.ticket }),
    });
    await assertStatus(continueExchangeResponse, 200);
    const continueExchange = await continueExchangeResponse.json();
    const continuedWorkbookAuthorization = `Workbook ${continueExchange.token}`;
    assert.equal(continueExchange.revision, 1);
    assert.equal(continueExchange.requiresName, false);
    assert.equal(continueExchange.solutionName, 'First result.ods');

    const oldTokenResponse = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: workbookAuthorization },
    });
    await assertStatus(oldTokenResponse, 200);
    assert.deepEqual(Buffer.from(await oldTokenResponse.arrayBuffer()), firstSolutionBytes);

    const continuedFirstBytes = Buffer.from('first result continued through exact helper binding');
    const unauthorizedRename = await putWorkbook({
      url: `${baseUrl}/workbook-helper/v1/content`,
      authorization: continuedWorkbookAuthorization,
      bytes: Buffer.from('rename must not update the exact result'),
      revision: 1,
      solutionName: 'Renamed result',
    });
    await assertStatus(unauthorizedRename, 409);

    const continuedFirstWrite = await putWorkbook({
      url: `${baseUrl}/workbook-helper/v1/content`,
      authorization: continuedWorkbookAuthorization,
      bytes: continuedFirstBytes,
      revision: 1,
    });
    await assertStatus(continuedFirstWrite, 200);
    const continuedFirstPayload = await continuedFirstWrite.json();
    assert.equal(continuedFirstPayload.file.id, solutionFileId);
    assert.equal(continuedFirstPayload.file.name, 'First result.ods');
    assert.equal(continuedFirstPayload.revision, 2);

    const untouchedSecondContent = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: secondWorkbookAuthorization },
    });
    await assertStatus(untouchedSecondContent, 200);
    assert.equal(untouchedSecondContent.headers.get('x-workbook-revision'), '1');
    assert.deepEqual(
      Buffer.from(await untouchedSecondContent.arrayBuffer()),
      secondSolutionBytes
    );

    const browserBytes = Buffer.from('browser fallback version');
    const uploadsBeforeMissingRevision = fs.readdirSync(uploadsDir).sort();
    const missingRevisionWrite = await putWorkbook({
      url: `${baseUrl}/api/workbook-solutions/${solutionFileId}/content`,
      authorization: userAuthorization,
      bytes: Buffer.from('must not save without a revision'),
    });
    await assertStatus(missingRevisionWrite, 428);
    const missingRevisionPayload = await missingRevisionWrite.json();
    assert.equal(missingRevisionPayload.revision, 2);
    assert.equal(missingRevisionPayload.contentHash, sha256(continuedFirstBytes));
    assert.deepEqual(fs.readdirSync(uploadsDir).sort(), uploadsBeforeMissingRevision);

    const browserWrite = await putWorkbook({
      url: `${baseUrl}/api/workbook-solutions/${solutionFileId}/content`,
      authorization: userAuthorization,
      bytes: browserBytes,
      revision: 2,
    });
    await assertStatus(browserWrite, 200);
    const browserEntry = await browserWrite.json();
    assert.equal(browserEntry.id, solutionFileId);
    assert.equal(browserEntry.workbookRevision, 3);
    assert.equal(browserEntry.workbookContentHash, sha256(browserBytes));

    const staleBrowserWrite = await putWorkbook({
      url: `${baseUrl}/api/workbook-solutions/${solutionFileId}/content`,
      authorization: userAuthorization,
      bytes: Buffer.from('stale browser fallback version'),
      revision: 2,
    });
    await assertStatus(staleBrowserWrite, 409);
    const staleBrowserPayload = await staleBrowserWrite.json();
    assert.equal(staleBrowserPayload.revision, 3);
    assert.equal(staleBrowserPayload.contentHash, sha256(browserBytes));

    const continuedBrowserContent = await fetch(
      `${baseUrl}/api/workbook-solutions/${solutionFileId}/content`,
      { headers: { Authorization: userAuthorization } }
    );
    await assertStatus(continuedBrowserContent, 200);
    assert.equal(continuedBrowserContent.headers.get('x-workbook-revision'), '3');
    assert.equal(
      continuedBrowserContent.headers.get('x-workbook-content-hash'),
      sha256(browserBytes)
    );
    assert.deepEqual(Buffer.from(await continuedBrowserContent.arrayBuffer()), browserBytes);

    const browserDefaultBytes = Buffer.from('legacy browser fallback from source');
    const browserSourceWrite = await putWorkbook({
      url: `${baseUrl}/api/workbook-solutions/source-a/content`,
      authorization: userAuthorization,
      bytes: browserDefaultBytes,
      revision: 0,
    });
    await assertStatus(browserSourceWrite, 200);
    const browserSourceEntry = await browserSourceWrite.json();
    assert.notEqual(browserSourceEntry.id, solutionFileId);
    assert.notEqual(browserSourceEntry.id, secondSolutionFileId);
    assert.equal(browserSourceEntry.workbookRevision, 1);

    const browserSourceContent = await fetch(
      `${baseUrl}/api/workbook-solutions/source-a/content`,
      { headers: { Authorization: userAuthorization } }
    );
    await assertStatus(browserSourceContent, 200);
    assert.equal(browserSourceContent.headers.get('x-workbook-revision'), '1');
    assert.deepEqual(
      Buffer.from(await browserSourceContent.arrayBuffer()),
      browserDefaultBytes
    );

    const filesAfterWrites = JSON.parse(fs.readFileSync(path.join(dataDir, 'files.json'), 'utf8'));
    const namedKeys = new Set([launch.workbookKey, secondLaunch.workbookKey]);
    const solutions = filesAfterWrites.filter((entry) => namedKeys.has(entry.workbookSolutionKey));
    assert.equal(solutions.length, 2);
    assert.deepEqual(
      new Set(solutions.map((entry) => entry.id)),
      new Set([solutionFileId, secondSolutionFileId])
    );
    assert.deepEqual(
      new Set(solutions.map((entry) => entry.name)),
      new Set(['First result.ods', 'Second result.ods'])
    );

    await stopServer(child);
    await startServer();
    const afterRestart = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: continuedWorkbookAuthorization },
    });
    await assertStatus(afterRestart, 200);
    assert.equal(afterRestart.headers.get('x-workbook-revision'), '3');
    assert.equal(afterRestart.headers.get('x-workbook-content-hash'), sha256(browserBytes));
    assert.deepEqual(Buffer.from(await afterRestart.arrayBuffer()), browserBytes);

    const invalidWorkbookAuthorization = `Workbook ${crypto.randomBytes(32).toString('base64url')}`;
    const rejectedInvalidTokens = await Promise.all(Array.from({ length: 119 }, () => (
      fetch(`${baseUrl}/workbook-helper/v1/content`, {
        headers: { Authorization: invalidWorkbookAuthorization },
      })
    )));
    assert.equal(rejectedInvalidTokens.every((response) => response.status === 401), true);
    const rateLimitedContent = await fetch(`${baseUrl}/workbook-helper/v1/content`, {
      headers: { Authorization: invalidWorkbookAuthorization },
    });
    assert.equal(rateLimitedContent.status, 429);
    assert.equal(rateLimitedContent.headers.get('retry-after'), '60');
  } finally {
    await stopServer(child);
    const safeTempRoot = path.resolve(tempRoot);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    if (safeTempRoot.startsWith(tempBase)) {
      fs.rmSync(safeTempRoot, { recursive: true, force: true });
    }
  }
});
