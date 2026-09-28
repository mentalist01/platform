// A recurring entry keeps its identity for history, payments and single-lesson moves.
export const isScheduleEntryInDateRange = (entry, day) => Boolean(entry?.date || (
  (!entry?.repeatFrom || day >= entry.repeatFrom) && (!entry?.repeatUntil || day <= entry.repeatUntil)
));
