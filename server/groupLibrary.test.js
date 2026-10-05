import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLibraryEntitlement as access, groupLibraryCatalog as catalog, listenerSignalAllowed as signal } from './groupLibrary.js';
const now = Date.parse('2026-10-05T12:00:00Z');
const student = { id: 's', teacherId: 't' };
const groups = [{ id: 'own', teacherId: 't', name: 'Группа 2', status: 'active', members: [{ studentId: 's', status: 'active' }] }, { id: 'foreign', teacherId: 't', name: 'Группа 3', members: [] }, { id: 'other', teacherId: 'another', name: 'Чужая группа', members: [] }];
const block = { id: 'b', teacherId: 't', studentId: 's', groupId: 'own', startsAt: '2026-10-01T00:00:00Z', accessUntil: '2026-11-01T00:00:00Z', lessonIds: [], consultations: [], payment: { amount: 9600 }, tariff: { kind: 'group', lessonCount: 8 } };
test('legacy per-lesson Group 2 and both group tariffs qualify without changing memberships', () => {
  assert.equal(access(student, groups, [], [], now), true);
  for (const id of ['group-main', 'group-plus']) assert.equal(access(student, groups, [{ ...block, tariff: { ...block.tariff, id } }], [], now), true);
  assert.equal(groups[1].members.length, 0);
});
test('unpaid, future, cancelled, recordings-only, removed and other teacher do not qualify', () => {
  for (const override of [{ payment: null }, { startsAt: '2026-12-01T00:00:00Z' }, { cancelledAt: '2026-10-02T12:00:00Z' }, { tariff: { kind: 'recordings', lessonCount: 8 } }]) assert.equal(access(student, groups, [{ ...block, ...override }], [], now), false);
  assert.equal(access({ ...student, teacherId: 'another' }, groups, [], [], now), false);
  assert.equal(access(student, groups.map(group => ({ ...group, members: [] })), [], [], now), false);
});
test('catalog contains only same teacher group videos, including recovery parts; no roster or private lesson recordings', () => {
  const lessons = [{ id: 'l', groupId: 'foreign', teacherId: 't', startAt: '2026-10-05T10:00:00Z', topic: 'Графы', participantIds: ['secret'], status: 'active' }, { id: 'other-l', groupId: 'other', teacherId: 'another', startAt: '2026-10-05T10:00:00Z' }];
  const url = n => `https://rutube.ru/video/private/${String(n).padStart(32, 'a')}/?p=fixture`;
  const job = { teacherId: 't', status: 'ready', occurrence: { scope: 'learning-group', lessonId: 'l' }, video: { url: url(1) } };
  const result = catalog(student, groups, lessons, [job, { ...job, startedAt: 2, video: { url: url(2) } }, { ...job, occurrence: { scope: 'individual', lessonId: 'l' }, video: { url: url(3) } }, { ...job, teacherId: 'another', video: { url: url(4) } }, { ...job, status: 'uploading', video: { url: url(5) } }], [], () => true);
  assert.equal(result.recordings.length, 1); assert.equal(result.recordings[0].recordingParts.length, 2);
  assert.equal(result.lessons[0].canListen, true); assert.equal(result.groups.length, 2);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
test('listener SDP permits receive-only audio/video and ICE; denies sending, defaults, contradictory directions, data, malformed SDP', () => {
  const sdp = (...lines) => ({ description: { type: 'offer', sdp: ['v=0', ...lines, ''].join('\r\n') } });
  assert.equal(signal(sdp('m=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=recvonly', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=inactive')), true);
  assert.equal(signal(sdp('a=recvonly', 'm=audio 9 UDP/TLS/RTP/SAVPF 111')), true);
  assert.equal(signal({ candidate: { candidate: 'candidate:fixture' } }), true);
  assert.equal(signal({ candidate: { candidate: 'fixture' }, mediaState: { isCameraEnabled: true } }), false);
  assert.equal(signal({ control: { preferredIceTransportPolicy: 'relay', restartConnection: true } }), true);
  assert.equal(signal({ control: { preferredIceTransportPolicy: 'relay', restartConnection: true, mediaState: {} } }), false);
  for (const lines of [['m=audio 9 UDP/TLS/RTP/SAVPF 111'], ['m=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=sendonly'], ['m=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=recvonly', 'a=sendrecv'], ['a=recvonly', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel']]) assert.equal(signal(sdp(...lines)), false);
  assert.equal(signal({ description: { type: 'offer', sdp: 'malformed' } }), false);
});
