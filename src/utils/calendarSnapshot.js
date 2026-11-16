// A response started before a completed edit must not restore the old time.
export function createCalendarSnapshotGuard() {
  let revision = 0;
  return { begin: () => ++revision, invalidate: () => ++revision, isCurrent: token => token === revision };
}

// Publish each source as soon as it is ready. Trial bookings must not hold the
// timetable behind a spinner; both sources still share the edit/reload guard.
export async function loadCalendarSnapshot({ guard, schedule, trials, onSchedule, onTrials, onScheduleError, onTrialsError, onScheduleSettled }) {
  const token = guard.begin();
  const run = async (request, accept, reject, settled) => {
    try {
      const result = await request();
      if (guard.isCurrent(token)) accept(result);
    } catch (error) {
      if (guard.isCurrent(token)) reject(error);
    } finally {
      if (guard.isCurrent(token)) settled?.();
    }
  };
  await Promise.all([
    run(schedule, onSchedule, onScheduleError, onScheduleSettled),
    run(trials, onTrials, onTrialsError),
  ]);
}

export function applySavedCalendarEdit(entries, { source, entry }) {
  if (!entry?.id) return entries;
  const result = entries.flatMap(value => {
    const original = source && (value.id === source.id || source.externalEventId && value.externalEventId === source.externalEventId)
      && value.time === source.time && (!value.date || value.date === source.date);
    if (original) return value.date ? [] : [{ ...value, excludedDates: [...new Set([...(value.excludedDates || []), source.date])] }];
    if (value.id === entry.id || entry.externalEventId && value.externalEventId === entry.externalEventId && value.date === entry.date && value.time === entry.time) return [];
    return [value];
  });
  return [...result, entry];
}
