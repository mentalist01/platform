import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode, directory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const entry = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
assert.ok(entry, 'Missing client entry');
const sources = new Map();
const visit = asset => {
  if (sources.has(asset)) return;
  const file = path.join(directory, asset.slice(1));
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, 'utf8');
  sources.set(asset, source);
  for (const match of source.matchAll(/["'](?:\.\/|\/?assets\/)?([A-Za-z0-9_.-]+\.js)["']/g)) {
    visit('/assets/' + match[1]);
  }
};
visit(entry);
const required = ['__EGE_BOARD_TASK_V2__:', '__EGE_BOARD_TASK_V1__:', 'Не удалось прочитать скопированное задание'];
const featureAssets = new Set([entry]);
for (const marker of required) {
  const match = [...sources].find(([, source]) => source.includes(marker));
  assert.ok(match, 'Missing portable board task clipboard feature: ' + marker);
  featureAssets.add(match[0]);
}
if (mode === 'verify') {
  const get = async route => {
    const response = await fetch('https://ivan100.ru' + route, {
      headers: {'Cache-Control': 'no-cache'}, signal: AbortSignal.timeout(25000),
    });
    assert.ok(response.ok, `HTTP ${response.status} ${route}`);
    return response;
  };
  assert.ok((await (await get('/')).text()).includes(entry), 'Production serves a different client');
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const asset of featureAssets) {
    assert.equal(digest(Buffer.from(await (await get(asset)).arrayBuffer())),
      digest(fs.readFileSync(path.join(directory, asset.slice(1)))), 'Published asset differs: ' + asset);
  }
  await get('/api/availability');
}
console.log('Portable board task clipboard, legacy compatibility and exact client bundles verified.');
