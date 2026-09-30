export const LESSON_PRICING_OPTIONS = [
  { value: 'perLesson', label: 'За занятие', minutes: null },
  { value: 'perHour', label: 'За 60 минут', minutes: 60 },
  { value: 'per90Minutes', label: 'За 90 минут', minutes: 90 },
];

export const isDurationPricing = (mode) => mode === 'perHour' || mode === 'per90Minutes';
export const lessonPricingLabel = (mode) => LESSON_PRICING_OPTIONS
  .find((option) => option.value === mode)?.label || (mode === 'monthly' ? 'За месяц' : 'За занятие');

// lessonPrice is the agreed rate. An occurrence's lessonPrice is already its
// final amount and must never be multiplied by duration a second time.
export const calculateLessonPrice = (rate = {}, durationMinutes = 60) => {
  const price = Math.max(0, Number(rate.lessonPrice) || 0);
  const duration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 60;
  const divisor = rate.pricingMode === 'perHour' ? 60 : (rate.pricingMode === 'per90Minutes' ? 90 : 0);
  return Math.round((divisor ? price * duration / divisor : price) * 100) / 100;
};

const normalizeRate = (rate) => ({
  pricingMode: ['perLesson', 'perHour', 'per90Minutes', 'monthly'].includes(rate?.pricingMode)
    ? rate.pricingMode : 'perLesson',
  lessonPrice: Math.round(Math.max(0, Number(rate?.lessonPrice) || 0) * 100) / 100,
});

export const normalizePricingHistory = (history) => (Array.isArray(history) ? history : [])
  .filter((change) => Number.isFinite(Date.parse(change?.from)))
  .map((change) => ({ from: change.from, before: normalizeRate(change.before), after: normalizeRate(change.after) }))
  .sort((a, b) => a.from.localeCompare(b.from));

export const recordPricingChange = (profile, nextProfile, from) => {
  const history = normalizePricingHistory(profile?.pricingHistory);
  const before = normalizeRate(profile);
  const after = normalizeRate(nextProfile);
  if (before.pricingMode === after.pricingMode && before.lessonPrice === after.lessonPrice) return history;
  // Setting a previously missing price still fills the unpriced lessons.
  if (before.lessonPrice > 0 || history.length) history.push({ from, before, after });
  return history;
};

export const lessonRateAt = (profile = {}, record = {}, { dayKey, startsAt, paidAt, hasMonthlyRate = true } = {}) => {
  const history = normalizePricingHistory(profile.pricingHistory);
  const occurrenceMs = Date.parse(startsAt);
  const paidMs = Date.parse(paidAt);
  const priceMs = Number.isFinite(paidMs) ? Math.min(paidMs, occurrenceMs) : occurrenceMs;
  if (!history.length || !Number.isFinite(priceMs)) return { ...profile, ...record };
  const latest = history.findLast((change) => Date.parse(change.from) <= priceMs);
  if (latest) return latest.after;
  // Preserve older per-month prices; the first change only replaces the
  // current month's record. A prepaid future lesson keeps its original rate.
  if (!hasMonthlyRate || String(dayKey || '').slice(0, 7) >= history[0].from.slice(0, 7)) return history[0].before;
  return { ...profile, ...record };
};

export const matchLessonPaymentTotal = (amount, occurrences, priceOf, limit = 8) => {
  const target = Math.round(Number(amount) * 100);
  let total = 0;
  const selected = [];
  for (const occurrence of occurrences.slice(0, limit)) {
    const cents = Math.round(priceOf(occurrence) * 100);
    if (!(cents > 0)) return [];
    total += cents;
    selected.push(occurrence);
    if (total === target) return selected;
    if (total > target) return [];
  }
  return [];
};
