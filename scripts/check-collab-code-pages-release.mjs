import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const [mode, directory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const files = fs.readdirSync(path.join(directory, 'assets')).filter(file => /\.(?:js|css)$/.test(file));
const features = files.filter(file => /collab-code-pages|codeSolutionPages|collab-pages:create/.test(fs.readFileSync(path.join(directory, 'assets', file), 'utf8')));
const source = features.filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(directory, 'assets', file), 'utf8')).join('\n');
for (const marker of ['Страницы кода', 'Создать страницу кода', 'Название страницы', 'Восстановить страницу',
  'codeSolutionPages', 'codePagesDeleted', 'collab-pages:create', 'collab-code-pages:']) assert.ok(source.includes(marker), `Code pages missing: ${marker}`);
assert.ok(features.some(file => file.endsWith('.css') && fs.readFileSync(path.join(directory, 'assets', file), 'utf8').includes('.collab-code-pages__panel')), 'Code page styles missing');
if (mode === 'verify') {
  const get = async route => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(25000) });
    assert.ok(response.ok, `HTTP ${response.status}: ${route}`); return response;
  };
  const remoteHtml = await (await get('/')).text();
  assert.ok(initial.length && initial.every(asset => remoteHtml.includes(asset)), 'Production serves a different client');
  const sha = data => crypto.createHash('sha256').update(data).digest('hex');
  for (const asset of new Set([...initial, ...features.map(file => `/assets/${file}`)])) {
    assert.equal(sha(Buffer.from(await (await get(asset)).arrayBuffer())), sha(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published code pages bundle differs: ${asset}`);
  }
}
console.log('Code page stacks and exact published feature bundles verified.');
