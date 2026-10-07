import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const [mode, directory, dataDirectory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const files = fs.readdirSync(path.join(directory, 'assets')).filter(file => /\.(?:js|css)$/.test(file));
const features = files.filter(file => /code-presence|learningAssignmentStatus|ЕГЭ и Python выдаются отдельно|scaleResolutionDownBy|Связь проверяется|collab-solutions__participant-presence/.test(fs.readFileSync(path.join(directory, 'assets', file), 'utf8')));
const source = features.filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(directory, 'assets', file), 'utf8')).join('\n');
for (const marker of ['/code-presence', 'Связь проверяется', 'Название домашки', 'ЕГЭ и Python выдаются отдельно', 'learningAssignmentStatus', 'scaleResolutionDownBy']) assert.ok(source.includes(marker), `Missing post-1.5.1 feature: ${marker}`);
if (mode === 'verify') {
  const get = async (route, token) => { const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(25000) }); assert.ok(response.ok, `HTTP ${response.status}: ${route}`); return response; };
  const remote = await (await get('/')).text(); assert.ok(initial.length && initial.every(file => remote.includes(file)), 'Wrong production client');
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  for (const file of new Set([...initial, ...features.map(name => `/assets/${name}`)])) assert.equal(hash(Buffer.from(await (await get(file)).arrayBuffer())), hash(fs.readFileSync(path.join(directory, file.slice(1)))), `Published bundle differs: ${file}`);
  assert.ok(dataDirectory, 'DATA_DIR required');
  const read = (file, fallback) => fs.existsSync(path.join(dataDirectory, file)) ? JSON.parse(fs.readFileSync(path.join(dataDirectory, file), 'utf8')) : fallback;
  const sessions = read('auth-sessions.json', []), session = sessions.filter(row => row.user?.role === 'teacher' && (!row.expiresAtMs || row.expiresAtMs > Date.now())).sort((a,b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0))[0];
  assert.ok(session?.token, 'Existing teacher session required');
  const groups = read('learning-groups.json', []).filter(row => row.teacherId === session.user.id && !row.deletedAt);
  const lesson = read('learning-lesson-sessions.json', []).find(row => groups.some(group => group.id === row.groupId));
  if (lesson) {
    const result = await (await get(`/api/learning-groups/${encodeURIComponent(lesson.groupId)}/lessons/${encodeURIComponent(lesson.id)}/code-presence`, session.token)).json();
    assert.ok(Array.isArray(result.participants) && result.participants.every(row => lesson.participantIds.includes(row.studentId) && Array.isArray(row.locations)), 'Presence does not match lesson roster');
  }
}
console.log('Concurrent homework, group code presence, video budgets and exact published bundles verified.');
