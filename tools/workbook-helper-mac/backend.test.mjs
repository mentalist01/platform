import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WorkbookApi, hash } from './api.mjs';
import { WorkbookController } from './controller.mjs';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test('macOS client interoperates with actual platform one-use grants, named save, source text, stale writes and ownership checks', { timeout: 45000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ivan100-mac-backend-')); const data = path.join(root, 'data'); const uploads = path.join(root, 'uploads');
  await fs.mkdir(data); await fs.mkdir(uploads); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date().toISOString();
  const seed = {
    'teachers.json': [{ id: 'teacher-mac', name: 'Учитель Mac', codeHash: `scrypt$mac-test$${crypto.scryptSync('mac-test-teacher', 'mac-test', 64).toString('base64')}`, createdAt: now }],
    'students.json': [{ id: 'student-mac', name: 'Ученик Mac', teacherId: 'teacher-mac', code: '654321', grade: '11', deletedAt: null, createdAt: now }],
    'files.json': [{ id: 'mac-table', studentId: 'student-mac', name: '9.ods', taskNumber: 9, category: 'class', sizeBytes: 5, size: '5 Б', storageName: 'mac-source.ods', url: '/uploads/mac-source.ods', createdAt: now },
      { id: 'mac-text', studentId: 'student-mac', name: '26.txt', taskNumber: 26, category: 'class', sizeBytes: 8, size: '8 Б', storageName: 'mac-text.txt', url: '/uploads/mac-text.txt', createdAt: now }],
    'folders.json': []
  };
  for (const [name, content] of Object.entries(seed)) await fs.writeFile(path.join(data, name), JSON.stringify(content));
  await fs.writeFile(path.join(uploads, 'mac-source.ods'), 'table'); await fs.writeFile(path.join(uploads, 'mac-text.txt'), '1 2 3\n');
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); const origin = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], { cwd: workspace, env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: uploads, PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => { logs += bytes; }); child.stderr.on('data', bytes => { logs += bytes; });
  t.after(async () => { if (child.exitCode !== null) return; const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await Promise.race([exited, delay(3000)]); if (child.exitCode === null) { child.kill('SIGKILL'); await exited; } });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) { if (child.exitCode !== null) throw new Error(logs); try { ready = (await fetch(origin + '/api/client-build-version')).ok; } catch { /* server booting */ } if (ready) break; await delay(100); }
  assert.equal(ready, true, logs);
  const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '654321' }) }); assert.equal(login.status, 200); const { token } = await login.json();
  async function ticket(fileId) { const response = await fetch(origin + '/api/workbook-helper/launch', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId }) }); assert.equal(response.status, 201, await response.clone().text()); return response.json(); }
  const api = new WorkbookApi(origin); const launch = await ticket('mac-table'); const grant = await api.exchange(launch.ticket); assert.equal(grant.requiresName, true); await assert.rejects(api.exchange(launch.ticket), error => error.status === 410);
  const initial = await api.download(grant); assert.equal(initial.bytes.toString(), 'table'); assert.equal(initial.contentHash, hash(initial.bytes));
  const changed = { bytes: Buffer.from('Mac named solution'), contentHash: hash(Buffer.from('Mac named solution')) };
  const receipt = await api.upload(grant, changed, initial.revision, 'Решение на Mac'); assert.equal(receipt.solutionName, 'Решение на Mac.ods');
  const duplicate = await api.upload(grant, changed, initial.revision, 'Решение на Mac'); assert.equal(duplicate.unchanged, true); assert.equal(duplicate.revision, receipt.revision);
  await assert.rejects(api.upload(grant, { bytes: Buffer.from('stale'), contentHash: hash(Buffer.from('stale')) }, initial.revision, 'Other'), error => error.status === 409);
  // Authorization comes from the scoped token. The advisory key header cannot
  // select a different student's workbook on the existing backend.
  assert.equal((await api.download({ ...grant, workbookKey: 'other-student-key' })).bytes.toString(), 'Mac named solution');
  await assert.rejects(api.download({ ...grant, token: 'invalid-token-abcdefghijklmnop' }), error => error.status === 401);
  const events = []; const textLaunch = await ticket('mac-text');
  const controller = new WorkbookController({ directory: path.join(root, 'local-solutions'), allowLoopback: true, adapter: { quarantine: async file => events.push(['quarantine', file]), openWorkbook: async file => events.push(['table', file]), openText: async file => events.push(['text', file]), requestName: async () => 'Текстовая задача', notify: async () => {} }, sessionOptions: { debounce: 500, snapshotDelay: 1, poll: 10000 } }); t.after(() => controller.close());
  const session = await controller.launch(`ivan-ege://workbook/open?origin=${encodeURIComponent(origin)}&ticket=${textLaunch.ticket}`); assert.deepEqual(events.map(item => item[0]), ['quarantine', 'table', 'quarantine', 'text']); assert.match((await fs.readFile(session.file)).toString(), /office:spreadsheet/); assert.equal((await fs.readFile(events[3][1])).toString(), '1 2 3\n');
  const teacherLogin = await fetch(origin + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'mac-test-teacher' }) }); assert.equal(teacherLogin.status, 200); const teacher = await teacherLogin.json();
  // Use the real authenticated API so server caches/session revocation run.
  const removed = await fetch(origin + '/api/students/student-mac', { method: 'DELETE', headers: { Authorization: `Bearer ${teacher.token}` } }); assert.equal(removed.status, 200);
  await assert.rejects(api.download(grant), error => [401, 403, 410].includes(error.status));
});
