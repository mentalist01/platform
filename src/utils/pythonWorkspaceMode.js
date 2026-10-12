import {buildLearningGroupTargetValue, LEARNING_GROUP_LESSON_OVERRUN_GRACE_MS} from './lessonTargets.js';

// Membership alone is not a lesson. A scheduled lesson applies only during its
// time window; an explicitly active session can continue until it is finished.
export function currentPythonGroupLesson(lesson, studentId, now = Date.now()) {
  if (!lesson?.groupId || !lesson?.lessonId || lesson.readOnly || lesson.notStarted
    || ['completed', 'cancelled'].includes(lesson.status)) return null;
  if (!Array.isArray(lesson.participantIds) || !lesson.participantIds.includes(studentId)) return null;
  if (lesson.participationOverrides?.[studentId] === false) return null;
  const start = Date.parse(lesson.startsAt || lesson.startAt || '');
  if (!Number.isFinite(start) || now < start) return null;
  const end = start + Math.max(15, Number(lesson.durationMinutes) || 60) * 60_000;
  const extra = lesson.status === 'active' || lesson.replayActive ? LEARNING_GROUP_LESSON_OVERRUN_GRACE_MS : 0;
  if (now >= end + extra) return null;
  return {groupId:lesson.groupId, key:`${lesson.groupId}:${lesson.lessonId}`};
}

export function resolvePythonWorkspaceMode({teacher, initialGroupId, lesson, studentId, now, manual, personalTask}) {
  const current = teacher ? null : currentPythonGroupLesson(lesson, studentId, now);
  const scope = teacher ? 'teacher' : current?.key || 'personal';
  const chosen = manual?.scope === scope ? manual : null;
  const personalWork = !teacher && (personalTask || chosen?.personalWork === true);
  return {
    scope,
    lessonGroupId:current?.groupId || '',
    personalWork,
    target:personalWork ? '' : chosen ? chosen.target : buildLearningGroupTargetValue(teacher ? initialGroupId : current?.groupId),
  };
}
