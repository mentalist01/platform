import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import WebSocket from 'ws';
import crypto from 'node:crypto';
import { createAccountSecurity } from './accountSecurity.js';

test('real routes require browser proof, isolate accounts and revoke live connections across restart', { timeout: 60_000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'security-platform-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const now = Date.now();
  const teacherCodeHash = 'scrypt$fixture-salt$' + crypto.scryptSync('123456', 'fixture-salt', 64).toString('base64');
  const unboundHash = 'scrypt$fixture-salt$' + crypto.scryptSync('654321', 'fixture-salt', 64).toString('base64');
  write('teachers', [{ id: 'teacher', name: 'Teacher', codeHash: teacherCodeHash, createdAt: new Date(now).toISOString() },
    { id: 'login-teacher', name: 'Email Teacher', codeHash: teacherCodeHash, createdAt: new Date(now).toISOString() },
    { id: 'unbound-teacher', name: 'Unbound Teacher', codeHash: unboundHash, createdAt: new Date(now).toISOString() }]);
  write('students', [{ id: 'student', name: 'Student', teacherId: 'teacher', code: '123457' }]);
  const identities = {
    main: { id: 'teacher', role: 'teacher', name: 'Teacher' },
    other: { id: 'teacher', role: 'teacher', name: 'Teacher' },
    third: { id: 'teacher', role: 'teacher', name: 'Teacher' },
    student: { id: 'student', role: 'student', name: 'Student', teacherId: 'former-teacher' },
    admin: { id: 'admin1', role: 'admin', name: 'Admin' },
  };
  write('auth-sessions', Object.entries(identities).map(([token, user]) => ({ token: `fixture-${token}`, user,
    createdAtMs: now, lastSeenAtMs: now, expiresAtMs: now + 3600_000,
    device: { type: token === 'other' ? 'mobile' : 'desktop', browser: 'Chrome', os: 'Test', label: 'Chrome · Test' }, ipAddress: '127.0.0.1',
  })));
  write('tests', {}); write('progress', {});
  // Generate real encrypted challenge fixtures with the production service.
  // Only SMTP delivery is replaced; the running platform has no test bypass.
  const delivered = [];
  const seeder = createAccountSecurity({ directory: path.join(data, 'account-security'),
    verifyCredential: async () => true,
    mailerFactory: () => ({ verify: async () => {}, sendMail: async (message) => { delivered.push(message); return { accepted: [message.to] }; } }),
  });
  const req = (name, body) => ({ auth: identities[name], authToken: `fixture-${name}`, headers: {}, ip: '127.0.0.1', body });
  await seeder.configureMail(req('admin', { provider: 'yandex', email: 'fixture@example.com', password: 'fixture-app-password', accessCode: 'fixture' }));
  const challenges = {};
  for (const name of ['main', 'student', 'admin']) {
    const challenge = await seeder.requestCode(req(name, { purpose: 'bind', email: `${name}@example.com`, accessCode: 'fixture' }));
    challenges[name] = { challengeId: challenge.challengeId, code: delivered.at(-1).text.match(/Ваш код: (\d{6})/)[1] };
  }
  const loginAuth = { id: 'login-teacher', role: 'teacher' };
  const loginBind = { auth: loginAuth, authToken: 'login-binding-fixture', headers: {}, ip: '127.0.0.1',
    body: { purpose: 'bind', email: 'login@example.com', accessCode: 'fixture' } };
  const bind = await seeder.requestCode(loginBind);
  seeder.verify({ ...loginBind, body: { challengeId: bind.challengeId, code: delivered.at(-1).text.match(/Ваш код: (\d{6})/)[1] } });
  const pendingLogin = await seeder.beginLogin({ headers: {}, ip: '127.0.0.1' }, loginAuth,
    crypto.createHash('sha256').update(teacherCodeHash).digest('hex'));
  const loginCode = delivered.at(-1).text.match(/Ваш код: (\d{6})/)[1];
  const reserve = net.createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child; let logs = ''; const sockets = [];
  const stop = async () => { if (child?.exitCode === null) { child.kill(); await once(child, 'exit'); } };
  t.after(async () => { for (const socket of sockets) socket.terminate(); await stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(import.meta.dirname, '..'), windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: data,
        PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_COLLAB_DIR: path.join(root, 'collab'),
        PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', AUTH_COOKIE_SECURE: 'false',
        AUTH_COOKIE_SAME_SITE: 'Strict', DISABLE_STARTUP_XP_REBALANCE: '1', ADMIN_CODE: 'fixture-admin' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (b) => { logs += b; }); child.stderr.on('data', (b) => { logs += b; });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      assert.equal(child.exitCode, null, logs);
      try { if ((await fetch(`${base}/api/client-build-version`)).ok) return; } catch { /* starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Fixture startup timeout: ${logs}`);
  };
  const cookies = {};
  const request = async (route, { actor = 'main', token, method = 'GET', body, expected = 200, cookie, header = true } = {}) => {
    const response = await fetch(`${base}/api${route}`, { method,
      headers: { Authorization: `Bearer ${token || `fixture-${actor}`}`, 'Content-Type': 'application/json',
        ...(header ? { 'X-Security-Action': '1' } : {}), Cookie: cookie ?? cookies[actor] ?? '' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
    const result = await response.json(); assert.equal(response.status, expected, `${route}: ${JSON.stringify(result)}`);
    for (const setCookie of response.headers.getSetCookie().filter((value) => /^ivan100_(security|trusted)=/.test(value))) {
      const pair = setCookie.split(';')[0]; const name = pair.split('=')[0];
      const existing = (cookies[actor] || '').split('; ').filter((entry) => entry && !entry.startsWith(name + '='));
      cookies[actor] = [...existing, pair].join('; '); assert.match(setCookie, /HttpOnly/i);
    }
    return result;
  };
  await start();
  for (const actor of ['main', 'student', 'admin']) {
    await request('/auth/sessions', { actor, expected: 403 });
    await request('/auth/sessions/others', { actor, method: 'DELETE', expected: 403 });
    const result = await request('/auth/security/verify', { actor, method: 'POST', body: challenges[actor] });
    assert.equal(result.emailLinked, true); assert.ok(result.verifiedUntil > now);
    assert.ok(!JSON.stringify(result).includes('@'));
  }
  await request('/auth/security/verify', { method: 'POST', body: challenges.main, expected: 400 });
  await request('/auth/sessions', { cookie: '' });
  await request('/auth/sessions', { header: false, expected: 403 });
  await request('/auth/sessions', { actor: 'other', cookie: cookies.main, expected: 403 });
  const list = await request('/auth/sessions?scope=all');
  assert.equal(list.scope, 'self'); assert.equal(list.sessions.length, 3);
  assert.equal(list.sessions.filter((s) => s.current).length, 1);
  assert.ok(list.sessions.every((s) => !s.token && s.ipAddress === '127.0.*.*'));
  const allAccounts = await request('/auth/sessions?scope=all', { actor: 'admin' });
  assert.equal(allAccounts.sessions.length, 5);
  assert.deepEqual(allAccounts.sessions.find((s) => s.user.role === 'student').user.teacher, { id: 'teacher', name: 'Teacher' });
  const teacherSessions = await request('/auth/sessions?scope=teachers', { actor: 'admin' });
  assert.equal(teacherSessions.scope, 'teachers'); assert.equal(teacherSessions.sessions.length, 3);
  assert.ok(teacherSessions.sessions.every((s) => s.user.role === 'teacher'));
  const pupilSessions = await request('/auth/sessions?scope=students', { actor: 'admin' });
  assert.equal(pupilSessions.scope, 'students'); assert.equal(pupilSessions.sessions.length, 1);
  assert.equal(pupilSessions.sessions[0].user.role, 'student');
  assert.deepEqual(pupilSessions.sessions[0].user.teacher, { id: 'teacher', name: 'Teacher' }, 'Use the current teacher, not the stale login snapshot');
  assert.equal((await request('/auth/sessions?scope=students&q=Teacher', { actor: 'admin' })).sessions.length, 1);
  assert.equal((await request('/auth/sessions?scope=students&q=former-teacher', { actor: 'admin' })).sessions.length, 0);
  assert.equal((await request('/auth/sessions?scope=teachers&q=Student', { actor: 'admin' })).sessions.length, 0);
  assert.equal((await request('/auth/sessions?scope=self', { actor: 'admin' })).sessions.length, 1);
  for (const scope of ['teachers', 'students']) {
    const restricted = await request(`/auth/sessions?scope=${scope}`);
    assert.equal(restricted.scope, 'self');
    assert.ok(restricted.sessions.every((s) => s.user.id === 'teacher' && !('teacher' in s.user)));
  }
  const studentList = await request('/auth/sessions', { actor: 'student' });
  assert.ok(!('teacher' in studentList.sessions[0].user), 'Teacher metadata is provided only in administrator account lists');
  const restrictedStudent = await request('/auth/sessions?scope=teachers', { actor: 'student' });
  assert.equal(restrictedStudent.scope, 'self'); assert.equal(restrictedStudent.sessions.length, 1);
  assert.equal(restrictedStudent.sessions[0].user.id, 'student');
  await request(`/auth/sessions/${studentList.sessions[0].id}`, { method: 'DELETE', expected: 403 });
  await request(`/auth/sessions/${list.sessions.find((s) => s.current).id}`, { method: 'DELETE', expected: 409 });
  const otherSession = list.sessions.find((s) => s.id === crypto.createHash('sha256').update('fixture-other').digest('hex').slice(0, 24));
  for (const route of ['/rtc', '/notifications', '/collab/board-teacher-student']) {
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}${route}?_auth=fixture-other`);
    sockets.push(ws); await once(ws, 'open');
  }
  const closed = Promise.all(sockets.map((ws) => once(ws, 'close')));
  await request(`/auth/sessions/${otherSession.id}`, { method: 'DELETE' });
  await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Revoked WebSockets stayed connected')), 3000); timer.unref(); })]);
  await request('/session', { actor: 'other', expected: 401 });
  await request('/session');
  assert.equal((await request('/auth/sessions/others', { method: 'DELETE' })).removed, 1);
  await request('/session', { actor: 'third', expected: 401 });
  await request('/session', { actor: 'student' });
  // Untrusted browsers cannot use the old primary-code-only login endpoint.
  await request('/login', { actor: 'anonymous', method: 'POST', body: { code: '123456' }, header: false, expected: 403 });
  const trustedLogin = await request('/login', { method: 'POST', body: { code: '123456' } });
  assert.equal(trustedLogin.role, 'teacher'); assert.ok(trustedLogin.token);
  await request('/auth/sessions', { token: trustedLogin.token, cookie: '' });
  const studentLogin = await request('/login', { actor: 'anonymous', method: 'POST', body: { code: '123457' } });
  assert.equal(studentLogin.role, 'student'); assert.ok(studentLogin.token);
  const unboundLogin = await request('/login', { actor: 'anonymous', method: 'POST', body: { code: '654321' } });
  const unboundRequest = (route) => fetch(base + '/api' + route, { headers: { Authorization: 'Bearer ' + unboundLogin.token, 'X-Security-Action': '1' } });
  assert.equal((await unboundRequest('/students')).status, 403);
  assert.equal((await unboundRequest('/auth/security')).status, 200);
  assert.equal((await (await unboundRequest('/auth/security')).json()).enrollmentRequired, true);
  assert.equal((await unboundRequest('/session')).status, 200);
  const body = { challengeId: pendingLogin.challengeId, code: loginCode };
  await request('/login/email/verify', { actor: 'anonymous', method: 'POST', body, expected: 400 });
  const emailLogin = await request('/login/email/verify', { actor: 'anonymous', method: 'POST', body,
    cookie: `ivan100_login=${pendingLogin.secret}` });
  assert.equal(emailLogin.id, 'login-teacher'); assert.ok(emailLogin.token);
  assert.ok(!JSON.stringify(emailLogin).includes('@'));
  await request('/auth/sessions', { token: emailLogin.token, cookie: '' });
  assert.equal((await request('/auth/security', { token: emailLogin.token, cookie: '' })).sessionVerified, true);
  await request('/auth/sessions', { actor: 'anonymous', cookie: cookies.anonymous, expected: 401 });
  await request('/login/email/verify', { actor: 'anonymous', method: 'POST', body,
    cookie: `ivan100_login=${pendingLogin.secret}`, expected: 400 });
  const stored = fs.readFileSync(path.join(data, 'account-security', 'accounts.json'), 'utf8');
  assert.ok(!stored.includes('@example.com')); assert.ok(!stored.includes('fixture-app-password'));
  await stop(); await start();
  assert.equal((await unboundRequest('/students')).status, 403, 'Mandatory enrollment must survive restart');
  await request('/session', { actor: 'other', expected: 401 });
  await request('/session', { actor: 'third', expected: 401 });
  await request('/session');
  await request('/auth/sessions', { cookie: '' });
  await request('/auth/sessions', { token: emailLogin.token, cookie: '' });
  const status = await request('/auth/security'); assert.equal(status.emailLinked, true); assert.equal(status.verifiedUntil, 0); assert.equal(status.sessionVerified, true);
  await request('/logout', { token: emailLogin.token, method: 'POST', cookie: '' });
  await request('/auth/sessions', { token: emailLogin.token, cookie: cookies.anonymous, expected: 401 });

  // Real logout routes must retain the browser/IP confirmation for the next
  // login, while invalidating every old session and its management authority.
  let repeatLogin = trustedLogin;
  for (let i = 0; i < 3; i++) {
    await request('/logout', { token: repeatLogin.token, method: 'POST' });
    await request('/session', { token: repeatLogin.token, expected: 401 });
    await request('/auth/sessions', { token: repeatLogin.token, expected: 401 });
    if (i === 1) { await stop(); await start(); }
    repeatLogin = await request('/login', { actor: 'main', method: 'POST', body: { code: '123456' } });
    assert.equal(repeatLogin.id, 'teacher');
    assert.ok(repeatLogin.token); assert.equal(repeatLogin.emailVerificationRequired, undefined);
    await request('/auth/sessions', { token: repeatLogin.token, cookie: '' });
  }
  await request('/login', { actor: 'anonymous', cookie: '', method: 'POST', body: { code: '123456' }, header: false, expected: 403 });
  const repeatSessionId = crypto.createHash('sha256').update(repeatLogin.token).digest('hex').slice(0, 24);
  await request(`/auth/sessions/${repeatSessionId}`, { method: 'DELETE' });
  await request('/session', { token: repeatLogin.token, expected: 401 });
  assert.equal((await request('/auth/security')).trustedHere, false);
  await request('/login', { cookie: cookies.main, method: 'POST', body: { code: '123456' }, header: false, expected: 403 });
});
