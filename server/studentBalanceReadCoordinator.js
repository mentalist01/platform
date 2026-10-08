// Reconciliation requested by a read may be reused briefly when its backing
// stores have not changed. Financial actions must bypass this coordinator.
// `enqueue` must serialize callbacks with the teacher's financial writes, and
// `version` must include every store/calendar revision used by reconciliation.
export function createStudentBalanceReadCoordinator({
  now = Date.now,
  version,
  enqueue,
  reconcile,
  ttlMs = 15_000,
}) {
  if (![version, enqueue, reconcile, now].every(value => typeof value === 'function')) {
    throw new TypeError('Balance read coordination requires function dependencies');
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TypeError('Balance read cache TTL must be positive');
  }

  const teachers = new Map();
  const fresh = timestamp => {
    if (timestamp == null) return false;
    const age = now() - timestamp;
    return age >= 0 && age < ttlMs;
  };
  const covered = (teacherId, studentId, sourceVersion) => {
    const cached = teachers.get(teacherId);
    if (!cached) return false;
    if (cached.version !== sourceVersion) {
      teachers.delete(teacherId);
      return false;
    }
    return fresh(cached.allAt) || (studentId !== '' && fresh(cached.students.get(studentId)));
  };

  return async function reconcileRead(teacherId, studentId = '') {
    const teacherKey = String(teacherId || '').trim();
    const studentKey = String(studentId || '').trim();
    if (!teacherKey) throw new TypeError('Balance reconciliation requires a teacher');
    try {
      return await enqueue(teacherKey, async () => {
        // Even a covered read waits behind preceding financial actions. A
        // cache hit outside this queue could return before their pending write.
        // Earlier queued reads/writes may have changed the version or already
        // reconciled this scope while this request waited for the teacher lock.
        const beforeVersion = await version(teacherKey);
        if (covered(teacherKey, studentKey, beforeVersion)) return;
        const previous = teachers.get(teacherKey);
        const result = await reconcile(teacherKey, studentKey);
        const afterVersion = await version(teacherKey);
        // A changed source invalidates other scopes. Only the reconciliation
        // that just succeeded is known to cover the new source version.
        const cached = previous && previous.version === afterVersion
          ? previous
          : { version: afterVersion, allAt: null, students: new Map() };
        if (studentKey) cached.students.set(studentKey, now());
        else {
          cached.allAt = now();
          cached.students.clear();
        }
        teachers.set(teacherKey, cached);
        return result;
      });
    } catch (error) {
      // Failed/version-unreadable runs must never count as successful reads.
      teachers.delete(teacherKey);
      throw error;
    }
  };
}
