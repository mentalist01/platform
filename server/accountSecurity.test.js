import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAccountSecurity } from './accountSecurity.js';

const fixture = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'account-security-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let time = Date.now(); const mail = []; let broken = false;
  const options = { directory, now: () => time,
    verifyCredential: async (_auth, code) => code === 'own-code',
    mailerFactory: (config) => {
      assert.equal(config.secure, true); assert.equal(config.tls.rejectUnauthorized, true);
      return { verify: async () => {}, sendMail: async (message) => {
        if (broken) throw new Error('SMTP secret must not reach clients');
        mail.push(message); return { accepted: [message.to] };
      } };
    },
  };
  const security = createAccountSecurity(options);
  const req = (body = {}, token = 'browser-a', role = 'teacher') => ({
    auth: { id: role === 'admin' ? 'admin' : 'teacher', role }, authToken: token,
    headers: {}, ip: '127.0.0.1', body,
  });
  const configure = () => security.configureMail(req({ provider: 'gmail', email: 'sender@example.com', password: 'app-secret', accessCode: 'own-code' }, 'admin-session', 'admin'));
  const lastCode = () => mail.at(-1).text.match(/Ваш код: (\d{6})/)[1];
  const verify = (challenge, token = 'browser-a') => {
    const request = req({ challengeId: challenge.challengeId, code: lastCode() }, token);
    const result = security.verify(request);
    return { ...request, headers: { cookie: `ivan100_security=${result.secret}; ivan100_trusted=${result.trustSecret}` } };
  };
  const bind = async () => { await configure(); const challenge = await security.requestCode(req({ purpose: 'bind', email: 'private@example.com', accessCode: 'own-code' })); return verify(challenge); };
  return { security, directory, options, req, configure, mail, lastCode, verify, bind,
    tick: (ms = 61_000) => { time += ms; }, breakMail: () => { broken = true; } };
};

test('initial binding requires fresh login credential and email proof; all stored secrets are encrypted', async (t) => {
  const f = fixture(t); await f.configure();
  await assert.rejects(f.security.requestCode(f.req({ purpose: 'bind', email: 'private@example.com', accessCode: 'wrong' })), /Неверный код входа/);
  assert.equal(f.mail.length, 0);
  const challenge = await f.security.requestCode(f.req({ purpose: 'bind', email: 'private@example.com', accessCode: 'own-code' }));
  assert.equal(f.security.status(f.req()).emailLinked, false);
  assert.equal(f.security.status(f.req()).enrollmentRequired, true);
  assert.throws(() => f.security.requireProof(f.req()), /Подтвердите/);
  const verified = f.verify(challenge);
  assert.equal(f.security.status(verified).emailLinked, true);
  assert.equal(f.security.status(verified).enrollmentRequired, false);
  assert.doesNotThrow(() => f.security.requireProof(verified));
  const disk = fs.readFileSync(path.join(f.directory, 'accounts.json'), 'utf8');
  for (const value of ['private@example.com', 'sender@example.com', 'app-secret', f.lastCode(), 'browser-a']) assert.ok(!disk.includes(value));
  assert.ok(!JSON.stringify(f.security.status(verified)).includes('@'));
});

test('email proof authorizes only the current session beyond ten minutes; codes cannot be replayed', async (t) => {
  const f = fixture(t); await f.configure();
  const challenge = await f.security.requestCode(f.req({ purpose: 'bind', email: 'private@example.com', accessCode: 'own-code' }));
  assert.throws(() => f.verify(challenge, 'browser-b'), /недействителен/);
  const verified = f.verify(challenge);
  assert.throws(() => f.verify(challenge), /недействителен/);
  assert.doesNotThrow(() => f.security.requireProof(f.req()));
  assert.throws(() => f.security.requireProof({ ...verified, authToken: 'browser-b' }), /Подтвердите/);
  assert.throws(() => f.security.requireProof({ ...verified, auth: { id: 'someone-else', role: 'teacher' } }), /Подтвердите/);
  f.tick(10 * 60_000);
  assert.doesNotThrow(() => f.security.requireProof({ ...verified, headers: {} }));
  assert.equal(f.security.status(verified).sessionVerified, true);
});

test('resends replace old codes; expired and brute-forced codes fail', async (t) => {
  const f = fixture(t); await f.bind(); f.tick();
  const old = await f.security.requestCode(f.req({ purpose: 'manage' }));
  await assert.rejects(f.security.requestCode(f.req({ purpose: 'manage' })), /Слишком много/);
  f.tick(); const current = await f.security.requestCode(f.req({ purpose: 'manage' }));
  assert.throws(() => f.verify(old), /недействителен/);
  const bad = f.lastCode() === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.throws(() => f.security.verify(f.req({ challengeId: current.challengeId, code: bad })), /Неверный код/);
  assert.throws(() => f.verify(current), /недействителен/);
  f.tick(); const expired = await f.security.requestCode(f.req({ purpose: 'manage' }));
  f.tick(10 * 60_000); assert.throws(() => f.verify(expired), /недействителен/);
});

