import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Never distribute state.json, browser profiles, or credentials.
export const recorderFiles = ['python-timeline.mjs','python-edit-media.mjs','python-editor.mjs','python-capture.mjs','lesson-topic.mjs','archive.mjs', 'archive-eta.mjs', 'archive-publish.mjs', 'archive-search.mjs', 'archive-worker.py', 'archive-requirements.txt', 'archive.html', 'updater.mjs', 'update-worker.mjs', 'Install.cmd', 'install.ps1', 'dependencies.ps1', 'app.mjs', 'obs.mjs',
  'start-day.mjs','share-bridge.mjs','share-view.html','office-follow.mjs','foreground-window.ps1','segments.mjs','engine.mjs', 'mock-review.mjs', 'python-theory.mjs', 'fallback.mjs', 'storage.mjs', 'recording-storage.mjs', 'recovery-inbox.mjs', 'rutube.mjs',
  'panel.html', 'hotkeys.ps1', 'background.vbs', 'watchdog.mjs', 'watchdog-task.ps1', 'README.md', 'package.json', 'package-lock.json'];
const directory = fileURLToPath(new URL('../tools/lesson-recorder/', import.meta.url));
const table = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Small, uncompressed ZIP, compatible with Windows Explorer.
export function recorderPackage() {
  const entries = []; const central = []; let offset = 0;
  const packageFiles = [...recorderFiles, 'release.json'];
  for (const name of packageFiles) {
    let data = name === 'release.json' ? Buffer.from(JSON.stringify(recorderRelease().manifest)) : fs.readFileSync(path.join(directory, name));
    if (name.endsWith('.cmd')) data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n'));
    if (name.endsWith('.ps1') && !data.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) {
      data = Buffer.concat([Buffer.from([239, 187, 191]), data]); // Windows PowerShell 5.1 UTF-8.
    }
    const filename = Buffer.from(`IVAN100-Recorder/${name}`);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(33, 12); local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6);
    local.copy(header, 8, 6, 28); header.writeUInt32LE(offset, 42);
    central.push(header, filename); entries.push(local, filename, data);
    offset += local.length + filename.length + data.length;
  }
  const directoryData = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(packageFiles.length, 8); end.writeUInt16LE(packageFiles.length, 10);
  end.writeUInt32LE(directoryData.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, directoryData, end]);
}

let cachedRelease;
export function recorderRelease() {
  if (cachedRelease) return cachedRelease;
  const files = Object.fromEntries(recorderFiles.map(name => [name, fs.readFileSync(path.join(directory, name), 'utf8').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '')]));
  const version = JSON.parse(files['package.json']).version;
  const bundle = Buffer.from(JSON.stringify({ version, files }));
  const id = crypto.createHash('sha256').update(bundle).digest('hex');
  cachedRelease = { manifest: { id, version, sha256: id, bytes: bundle.length }, bundle };
  return cachedRelease;
}
