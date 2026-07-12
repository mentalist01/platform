export const STUDENT_PAYMENT_REMINDER_MIN_AGE_MS = 2 * 24 * 60 * 60 * 1000;

const parseDayKey = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const parseTimeMinutes = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

const resolveOccurrenceEndMs = (entry, state, dateKey) => {
  const day = parseDayKey(dateKey);
  if (!day) return null;
  const storedEndMinutes = Number(state?.endMinutes);
  if (Number.isFinite(storedEndMinutes) && storedEndMinutes >= 0) {
    return day.getTime() + (storedEndMinutes * 60 * 1000);
  }
  const storedStartMinutes = Number(state?.startMinutes);
  const entryStartMinutes = parseTimeMinutes(entry?.time);
  const startMinutes = Number.isFinite(storedStartMinutes) && storedStartMinutes >= 0
    ? storedStartMinutes
    : entryStartMinutes;
  if (!Number.isFinite(startMinutes)) return null;
  const rawDuration = Number(entry?.durationMinutes);
  const durationMinutes = Number.isFinite(rawDuration) && rawDuration > 0
    ? Math.round(rawDuration)
    : 60;
  return day.getTime() + ((startMinutes + durationMinutes) * 60 * 1000);
};

const getEntryPaymentStates = (entry) => {
  const payment = entry?.payment && typeof entry.payment === 'object' ? entry.payment : null;
  if (!payment) return [];
  const statesByDate = payment.statesByDate && typeof payment.statesByDate === 'object'
    ? payment.statesByDate
    : {};
  const entries = Object.entries(statesByDate)
    .filter(([, state]) => state && typeof state === 'object')
    .map(([dateKey, state]) => ({ dateKey, state }));
  if (entries.length > 0) return entries;
  return [{ dateKey: payment.date || entry?.date || '', state: payment }];
};

export const getStudentPaymentReminderItems = (
  schedule,
  nowMs = Date.now(),
  minAgeMs = STUDENT_PAYMENT_REMINDER_MIN_AGE_MS
) => {
  const safeNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const safeMinAgeMs = Math.max(0, Number(minAgeMs) || 0);
  const itemsByOccurrence = new Map();

  (Array.isArray(schedule) ? schedule : []).forEach((entry) => {
    getEntryPaymentStates(entry).forEach(({ dateKey: rawDateKey, state }) => {
      const status = String(state?.status || '').trim().toLowerCase();
      if (status !== 'unpaid' || (!state?.finished && !state?.overdue)) return;
      const dateKey = String(state?.date || rawDateKey || entry?.date || '').trim();
      const endMs = resolveOccurrenceEndMs(entry, state, dateKey);
      if (!Number.isFinite(endMs) || safeNowMs - endMs < safeMinAgeMs) return;
      const startMinutes = Number.isFinite(Number(state?.startMinutes))
        ? Number(state.startMinutes)
        : parseTimeMinutes(entry?.time);
      const occurrenceKey = `${dateKey}|${Number.isFinite(startMinutes) ? startMinutes : String(entry?.time || '')}`;
      const item = {
        id: occurrenceKey,
        dateKey,
        endMs,
        startMinutes: Number.isFinite(startMinutes) ? startMinutes : null,
        time: String(entry?.time || '').trim(),
        durationMinutes: Number(entry?.durationMinutes) || 60,
        subject: String(entry?.subject || entry?.title || 'Урок').trim() || 'Урок',
      };
      const previous = itemsByOccurrence.get(occurrenceKey);
      if (!previous || item.endMs > previous.endMs) itemsByOccurrence.set(occurrenceKey, item);
    });
  });

  return Array.from(itemsByOccurrence.values())
    .sort((left, right) => right.endMs - left.endMs);
};
