import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { MAC_PACKAGE_NAME, workbookHelperMacPackage } from '../tools/workbook-helper-mac/package.mjs';

const [mode, directory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assetDirectory = path.join(directory, 'assets');
const packageBytes = fs.readFileSync(path.join(assetDirectory, MAC_PACKAGE_NAME));
assert.equal(digest(packageBytes), digest(workbookHelperMacPackage()), 'Mac installer differs from reviewed sources');
const files = fs.readdirSync(assetDirectory).filter(name => name.endsWith('.js'));
const sources = new Map(files.map(name => [name, fs.readFileSync(path.join(assetDirectory, name), 'utf8')]));
const featureFiles = files.filter(name => /^(?:NotesSection|StudentPaymentBalances|StudentTestModal|TeacherQuestionWorkbookPanel|workbookHelperInstall)-/.test(name)
  || [MAC_PACKAGE_NAME, 'expectedAvailable'].some(marker => sources.get(name).includes(marker)));
const source = featureFiles.map(name => sources.get(name)).join('\n');
for (const marker of [MAC_PACKAGE_NAME, 'Скачать помощник для Mac', 'Тестовая версия macOS', 'Установить.command', 'Скачать', 'Изменить баланс', 'Установить свободный остаток', 'Сохранить корректировку', 'expectedAvailable']) {
  assert.ok(source.includes(marker), `Missing released feature: ${marker}`);
}
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
if (mode === 'verify') {
  const get = async route => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(25000) });
    assert.ok(response.ok, `HTTP ${response.status}: ${route}`);
    return response;
  };
  const publishedHtml = await (await get('/')).text();
  assert.ok(initial.length && initial.every(asset => publishedHtml.includes(asset)), 'Production client differs from this build');
  for (const route of new Set([...initial, ...featureFiles.map(name => `/assets/${name}`), `/assets/${MAC_PACKAGE_NAME}`])) {
    const expected = fs.readFileSync(path.join(directory, route.slice(1)));
    assert.equal(digest(Buffer.from(await (await get(route)).arrayBuffer())), digest(expected), `Published asset differs: ${route}`);
  }
}
console.log('Balance adjustments, file downloads and exact Mac helper package verified.');
