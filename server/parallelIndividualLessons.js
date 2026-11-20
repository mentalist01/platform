import { randomUUID } from 'node:crypto';

const SESSION_LIFETIME_MS = 5 * 60 * 60 * 1000;

export function createParallelIndividualLessons({ now = Date.now } = {}) {
  const byTeacher = new Map();
  const get = (teacherId) => {
    const session = byTeacher.get(teacherId);
    if (session && session.expiresAt > now()) return session;
    if (session) byTeacher.delete(teacherId);
    return null;
  };

  return {
    start(teacherId, requestId, studentIds) {
      const existing = get(teacherId);
      if (existing) return existing.requestId === requestId ? existing : null;

      const session = {
        id: randomUUID(),
        requestId,
        studentIds: [...new Set(studentIds)],
        expiresAt: now() + SESSION_LIFETIME_MS,
      };
      byTeacher.set(teacherId, session);
      return session;
    },
    get,
    allows(teacherId, sessionId, studentId) {
      const session = get(teacherId);
      return Boolean(session && session.id === sessionId && session.studentIds.includes(studentId));
    },
    finish(teacherId, sessionId) {
      if (get(teacherId)?.id !== sessionId) return false;
      byTeacher.delete(teacherId);
      return true;
    },
  };
}
