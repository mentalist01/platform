import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [mode,directory] = process.argv.slice(2);
if (!['local','verify'].includes(mode) || !directory) throw new Error('Usage: node scripts/check-board-pages-release.mjs local|verify BUILD_DIR');
const html = fs.readFileSync(path.join(directory,'index.html'),'utf8');
const initialAssets = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g),m=>m[1]);
const initialJs = initialAssets.find(a=>/\/index-[^/]+\.js$/.test(a));
if (!initialJs) throw new Error('Client entry bundle not found');
const entrySource = fs.readFileSync(path.join(directory,initialJs.slice(1)),'utf8');
const featureAssets = [...new Set(Array.from(entrySource.matchAll(/BoardPagesWorkspace-[A-Za-z0-9_-]+\.(?:js|css)/g),m=>`/assets/${m[0]}`))];
const featureJs = featureAssets.find(a=>a.endsWith('.js'));
const featureCss = featureAssets.find(a=>a.endsWith('.css'));
if (!featureJs || !featureCss) throw new Error('Board pages feature bundles not found in the current client');
const js = fs.readFileSync(path.join(directory,featureJs.slice(1)),'utf8');
for (const feature of ['Новая страница','Страницы доски','Удалить страницу?','Страница удалена','~page~','Копировать выделенное','Изменить размер выделения:','Направляющие выравнивания','__IVAN100_BOARD_FRAGMENT_V1__:']) {
  if (!js.includes(feature)) throw new Error(`Missing feature: ${feature}`);
}
const css = fs.readFileSync(path.join(directory,featureCss.slice(1)),'utf8');
for (const selector of ['.board-pages-panel.is-embedded','.board-fragment-copy','.board-selection-resize','.board-alignment-guide']) {
  if (!css.includes(selector)) throw new Error(`Missing board styles: ${selector}`);
}
if (js.includes('board-pages-toggle') || css.includes('.board-pages-toggle')) throw new Error('Duplicate bottom pages button is still present');
if (js.includes('board-fragment-paste') || css.includes('.board-fragment-paste')) throw new Error('Redundant fragment paste button is still present');
if (/\.get\(["']panel["']\)|\.set\(["']panel["']/.test(js)) throw new Error('Pages panel still synchronizes between participants');
console.log('Shared board pages and fragment clipboard JavaScript and CSS verified.');
if (mode === 'verify') {
  const get = async pathname => {
    const response = await fetch(`https://ivan100.ru${pathname}`,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const remoteHtml = (await get('/')).toString('utf8');
  if (!initialAssets.every(a=>remoteHtml.includes(a))) throw new Error('Production serves a different client');
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  for (const asset of new Set([...initialAssets,...featureAssets])) {
    if (digest(await get(asset)) !== digest(fs.readFileSync(path.join(directory,asset.slice(1))))) throw new Error(`Published asset mismatch: ${asset}`);
  }
  await get('/api/client-build-version');
  console.log('Exact published board pages bundles and server health verified.');
}
