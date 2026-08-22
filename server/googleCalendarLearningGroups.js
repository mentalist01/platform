import crypto from 'node:crypto';

export const normalizeGoogleCalendarLearningGroupName = (value) => String(value || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^0-9a-zа-я]+/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isUnfinishedLearningGroup = (group) => (
  group
  && !group.deletedAt
  && !group.completedAt
  && String(group.status || '').trim().toLowerCase() !== 'completed'
);

export const resolveGoogleCalendarLearningGroupMatch = ({
  title,
  teacherId,
  groups = [],
} = {}) => {
  const normalizedTitle = normalizeGoogleCalendarLearningGroupName(title);
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTitle || !normalizedTeacherId) {
    return { group: null, ambiguous: false, matchedGroupIds: [] };
  }

  const matches = (Array.isArray(groups) ? groups : []).filter((group) => (
    isUnfinishedLearningGroup(group)
    && String(group.teacherId || '').trim() === normalizedTeacherId
    && normalizeGoogleCalendarLearningGroupName(group.name) === normalizedTitle
  ));
  const matchedGroupIds = matches
    .map((group) => String(group?.id || '').trim())
    .filter(Boolean);
  return {
    group: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
    matchedGroupIds,
  };
};

export const buildGoogleCalendarLearningLessonId = ({
  teacherId,
  groupId,
  externalEventId,
  startAt,
} = {}) => {
  const parts = [teacherId, groupId, externalEventId, startAt]
    .map((value) => String(value || '').trim());
  if (parts.some((value) => !value)) return '';
  const hash = crypto.createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 24);
  return `google-group-lesson-${hash}`;
};
