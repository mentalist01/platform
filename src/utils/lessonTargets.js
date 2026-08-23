export const LEARNING_GROUP_TARGET_PREFIX = 'learning-group:';

export const buildLearningGroupTargetValue = (groupId) => {
  const normalizedGroupId = String(groupId || '').trim();
  return normalizedGroupId ? `${LEARNING_GROUP_TARGET_PREFIX}${normalizedGroupId}` : '';
};

export const parseLessonTargetValue = (value) => {
  const normalizedValue = String(value || '').trim();
  if (normalizedValue.startsWith(LEARNING_GROUP_TARGET_PREFIX)) {
    return {
      type: 'group',
      id: normalizedValue.slice(LEARNING_GROUP_TARGET_PREFIX.length).trim(),
    };
  }
  return { type: 'student', id: normalizedValue };
};

const parseTimestamp = (value) => {
  const timestamp = Date.parse(String(value || '').trim());
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getStudentActiveLearningGroups = (groups, studentId) => {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) return [];
  return (Array.isArray(groups) ? groups : [])
    .filter((group) => (
      String(group?.status || '').trim() === 'active'
      && (Array.isArray(group?.members) ? group.members : []).some((member) => (
        String(member?.studentId || member?.id || '').trim() === normalizedStudentId
        && String(member?.status || '').trim() === 'active'
      ))
    ))
    .sort((left, right) => (
      parseTimestamp(right?.updatedAt || right?.startedAt)
      - parseTimestamp(left?.updatedAt || left?.startedAt)
    ));
};

export const selectLearningGroupWorkspaceLesson = (lessons, nowValue = Date.now()) => {
  const now = Number(nowValue);
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const candidates = (Array.isArray(lessons) ? lessons : [])
    .filter((lesson) => String(lesson?.status || '').trim() !== 'cancelled')
    .map((lesson) => {
      const startMs = parseTimestamp(lesson?.startsAt || lesson?.startAt);
      const durationMs = Math.max(15, Number(lesson?.durationMinutes) || 60) * 60 * 1000;
      const endMs = startMs + durationMs;
      const status = String(lesson?.status || '').trim();
      let priority = 4;
      if (status === 'active') priority = 0;
      else if (startMs > 0 && startMs <= nowMs && nowMs <= endMs + (30 * 60 * 1000)) priority = 1;
      else if (startMs >= nowMs) priority = 2;
      else if (status !== 'completed') priority = 3;
      return { lesson, startMs, priority };
    });

  candidates.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    if (left.priority <= 2) return left.startMs - right.startMs;
    return right.startMs - left.startMs;
  });
  return candidates[0]?.lesson || null;
};
