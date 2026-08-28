import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import zlib from 'node:zlib';

const compressReplay = (replay) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./lessonReplayCompressWorker.cjs', import.meta.url), {
    workerData: {
      replay,
      maxRawBytes: 1024 * 1024,
      maxCompressedBytes: 1024 * 1024,
    },
  });
  worker.once('message', (result) => {
    void worker.terminate();
    if (result?.error) reject(new Error(result.error));
    else resolve(result);
  });
  worker.once('error', reject);
});

test('lesson replay worker serializes and compresses replay data', async () => {
  const replay = {
    occurrence: { key: 'student:2026-08-28T17:00:00.000Z' },
    events: Array.from({ length: 100 }, (_, index) => ({
      id: `event-${index}`,
      type: 'board',
      payload: { text: `value-${index}` },
    })),
  };

  const result = await compressReplay(replay);
  const restored = JSON.parse(zlib.gunzipSync(Buffer.from(result.compressed)).toString('utf8'));

  assert.equal(result.rawBytes, Buffer.byteLength(JSON.stringify(replay), 'utf8'));
  assert.deepEqual(restored, replay);
});
