import test from 'node:test';
import assert from 'node:assert/strict';
import { publishArchiveClip } from './archive-publish.mjs';

const url = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Test_Key';
test('processing is retried without another upload, and a lost platform response keeps the same id and title', async () => {
  const clip = { id: 'clip-id', title: 'Задание 7: звук / теория', autoPublish: true };
  let uploads = 0, checks = 0, attaches = 0; const titles = []; const ids = [];
  const deps = { persist() {}, now: () => 1000,
    upload: async c => { uploads++; c.url = url; },
    ready: async () => ++checks > 1,
    attach: async payload => { attaches++; titles.push(payload.title); ids.push(payload.clipId); if (attaches === 1) throw Error('Connection lost after server commit'); return { material: { id: 'material-id' } }; },
  };
  await publishArchiveClip(clip, deps); assert.equal(clip.materialStatus, 'processing'); assert.equal(clip.nextPublishAt, 31000); assert.equal(attaches, 0);
  await publishArchiveClip(clip, deps); assert.equal(clip.materialStatus, 'error'); assert.equal(uploads, 1);
  await publishArchiveClip(clip, deps); assert.equal(clip.materialStatus, 'done'); assert.equal(clip.materialId, 'material-id');
  await publishArchiveClip(clip, deps); assert.equal(uploads, 1); assert.equal(attaches, 2);
  assert.deepEqual(ids, ['clip-id', 'clip-id']); assert.deepEqual(titles, [clip.title, clip.title]);
});
test('a failed or unconfirmed upload never attaches an unavailable/public video', async () => {
  for (const uploaded of [undefined, 'https://rutube.ru/video/1234567890abcdef1234567890abcdef/']) {
    const clip = { id: 'x', title: 'Theory' }; let attached = false;
    await publishArchiveClip(clip, { persist() {}, upload: async c => { c.url = uploaded; }, ready: async () => true, attach: async () => { attached = true; } });
    assert.equal(clip.materialStatus, 'error'); assert.equal(attached, false);
  }
});
