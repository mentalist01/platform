import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';
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
  let notifications;
  try {
    await start();
    const teacher = await login('teacher-a-code'), student = await login('a-code'), other = await login('teacher-b-code');
    await assert.rejects(new Promise((resolve, reject) => {
      const ws = new WebSocket(`${base.replace('http', 'ws')}/collab/collab-teacher-a-a?_auth=${other}`);
      ws.once('error', reject); ws.once('open', () => { ws.close(); resolve(); });
    }), /403/);
    const teacherDoc = await connect(teacher), studentDoc = await connect(student);
    const focusApi = (token, body) => fetch(`${base}/api/lesson-code-focus?studentId=a`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    const lockRequest = { studentId: 'a', room: 'collab-teacher-a-a', locked: true };
    assert.equal((await focusApi(other, lockRequest)).status, 403);
    assert.equal((await focusApi(student, lockRequest)).status, 403);
    getCollabSolutionChannels(teacherDoc, 'main').codeText.insert(0, 'print("original")');
    for (const id of ['8', '9', '10', '11']) {
      createEmptyCollabSolution(teacherDoc, { id, name: id, createdAt: Number(id) });
      getCollabSolutionChannels(teacherDoc, id).codeText.insert(0, `print(${id})`);
    }
    const page = createCollabCodePage(teacherDoc, { id: 'lesson-two', name: 'Второй урок' });
    createEmptyCollabSolution(teacherDoc, { id: 'second-8', name: '8', pageId: page.id });
    await wait(() => listCollabPageSolutions(studentDoc, page.id).length === 2);
    const [teacherProvider, studentProvider] = connections.map(row => row.provider);
    teacherProvider.awareness.setLocalState({ solutionId: '8', codeTabFocused: true });
    studentProvider.awareness.setLocalState({ solutionId: 'second-8', codeTabFocused: true });
    await wait(() => teacherProvider.awareness.getStates().get(studentDoc.clientID)?.solutionId === 'second-8');
    const messages = [];
    notifications = new WebSocket(`${base.replace('http', 'ws')}/notifications?_auth=${student}`);
    notifications.on('message', data => messages.push(JSON.parse(data.toString())));
    await wait(() => messages.some(message => message.type === 'ready'));
    const locked = await focusApi(teacher, lockRequest);
    const lockResult = await locked.json();
    assert.equal(locked.status, 200, JSON.stringify(lockResult));
    assert.equal(lockResult.focus.solutionId, 'second-8');
    assert.equal(lockResult.focus.pageId, page.id);
    assert.deepEqual((await (await focusApi(student)).json()).focus, lockResult.focus);
    await wait(() => messages.some(message => message.type === 'lesson-code-focus' && message.focus?.solutionId === 'second-8'));
    notifications.close();
    const channels = getCollabSolutionChannels(studentDoc, 'second-8');
    channels.codeText.insert(0, 'print("second")'); channels.testFileText.insert(0, 'second file');
    channels.runMap.set('stdinDraft', 'second input'); channels.runMap.set('output', 'second output');
    await wait(() => getCollabSolutionChannels(teacherDoc, 'second-8').runMap.get('output') === 'second output');
    assert.equal(getCollabSolutionChannels(teacherDoc, '8').codeText.toString(), 'print(8)');
    deleteCollabCodePage(teacherDoc, page.id); await wait(() => listCollabCodePages(studentDoc).length === 1);
    restoreCollabCodePage(studentDoc, page.id); await wait(() => listCollabCodePages(teacherDoc).length === 2);
    closeConnections(); await new Promise(resolve => setTimeout(resolve, 250)); await stop(); await start();
    const restored = await connect(await login('teacher-a-code'));
    const restoredStudent = await login('a-code'), restoredTeacher = await login('teacher-a-code');
    assert.deepEqual((await (await focusApi(restoredStudent)).json()).focus, lockResult.focus);
    const unlocked = await focusApi(restoredTeacher, { studentId: 'a', locked: false });
    assert.equal(unlocked.status, 200);
    assert.equal((await (await focusApi(restoredStudent)).json()).focus, null);
    await wait(() => listCollabCodePages(restored).length === 2);
    assert.deepEqual(listCollabPageSolutions(restored).map(row => row.name), ['Основной код', '8', '9', '10', '11']);
    assert.equal(getCollabSolutionChannels(restored, page.mainSolutionId).codeText.toString(), '');
    const saved = getCollabSolutionChannels(restored, 'second-8');
    assert.equal(saved.codeText.toString(), 'print("second")'); assert.equal(saved.testFileText.toString(), 'second file');
    assert.equal(saved.runMap.get('stdinDraft'), 'second input'); assert.equal(saved.runMap.get('output'), 'second output');

    const request = async (route, token, body, status = 200) => {
      const form = body instanceof FormData;
      const response = await fetch(base + route, {
        headers: { Authorization: `Bearer ${token}`, ...(!form && body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { method: 'POST', body: form ? body : JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      assert.equal(response.status, status, JSON.stringify(data) + logs.slice(-500));
      return data;
    };
    const image = new FormData();
    const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: 'white' } }).png().toBuffer();
    image.append('file', new Blob([png], { type: 'image/png' }), 'condition.png');
    const { id: imageId } = await request('/api/lesson-task-images', restoredTeacher, image, 201);
    const set = await request('/api/lesson-task-sets', restoredTeacher, {
      name: 'Проверка замка', taskNumber: 5,
      tasks: ['1', '2', '3'].map(title => ({ title, images: [imageId], answers: ['42'], format: 'exact' })),
    }, 201);
    const { run } = await request('/api/lesson-task-runs', restoredTeacher, {
      room: 'board-teacher-a-a~page~' + page.id, setId: set.id, x: 0, y: 0,
    }, 201);
    const pupil = await connect(restoredStudent);
    const first = run.cards[0];
    const pupilProvider = connections.find(row => row.doc === pupil).provider;
    await wait(() => listCollabPageSolutions(pupil, page.id).some(solution => solution.id === first.codeId));
    pupilProvider.awareness.setLocalState({ solutionId: first.codeId, codeTabFocused: true });
    const restoredTeacherProvider = connections.find(row => row.doc === restored).provider;
    await wait(() => restoredTeacherProvider.awareness.getStates().get(pupil.clientID)?.solutionId === first.codeId);
    const initialPin = (await (await focusApi(restoredTeacher, lockRequest)).json()).focus;
    assert.equal(initialPin?.solutionId, first.codeId);
    await request('/api/lesson-task-runs', restoredTeacher, {
      room: 'board-teacher-a-a', setId: set.id, x: 0, y: 0,
    }, 201);
    assert.deepEqual((await (await focusApi(restoredStudent)).json()).focus, initialPin, 'Another board page keeps its own code tabs');
    const updates = [];
    notifications = new WebSocket(`${base.replace('http', 'ws')}/notifications?_auth=${restoredStudent}`);
    notifications.on('message', data => updates.push(JSON.parse(data.toString())));
    await wait(() => updates.some(message => message.type === 'ready'));
    const action = (token, body) => request(`/api/lesson-task-runs/${run.id}/action`, token, body);
    const checkPin = async card => {
      const focus = (await (await focusApi(restoredStudent)).json()).focus;
      assert.deepEqual(focus, { ...initialPin, solutionId: card.codeId, solutionName: card.title });
      assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'lesson-code-focus.json'), 'utf8')).a.solutionId, card.codeId);
      await wait(() => updates.some(message => message.type === 'lesson-code-focus' && message.focus?.solutionId === card.codeId));
    };
    await action(restoredTeacher, { action: 'auto', value: true });
    await action(restoredStudent, { action: 'answer', cardId: first.id, revision: 0, answers: ['42'] });
    const { run: advanced } = await action(restoredStudent, { action: 'check', cardId: first.id, revision: 1 });
    const second = advanced.cards[1];
    await checkPin(second);
    await action(restoredTeacher, { action: 'focus', cardId: first.id });
    assert.equal((await (await focusApi(restoredStudent)).json()).focus.solutionId, second.codeId);
    await action(restoredTeacher, { action: 'focus', cardId: second.id });
    const { run: skipped } = await action(restoredTeacher, { action: 'skip', expectedCount: 2, fromCardId: second.id });
    await checkPin(skipped.cards[2]);
    notifications.close();

    if (process.env.CODE_PAGES_QA_SERVE === '1') {
      closeConnections(); console.log(`CODE_PAGES_QA ${JSON.stringify({ base, root })}`);
      await new Promise(resolve => process.once('SIGINT', resolve));
    }
  } finally {
    notifications?.close();
    closeConnections(); await stop();
    if (process.env.CODE_PAGES_QA_SERVE !== '1') fs.rmSync(root, { recursive: true, force: true });
  }
});
