const MAX_LESSON_ID_LENGTH = 160;
const SAFE_LESSON_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._~-]*$/;

const normalizeId = (value) => String(value ?? '').trim();

export const buildLessonRtcRoomId = (lessonId, channelId = 'general') => {
  const normalizedLessonId = normalizeId(lessonId);
  if (
    !normalizedLessonId
    || normalizedLessonId.length > MAX_LESSON_ID_LENGTH
    || !SAFE_LESSON_ID_PATTERN.test(normalizedLessonId)
  ) {
    return '';
  }
  const channel = normalizeId(channelId);
  if (!channel || channel.length > 160 || !SAFE_LESSON_ID_PATTERN.test(channel)) return '';
  return `rtc:lesson:${normalizedLessonId}${channel === 'general' ? '' : `:channel:${channel}`}`;
};

export const buildLegacyRtcRoomId = (teacherId, studentId) => {
  const normalizedTeacherId = normalizeId(teacherId);
  const normalizedStudentId = normalizeId(studentId);
  return normalizedTeacherId && normalizedStudentId
    ? `rtc:${normalizedTeacherId}:${normalizedStudentId}`
    : '';
};

export const resolveCallRtcRoom = ({ lessonId, teacherId, studentId, channelId = 'general' } = {}) => {
  const requestedLessonId = normalizeId(lessonId);
  if (requestedLessonId) {
    const roomId = buildLessonRtcRoomId(requestedLessonId, channelId);
    return {
      mode: 'group',
      isGroupLesson: true,
      lessonId: roomId ? requestedLessonId : '',
      roomId,
    };
  }

  return {
    mode: 'individual',
    isGroupLesson: false,
    lessonId: '',
    roomId: buildLegacyRtcRoomId(teacherId, studentId),
  };
};

export const normalizeRtcParticipantIds = (participantIds) => {
  if (!Array.isArray(participantIds)) return [];
  return Array.from(new Set(participantIds.map(normalizeId).filter(Boolean)));
};
