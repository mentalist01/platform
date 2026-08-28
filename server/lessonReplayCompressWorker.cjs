'use strict';

const { parentPort } = require('node:worker_threads');
const zlib = require('node:zlib');

parentPort.on('message', (message) => {
  const requestId = Number(message?.requestId);
  try {
    const raw = Buffer.from(JSON.stringify(message?.replay), 'utf8');
    const maxRawBytes = Math.max(1, Number(message?.maxRawBytes) || 1);
    const maxCompressedBytes = Math.max(1, Number(message?.maxCompressedBytes) || 1);
    if (raw.length > maxRawBytes) throw new Error('Lesson replay exceeds the storage limit');
    const compressed = zlib.gzipSync(raw, { level: 1 });
    if (compressed.length > maxCompressedBytes) {
      throw new Error('Compressed lesson replay exceeds the storage limit');
    }
    parentPort.postMessage({ requestId, rawBytes: raw.length, compressed });
  } catch (error) {
    parentPort.postMessage({
      requestId,
      error: error?.message || 'Failed to compress lesson replay.',
    });
  }
});
