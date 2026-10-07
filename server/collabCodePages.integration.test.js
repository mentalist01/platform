import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { createCollabCodePage, createEmptyCollabSolution, getCollabSolutionChannels,
  listCollabCodePages, listCollabPageSolutions, deleteCollabCodePage, restoreCollabCodePage } from '../src/utils/collabSolutions.js';

test('code page stacks synchronize through authenticated rooms and survive server restart', { timeout: process.env.CODE_PAGES_QA_SERVE === '1' ? 3600_000 : 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-code-pages-api-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  write('teachers', [{ id: 'teacher-a', name: 'Тестовый преподаватель', code: 'teacher-a-code' }, { id: 'teacher-b', name: 'Другой преподаватель', code: 'teacher-b-code' }]);
  write('students', [{ id: 'a', name: 'Тестовый ученик', teacherId: 'teacher-a', code: 'a-code', grade: '11' }, { id: 'b', name: 'Другой ученик', teacherId: 'teacher-b', code: 'b-code', grade: '11' }]);
  write('tests', {}); write('progress', {});
  const port = await new Promise(resolve => { const probe = net.createServer(); probe.listen(process.env.CODE_PAGES_QA_SERVE === '1' ? 55793 : 0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  const base = `http://127.0.0.1:${port}`, connections = [];
  let child, logs = '';
  const wait = async condition => {
    for (let n = 0; n < 800; n++) {
      if (await condition()) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Condition timed out: ${logs.slice(-1500)}`);
  };
  const start = async () => {
    child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
        PLATFORM_COLLAB_DIR: path.join(root, 'collab'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '1',
        DISABLE_STARTUP_XP_REBALANCE: '1', LEGACY_LESSON_RECORDING_ENABLED: '0',
        ...(process.env.CODE_PAGES_QA_SERVE === '1' ? { CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5599' } : {}) },
      stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
    await wait(async () => { assert.equal(child.exitCode, null, logs); try { return (await fetch(`${base}/api/client-build-version`)).ok; } catch { return false; } });
  };
  const stop = async () => {
    if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
  };
  const login = async code => {
    const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const session = await response.json(); assert.equal(response.status, 200, JSON.stringify(session)); return session.token;
  };
  const connect = async token => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(base.replace('http', 'ws') + '/collab', 'collab-teacher-a-a', doc, { WebSocketPolyfill: WebSocket, params: { _auth: token }, disableBc: true });
    connections.push({ doc, provider }); await wait(() => provider.synced); return doc;
  };
  const closeConnections = () => { for (const { doc, provider } of connections.splice(0)) { provider.destroy(); doc.destroy(); } };
  try {
    await start();
    const teacher = await login('teacher-a-code'), student = await login('a-code'), other = await login('teacher-b-code');
    await assert.rejects(new Promise((resolve, reject) => {
      const ws = new WebSocket(`${base.replace('http', 'ws')}/collab/collab-teacher-a-a?_auth=${other}`);
      ws.once('error', reject); ws.once('open', () => { ws.close(); resolve(); });
    }), /403/);
    const teacherDoc = await connect(teacher), studentDoc = await connect(student);
    getCollabSolutionChannels(teacherDoc, 'main').codeText.insert(0, 'print("original")');
    for (const id of ['8', '9', '10', '11']) {
      createEmptyCollabSolution(teacherDoc, { id, name: id, createdAt: Number(id) });
      getCollabSolutionChannels(teacherDoc, id).codeText.insert(0, `print(${id})`);
    }
    const page = createCollabCodePage(teacherDoc, { id: 'lesson-two', name: 'Второй урок' });
    createEmptyCollabSolution(teacherDoc, { id: 'second-8', name: '8', pageId: page.id });
    await wait(() => listCollabPageSolutions(studentDoc, page.id).length === 2);
    const channels = getCollabSolutionChannels(studentDoc, 'second-8');
    channels.codeText.insert(0, 'print("second")'); channels.testFileText.insert(0, 'second file');
    channels.runMap.set('stdinDraft', 'second input'); channels.runMap.set('output', 'second output');
    await wait(() => getCollabSolutionChannels(teacherDoc, 'second-8').runMap.get('output') === 'second output');
    assert.equal(getCollabSolutionChannels(teacherDoc, '8').codeText.toString(), 'print(8)');
    deleteCollabCodePage(teacherDoc, page.id); await wait(() => listCollabCodePages(studentDoc).length === 1);
    restoreCollabCodePage(studentDoc, page.id); await wait(() => listCollabCodePages(teacherDoc).length === 2);
    closeConnections(); await new Promise(resolve => setTimeout(resolve, 250)); await stop(); await start();
    const restored = await connect(await login('teacher-a-code'));
    await wait(() => listCollabCodePages(restored).length === 2);
    assert.deepEqual(listCollabPageSolutions(restored).map(row => row.name), ['Основной код', '8', '9', '10', '11']);
    assert.equal(getCollabSolutionChannels(restored, page.mainSolutionId).codeText.toString(), '');
    const saved = getCollabSolutionChannels(restored, 'second-8');
    assert.equal(saved.codeText.toString(), 'print("second")'); assert.equal(saved.testFileText.toString(), 'second file');
    assert.equal(saved.runMap.get('stdinDraft'), 'second input'); assert.equal(saved.runMap.get('output'), 'second output');
    if (process.env.CODE_PAGES_QA_SERVE === '1') {
      closeConnections(); console.log(`CODE_PAGES_QA ${JSON.stringify({ base, root })}`);
      await new Promise(resolve => process.once('SIGINT', resolve));
    }
  } finally {
    closeConnections(); await stop();
    if (process.env.CODE_PAGES_QA_SERVE !== '1') fs.rmSync(root, { recursive: true, force: true });
  }
});
