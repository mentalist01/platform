import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

test('real routes protect upload ownership, browser origins and account boundaries', { timeout: 30000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-boundaries-'));
  const data = path.join(root, 'data'); const uploads = path.join(root, 'uploads');
  fs.mkdirSync(data); fs.mkdirSync(uploads);
  const write = (name, value) => fs.writeFileSync(path.join(data, name + '.json'), JSON.stringify(value));
  const now = Date.now();
  const users = [{ id: 'teacher-a', role: 'teacher', name: 'A' }, { id: 'teacher-b', role: 'teacher', name: 'B' },
    { id: 'student-a', role: 'student', teacherId: 'teacher-a', name: 'Student A' }, { id: 'student-b', role: 'student', teacherId: 'teacher-b', name: 'Student B' }];
  write('teachers', users.filter((u) => u.role === 'teacher').map((u) => ({ ...u, createdAt: new Date(now).toISOString() })));
  write('students', users.filter((u) => u.role === 'student'));
  write('auth-sessions', users.map((user) => ({ token: 'fixture-' + user.id, user, createdAtMs: now, lastSeenAtMs: now, expiresAtMs: now + 3600000 })));
  write('files', [{ id: 'private-note', studentId: 'student-a', storageName: 'private-note.html', category: 'class', taskNumber: 1 }]);
  fs.writeFileSync(path.join(uploads, 'private-note.html'), '<!doctype html><h1>Fixture</h1>');
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(import.meta.dirname, '..'), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), ADMIN_CODE: 'fixture-admin', PLATFORM_DATA_DIR: data,
      PLATFORM_UPLOADS_DIR: uploads, PLATFORM_COLLAB_DIR: path.join(root, 'collab'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
      AUTH_COOKIE_SECURE: 'false', COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (b) => { logs += b; }); child.stderr.on('data', (b) => { logs += b; });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } fs.rmSync(root, { recursive: true, force: true }); });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, logs);
    try { if ((await fetch(base + '/api/client-build-version')).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const request = (url, actor = 'teacher-a', options = {}) => fetch(base + url, { ...options, headers: { Authorization: 'Bearer fixture-' + actor, ...options.headers } });
  const upload = (actor) => { const body = new FormData(); body.append('file', new Blob(['fixture']), 'exercise.txt'); return request('/api/test-files', actor, { method: 'POST', body }); };
  const filesBeforeUnauthorizedUpload = fs.readdirSync(uploads).sort();
  assert.equal((await upload('student-a')).status, 403);
  assert.deepEqual(fs.readdirSync(uploads).sort(), filesBeforeUnauthorizedUpload, 'Unauthorized uploads must be rejected before writing to disk');
  const response = await upload('teacher-a'); assert.equal(response.status, 200, await response.clone().text());
  const file = await response.json();
  assert.equal((await request('/api/test-files/' + file.storageName, 'teacher-b', { method: 'DELETE' })).status, 403);
  assert.ok(fs.existsSync(path.join(uploads, file.storageName)));
  assert.equal((await request('/api/test-files/private-note.html', 'teacher-a', { method: 'DELETE' })).status, 403);
  assert.equal((await request('/uploads/private-note.html', 'student-b')).status, 403);
  assert.equal((await request('/uploads/private-note.html', 'teacher-b')).status, 403);
  const note = await request('/uploads/private-note.html', 'student-a'); assert.equal(note.status, 200);
  assert.match(note.headers.get('content-security-policy'), /sandbox/);
  assert.match(note.headers.get('content-disposition'), /^attachment/);
  assert.equal(note.headers.get('x-content-type-options'), 'nosniff');
  const crossSite = await request('/api/test-files/' + file.storageName, 'teacher-a', { method: 'DELETE', headers: { Origin: 'https://untrusted.example' } });
  assert.equal(crossSite.status, 403);
  assert.equal((await request('/api/test-files/' + file.storageName, 'teacher-a', { method: 'DELETE', headers: { Origin: base } })).status, 200);
  assert.equal(fs.existsSync(path.join(uploads, file.storageName)), false);
  assert.equal((await request('/api/teachers', 'student-a')).status, 403);
  assert.equal((await request('/api/teachers', 'teacher-a')).status, 403);
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/rtc?_auth=fixture-teacher-a', { origin: 'https://untrusted.example' });
  ws.on('error', () => {});
  const rejected = await new Promise((resolve, reject) => { ws.once('unexpected-response', (_request, reply) => { reply.resume(); ws.terminate(); resolve(reply.statusCode); }); ws.once('open', () => { ws.terminate(); reject(new Error('Cross-site WebSocket accepted')); }); });
  assert.equal(rejected, 403);
});
