import { addCalendarDays, moscowDay, weekdayIndex, clockTime } from './groupAvailability.js';
export const rescheduleWeek = (offset = 1, now = Date.now()) => addCalendarDays(moscowDay(now), -weekdayIndex(moscowDay(now)) + offset * 7);
export const lessonStart = lesson => Date.parse(`${lesson.date}T${lesson.time}:00+03:00`);
export const lessonEnd = lesson => lessonStart(lesson) + lesson.durationMinutes * 60000;
export const lessonTimeLabel = lesson => `${lesson.time}–${clockTime(Number(lesson.time.slice(0, 2)) * 60 + Number(lesson.time.slice(3)) + lesson.durationMinutes)}`;
export const lessonDateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'Europe/Moscow' });
export const rescheduleStatus = { pending: 'Ждём ответа учителя', applying: 'Перенос в Google — требуется завершить', approved: 'Занятие перенесено', rejected: 'Учитель отклонил', cancelled: 'Запрос отменён' };
