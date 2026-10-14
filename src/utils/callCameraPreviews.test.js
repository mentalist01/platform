import test from 'node:test';
import assert from 'node:assert/strict';
import { withFloatingCameraStreams, visibleFloatingParticipants } from './callCameraPreviews.js';

test('floating webcams use exact participants and exclude simultaneous screen sharing', () => {
  const own = {}, camera = {}, screen = {};
  const people = [{ id: 'self', isSelf: true }, { id: 'student', isMuted: true }, { id: 'screen-only' }];
  const videos = [
    { isSelf: true, hasVideo: true, videoKind: 'screen', stream: screen },
    { isSelf: true, hasVideo: true, videoKind: 'camera', stream: own },
    { peerId: 'student', hasVideo: true, videoKind: 'screen', stream: screen },
    { peerId: 'student', hasVideo: true, videoKind: 'camera', stream: camera },
    { peerId: 'screen-only', hasVideo: true, videoKind: 'screen', stream: screen },
  ];
  const floating = withFloatingCameraStreams(people, videos);
  assert.equal(floating[0].cameraStream, own);
  assert.equal(floating[1].cameraStream, camera);
  assert.equal(floating[1].isMuted, true);
  assert.equal(floating[2].cameraStream, null);
  assert.equal(withFloatingCameraStreams(people, [])[1].cameraStream, null);
  assert.equal(withFloatingCameraStreams([{ ...people[1], isCameraEnabled: false }], videos)[0].cameraStream, null);
});

test('large groups show every enabled webcam before expanding voice-only participants', () => {
  const people = [{ id: 'self', isSelf: true }, ...Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, cameraStream: index % 2 ? {} : null }))];
  assert.deepEqual(visibleFloatingParticipants(people, false).map(p => p.id), ['self', 's1', 's3', 's5']);
  assert.equal(visibleFloatingParticipants(people, true).length, 7);
  assert.equal(visibleFloatingParticipants(people.slice(0, 2), false).length, 2);
});
