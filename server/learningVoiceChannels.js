import { createHash } from 'node:crypto';
import { buildLessonRtcRoomId } from '../src/utils/rtcRooms.js';

export const MAX_CUSTOM_VOICE_CHANNELS = 12;
export const normalizeVoiceChannelName = (value) => String(value ?? '')
  // eslint-disable-next-line no-control-regex -- Strip invisible controls from user-visible names.
  .replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);

export const normalizeLearningVoiceChannels = (value) => {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    const id = String(entry?.id || '');
    const name = normalizeVoiceChannelName(entry?.name);
    if (!/^custom-[a-zA-Z0-9-]{1,80}$/.test(id) || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name }];
  }).slice(0, MAX_CUSTOM_VOICE_CHANNELS);
};

export const normalizeVoiceChannelNames = (value) => Object.fromEntries(
  Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    .filter(([id]) => /^(general|student-[a-f0-9]{24}|custom-[a-zA-Z0-9-]{1,80})$/.test(id))
    .map(([id, name]) => [id, normalizeVoiceChannelName(name)])
    .filter(([, name]) => name)
);

// Configuration belongs to the group; media rooms belong to one lesson only.
export const getLearningVoiceChannels = (group, lesson, students = []) => {
  const byId = new Map(students.map((student) => [student.id, student]));
  const participantIds = [...new Set((lesson?.participantIds || []).filter(Boolean))];
  const channels = [
    { id: 'general', name: 'Общий канал', kind: 'general' },
    ...participantIds.map((studentId, index) => {
      const student = byId.get(studentId);
      return {
        id: `student-${createHash('sha256').update(String(studentId)).digest('hex').slice(0, 24)}`,
        name: normalizeVoiceChannelName(student?.name) || `Ученик ${index + 1}`,
        studentId,
        kind: 'student',
      };
    }),
    ...normalizeLearningVoiceChannels(group?.voiceChannels).map((channel) => ({ ...channel, kind: 'custom' })),
  ];
  const names = normalizeVoiceChannelNames(group?.voiceChannelNames);
  return channels.map((channel) => ({
    ...channel,
    name: names[channel.id] || channel.name,
    defaultName: channel.name,
    roomId: buildLessonRtcRoomId(lesson?.id, channel.id),
  }));
};