test('email change requires current email verification plus new email proof and invalidates previous grants', async (t) => {
  const f = fixture(t); const verified = await f.bind(); f.tick();
  f.security.associateSession(verified, verified.auth, 'second-verified-session');
  const otherSession = { ...verified, authToken: 'second-verified-session', headers: {} };
  assert.doesNotThrow(() => f.security.requireProof(otherSession));
  await assert.rejects(f.security.requestCode(f.req({ purpose: 'change', email: 'new@example.com' }, 'unconfirmed-session')), /Подтвердите/);
  await assert.rejects(f.security.requestCode(f.req({ purpose: 'bind', email: 'new@example.com', accessCode: 'own-code' })), /уже привязана/);
  const challenge = await f.security.requestCode({ ...verified, body: { purpose: 'change', email: 'new@example.com' } });
  assert.equal(f.mail.at(-1).to, 'new@example.com');
  const result = f.security.verify({ ...verified, body: { challengeId: challenge.challengeId, code: f.lastCode() } });
  assert.throws(() => f.security.requireProof(otherSession), /Подтвердите/);
  assert.doesNotThrow(() => f.security.requireProof({ ...verified, headers: { cookie: `ivan100_security=${result.secret}` } }));
  f.tick(); await f.security.requestCode(f.req({ purpose: 'manage', email: 'attacker@example.com' }));
  assert.equal(f.mail.at(-1).to, 'new@example.com');
});

test('restart preserves email verification for the session and limits; logout revokes it', async (t) => {
  const f = fixture(t); const verified = await f.bind();
  const restarted = createAccountSecurity(f.options);
  assert.equal(restarted.status(f.req()).emailLinked, true);
  assert.doesNotThrow(() => restarted.requireProof({ ...verified, headers: {} }));
  await assert.rejects(restarted.requestCode(f.req({ purpose: 'manage' })), /Слишком много/);
  f.security.revokeToken('browser-a');
  assert.throws(() => f.security.requireProof(verified), /Подтвердите/);
});

test('SMTP failure never grants access, exposes secrets or pretends delivery succeeded', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.security.requestCode(f.req({ purpose: 'bind' })), /ещё не настроена/);
  await f.configure(); f.breakMail();
  await assert.rejects(f.security.requestCode(f.req({ purpose: 'bind', email: 'private@example.com', accessCode: 'own-code' })), /Не удалось отправить/);
  assert.equal(f.security.status(f.req()).emailLinked, false);
  assert.equal(f.security.status(f.req()).verifiedUntil, 0);
  assert.equal(f.mail.length, 0);
});

test('only administrator can configure SMTP, and linked administrator must also confirm email', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.security.configureMail(f.req({})), /только администратору/);
  await f.configure();
  const request = f.req({ purpose: 'bind', email: 'admin@example.com', accessCode: 'own-code' }, 'admin-session', 'admin');
  const challenge = await f.security.requestCode(request);
  f.security.verify({ ...request, body: { challengeId: challenge.challengeId, code: f.lastCode() } });
  assert.doesNotThrow(() => f.security.requireProof(request));
  await assert.rejects(f.security.configureMail(f.req({ provider: 'gmail', email: 'sender@example.com', password: 'app-secret', accessCode: 'own-code' }, 'different-admin-session', 'admin')), /Подтвердите/);
});

test('teacher trust requires both confirmed browser and exact IP; students keep ordinary login', async (t) => {
  const f = fixture(t);
  assert.equal(f.security.needsLoginCode(f.req(), f.req().auth), false);
  const confirmed = await f.bind();
  assert.equal(f.security.needsLoginCode(f.req(), confirmed.auth), true);
  assert.equal(f.security.needsLoginCode(confirmed, confirmed.auth), false);
  assert.equal(f.security.needsLoginCode({ ...confirmed, ip: '192.0.2.1' }, confirmed.auth), true);
  assert.equal(f.security.needsLoginCode(f.req(), { id: 'teacher', role: 'student' }), false);
  const restarted = createAccountSecurity(f.options);
  assert.equal(restarted.needsLoginCode(confirmed, confirmed.auth), false);
  const disk = fs.readFileSync(path.join(f.directory, 'accounts.json'), 'utf8');
  assert.ok(!disk.includes('127.0.0.1'));
  assert.ok(!disk.includes(confirmed.headers.cookie.split('ivan100_trusted=')[1]));
  f.tick(30 * 24 * 60 * 60_000);
  assert.equal(f.security.needsLoginCode(confirmed, confirmed.auth), true);
});

