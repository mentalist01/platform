import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { recorderPackage, recorderRelease } from '../server/recorderPackage.js';
import { MAC_PACKAGE_NAME, workbookHelperMacPackage } from '../tools/workbook-helper-mac/package.mjs';
import {packageWorkbookHelperWindows} from '../tools/IvanEge.WorkbookHelper/package.mjs';
import { checkTeacherUpdateNotes } from './check-teacher-update-notes.mjs';
import { loadEnv } from 'vite';
import { validateRtcBuildConfig, verifyRtcBuildBundle } from './rtc-build-config.mjs';

checkTeacherUpdateNotes();

const gzipAsync = promisify(gzip);
const buildArgs = process.argv.slice(2);
const modeAt = buildArgs.indexOf('--mode');
const buildMode = modeAt >= 0 ? buildArgs[modeAt + 1] : (buildArgs.find(arg => arg.startsWith('--mode='))?.slice(7) || 'production');
const rtcEnv = { ...loadEnv(buildMode, process.cwd(), 'VITE_'), ...process.env };
if (buildMode !== 'development') validateRtcBuildConfig(rtcEnv);
const viteBin = path.resolve('node_modules/vite/bin/vite.js');

const buildExitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [...process.execArgv, viteBin, 'build', ...buildArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Vite build stopped by signal ${signal}.`));
      return;
    }
    resolve(Number(code) || 0);
  });
});

if (buildExitCode !== 0) process.exit(buildExitCode);

const resolveOutDir = () => {
  for (let index = 0; index < buildArgs.length; index += 1) {
    if (buildArgs[index] === '--outDir' && buildArgs[index + 1]) return path.resolve(buildArgs[index + 1]);
    if (buildArgs[index].startsWith('--outDir=')) return path.resolve(buildArgs[index].slice('--outDir='.length));
  }
  return path.resolve('dist');
};

const compressibleExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
let compressedFileCount = 0;
let rawByteCount = 0;
let compressedByteCount = 0;

const precompressDirectory = async (directoryPath) => {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await precompressDirectory(entryPath);
      continue;
    }
    if (!entry.isFile() || !compressibleExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const source = await fs.readFile(entryPath);
    if (source.length < 1024) continue;
    const compressed = await gzipAsync(source, { level: 9 });
    if (compressed.length >= source.length) continue;
    await fs.writeFile(`${entryPath}.gz`, compressed);
    compressedFileCount += 1;
    rawByteCount += source.length;
    compressedByteCount += compressed.length;
  }
};

const outDir = resolveOutDir();
if (buildMode !== 'development') {
  const callFiles = (await fs.readdir(path.join(outDir, 'assets'))).filter(name => /^CallSection-.*\.js$/.test(name));
  if (callFiles.length !== 1) throw Error('[build] Missing or ambiguous call bundle');
  verifyRtcBuildBundle(await fs.readFile(path.join(outDir, 'assets', callFiles[0]), 'utf8'), rtcEnv);
  console.log('[build] authenticated TURN and transport policy verified in the call bundle');
}

const copyMonacoAssets = async () => {
  const sourcePath = path.resolve('node_modules/monaco-editor/min/vs');
  const destinationPath = path.join(outDir, 'vendor', 'monaco', 'vs');
  await fs.cp(sourcePath, destinationPath, { recursive: true, force: true });

  const requiredAssets = [
    'loader.js',
    path.join('editor', 'editor.main.js'),
    path.join('editor', 'editor.main.css'),
    path.join('base', 'worker', 'workerMain.js'),
  ];
  await Promise.all(requiredAssets.map((assetPath) => fs.access(path.join(destinationPath, assetPath))));
  console.log(`[build] copied self-hosted Monaco assets to ${path.relative(process.cwd(), destinationPath)}`);
};

const verifyInitialBundle = async () => {
  const indexPath = path.join(outDir, 'index.html');
  const html = await fs.readFile(indexPath, 'utf8');
  const initialAssetUrls = Array.from(
    html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi),
    (match) => match[1]
  );
  const forbiddenInitialChunks = ['editor-vendor', 'collaboration-vendor', 'syntax-vendor'];
  const eagerHeavyChunk = initialAssetUrls.find((assetUrl) => (
    forbiddenInitialChunks.some((chunkName) => assetUrl.includes(chunkName))
  ));
  if (eagerHeavyChunk) {
    throw new Error(`[build] heavy lazy chunk leaked into initial HTML: ${eagerHeavyChunk}`);
  }

  const entryScriptUrl = initialAssetUrls.find((assetUrl) => /\/assets\/index-[^/]+\.js$/i.test(assetUrl));
  const entryStyleUrl = initialAssetUrls.find((assetUrl) => /\/assets\/index-[^/]+\.css$/i.test(assetUrl));
  if (!entryScriptUrl || !entryStyleUrl) {
    throw new Error('[build] could not resolve initial script/style assets from index.html');
  }
  const toOutputPath = (assetUrl) => path.join(outDir, assetUrl.replace(/^\/+/, '').replaceAll('/', path.sep));
  const [entryScriptStat, entryStyleStat] = await Promise.all([
    fs.stat(toOutputPath(entryScriptUrl)),
    fs.stat(toOutputPath(entryStyleUrl)),
  ]);
  const budgets = {
    script: 1_050_000,
    style: 2_500_000,
  };
  if (entryScriptStat.size > budgets.script) {
    throw new Error(`[build] initial JS budget exceeded: ${entryScriptStat.size} > ${budgets.script} bytes`);
  }
  if (entryStyleStat.size > budgets.style) {
    throw new Error(`[build] initial CSS budget exceeded: ${entryStyleStat.size} > ${budgets.style} bytes`);
  }
  console.log(
    `[build] initial bundle verified: ${Math.round(entryScriptStat.size / 1024)} KiB JS, ${Math.round(entryStyleStat.size / 1024)} KiB CSS`
  );
};

await copyMonacoAssets();
const recorderInstaller = path.join(outDir, 'assets', `IVAN100-Recorder-Windows-${recorderRelease().manifest.version}.zip`);
await fs.writeFile(recorderInstaller, recorderPackage());
console.log(`[build] packaged Windows recorder ${recorderRelease().manifest.version}`);
await fs.writeFile(path.join(outDir, 'assets', MAC_PACKAGE_NAME), workbookHelperMacPackage());
console.log('[build] packaged macOS workbook helper');
const windowsHelper=await packageWorkbookHelperWindows(path.join(outDir,'downloads'));
console.log(`[build] packaged Windows workbook helper ${windowsHelper.version} (${windowsHelper.authenticode.verification})`);
await verifyInitialBundle();
await precompressDirectory(outDir);
console.log(
  `[build] precompressed ${compressedFileCount} files: ${Math.round(rawByteCount / 1024)} KiB -> ${Math.round(compressedByteCount / 1024)} KiB`
);
