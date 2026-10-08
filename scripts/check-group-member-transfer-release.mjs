import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode, directory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const files = fs.readdirSync(path.join(directory, 'assets')).filter(name => name.endsWith('.js'));
const featureFiles = files.filter(name => /transferLearningGroupMember|availability_answer_conflict|ga-member-transfer/.test(fs.readFileSync(path.join(directory, 'assets', name), 'utf8')));
const source = featureFiles.map(name => fs.readFileSync(path.join(directory, 'assets', name), 'utf8')).join('\n');
for (const marker of ['Перенести в другую группу', 'Перенести ученика', 'replaceTargetAnswer', 'availability_answer_conflict', 'ga-member-transfer', 'Отметки времени перенесены', 'synchronizationPending']) {
  assert.ok(source.includes(marker), `Missing transfer feature: ${marker}`);
}
if (mode === 'verify') {
  const get = async route => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(25000) });
    assert.ok(response.ok, `HTTP ${response.status}: ${route}`);
    return response;
  };
  const publishedHtml = await (await get('/')).text();
  assert.ok(initial.length && initial.every(asset => publishedHtml.includes(asset)), 'Production client differs from this build');
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  for (const route of new Set([...initial, ...featureFiles.map(name => `/assets/${name}`)])) {
    assert.equal(hash(Buffer.from(await (await get(route)).arrayBuffer())), hash(fs.readFileSync(path.join(directory, route.slice(1)))), `Published asset differs: ${route}`);
  }
  assert.equal((await (await get('/api/availability')).json()).available, true);
}
console.log('Group transfer interface and exact published bundles verified.');
