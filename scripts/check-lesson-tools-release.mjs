import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const [mode, directory, dataDirectory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const files = fs.readdirSync(path.join(directory, 'assets')).filter(file => /\.(js|css)$/.test(file));
const source = files.filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(directory, 'assets', file), 'utf8')).join('\n');
for (const marker of ['Миникарта доски. Перетащите синюю рамку', 'Не забыли задать домашку?', 'Перейти задать', 'Я так и хотел', '/api/teacher-homework-reminders', 'openHomeworkRequest', 'homework-reminder-', 'Создать новый пустой раздел кода', 'Название раздела']) assert.ok(source.includes(marker), `Missing lesson feature: ${marker}`);
const featureFiles = files.filter(file => /^(?:TeacherHomeworkReminders|LearningGroupsSection|CallSection)-/.test(file));
assert.ok(featureFiles.some(file => file.endsWith('.css') && fs.readFileSync(path.join(directory, 'assets', file), 'utf8').includes('.teacher-homework-reminder')), 'Reminder styles missing');
const callJs = featureFiles.find(file => /^CallSection-.+\.js$/.test(file));
const callCss = featureFiles.find(file => /^CallSection-.+\.css$/.test(file));
assert.ok(callJs && callCss, 'Call media bundles missing');
assert.ok(fs.readFileSync(path.join(directory, 'assets', callJs), 'utf8').includes('call-media-tile--stage'), 'Large active call media missing');
for (const marker of ['call-workspace-body', 'call-prejoin-footer', 'call-prejoin-kicker', 'call-mini-panel__return', 'Вернуться в звонок', 'call-workspace-diagnostics', 'call-workspace-ambient', 'Остановить показ']) assert.ok(fs.readFileSync(path.join(directory, 'assets', callJs), 'utf8').includes(marker), `Call workspace missing: ${marker}`);
const callStyles = fs.readFileSync(path.join(directory, 'assets', callCss), 'utf8');
for (const selector of ['.call-media-grid .call-participant-entry--video', '.call-media-tile--stage', '.call-media-tile:fullscreen']) assert.ok(callStyles.includes(selector), `Call media style missing: ${selector}`);
for (const selector of ['.call-workspace.call-panel-root', '.call-workspace.call-panel-root[data-call-role] .call-workspace-body', '.call-workspace.call-panel-root[data-call-role] .call-controls-rail', '.call-workspace.call-panel-root[data-call-role] .call-prejoin-footer']) assert.ok(callStyles.includes(selector), `Bounded call workspace style missing: ${selector}`);
for (const marker of ['callAmbientDrift', 'callAvatarFloat', 'callVoiceWave', 'prefers-reduced-motion', 'width:112px']) assert.ok(callStyles.includes(marker), `Animated call style missing: ${marker}`);
for (const marker of ['.call-prejoin-kicker', '.call-mini-panel__return', '.call-game-overlay--cabinet', 'width:min(960px,100%)', '#151127']) assert.ok(callStyles.includes(marker), `Preparation/mini-panel style missing: ${marker}`);
console.log('Interactive minimap, empty code sections and teacher homework reminders verified in this build.');
if (mode === 'verify') {
  const get = async (route, token) => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(25000) });
    assert.ok(response.ok, `${route.split('?')[0]}: HTTP ${response.status}`); return response;
  };
  const remoteHtml = await (await get('/')).text();
  assert.ok(initial.length && initial.every(asset => remoteHtml.includes(asset)), 'Production client differs from this build');
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  for (const asset of new Set([...initial, ...featureFiles.map(file => `/assets/${file}`)])) {
    assert.equal(digest(Buffer.from(await (await get(asset)).arrayBuffer())), digest(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published bundle differs: ${asset}`);
  }
  if (dataDirectory) {
    const sessions = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'auth-sessions.json'), 'utf8'));
    const session = sessions.filter(entry => entry.user?.role === 'teacher' && (!entry.expiresAtMs || entry.expiresAtMs > Date.now())).sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0))[0];
    assert.ok(session?.token, 'An existing teacher session is required for verification');
    const payload = await (await get('/api/teacher-homework-reminders', session.token)).json();
    assert.ok(Array.isArray(payload.reminders), 'Reminder API unavailable');
    for (const reminder of payload.reminders) {
      assert.ok(reminder.id && reminder.name && reminder.endedAt);
      assert.ok(!('teacherId' in reminder) && !('occurrenceKey' in reminder), 'Internal reminder data leaked');
    }
    console.log('Teacher reminder API verified without assigning homework or answering reminders.');
  }
  console.log('Exact published lesson feature bundles verified.');
}
