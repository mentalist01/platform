import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const [mode, directory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map((m) => m[1]);
const assets = fs.readdirSync(path.join(directory, 'assets'));
const features = {
  GuestMeetingPage: ['Как вас зовут?', 'Перейти к настройкам', 'ВСТРЕЧА ПО ПРИГЛАШЕНИЮ'],
  GuestMeetingsSection: ['Встречи по ссылке', 'Завершить для всех', 'Закрыть вход'],
  CallSection: ['_meetingAuth', 'host-mute', 'Войти во встречу'],
};
const bundles = Object.keys(features).map((name) => {
  const file = assets.find((value) => value.startsWith(`${name}-`) && value.endsWith('.js'));
  assert.ok(file, `Missing ${name} bundle`);
  const source = fs.readFileSync(path.join(directory, 'assets', file), 'utf8');
  for (const text of features[name]) assert.ok(source.includes(text), `${name}: missing ${text}`);
  if (name === 'CallSection') {
    assert.ok(source.includes('VITE_RTC_ICE_TRANSPORT_POLICY:"relay"'), 'Calls must keep mandatory TURN relay');
    assert.ok(/turns?:/.test(source), 'TURN configuration missing');
  }
  return `/assets/${file}`;
});
console.log('Guest invitation, host controls and existing RTC client verified.');

if (mode === 'verify') {
  const read = async (url) => {
    const response = await fetch(`https://ivan100.ru${url}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20_000) });
    assert.ok(response.ok, `${url}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const published = (await read('/')).toString();
  assert.ok(initial.every((asset) => published.includes(asset)), 'Published entry differs');
  const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  for (const asset of [...initial, ...bundles]) {
    assert.equal(digest(await read(asset)), digest(fs.readFileSync(path.join(directory, asset.slice(1)))), `Asset differs: ${asset}`);
  }
  const missing = await fetch('https://ivan100.ru/api/guest-meetings/00000000-0000-0000-0000-000000000000', { signal: AbortSignal.timeout(20_000) });
  assert.equal(missing.status, 404, 'Public guest endpoint is unavailable');
  assert.match((await missing.json()).error, /не найдена/);
  console.log('Public guest endpoint and published client verified without creating a meeting.');
}
