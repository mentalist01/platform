import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const [mode, directory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const entry = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
assert.ok(entry, 'Client entry missing');
const source = fs.readFileSync(path.join(directory, entry.slice(1)), 'utf8');
const login = source.match(/LoginPage-[A-Za-z0-9_-]+\.js/)?.[0];
assert.ok(login, 'Login bundle missing');
const loginPath = `/assets/${login}`;
const loginSource = fs.readFileSync(path.join(directory, loginPath.slice(1)), 'utf8');
for (const marker of ['Вход в приложение преподавателя', 'Кабинет преподавателя', 'Введите код доступа своего аккаунта преподавателя.']) assert.ok(loginSource.includes(marker), `Missing ${marker}`);
assert.ok(/\["schedule","groups","meetings","teacher-calendar","recording"/.test(source), 'Recording navigation missing');
const feature = source.match(/LessonRecordingSection-[A-Za-z0-9_-]+\.js/)?.[0];
assert.ok(feature, 'Recording onboarding missing');
const featurePath = `/assets/${feature}`;
const featureSource = fs.readFileSync(path.join(directory, featurePath.slice(1)), 'utf8');
assert.ok(featureSource.includes('Приложение для преподавателя'), 'Desktop download UI missing');
assert.ok(featureSource.includes('teacher-desktop-v0.1.0/IVAN100-Teacher-0.1.0-Setup.exe'), 'Desktop download URL missing');
console.log('Teacher desktop entry, navigation and download verified.');
if (mode === 'verify') {
  const get = async route => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
    assert.ok(response.ok, `${route}: HTTP ${response.status}`); return Buffer.from(await response.arrayBuffer());
  };
  assert.ok((await get('/?desktop=teacher')).toString().includes(entry), 'Desktop entry is stale');
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const asset of [entry, loginPath, featurePath]) assert.equal(digest(await get(asset)), digest(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published ${asset} differs`);
  const download = await fetch('https://github.com/mentalist01/platform/releases/download/teacher-desktop-v0.1.0/IVAN100-Teacher-0.1.0-Setup.exe', { method: 'HEAD', signal: AbortSignal.timeout(30000) });
  assert.ok(download.ok && Number(download.headers.get('content-length')) > 10000000, 'Windows installer is unavailable');
  console.log('Published teacher entry and Windows installer available.');
}
