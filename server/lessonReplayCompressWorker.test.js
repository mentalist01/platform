import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import zlib from 'node:zlib';

let requestId = 0;
const compressReplay = (worker, replay) => new Promise((resolve, reject) => {
  requestId += 1;
  const currentRequestId = requestId;
  const cleanup = () => {
    worker.off('message', onMessage);
    worker.off('error', onError);
  };
  const onMessage = (result) => {
    if (result?.requestId !== currentRequestId) return;
    cleanup();
    if (result?.error) reject(new Error(result.error));
    else resolve(result);
  };
  const onError = (error) => {
    cleanup();
    reject(error);
  };
  worker.on('message', onMessage);
  worker.on('error', onError);
  worker.postMessage({
    requestId: currentRequestId,
    replay,
    maxRawBytes: 1024 * 1024,
    maxCompressedBytes: 1024 * 1024,
  });
});

test('lesson replay worker serializes and compresses replay data', async (context) => {
  const worker = new Worker(new URL('./lessonReplayCompressWorker.cjs', import.meta.url));
  context.after(() => worker.terminate());
  const replay = {
    occurrence: { key: 'student:2026-08-28T17:00:00.000Z' },
    events: Array.from({ length: 100 }, (_, index) => ({
      id: `event-${index}`,
      type: 'board',
      payload: { text: `value-${index}` },
    })),
  };

  const result = await compressReplay(worker, replay);
  const restored = JSON.parse(zlib.gunzipSync(Buffer.from(result.compressed)).toString('utf8'));

  assert.equal(result.rawBytes, Buffer.byteLength(JSON.stringify(replay), 'utf8'));
  assert.deepEqual(restored, replay);

  const secondResult = await compressReplay(worker, { occurrence: { key: 'second' }, events: [] });
  const secondRestored = JSON.parse(zlib.gunzipSync(Buffer.from(secondResult.compressed)).toString('utf8'));
  assert.equal(secondRestored.occurrence.key, 'second');
});
