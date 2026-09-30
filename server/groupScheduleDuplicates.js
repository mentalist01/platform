// Google imports and the approved weekly group plan can describe the same
// occurrence. Names and storage IDs differ, but the booking is still one lesson.
export function deduplicateGroupScheduleEntries(entries) {
  const result = [], indexes = new Map();
  for (const entry of entries) {
    const key = entry.groupId && entry.date && entry.time
      ? `${entry.groupId}|${entry.date}|${entry.time}|${Number(entry.durationMinutes) || 60}` : '';
    if (!key || !indexes.has(key)) {
      if (key) indexes.set(key, result.length);
      result.push(entry);
      continue;
    }
    const index = indexes.get(key);
    // Keep Google's identity, so payment marks and room links resolve to the
    // same occurrence in the student and teacher calendars.
    if (entry.externalEventId && !result[index].externalEventId) result[index] = entry;
  }
  return result;
}

export function deduplicateGroupLessonSessions(lessons, hasRecording = () => false) {
  const candidates = new Map();
  for (const lesson of lessons) {
    if (!['google-calendar', 'availability-plan'].includes(lesson.source) || lesson.status === 'cancelled') continue;
    const key = `${lesson.groupId}|${Date.parse(lesson.startAt)}|${Number(lesson.durationMinutes) || 60}`;
    const same = candidates.get(key) || [];
    same.push(lesson); candidates.set(key, same);
  }
  const hidden = new Set();
  for (const same of candidates.values()) {
    if (!same.some(l => l.source === 'google-calendar') || !same.some(l => l.source === 'availability-plan')) continue;
    const recorded = same.filter(hasRecording);
    // Existing recordings are never hidden, even if both copies captured data.
    const kept = recorded.length ? recorded : [same.find(l => l.status === 'active') || same.find(l => l.source === 'google-calendar')];
    same.filter(l => !kept.includes(l)).forEach(l => hidden.add(l.id));
  }
  return lessons.filter(l => !hidden.has(l.id));
}