test('login OTP binds browser and IP, is single use, and authorizes the newly created session', async (t) => {
  const f = fixture(t); await f.bind(); f.tick();
  const req = { headers: {}, ip: '192.0.2.2', body: {} };
  const challenge = await f.security.beginLogin(req, f.req().auth, 'credential-v1');
  const verifyReq = { ...req, headers: { cookie: `ivan100_login=${challenge.secret}` },
    body: { challengeId: challenge.challengeId, code: f.lastCode() } };
  const identity = () => ({ user: f.req().auth, credentialVersion: 'credential-v1' });
  await assert.rejects(f.security.verifyLogin({ ...verifyReq, headers: {} }, identity), /недействителен/);
  await assert.rejects(f.security.verifyLogin({ ...verifyReq, ip: '192.0.2.3' }, identity), /недействителен/);
  const result = await f.security.verifyLogin(verifyReq, identity);
  const signedIn = { ...f.req({}, 'new-session'), ip: req.ip, headers: { cookie: `ivan100_trusted=${result.trustSecret}` } };
  assert.equal(f.security.needsLoginCode(signedIn, result.user), false);
  assert.throws(() => f.security.requireProof(signedIn), /Подтвердите/);
  await assert.rejects(f.security.verifyLogin(verifyReq, identity), /недействителен/);
  f.security.associateSession(signedIn, result.user, 'new-session');
  assert.doesNotThrow(() => f.security.requireProof(signedIn));
  f.tick(11 * 60_000);
  assert.doesNotThrow(() => createAccountSecurity(f.options).requireProof({ ...signedIn, headers: {} }));
  f.security.revokeToken('new-session');
  assert.throws(() => f.security.requireProof(signedIn), /Подтвердите/);
  assert.equal(f.security.needsLoginCode(signedIn, result.user), true);
});

test('ordinary login inherits verification only from the confirmed browser and matching IP', async (t) => {
  const f = fixture(t); const confirmed = await f.bind();
  for (const [token, request] of [['missing-cookie', { ...confirmed, headers: {} }], ['wrong-ip', { ...confirmed, ip: '192.0.2.25' }]]) {
    f.security.associateSession(request, confirmed.auth, token);
    assert.throws(() => f.security.requireProof({ ...f.req({}, token), headers: {} }), /Подтвердите/);
  }
  f.security.associateSession(confirmed, confirmed.auth, 'trusted-login');
  assert.doesNotThrow(() => f.security.requireProof(f.req({}, 'trusted-login')));
});

test('old confirmed teacher sessions migrate once; explicit lock stays locked after restart', async (t) => {
  const f = fixture(t); const confirmed = await f.bind();
  const file = path.join(f.directory, 'accounts.json');
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete old.verifiedSessions;
  fs.writeFileSync(file, JSON.stringify(old));
  const migrated = createAccountSecurity(f.options);
  assert.doesNotThrow(() => migrated.requireProof({ ...confirmed, headers: {} }));
  migrated.lock(confirmed);
  assert.throws(() => createAccountSecurity(f.options).requireProof(confirmed), /Подтвердите/);
});

test('expired, brute-forced, and credential-changed login challenges cannot authorize', async (t) => {
  const f = fixture(t); await f.bind(); f.tick();
  const req = { headers: {}, ip: '192.0.2.4', body: {} };
  const pending = async () => {
    const c = await f.security.beginLogin(req, f.req().auth, 'v1');
    return { ...req, headers: { cookie: `ivan100_login=${c.secret}` }, body: { challengeId: c.challengeId, code: f.lastCode() } };
  };
  const identity = () => ({ user: f.req().auth, credentialVersion: 'v1' });
  const expired = await pending(); f.tick(10 * 60_000);
  await assert.rejects(f.security.verifyLogin(expired, identity), /недействителен/);
  const incorrect = await pending();
  const wrong = { ...incorrect, body: { ...incorrect.body, code: 'incorrect' } };
  for (let i = 0; i < 5; i++) await assert.rejects(f.security.verifyLogin(wrong, identity), /Неверный код/);
  await assert.rejects(f.security.verifyLogin(incorrect, identity), /недействителен/);
  f.tick(); const changed = await pending();
  await assert.rejects(f.security.verifyLogin(changed, () => ({ user: f.req().auth, credentialVersion: 'v2' })), /Аккаунт изменился/);
});

test('email change revokes trusted locations and pending login proofs', async (t) => {
  const f = fixture(t); const confirmed = await f.bind(); f.tick();
  const login = await f.security.beginLogin({ headers: {}, ip: '127.0.0.1' }, f.req().auth, 'v1');
  const code = f.lastCode(); f.tick();
  const change = await f.security.requestCode({ ...confirmed, body: { purpose: 'change', email: 'replacement@example.com' } });
  f.security.verify({ ...confirmed, body: { challengeId: change.challengeId, code: f.lastCode() } });
  await assert.rejects(f.security.verifyLogin({ headers: { cookie: `ivan100_login=${login.secret}` }, ip: '127.0.0.1',
    body: { challengeId: login.challengeId, code } }, () => ({ user: f.req().auth, credentialVersion: 'v1' })), /недействителен/);
});
