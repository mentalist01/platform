import test from 'node:test';
import assert from 'node:assert/strict';
import { getLearningVoiceChannels, normalizeLearningVoiceChannels, normalizeVoiceChannelNames } from './learningVoiceChannels.js';
import { normalizeLearningGroup, updateLearningGroup } from './learningGroups.js';
import { authorizeLearningRealtimeRoom, parseLearningLessonRoomTarget } from './learningLessonAccess.js';
import { normalizeLessonHistoryRecord } from './lessonHistory.js';
import { normalizeLessonReplay } from './lessonReplay.js';

test('history and existing group replays retain access for all 20 participants', () => {
  const participantIds = Array.from({ length: 20 }, (_, index) => `student-${index + 1}`);
  const history = normalizeLessonHistoryRecord({
    studentId: 'student-20', groupId: 'g', lessonId: 'l', participantIds,
    dayKey: '2026-09-26', time: '12:00', durationMinutes: 60,
  });
  assert.deepEqual(history.participantIds, participantIds);
  const replay = normalizeLessonReplay({ occurrence: { scope: 'learning-group', participantIds } });
  assert.deepEqual(replay.occurrence.participantIds, participantIds);
});

test('creates one general channel and one per participant, with stable identities', () => {
  const lesson = { id: 'lesson-a', participantIds: ['a', 'b', 'a'] };
  const channels = getLearningVoiceChannels({}, lesson, [{ id: 'a', name: 'Анна' }]);
  assert.equal(channels.length, 3);
  assert.equal(channels[1].name, 'Анна');
  assert.equal(new Set(channels.map((channel) => channel.roomId)).size, 3);
  assert.equal(channels[1].id, getLearningVoiceChannels({}, { ...lesson, participantIds: ['b', 'a'] })[2].id);
  assert.notEqual(channels[1].roomId, getLearningVoiceChannels({}, { ...lesson, id: 'lesson-b' })[1].roomId);
  assert.equal(getLearningVoiceChannels({}, { ...lesson, participantIds: Array.from({ length: 20 }, (_, i) => String(i)) }).length, 21);
});

test('custom channels persist through normal group edits and reject malformed records', () => {
  const voiceChannels = [{ id: 'custom-pair', name: 'Работа в паре' }];
  const group = normalizeLearningGroup({ id: 'g', teacherId: 't', name: 'Группа', voiceChannels });
  assert.deepEqual(updateLearningGroup(group, { name: 'Новое имя' }).voiceChannels, voiceChannels);
  assert.deepEqual(normalizeLearningVoiceChannels([
    ...voiceChannels, ...voiceChannels, { id: 'general', name: 'Общий' }, { id: 'custom-../bad', name: 'Bad' },
  ]), voiceChannels);
});

test('channel labels use Name1; overrides survive edits and remain scoped to one group', () => {
  const lesson = { id: 'l', participantIds: ['a'] };
  const students = [{ id: 'a', name: 'Анна', nickname: 'Имя2' }];
  const original = getLearningVoiceChannels({}, lesson, students)[1];
  assert.equal(original.name, 'Анна');
  const names = { [original.id]: '  Практика\u0000  ', general: 'Разбор' };
  const group = normalizeLearningGroup({ id: 'g', teacherId: 't', name: 'Группа', voiceChannelNames: names });
  const edited = updateLearningGroup(group, { name: 'Группа 2' });
  const renamed = getLearningVoiceChannels(edited, lesson, students)[1];
  assert.equal(renamed.name, 'Практика');
  assert.equal(renamed.defaultName, 'Анна');
  assert.equal(renamed.roomId, original.roomId);
  assert.equal(getLearningVoiceChannels({}, lesson, students)[1].name, 'Анна');
  assert.equal(students[0].name, 'Анна');
  assert.deepEqual(normalizeVoiceChannelNames({ ...names, '__bad__': 'Invalid', 'student-x': 'Invalid' }), { [original.id]: 'Практика', general: 'Разбор' });
});

test('channel rooms retain lesson ACL and reject malformed or ambiguous suffixes', () => {
  const session = { id: 'lesson-a', teacherId: 't', groupId: 'g', participantIds: ['a'], status: 'active' };
  const roomId = 'rtc:lesson:lesson-a:channel:custom-pair';
  const target = parseLearningLessonRoomTarget(roomId);
  assert.equal(target.sessionId, 'lesson-a');
  assert.equal(target.channelId, 'custom-pair');
  assert.equal(target.canonicalRoomId, 'lesson:lesson-a');
  const options = { roomId, sessions: [session], allowedKinds: ['rtc'], allowedSessionStatuses: ['active'] };
  assert.equal(authorizeLearningRealtimeRoom({ ...options, auth: { id: 'a', role: 'student' } }).allowed, true);
  assert.equal(authorizeLearningRealtimeRoom({ ...options, auth: { id: 'outsider', role: 'student' } }).allowed, false);
  for (const suffix of [':channel:', ':channel:general', ':channel:a:channel:b', ':channel:../x', ':extra']) {
    assert.equal(parseLearningLessonRoomTarget(`rtc:lesson:lesson-a${suffix}`), null);
  }
});
