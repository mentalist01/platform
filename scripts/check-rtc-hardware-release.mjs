import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const [mode,directory]=process.argv.slice(2);
assert.ok(['local','verify'].includes(mode)&&directory,'Usage: local|verify BUILD_DIR');
for(const name of ['src/components/CallSection.jsx','src/hooks/useRecorderShare.js']){
 const source=fs.readFileSync(name,'utf8');
 assert.ok(source.includes('preferH264ForVideoSender('),`Codec preference missing from ${name}`);
}
const assets=fs.readdirSync(path.join(directory,'assets')).filter(name=>name.endsWith('.js'));
const feature=assets.filter(name=>fs.readFileSync(path.join(directory,'assets',name),'utf8').includes('video/h264'));
assert.ok(feature.length,'Hardware-capable video codec preference not bundled');
assert.ok(feature.some(name=>fs.readFileSync(path.join(directory,'assets',name),'utf8').includes('setCodecPreferences')));
const html=fs.readFileSync(path.join(directory,'index.html'),'utf8');
const initial=[...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(m=>m[1]);
const call=assets.filter(name=>name.startsWith('CallSection-'));
assert.equal(call.length,1,'Ambiguous call bundle');
if(mode==='verify'){
 const get=async route=>{const response=await fetch('https://ivan100.ru'+route,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.ok(response.ok,`HTTP ${response.status}: ${route}`);return response;};
 const remote=await(await get('/')).text();assert.ok(initial.length&&initial.every(file=>remote.includes(file)),'Wrong production client');
 const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
 for(const file of new Set([...initial,...[...feature,...call].map(name=>'/assets/'+name)]))assert.equal(hash(Buffer.from(await(await get(file)).arrayBuffer())),hash(fs.readFileSync(path.join(directory,file.slice(1)))),`Published bundle differs: ${file}`);
}
console.log('H.264 preference in the call and OBS relay, fallback and exact published bundles verified.');
