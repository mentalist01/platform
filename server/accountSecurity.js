import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

const CODE_TTL = 10 * 60_000;
const GRANT_TTL = 10 * 60_000;
const COOKIE = 'ivan100_security';
const TRUST_COOKIE = 'ivan100_trusted';
const LOGIN_COOKIE = 'ivan100_login';
const TRUST_TTL = 30 * 24 * 60 * 60_000;
const accountKey = (auth) => `${auth.role}:${auth.id}`;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const normalizeEmail = (value) => {
  const email = String(value || '').trim();
  if (email.length > 254 || !/^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(email)) {
    fail(400, 'Введите корректный адрес почты.');
  }
  return email;
};
const secureEqual = (left, right) => {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export function createAccountSecurity({ directory, verifyCredential, now = Date.now, mailerFactory = nodemailer.createTransport }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = path.join(directory, 'encryption.key');
  if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 });
  const key = fs.readFileSync(keyPath);
  if (key.length !== 32) throw new Error('Invalid account security encryption key');
  const statePath = path.join(directory, 'accounts.json');
  let state = { accounts: {}, challenges: {}, limits: {}, smtp: null };
  if (fs.existsSync(statePath)) state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.trusted ||= {};
  state.loginChallenges ||= {};
  const grants = new Map(); // Never persist temporary browser verification.
  const inflight = new Set();
  const save = () => {
    const temp = `${statePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temp, statePath);
  };
  // Migrate existing email-confirmed teacher sessions once, without regranting
  // access after an explicit lock or logout.
  if (!state.verifiedSessions) {
    state.verifiedSessions = {};
    for (const entry of Object.values(state.trusted)) {
      if (entry.expiresAt <= now() || entry.revision !== state.accounts[entry.account]?.revision) continue;
      for (const session of entry.sessions || []) {
        state.verifiedSessions[session] = { account: entry.account, revision: entry.revision };
      }
    }
    save();
  }
  const encrypt = (text, context) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  };
  const decrypt = (text, context) => {
    const data = Buffer.from(text, 'base64');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
  };
  const sessionKey = (req) => hash(String(req.authToken || ''));
  const cookieValue = (req, name = COOKIE) => String(req.headers?.cookie || '').split(';')
    .map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || '';
  // Use Express's configured proxy boundary, never the first untrusted XFF item.
  const ipKey = (req) => crypto.createHmac('sha256', key).update(String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '')).digest('hex');
  const trustId = (req, auth, secret = cookieValue(req, TRUST_COOKIE)) =>
    secret ? hash(`${accountKey(auth)}:${secret}:${ipKey(req)}`) : '';
  const trusted = (req, auth) => {
    const entry = state.trusted[trustId(req, auth)];
    return Boolean(entry && entry.expiresAt > now() && entry.revision === state.accounts[accountKey(auth)]?.revision);
  };
  const remember = (req, auth) => {
    if (auth.role !== 'teacher' || !state.accounts[accountKey(auth)]) return '';
    const secret = cookieValue(req, TRUST_COOKIE) || crypto.randomBytes(32).toString('hex');
    const account = accountKey(auth);
    const previousSessions = state.trusted[trustId(req, auth, secret)]?.sessions || [];
    const entries = Object.entries(state.trusted).filter(([, value]) => value.account === account).sort((a, b) => b[1].createdAt - a[1].createdAt);
    for (const [id] of entries.slice(19)) delete state.trusted[id];
    state.trusted[trustId(req, auth, secret)] = { account, revision: state.accounts[account].revision,
      createdAt: now(), expiresAt: now() + TRUST_TTL,
      sessions: [...new Set([...previousSessions, ...(req.authToken ? [sessionKey(req)] : [])])] };
    save(); return secret;
  };
  const associateSession = (req, auth, token, secret) => {
    const entry = state.trusted[trustId(req, auth, secret)];
    if (entry && entry.expiresAt > now() && entry.revision === state.accounts[accountKey(auth)]?.revision) {
      state.verifiedSessions[hash(token)] = { account: accountKey(auth), revision: entry.revision };
      entry.sessions = [...new Set([...(entry.sessions || []), hash(token)])]; save();
    }
  };
  // Main authentication middleware remains authoritative for session expiry.
  const grantVerifiedSession = (auth, token) => {
    const account = auth?.id && accountKey(auth);
    const revision = state.accounts[account]?.revision;
    if (!revision || !token) throw new Error('An email-verified account and session are required');
    state.verifiedSessions[hash(token)] = { account, revision }; save();
    const secret = crypto.randomBytes(32).toString('hex');
    const grant = { session: hash(token), account, expiresAt: now() + GRANT_TTL };
    grants.set(hash(secret), grant);
    return { secret, verifiedUntil: grant.expiresAt };
  };
  const sessionVerified = (req) => {
    const entry = state.verifiedSessions[sessionKey(req)];
    return Boolean(req.authToken && entry && entry.account === accountKey(req.auth)
      && entry.revision === state.accounts[entry.account]?.revision);
  };
  const proof = (req) => {
    const grant = grants.get(hash(cookieValue(req)));
    return grant?.session === sessionKey(req) && grant?.account === accountKey(req.auth)
      && grant?.expiresAt > now() ? grant : null;
  };
  const sweep = () => {
    for (const [id, value] of grants) if (value.expiresAt <= now()) grants.delete(id);
    for (const [id, value] of Object.entries(state.challenges)) if (value.expiresAt <= now()) delete state.challenges[id];
    for (const [id, value] of Object.entries(state.limits)) if (value.until <= now()) delete state.limits[id];
    for (const [id, value] of Object.entries(state.trusted)) if (value.expiresAt <= now()) delete state.trusted[id];
    for (const [id, value] of Object.entries(state.loginChallenges)) if (value.expiresAt <= now()) delete state.loginChallenges[id];
  };
  const rate = (name, limit, windowMs) => {
    const id = hash(name); const current = state.limits[id];
    const entry = current?.until > now() ? current : { count: 0, until: now() + windowMs };
    if (entry.count >= limit) fail(429, 'Слишком много попыток. Подождите и попробуйте снова.');
    entry.count++; state.limits[id] = entry; save();
  };
  const credential = async (req) => {
    rate(`credential:${accountKey(req.auth)}`, 8, 15 * 60_000);
    const code = String(req.body?.accessCode || '');
    if (!code || code.length > 200 || !await verifyCredential(req.auth, code)) fail(403, 'Неверный код входа в аккаунт.');
  };
  const mailer = (config) => mailerFactory({
    host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: true, tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  const requireProof = (req) => { if (!sessionVerified(req) && !proof(req)) fail(403, 'Подтвердите этот вход кодом из письма.'); };
  const enrollmentRequired = (auth) => auth?.role === 'teacher' && Boolean(state.smtp) && !state.accounts[accountKey(auth)];
  const status = (req) => ({
    emailLinked: Boolean(state.accounts[accountKey(req.auth)]),
    mailConfigured: Boolean(state.smtp),
    verifiedUntil: proof(req)?.expiresAt || 0,
    sessionVerified: sessionVerified(req),
    trustedHere: req.auth.role === 'teacher' && trusted(req, req.auth),
    enrollmentRequired: enrollmentRequired(req.auth),
  });
  const withLock = async (id, fn) => {
    if (inflight.has(id)) fail(429, 'Предыдущий запрос ещё выполняется.');
    inflight.add(id);
    try { return await fn(); } finally { inflight.delete(id); }
  };
  const configureMail = async (req) => withLock('smtp', async () => {
    if (req.auth.role !== 'admin') fail(403, 'Настройка доступна только администратору.');
    await credential(req);
    if (state.accounts[accountKey(req.auth)]) requireProof(req);
    const hosts = { yandex: 'smtp.yandex.ru', mailru: 'smtp.mail.ru', gmail: 'smtp.gmail.com' };
    const host = hosts[req.body?.provider];
    if (!host) fail(400, 'Выберите почтовый сервис.');
    const user = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!password || password.length > 500) fail(400, 'Введите пароль приложения почты.');
    const config = { host, port: 465, user, password };
    const transport = mailer(config);
    try { await transport.verify(); }
    catch { fail(503, 'Не удалось подключиться к почте. Проверьте адрес, пароль приложения и доступ SMTP.'); }
    finally { transport.close?.(); }
    state.smtp = encrypt(JSON.stringify(config), 'smtp'); save();
    return { ok: true, ...status(req) };
  });
  const sendCode = async (email, code, purpose) => {
    if (!state.smtp) fail(503, 'Отправка писем ещё не настроена администратором.');
    const config = JSON.parse(decrypt(state.smtp, 'smtp'));
    const transport = mailer(config);
    const action = purpose === 'login' ? 'Вход преподавателя с нового устройства или сети'
      : purpose === 'manage' ? 'Управление сессиями' : 'Подтверждение почты';
    try {
      const result = await transport.sendMail({
        from: { name: 'Иван на сотку', address: config.user }, to: email,
        subject: `${action} — код подтверждения`,
        text: `Ваш код: ${code}\n\n${action} на ivan100.ru. Код действует 10 минут и только в браузере, где вы его запросили. Никому не сообщайте код. Если вы не запрашивали его, проигнорируйте письмо.`,
      });
      if (!result.accepted?.length) fail(503, 'Почтовый сервер не принял письмо.');
    } catch { fail(503, 'Не удалось отправить письмо. Попробуйте позже или обратитесь к администратору.'); }
    finally { transport.close?.(); }
  };
  const needsLoginCode = (req, auth) => auth.role === 'teacher' && Boolean(state.accounts[accountKey(auth)]) && !trusted(req, auth);
  // Called only after the ordinary login code has been checked. No auth session
  // exists until this separate, browser-bound email challenge is consumed.
  const beginLogin = async (req, auth, credentialVersion) => withLock(`login:${accountKey(auth)}`, async () => {
    sweep();
    const account = accountKey(auth); const existing = state.accounts[account];
    if (auth.role !== 'teacher' || !existing) fail(400, 'Подтверждение входа не требуется.');
    rate(`login-cooldown:${account}`, 1, 60_000);
    rate(`send-account:${account}`, 5, 60 * 60_000);
    rate(`login-send-ip:${ipKey(req)}`, 20, 60 * 60_000);
    const id = crypto.randomUUID(); const secret = crypto.randomBytes(32).toString('hex');
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const nonce = hash(secret);
    const challenge = { id, account, userId: auth.id, credentialVersion, revision: existing.revision,
      nonce, ip: ipKey(req), attempts: 0, expiresAt: now() + CODE_TTL,
      digest: crypto.createHmac('sha256', key).update(`${id}:${nonce}:${code}`).digest('hex') };
    delete state.loginChallenges[account]; save();
    await sendCode(decrypt(existing.email, account), code, 'login');
    if (state.accounts[account]?.revision !== existing.revision) fail(409, 'Настройки изменились. Повторите вход.');
    state.loginChallenges[account] = challenge; save();
    return { secret, challengeId: id, expiresAt: challenge.expiresAt };
  });
  const verifyLogin = async (req, resolveIdentity) => withLock('verify-login:' + String(req.body?.challengeId || ''), async () => {
    sweep(); rate(`login-verify-ip:${ipKey(req)}`, 30, 15 * 60_000);
    const challenge = Object.values(state.loginChallenges).find((entry) => entry.id === req.body?.challengeId);
    if (!challenge || challenge.ip !== ipKey(req) || !secureEqual(challenge.nonce, hash(cookieValue(req, LOGIN_COOKIE)))) {
      fail(400, 'Код недействителен или истёк. Начните вход заново в этом браузере.');
    }
    challenge.attempts++; save();
    const digest = crypto.createHmac('sha256', key).update(`${challenge.id}:${challenge.nonce}:${String(req.body?.code || '')}`).digest('hex');
    if (!secureEqual(digest, challenge.digest)) {
      if (challenge.attempts >= 5) { delete state.loginChallenges[challenge.account]; save(); }
      fail(400, 'Неверный код. После пяти ошибок потребуется новый.');
    }
    const identity = await resolveIdentity(challenge.userId);
    if (!identity || identity.user.role !== 'teacher' || identity.user.id !== challenge.userId
      || identity.credentialVersion !== challenge.credentialVersion
      || state.accounts[challenge.account]?.revision !== challenge.revision
      || state.loginChallenges[challenge.account]?.id !== challenge.id) {
      delete state.loginChallenges[challenge.account]; save();
      fail(409, 'Аккаунт изменился. Начните вход заново.');
    }
    delete state.loginChallenges[challenge.account]; save();
    return { user: identity.user, trustSecret: remember({ ...req, authToken: '' }, identity.user) };
  });
  const requestCode = async (req) => withLock(accountKey(req.auth), async () => {
    sweep();
    const account = accountKey(req.auth);
    const existing = state.accounts[account];
    const purpose = String(req.body?.purpose || 'manage');
    if (!['bind', 'manage', 'change'].includes(purpose)) fail(400, 'Некорректное действие.');
    if (!state.smtp) fail(503, 'Отправка писем ещё не настроена администратором.');
    if (purpose === 'bind' && existing) fail(409, 'Почта уже привязана. Сначала подтвердите доступ к ней.');
    if (purpose === 'manage' && !existing) fail(409, 'Сначала привяжите почту.');
    if (purpose === 'change') { requireProof(req); if (!existing) fail(409, 'Сначала привяжите почту.'); }
    if (purpose === 'bind') await credential(req);
    const email = purpose === 'manage' ? decrypt(existing.email, account) : normalizeEmail(req.body?.email);
    rate(`send-cooldown:${account}`, 1, 60_000);
    rate(`send-account:${account}`, 5, 60 * 60_000);
    rate(`send-ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`, 20, 60 * 60_000);
    const id = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const session = sessionKey(req);
    const digest = crypto.createHmac('sha256', key).update(`${id}:${session}:${code}`).digest('hex');
    const challenge = { id, account, session, purpose, digest, attempts: 0, expiresAt: now() + CODE_TTL,
      email: encrypt(email, account), revision: existing?.revision || '' };
    // New requests replace the old code, including requests in other browsers.
    delete state.challenges[account]; save();
    await sendCode(email, code, purpose);
    // Auth can be revoked while SMTP is awaiting a response; verification still
    // passes the main authentication middleware before using this challenge.
    state.challenges[account] = challenge; save();
    return { challengeId: id, expiresAt: challenge.expiresAt, retryAt: now() + 60_000 };
  });
  const verify = (req) => {
    sweep();
    const account = accountKey(req.auth);
    rate(`verify:${account}`, 15, 15 * 60_000);
    const challenge = state.challenges[account];
    if (!challenge || challenge.id !== req.body?.challengeId || challenge.session !== sessionKey(req)) fail(400, 'Код недействителен или истёк. Запросите новый в этом браузере.');
    challenge.attempts++; save();
    const digest = crypto.createHmac('sha256', key).update(`${challenge.id}:${challenge.session}:${String(req.body?.code || '')}`).digest('hex');
    if (!secureEqual(digest, challenge.digest)) {
      if (challenge.attempts >= 5) { delete state.challenges[account]; save(); }
      fail(400, 'Неверный код. После пяти ошибок потребуется новый.');
    }
    const current = state.accounts[account];
    if ((current?.revision || '') !== challenge.revision) fail(409, 'Настройки изменились. Запросите новый код.');
    if (challenge.purpose === 'change') requireProof(req);
    if (challenge.purpose !== 'manage') {
      state.accounts[account] = { email: challenge.email, revision: crypto.randomUUID(), verifiedAt: now() };
      for (const [id, grant] of grants) if (grant.account === account) grants.delete(id);
      for (const [id, entry] of Object.entries(state.verifiedSessions)) if (entry.account === account) delete state.verifiedSessions[id];
      for (const [id, entry] of Object.entries(state.trusted)) if (entry.account === account) delete state.trusted[id];
      delete state.loginChallenges[account];
    }
    delete state.challenges[account]; save();
    return { ...grantVerifiedSession(req.auth, req.authToken), trustSecret: remember(req, req.auth) };
  };
  const revokeToken = (token, { forgetBrowser = true } = {}) => {
    const session = hash(token);
    for (const [id, grant] of grants) if (grant.session === session) grants.delete(id);
    let changed = false;
    if (state.verifiedSessions[session]) { delete state.verifiedSessions[session]; changed = true; }
    for (const [id, challenge] of Object.entries(state.challenges)) if (challenge.session === session) { delete state.challenges[id]; changed = true; }
    for (const [id, entry] of Object.entries(state.trusted)) {
      if (!entry.sessions?.includes(session)) continue;
      // Signing out (or expiring a session) removes that session's authority,
      // not the browser/IP confirmation. Explicit remote revocation forgets it.
      if (forgetBrowser) delete state.trusted[id];
      else entry.sessions = entry.sessions.filter((value) => value !== session);
      changed = true;
    }
    if (changed) save();
  };
  const lock = (req) => {
    grants.delete(hash(cookieValue(req)));
    delete state.verifiedSessions[sessionKey(req)]; save();
  };
  return { status, configureMail, requestCode, verify, requireProof, revokeToken, lock,
    needsLoginCode, beginLogin, verifyLogin, associateSession, enrollmentRequired };
}

const cookieOptions = ({ secureCookies = true, sameSite = 'strict' } = {}) => ({ httpOnly: true, secure: secureCookies, sameSite });
export const setSecurityProofCookie = (res, secret, options) => {
  res.cookie(COOKIE, secret, { ...cookieOptions(options), path: '/api/auth', maxAge: GRANT_TTL });
};
export const setTrustedBrowserCookie = (res, secret, options) => {
  if (secret) res.cookie(TRUST_COOKIE, secret, { ...cookieOptions(options), path: '/api', maxAge: TRUST_TTL });
};
export const setLoginChallengeCookie = (res, secret, options) => {
  if (secret) res.cookie(LOGIN_COOKIE, secret, { ...cookieOptions(options), path: '/api/login', maxAge: CODE_TTL });
  else res.clearCookie(LOGIN_COOKIE, { ...cookieOptions(options), path: '/api/login' });
};

export function registerAccountSecurityRoutes(app, security, { secureCookies = true, sameSite = 'strict' } = {}) {
  const handle = (fn) => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { await fn(req, res); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Не удалось выполнить действие безопасности.' }); }
  };
  // Sensitive operations require a custom header. Cross-site forms cannot
  // submit it, including when the main session cookie uses SameSite=None.
  app.use('/api/auth', (req, res, next) => {
    if ((req.path.startsWith('/security') || req.path.startsWith('/sessions'))
      && req.headers['x-security-action'] !== '1') return res.status(403).json({ error: 'Откройте настройки безопасности на платформе.' });
    return next();
  });
  app.get('/api/auth/security', handle((req, res) => res.json(security.status(req))));
  app.post('/api/auth/security/mail', handle(async (req, res) => res.json(await security.configureMail(req))));
  app.post('/api/auth/security/code', handle(async (req, res) => res.json(await security.requestCode(req))));
  app.post('/api/auth/security/verify', handle((req, res) => {
    const { secret, verifiedUntil, trustSecret } = security.verify(req);
    setSecurityProofCookie(res, secret, { secureCookies, sameSite });
    setTrustedBrowserCookie(res, trustSecret, { secureCookies, sameSite });
    res.json({ ...security.status(req), verifiedUntil, trustedHere: Boolean(trustSecret) });
  }));
  app.post('/api/auth/security/lock', handle((req, res) => {
    security.lock(req);
    res.clearCookie(COOKIE, { httpOnly: true, secure: secureCookies, sameSite, path: '/api/auth' });
    res.json({ ok: true });
  }));
  app.use('/api/auth/sessions', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try { security.requireProof(req); return next(); }
    catch (error) { return res.status(error.status || 403).json({ error: error.message, code: 'SECURITY_VERIFICATION_REQUIRED' }); }
  });
}
