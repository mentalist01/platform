'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const zlib = require('node:zlib');

try {
  const raw = Buffer.from(JSON.stringify(workerData?.replay), 'utf8');
  const maxRawBytes = Math.max(1, Number(workerData?.maxRawBytes) || 1);
  const maxCompressedBytes = Math.max(1, Number(workerData?.maxCompressedBytes) || 1);
  if (raw.length > maxRawBytes) throw new Error('Lesson replay exceeds the storage limit');
  const compressed = zlib.gzipSync(raw, { level: 1 });
  if (compressed.length > maxCompressedBytes) {
    throw new Error('Compressed lesson replay exceeds the storage limit');
  }
  parentPort.postMessage({ rawBytes: raw.length, compressed });
} catch (error) {
  parentPort.postMessage({
    error: error?.message || 'Failed to compress lesson replay.',
  });
}
