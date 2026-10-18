// A rescheduled duration can leave two history records with the same start.
// Count that time once for both parts of the introductory-period display.
export function homeworkLivesLessonHistory(individual, groups, nowMs = Date.now()) {
  const byStart = new Map();
  for (const lesson of [...individual, ...groups]) {
    const start = Number(lesson.startMs), end = Number(lesson.endMs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start > nowMs) continue;
    byStart.set(start, Math.max(byStart.get(start) ?? end, end));
  }
  return {
    startedLessonTimes: [...byStart.keys()],
    completedLessonTimes: [...byStart.values()].filter(end => end <= nowMs),
  };
}
