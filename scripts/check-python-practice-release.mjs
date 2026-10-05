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
const feature = entryText.match(/PythonSection-[A-Za-z0-9_-]+\.js/)?.[0];
assert.ok(feature, 'Missing Python section');
const featurePath = '/assets/' + feature;
const source = fs.readFileSync(path.join(directory, featurePath.slice(1)), 'utf8');
for (const marker of ['Пора повторить Python', 'Повторение Python', 'Повторить тему', 'Напишите решение заново', 'Черновик повторения сохраняется отдельно на этом устройстве', 'python-review:']) {
  assert.ok(source.includes(marker), `Missing Python practice feature: ${marker}`);
}
if (mode === 'verify') {
  const get = async route => {
    const response = await fetch('https://ivan100.ru' + route, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(25000) });
    assert.ok(response.ok, `HTTP ${response.status} ${route}`); return response;
  };
  assert.ok((await (await get('/')).text()).includes(entry), 'Production uses a different client');
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const asset of [entry, featurePath]) {
    assert.equal(digest(Buffer.from(await (await get(asset)).arrayBuffer())), digest(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published asset differs: ${asset}`);
  }
  await get('/api/availability');
}
console.log('Python review panel, separate drafts and exact client bundles verified.');
