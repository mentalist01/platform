// Keep manual closure separate from expiry: extending a deadline reopens only
// homework that expired automatically. Resolve on every request, not in a timer
// or the cached JSON normalizer, so a restart or an idle page cannot miss expiry.
export const getLearningAssignmentState = (assignment, now = Date.now()) => {
  const status = assignment?.acceptanceStatus || assignment?.status || 'assigned';
  if (status !== 'assigned') return { status, closureReason: status === 'closed' ? 'manual' : '' };
  const dueMs = Date.parse(assignment?.homework?.dueAt || assignment?.dueAt || '');
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  return Number.isFinite(dueMs) && Number.isFinite(nowMs) && nowMs >= dueMs
    ? { status: 'closed', closureReason: 'deadline' }
    : { status: 'assigned', closureReason: '' };
};
