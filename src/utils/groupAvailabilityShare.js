import {availabilitySlots} from './groupAvailability.js';

export function unanimousGroupSlots(group, poll) {
  const ids = [...new Set((group.members || []).filter(member => member.status === 'active').map(member => member.studentId || member.id).filter(Boolean))];
  if (!ids.length || !poll?.config) return [];
  return availabilitySlots(poll.config).filter(slot => ids.every(id => ['yes', 'maybe'].includes(poll.answers?.[id]?.choices?.[slot.id])))
    .map(slot => ({...slot, groupId:group.id, groupName:group.name, durationMinutes:poll.config.durationMinutes,
      memberCount:ids.length, flexibleCount:ids.filter(id => poll.answers[id].choices[slot.id] === 'maybe').length}));
}

// Compress consecutive allowed starting times, never the lessons themselves:
// 10:00 and 10:30 starts for a 60-minute lesson are two distinct choices.
export function groupAvailabilityShareCards(groups, mode = 'all') {
  const days = Array.from({length:7}, () => []);
  for (const group of groups || []) {
    const slots = (group.slots || []).filter(slot => mode !== 'free' || slot.busy === false)
      .slice().sort((a,b) => a.day-b.day || a.minutes-b.minutes);
    let previous;
    for (const slot of slots) {
      if (previous && previous.day === slot.day && previous.lastStart + 30 === slot.minutes
        && previous.durationMinutes === slot.durationMinutes && previous.busy === Boolean(slot.busy)) {
        previous.lastStart = slot.minutes;
        previous.count++;
      } else {
        previous = {groupId:group.groupId, groupName:group.groupName, day:slot.day, firstStart:slot.minutes,
          lastStart:slot.minutes, durationMinutes:slot.durationMinutes, busy:Boolean(slot.busy), count:1,
          startDate:group.config?.startDate, weeks:group.config?.weeks || 8};
        days[slot.day]?.push(previous);
      }
    }
  }
  for (const day of days) day.sort((a,b) => a.firstStart-b.firstStart || a.groupName.localeCompare(b.groupName,'ru'));
  return days;
}
