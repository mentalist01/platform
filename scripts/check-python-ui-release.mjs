import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [mode, directory] = process.argv.slice(2);
if (!['local', 'verify'].includes(mode) || !directory) {
  throw new Error('Usage: node scripts/check-python-ui-release.mjs local|verify BUILD_DIR');
}
const origin = 'https://ivan100.ru';
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initialAssets = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g), match => match[1]);
if (!initialAssets.some(asset => /\/index-[^/]+\.js$/.test(asset))) {
  throw new Error('Client entry bundle not found');
}
const features = new Set(['python-runtime-test-toggle', 'python-runtime-test-whitespace', 'python-runtime-test-full-value']);
const assetsDirectory = path.join(directory, 'assets');
const featureAssets = fs.readdirSync(assetsDirectory).filter(name => /\.(js|css)$/.test(name)).filter(name => {
  const source = fs.readFileSync(path.join(assetsDirectory, name), 'utf8');
  const matches = Array.from(features).filter(feature => source.includes(feature));
  matches.forEach(feature => features.delete(feature));
  return matches.length > 0 || source.includes('python-runtime-test-output-comparison');
}).map(name => `/assets/${name}`);
if (features.size) throw new Error(`Python test details missing from build: ${Array.from(features).join(', ')}`);
if (!featureAssets.some(asset => asset.endsWith('.js')) || !featureAssets.some(asset => asset.endsWith('.css'))) {
  throw new Error('Python test details need both JavaScript and CSS');
}
console.log(`Python UI build verified: ${featureAssets.length} feature assets.`);

if (mode === 'verify') {
  const get = async (pathname) => {
    const response = await fetch(`${origin}${pathname}`, {
      headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const remoteHtml = (await get('/')).toString('utf8');
  if (!initialAssets.every(asset => remoteHtml.includes(asset))) throw new Error('Production serves a different client');
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const asset of new Set([...initialAssets, ...featureAssets])) {
    const local = fs.readFileSync(path.join(directory, asset.slice(1)));
    if (digest(await get(asset)) !== digest(local)) throw new Error(`Published asset checksum mismatch: ${asset}`);
  }
  await get('/api/availability');
  console.log('Exact production bundles and availability API verified.');
}
