import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const buildArgs = process.argv.slice(2);
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
await precompressDirectory(outDir);
console.log(
  `[build] precompressed ${compressedFileCount} files: ${Math.round(rawByteCount / 1024)} KiB -> ${Math.round(compressedByteCount / 1024)} KiB`
);
