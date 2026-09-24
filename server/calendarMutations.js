// Shared by group approvals and individual lesson moves on this server.
export const calendarMutationLocks = new Map();
export async function withTeacherCalendarLock(teacherId, task) {
  const previous = calendarMutationLocks.get(teacherId) || Promise.resolve();
  let release;
  const tail = new Promise(resolve => { release = resolve; });
  calendarMutationLocks.set(teacherId, tail);
  await previous;
  try { return await task(); }
  finally { release(); if (calendarMutationLocks.get(teacherId) === tail) calendarMutationLocks.delete(teacherId); }
}
