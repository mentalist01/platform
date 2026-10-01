const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dayLabels = {monday:'Понедельник',tuesday:'Вторник',wednesday:'Среда',thursday:'Четверг',friday:'Пятница',saturday:'Суббота',sunday:'Воскресенье'};
export const participationSlotLabel = slot => {const [day,time]=slot.split('|');return `${dayLabels[day] || day}, ${time}`;};
const dateFormatter = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
export const participationDay = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date).slice(0, 10) : '';
};
export function participationOccurrence(lesson = {}) {
  const date = new Date(lesson.startAt || '');
  const parts = Number.isFinite(date.getTime()) ? dateFormatter.format(date).split(' ') : [];
  const day = parts[0] || lesson.date || lesson.dayKey || '';
  const time = parts[1] || lesson.time || '';
  const dayDate = new Date(`${day}T12:00:00Z`);
  const weekday = Number.isFinite(dayDate.getTime()) ? weekdays[dayDate.getUTCDay()] : lesson.weekdayKey;
  return {day, time, slot: `${weekday}|${time}`};
}
export function normalizeParticipationPlans(value) {
  return (Array.isArray(value) ? value : []).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p?.from || '') && ['all', 'selected'].includes(p.mode)).map(p => ({
    from: p.from, mode: p.mode,
    slots: [...new Set((Array.isArray(p.slots) ? p.slots : []).filter(s => /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\|([01]\d|2[0-3]):[0-5]\d$/.test(s)))],
    effectiveAt: String(p.effectiveAt || ''), updatedAt: String(p.updatedAt || ''), updatedById: String(p.updatedById || ''),
  })).sort((a, b) => a.from.localeCompare(b.from) || a.effectiveAt.localeCompare(b.effectiveAt));
}
export function participationPlanAt(member, day = participationDay(Date.now())) {
  return normalizeParticipationPlans(member?.participationPlans).filter(p => p.from <= day).at(-1) || {mode: 'all', slots: [], from: ''};
}
export function isGroupLessonAssigned(group, studentId, lesson) {
  if (typeof lesson?.participationOverrides?.[studentId] === 'boolean') return lesson.participationOverrides[studentId];
  const member = group?.members?.find(m => m.studentId === studentId);
  if (!member) return false;
  const occurrence = participationOccurrence(lesson);
  const instant = Date.parse(lesson?.startAt || `${occurrence.day}T${occurrence.time || '00:00'}:00+03:00`);
  const plan = normalizeParticipationPlans(member.participationPlans).filter(p=>p.from<=occurrence.day
    && (!p.effectiveAt || Date.parse(p.effectiveAt)<=instant)).at(-1) || {mode:'all',slots:[]};
  return plan.mode === 'all' || plan.slots.includes(lesson?.participationSlot || occurrence.slot);
}
export const requiredGroupLessonParticipants = (group, lesson) => (lesson.participantIds || [])
  .filter(id => isGroupLessonAssigned(group, id, lesson));
