// Only a real, currently scheduled, adjacent lesson may continue an existing
// call. Never extend the old deadline or invent another unscheduled hour.
export function isAdjacentRecordingSuccessor(previous, next, nowMs) {
  return Boolean(previous?.key && next?.key && previous.key !== next.key
    && !previous.lessonId && !next.lessonId && previous.studentId === next.studentId
    && Number.isFinite(previous.endMs) && previous.endMs <= nowMs
    && next.startMs === previous.endMs && next.startMs <= nowMs && next.endMs > nowMs);
}

export function currentScheduledSuccessor(active, candidates, nowMs) {
  if (!active?.key || !(active.endMs <= nowMs)) return null;
  return candidates.find(next => next.key !== active.key && next.studentId === active.studentId
    && next.startMs >= active.endMs && next.startMs <= nowMs && next.endMs > nowMs) || null;
}
