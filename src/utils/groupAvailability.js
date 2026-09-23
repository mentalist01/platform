export const AVAILABILITY_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const AVAILABILITY_DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const AVAILABILITY_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export const clockTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const moscowDay = (now = Date.now()) => new Date(now + 3 * 3600000).toISOString().slice(0, 10);
export const addCalendarDays = (day, count) => new Date(Date.parse(`${day}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
export const weekdayIndex = day => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
export function availabilitySlots(config) {
  if (!config) return [];
  const slots = [];
  for (let day = 0; day < 7; day++) for (let minutes = config.startMinute; minutes + config.durationMinutes <= config.endMinute; minutes += 30) {
    if (config.days.includes(day)) slots.push({ id: `${day}-${minutes}`, day, minutes, time: clockTime(minutes), end: clockTime(minutes + config.durationMinutes) });
  }
  return slots;
}
export function slotLabel(slot, config) {
  const found = availabilitySlots(config).find(s => s.id === slot);
  return found ? `${AVAILABILITY_DAYS[found.day]}, ${found.time}–${found.end}` : '';
}
export function slotPeople(slotId, members, answers) {
  return members.map(member => ({ ...member, choice: answers[member.id]?.choices?.[slotId] || (answers[member.id] ? 'no' : 'pending') }));
}
export function rankedSlots(poll, blocked = {}) {
  if (!poll) return [];
  return availabilitySlots(poll.config).filter(slot => !blocked[slot.id]).map(slot => {
    const people = slotPeople(slot.id, poll.members, poll.answers);
    return { ...slot, people, yes: people.filter(p => p.choice === 'yes').length, maybe: people.filter(p => p.choice === 'maybe').length,
      pending: people.filter(p => p.choice === 'pending').length, no: people.filter(p => p.choice === 'no').length };
  }).sort((a, b) => (b.yes + b.maybe) - (a.yes + a.maybe) || b.yes - a.yes || a.day - b.day || a.minutes - b.minutes);
}
export function suggestedPair(poll, blocked) {
  const ranked = rankedSlots(poll, blocked);
  const first = ranked.find(s => s.yes + s.maybe > 0);
  if (!first) return [];
  const second = ranked.find(s => s.day !== first.day && s.yes + s.maybe > 0);
  return second ? [first.id, second.id] : [first.id];
}
