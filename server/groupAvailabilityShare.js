import {unanimousGroupSlots} from '../src/utils/groupAvailabilityShare.js';
import {busySlots, currentAvailabilityConfig, groupAvailabilityBusyEntries} from './groupAvailability.js';
import {addCalendarDays, moscowDay, AVAILABILITY_END_MINUTE} from '../src/utils/groupAvailability.js';

export function registerGroupAvailabilityShare(app, {groups, polls, canManage, getEntries}) {
  app.get('/api/learning-groups/availability-share', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
    const teacherId = req.auth?.role === 'teacher' ? req.auth.id : req.auth?.role === 'admin' ? String(req.query.teacherId || '') : '';
    if (!teacherId) return res.status(403).json({error:'Картинка времени групп доступна преподавателю.'});
    const currentGroups = groups().filter(group => group.teacherId === teacherId && !group.deletedAt && group.status !== 'completed' && canManage(req.auth, group));
    const saved = polls(), now = Date.now();
    const summaries = currentGroups.map(group => {
      const poll = saved[group.id];
      const config = poll?.config ? currentAvailabilityConfig({...poll.config, weeks:poll.config.weeks || 8, ...(poll.status === 'open' && poll.hoursVersion !== 1 ? {endMinute:AVAILABILITY_END_MINUTE} : {})}, now) : null;
      const memberIds = [...new Set((group.members || []).filter(member => member.status === 'active').map(member => member.studentId || member.id).filter(Boolean))];
      return {groupId:group.id, groupName:group.name, config,
        memberCount:memberIds.length, answeredCount:memberIds.filter(id => saved[group.id]?.answers?.[id]).length,
        slots:unanimousGroupSlots(group, config ? {...poll, config} : null)};
    });
    const throughDay = summaries.filter(group => group.config).map(group => addCalendarDays(group.config.startDate, (group.config.weeks || 8)*7)).sort().at(-1);
    let entries = [], calendarError = '';
    if (summaries.some(group => group.slots.length)) {
      try { entries = await getEntries(teacherId, throughDay); }
      catch { calendarError = 'Не удалось проверить занятость преподавателя. Все совпадения доступны, но вариант только со свободным временем пока сформировать нельзя. Нажмите «Обновить».'; }
    }
    const byId = new Map(currentGroups.map(group => [group.id,group]));
    for (const group of summaries) {
      const blocked = !calendarError && group.config ? busySlots(group.config, groupAvailabilityBusyEntries(byId.get(group.groupId),entries),now) : {};
      group.slots = group.slots.map(slot => ({...slot, busy:calendarError ? null : Boolean(blocked[slot.id])}));
    }
    return res.json({generatedAt:new Date(now).toISOString(), timezone:'Europe/Moscow', calendarError,
      fromDate:moscowDay(now), groups:summaries});
    } catch {return res.status(503).json({error:'Не удалось собрать время групп. Попробуйте обновить позже.'});}
  });
}
