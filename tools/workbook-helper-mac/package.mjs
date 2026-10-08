import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const MAC_PACKAGE_NAME = 'IVAN100-WorkbookHelper-Mac-0.1.0.zip';
export const NODE_RUNTIME = Object.freeze({ version: 'v22.23.3',
  arm64: '23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53',
  x64: '8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8' });
const root = path.dirname(fileURLToPath(import.meta.url));
const readSource = name => Buffer.from(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), 'utf8');
const sources = ['protocol.mjs', 'api.mjs', 'session.mjs', 'mac.mjs', 'controller.mjs', 'ipc.mjs', 'index.mjs', 'helper.applescript'];
const crcTable = Array.from({ length: 256 }, (_, value) => { for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
export function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
export function workbookHelperMacPackage() {
  const files = sources.map(name => ({ name: 'payload/' + name, bytes: readSource(name), mode: 0o644 }));
  const checksums = files.map(file => `${crypto.createHash('sha256').update(file.bytes).digest('hex')}  ${file.name.slice(8)}`).join('\n') + '\n';
  files.push({ name: 'payload/SHA256SUMS', bytes: Buffer.from(checksums), mode: 0o644 },
    { name: 'Установить.command', bytes: readSource('Install.command'), mode: 0o755 },
    { name: 'Прочитать.txt', bytes: readSource('README.txt'), mode: 0o644 });
  let offset = 0; const local = [], central = [];
  for (const file of files) {
    const name = Buffer.from(file.name); const crc = crc32(file.bytes);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(0x5021, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(file.bytes.length, 18); header.writeUInt32LE(file.bytes.length, 22); header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(0x314, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(0x5021, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(file.bytes.length, 20); directory.writeUInt32LE(file.bytes.length, 24); directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(((0o100000 | file.mode) * 65536) >>> 0, 38); directory.writeUInt32LE(offset, 42);
    local.push(header, name, file.bytes); central.push(directory, name); offset += header.length + name.length + file.bytes.length;
  }
  const centralBytes = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}
