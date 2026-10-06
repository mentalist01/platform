import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [mode, directory, dataDir] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const features = fs.readdirSync(path.join(directory, 'assets')).filter(file => /^TeacherFinanceSection-.*\.(js|css)$/.test(file));
const source = features.map(file => fs.readFileSync(path.join(directory, 'assets', file), 'utf8')).join('\n');
for (const marker of ['Автооплата', 'Скопировать тело запроса', '/api/teacher-payment-connection', '/api/payment-notifications', '.payment-connection']) assert.ok(source.includes(marker), `Missing payment UI: ${marker}`);
for (const marker of ['Поступления по уведомлениям', 'Оплачено занятий', 'Поиск по плательщику или ученику', 'По поиску за всю историю', 'Выгрузить CSV', '.payment-history__summary']) assert.ok(source.includes(marker), `Missing payment analytics: ${marker}`);
assert.ok(!initial.some(asset => features.some(file => asset.endsWith(file))), 'Finance must remain lazy');
console.log('Personal payment connection UI, history and lazy bundles verified.');
if (mode === 'verify') {
  assert.ok(dataDir, 'DATA_DIR required');
  const request = async (route, { token, body } = {}) => fetch(`https://ivan100.ru${route}`, {
    method: body ? 'POST' : 'GET', headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000),
  });
  const get = async (route, token) => { const res = await request(route, { token }); assert.ok(res.ok, `${route.split('?')[0]}: HTTP ${res.status}`); return res; };
  const remoteHtml = await (await get('/')).text();
  assert.ok(initial.every(asset => remoteHtml.includes(asset)), 'Production serves another client');
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  for (const asset of [...initial, ...features.map(file => `/assets/${file}`)]) assert.equal(digest(Buffer.from(await (await get(asset)).arrayBuffer())), digest(fs.readFileSync(path.join(directory, asset.slice(1)))), `Bundle differs: ${asset}`);
  assert.ok([401, 403].includes((await request('/api/teacher-payment-connection')).status));
  assert.equal((await request('/api/payment-notifications/tbank', { body: { secret: 'invalid-release-probe', test: true } })).status, 401);
  const read = (name, fallback) => fs.existsSync(path.join(dataDir, `${name}.json`)) ? JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8')) : fallback;
  const snapshot = () => JSON.stringify(['teacher-finances', 'teacher-calendar-marks', 'payment-notifications', 'teacher-subscriptions', 'teacher-payment-connections'].map(name => read(name, null)));
  const before = snapshot();
  const sessions = read('auth-sessions', []).filter(entry => !entry.expiresAtMs || entry.expiresAtMs > Date.now());
  const teachers = new Map();
  for (const session of sessions.filter(entry => entry.user?.role === 'teacher').sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0))) if (!teachers.has(session.user.id)) teachers.set(session.user.id, session);
  assert.ok(teachers.size, 'Existing teacher session required for read-only verification');
  for (const [id, session] of teachers) {
    const response = await get('/api/teacher-payment-connection', session.token);
    assert.ok(response.headers.get('Cache-Control')?.includes('no-store'));
    const { connection } = await response.json();
    assert.equal(connection.teacherId, id);
    const historyResponse = await get('/api/payment-notifications', session.token);
    assert.ok(historyResponse.headers.get('Cache-Control')?.includes('no-store'));
    const history = await historyResponse.json();
    assert.ok(Array.isArray(history.notifications));
    assert.equal(history.history?.scope, 'saved-notifications');
    assert.equal(history.history.total, history.notifications.length);
    const rawHistory = read('payment-notifications', {items:[]});
    const text = value => String(value || '').trim();
    const expectedIds = new Set((Array.isArray(rawHistory) ? rawHistory : rawHistory.items || []).filter(entry => text(entry?.id) && entry.paymentTarget !== 'teacher-platform' && (text(entry.receiverTeacherId) ? text(entry.receiverTeacherId) === id : text(entry.teacherId) === id)).map(entry => text(entry.id)));
    assert.deepEqual(new Set(history.notifications.map(entry => entry.id)), expectedIds, 'The complete owned journal must be served');
    const other = [...teachers.keys()].find(value => value !== id);
    if (other) assert.equal((await request(`/api/teacher-payment-connection?teacherId=${encodeURIComponent(other)}`, { token: session.token })).status, 403);
    if (connection.configured) {
      const probe = await request('/api/payment-notifications/tbank', { body: { secret: connection.secret, test: true } });
      assert.equal(probe.status, 200); assert.equal((await probe.json()).teacherId, id);
    }
  }
  const student = sessions.find(entry => entry.user?.role === 'student');
  if (student) assert.equal((await request('/api/teacher-payment-connection', { token: student.token })).status, 403);
  // Read PM2's effective environment privately; credentials never appear in output.
  const env = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 10_000_000 })).find(entry => entry.name === 'ege')?.pm2_env || {};
  const secret = env.MACRODROID_PAYMENT_SECRET || env.TBANK_PAYMENT_NOTIFICATION_SECRET || env.PAYMENT_NOTIFICATION_SECRET;
  const ownerId = env.PAYMENT_NOTIFICATION_TEACHER_ID || env.TBANK_PAYMENT_TEACHER_ID || env.SIGNUP_TEACHER_ID || env.DEFAULT_SIGNUP_TEACHER_ID;
  assert.ok(secret && ownerId, 'Pinned legacy recipient and existing secret required for migration');
  const ownerConnection = read('teacher-payment-connections', null);
  if (!ownerConnection || ownerConnection.legacy?.enabled) {
    const probe = await request('/api/payment-notifications/tbank', { body: { secret, test: true } });
    assert.equal(probe.status, 200, 'Old phone macro must keep working during migration');
    assert.equal((await probe.json()).teacherId, ownerId);
    assert.equal((await request('/api/payment-notifications/tbank', { body: { secret, teacherId: `${ownerId}-foreign`, test: true } })).status, 403);
  }
  assert.equal(snapshot(), before, 'Verification must not alter keys or financial data');
  console.log('Production bundles and teacher-scoped APIs verified; existing legacy macro is pinned, no keys or payments changed.');
}
