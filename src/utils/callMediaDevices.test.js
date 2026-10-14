import test from 'node:test';
import assert from 'node:assert/strict';
import { readCallDevices, requestCallMedia } from './callMediaDevices.js';

test('camera and microphone selections override virtual defaults independently, including diagnostics', async () => {
  const requests = [];
  const hardware = {
    async getUserMedia(constraints) {
      requests.push(constraints);
      return { camera: constraints.video?.deviceId?.exact || 'OBS', mic: constraints.audio?.deviceId?.exact || 'DroidCam' };
    },
  };
  const selected = { camera: { deviceId: 'insta360' }, microphone: { deviceId: 'pd200x' } };
  assert.deepEqual(await requestCallMedia(hardware, { video: { width: { ideal: 1280 } }, audio: { echoCancellation: true } }, selected), { camera: 'insta360', mic: 'pd200x' });
  await requestCallMedia(hardware, { audio: { noiseSuppression: false }, video: false }, selected);
  assert.equal(requests[0].audio.echoCancellation, true);
  assert.deepEqual(requests[0].video.width, { ideal: 1280 });
  assert.deepEqual(requests[1], { audio: { noiseSuppression: false, deviceId: { exact: 'pd200x' } }, video: false });
});

test('unplugged selected camera reports the device and never retries with OBS/default', async () => {
  let requests = 0;
  const hardware = { async getUserMedia() { requests++; throw Object.assign(new Error(), { name: 'OverconstrainedError' }); } };
  await assert.rejects(requestCallMedia(hardware, { video: true, audio: false }, { camera: { deviceId: 'unplugged', label: 'Insta360 Link 2C' } }), /Insta360 Link 2C/);
  assert.equal(requests, 1);
});

test('no selection preserves browser defaults; malformed storage and other accounts cannot import devices', async () => {
  const storage = { getItem: (key) => key === 'teacher:a' ? JSON.stringify({ camera: { deviceId: 'insta360', label: 'Link' }, microphone: { deviceId: 42 } }) : '{' };
  assert.equal(readCallDevices(storage, 'teacher:a').camera.deviceId, 'insta360');
  const empty = readCallDevices(storage, 'teacher:b');
  assert.equal(empty.camera.deviceId, '');
  assert.equal(readCallDevices(storage, 'teacher:a').microphone.deviceId, '');
  let actual;
  await requestCallMedia({ async getUserMedia(value) { actual = value; } }, { audio: true, video: false }, empty);
  assert.deepEqual(actual, { audio: true, video: false });
});
