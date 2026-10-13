import {availabilitySlots} from './groupAvailability.js';

export function unanimousGroupSlots(group, poll) {
  const ids = [...new Set((group.members || []).filter(member => member.status === 'active').map(member => member.studentId || member.id).filter(Boolean))];
  if (!ids.length || !poll?.config) return [];
  return availabilitySlots(poll.config).filter(slot => ids.every(id => ['yes', 'maybe'].includes(poll.answers?.[id]?.choices?.[slot.id])))
    .map(slot => ({...slot, groupId:group.id, groupName:group.name, durationMinutes:poll.config.durationMinutes,
      memberCount:ids.length, flexibleCount:ids.filter(id => poll.answers[id].choices[slot.id] === 'maybe').length}));
}

export function groupAvailabilityCandidates(group, poll) {
  const ids = [...new Set((group.members || []).filter(member => member.status === 'active').map(member => member.studentId || member.id).filter(Boolean))];
  if (!ids.length || !poll?.config) return [];
  return availabilitySlots(poll.config).map(slot => ({...slot, groupId:group.id, groupName:group.name, durationMinutes:poll.config.durationMinutes,
    availableMemberIds:ids.filter(id => ['yes','maybe'].includes(poll.answers?.[id]?.choices?.[slot.id])),
    flexibleMemberIds:ids.filter(id => poll.answers?.[id]?.choices?.[slot.id] === 'maybe')}))
    .filter(slot => slot.availableMemberIds.length);
}

// Exclusions are a local preview choice, never an edit to membership or answers.
export function selectGroupAvailabilityParticipants(data, exclusions = {}) {
  if (!data) return null;
  return {...data, groups:data.groups.map(group => {
    if (!Array.isArray(group.members) || !Array.isArray(group.candidates)) return group;
    const excluded = new Set(Array.isArray(exclusions[group.groupId]) ? exclusions[group.groupId] : []);
    const included = group.members.filter(member => !excluded.has(member.id));
    const includedIds = included.map(member => member.id);
    const slots = includedIds.length ? group.candidates.filter(slot => includedIds.every(id => slot.availableMemberIds.includes(id)))
      .map(slot => ({...slot, memberCount:includedIds.length, flexibleCount:includedIds.filter(id=>slot.flexibleMemberIds.includes(id)).length})) : [];
    return {...group, includedMemberCount:includedIds.length, excludedMemberCount:group.members.length-includedIds.length,
      includedAnsweredCount:included.filter(member => member.answered).length, slots};
  })};
}

// Each choice shows the whole lesson, including overlapping alternatives.
export function groupAvailabilityShareCards(groups, mode = 'all') {
  const days = Array.from({length:7}, () => []);
  for (const group of groups || []) {
    const slots = (group.slots || []).filter(slot => mode !== 'free' || slot.busy === false)
      .slice().sort((a,b) => a.day-b.day || a.minutes-b.minutes);
    for (const slot of slots) {
        const card = {groupId:group.groupId, groupName:group.groupName, day:slot.day, firstStart:slot.minutes,
          durationMinutes:slot.durationMinutes, busy:Boolean(slot.busy),
          startDate:group.config?.startDate, weeks:group.config?.weeks || 8,
          memberCount:group.memberCount, includedMemberCount:group.includedMemberCount ?? group.memberCount};
        days[slot.day]?.push(card);
    }
  }
  for (const day of days) day.sort((a,b) => a.firstStart-b.firstStart || a.groupName.localeCompare(b.groupName,'ru'));
  return days;
}
