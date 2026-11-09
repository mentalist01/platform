import { addCalendarDays, weekdayIndex } from './groupAvailability.js';

export function buildPreparationSchedule(input) {
  const count = Number(input?.count), durationMinutes = Number(input?.durationMinutes);
  const startDate = input?.startDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !Number.isFinite(Date.parse(startDate))
    || new Date(startDate).toISOString().slice(0, 10) !== startDate) throw Error('Выберите дату начала.');
  if (!Number.isInteger(count) || count < 1 || count > 50) throw Error('Укажите от 1 до 50 занятий.');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 180) throw Error('Длительность — от 15 до 180 минут.');
  if (!Array.isArray(input.slots) || !input.slots.length || input.slots.length > 7) throw Error('Добавьте дни и время занятий.');
  const slots = input.slots.map(slot => {
    const day = Number(slot.day), time = slot.time;
    if (!Number.isInteger(day) || day < 0 || day > 6 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '')
      || Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + durationMinutes > 1440) throw Error('Проверьте дни и время занятий.');
    return { day, time };
  });
  if (new Set(slots.map(slot => slot.day)).size !== slots.length) throw Error('Выберите разные дни недели.');
  const lessons = [];
  for (let offset = 0; lessons.length < count; offset++) {
    const date = addCalendarDays(startDate, offset), slot = slots.find(value => value.day === weekdayIndex(date));
    if (slot) lessons.push({ date, time: slot.time, durationMinutes });
  }
  return { config: { count, durationMinutes, startDate, slots }, lessons };
}
