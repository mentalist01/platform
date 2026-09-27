export const GROUP_SHARED_CODE_ID = '__shared__';

export function groupCodeTabs(participants, role, userId) {
  const own = role === 'teacher' || role === 'admin'
    ? participants : participants.filter(participant => participant.id === userId);
  return [{ id: GROUP_SHARED_CODE_ID, name: 'Общий код' }, ...own];
}

export function groupCodeRoom(lessonId, participantId) {
  if (!lessonId || !participantId) return null;
  return participantId === GROUP_SHARED_CODE_ID
    ? `collab-lesson-${lessonId}`
    : `collab-lesson-${lessonId}~student~${participantId}`;
}
