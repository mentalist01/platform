import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const [mode, directory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const files = fs.readdirSync(path.join(directory, 'assets')).filter(name => name.endsWith('.js'));
const features = files.filter(name => fs.readFileSync(path.join(directory, 'assets', name), 'utf8').includes('Удобное время сохраняется у ученика'));
const source = features.map(name => fs.readFileSync(path.join(directory, 'assets', name), 'utf8')).join('\n');
for (const marker of ['Удобное время сохраняется у ученика', 'Сохранённые отметки участников появятся автоматически', 'Предложение и согласие на расписание нужно будет получить заново']) assert.ok(source.includes(marker), `Missing saved availability UI: ${marker}`);
if (mode === 'verify') {
 const get = async route => { const r=await fetch(`https://ivan100.ru${route}`,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.ok(r.ok,`HTTP ${r.status}: ${route}`);return r; };
 const published=await(await get('/')).text();assert.ok(initial.length&&initial.every(asset=>published.includes(asset)),'Different production client');
 const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 for(const route of new Set([...initial,...features.map(name=>`/assets/${name}`)])) assert.equal(hash(Buffer.from(await(await get(route)).arrayBuffer())),hash(fs.readFileSync(path.join(directory,route.slice(1)))),`Different published bundle: ${route}`);
 assert.equal((await(await get('/api/availability')).json()).available,true);
}
console.log('Saved pupil availability UI and exact published bundles verified.');
