import { AVAILABILITY_DAYS, availabilitySlots } from './groupAvailability.js';
import { lessonTimeLabel } from './lessonReschedule.js';

export const weeklyScheduleStatus = { pending: 'Ждём подтверждения учителя', applying: 'Завершаем подтверждение', approved: 'Расписание подтверждено', rejected: 'Учитель отклонил', cancelled: 'Запрос отменён' };
export const weeklyScheduleLabel = row => availabilitySlots(row.config).filter(s => row.slots.includes(s.id))
  .map(s => `${AVAILABILITY_DAYS[s.day]} ${lessonTimeLabel({ time: s.time, durationMinutes: row.config.durationMinutes })}`).join(' · ');

