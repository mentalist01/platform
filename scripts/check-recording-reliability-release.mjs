import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const [mode, directory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const entry = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
assert.ok(entry, 'Missing client entry');
const entryText = fs.readFileSync(path.join(directory, entry.slice(1)), 'utf8');
const warning = entryText.match(/RecordingHealthWarning-[A-Za-z0-9_-]+\.js/)?.[0];
assert.ok(warning, 'Missing recording connection warning');
const source = fs.readFileSync(path.join(directory, 'assets', warning), 'utf8');
for (const text of ['Пульт записи потерял связь', 'Запись урока не подтверждена', 'Не можем проверить запись', 'Открыть пульт', 'Понятно']) assert.ok(source.includes(text), `Missing warning: ${text}`);
if (mode === 'verify') {
  const get = async route => {
    const response = await fetch('https://ivan100.ru' + route, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(25000) });
    assert.ok(response.ok, `HTTP ${response.status} ${route}`); return response;
  };
  assert.ok((await (await get('/')).text()).includes(entry), 'Production uses a different client');
  const sha = data => crypto.createHash('sha256').update(data).digest('hex');
  for (const asset of [entry, '/assets/' + warning]) assert.equal(sha(Buffer.from(await (await get(asset)).arrayBuffer())), sha(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published asset differs: ${asset}`);
}
console.log('Recording health warning and exact client bundles verified.');
