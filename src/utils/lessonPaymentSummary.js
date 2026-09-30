import { calculateLessonPrice } from './lessonPricing.js';

export const summarizeUnpaidLessons = (schedule = [], lessons = [], rate = {}) => {
  const occurrences = new Map();
  const add = (entry, dayKey, payment) => {
    if (payment?.status !== 'unpaid' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
    const duration = Number(entry.durationMinutes) || 60;
    const key = `${dayKey}:${entry.time || ''}:${duration}`;
    const amount = payment.amount != null ? Number(payment.amount) : calculateLessonPrice(rate, duration);
    occurrences.set(key, { dayKey, amount: Math.max(0, amount || 0) });
  };
  schedule.forEach((entry) => Object.entries(entry?.payment?.statesByDate || {})
    .forEach(([dayKey, payment]) => add(entry, dayKey, payment)));
  lessons.forEach((entry) => add(entry, entry.dayKey || entry.date, entry.payment));
  const rows = Array.from(occurrences.values());
  return {
    count: rows.length,
    amount: Math.round(rows.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100,
    amountKnown: rows.length > 0 && rows.every((entry) => entry.amount > 0),
    dates: Array.from(new Set(rows.map((entry) => entry.dayKey))).sort(),
  };
};
