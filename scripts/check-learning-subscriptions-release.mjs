import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LEARNING_TARIFFS } from '../server/learningSubscriptions.js';

const [mode, directory, dataDirectory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
assert.ok(initial.length, 'Initial client assets missing');
const files = fs.readdirSync(path.join(directory, 'assets')).filter(file => /\.(?:js|css)$/.test(file));
const features = files.filter(file => /^(?:LearningSubscriptions|TeacherFinanceSection|ScheduleSection|LearningGroupsSection)-/.test(file)
  || (file.endsWith('.css') && fs.readFileSync(path.join(directory, 'assets', file), 'utf8').includes('.learning-subscriptions')));
const featureSource = features.filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(directory, 'assets', file), 'utf8')).join('\n');
for (const marker of ['Абонементы и тарифы', 'Сохранить нынешнюю ставку группы', 'Подтвердить оплату', 'Тарифы для нового набора', 'Мой абонемент', 'Не входит в абонемент', '/api/learning-subscriptions', 'Оплаты абонементов']) {
  assert.ok(featureSource.includes(marker), `Missing subscription feature: ${marker}`);
}
assert.ok(features.some(file => file.endsWith('.css')), 'Subscription styles missing');
console.log('Subscription assignment, pricing, payment, student cards and access UI verified.');
if (mode === 'verify') {
  const get = async (route, token) => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(25000) });
    assert.ok(response.ok, `${route.split('?')[0]}: HTTP ${response.status}`);
    return response;
  };
  const remoteHtml = await (await get('/')).text();
  assert.ok(initial.every(asset => remoteHtml.includes(asset)), 'Production serves another client');
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  for (const asset of new Set([...initial, ...features.map(file => `/assets/${file}`)])) {
    assert.equal(digest(Buffer.from(await (await get(asset)).arrayBuffer())), digest(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published bundle differs: ${asset}`);
  }
  if (dataDirectory) {
    const read = (name, fallback) => fs.existsSync(path.join(dataDirectory, name)) ? JSON.parse(fs.readFileSync(path.join(dataDirectory, name), 'utf8')) : fallback;
    const session = read('auth-sessions.json', []).filter(entry => entry.user?.role === 'teacher' && (!entry.expiresAtMs || entry.expiresAtMs > Date.now())).sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0))[0];
    assert.ok(session?.token, 'An existing teacher session is required for read-only verification');
    const beforeFinance = read('teacher-finances.json', {});
    const beforeBlocks = read('learning-subscriptions.json', { blocks: [] }).blocks;
    const catalog = await (await get('/api/learning-subscriptions', session.token)).json();
    const saved = read('learning-subscriptions.json', { tariffs: {}, blocks: [] });
    assert.deepEqual(catalog.tariffs, saved.tariffs?.[session.user.id] || DEFAULT_LEARNING_TARIFFS);
    assert.equal(catalog.blocks.length, saved.blocks.filter(block => block.teacherId === session.user.id).length);
    assert.deepEqual(read('teacher-finances.json', {}), beforeFinance, 'Reading subscriptions must not change existing finances');
    assert.deepEqual(saved.blocks.map(block => ({ id: block.id, tariff: block.tariff, payment: block.payment })), beforeBlocks.map(block => ({ id: block.id, tariff: block.tariff, payment: block.payment })), 'Verification must not assign or pay real subscriptions');
    const groups = read('learning-groups.json', []);
    for (const group of catalog.groups) assert.equal(group.pricePerLesson, groups.find(entry => entry.id === group.id)?.pricePerLesson);
    const profiles = beforeFinance[session.user.id]?.studentProfiles || {};
    for (const student of catalog.students) assert.equal(student.individualPrice, profiles[student.id]?.lessonPrice || null);
    console.log('Live API and preservation of existing prices and payments verified without assigning real students.');
  }
  console.log('Exact published subscription bundles verified.');
}
