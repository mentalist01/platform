export const MAX_PRACTICE_ROOMS = 20;

const workId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const lessonIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;
const pagePattern = /^(main|[a-zA-Z0-9_-]{8,80})$/;

export const isPracticeWorkId = (value) => typeof value === 'string' && workId.test(value);
export const isPracticePageId = (value) => typeof value === 'string' && pagePattern.test(value);

export function practiceWorkspaceRoom(lessonId, roomId, type = 'board') {
  return lessonIdPattern.test(lessonId) && isPracticeWorkId(roomId)
    ? `${type === 'code' ? 'collab' : 'board'}-lesson-${lessonId}~practice~${roomId}`
    : '';
}

export function parsePracticeWorkspaceRoom(value) {
  const match = /^(board|collab)-lesson-([a-zA-Z0-9][a-zA-Z0-9._-]{0,159})~practice~([a-f0-9-]{36})$/.exec(value);
  if (!match || !isPracticeWorkId(match[3])) return null;
  return { kind: match[1], lessonId: match[2], roomId: match[3] };
}

export function normalizePracticeViewport(value) {
  const { zoom, offset } = value || {};
  if (!Number.isFinite(zoom) || zoom < 0.05 || zoom > 12
    || !Number.isFinite(offset?.x) || Math.abs(offset.x) > 1_000_000
    || !Number.isFinite(offset?.y) || Math.abs(offset.y) > 1_000_000) return undefined;
  return { zoom, offset: { x: offset.x, y: offset.y } };
}

export const practiceVoiceChannelId = (roomId) => `custom-practice-${roomId}`;

export function findPracticeRoom(practice, roomId) {
  for (const round of practice?.rounds || []) {
    const room = round.rooms.find(entry => entry.id === roomId);
    if (room) return { room, round };
  }
  return null;
}

export const getActivePracticeRound = (practice) =>
  practice?.rounds?.find(round => round.id === practice.activeRoundId) || null;

export const canAccessPracticeRoom = (auth, room) =>
  auth?.role === 'teacher' || auth?.role === 'admin'
  || (auth?.role === 'student' && Boolean(room?.studentIds.includes(auth.id)));

export function buildPracticeAssignments(studentIds, mode) {
  const size = mode === 'solo' ? 1 : 2;
  return studentIds.reduce((rooms, studentId, index) => {
    if (index % size === 0) rooms.push([]);
    rooms.at(-1).push(studentId);
    return rooms;
  }, []);
}
