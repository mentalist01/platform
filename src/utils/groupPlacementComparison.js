import { availabilitySlots } from './groupAvailability.js';

const available = value => value === 'yes' || value === 'maybe';
export const PLACEMENT_CHOICE_LABELS = {
  yes: 'Удобно', maybe: 'Подстроится', no: 'Не подходит', unmarked: 'Не выбрано', pending: 'Нет ответа', outside: 'Не спрашивали',
};

// A temporary extra answer in the actual group grid. Never mutate the saved poll.
export function buildAvailabilityTryOn(snapshot, student, answers = []) {
  if (!snapshot?.poll || !student?.id) return snapshot?.poll || null;
  const poll = snapshot.poll;
  const own = answers.find(value => value.durationMinutes === poll.config.durationMinutes && value.answer);
  const scope = new Set(availabilitySlots(own?.config).map(slot => slot.id));
  const choices = Object.fromEntries(availabilitySlots(poll.config).map(slot => [slot.id,
    !scope.has(slot.id) ? 'outside' : own.answer.choices?.[slot.id] || 'no']));
  const augmented = { ...poll.answers };
  if (own) augmented[student.id] = { ...own.answer, choices };
  else delete augmented[student.id];
  return { ...poll, members: [...poll.members.filter(member => member.id !== student.id), { ...student, candidate: true }], answers: augmented };
}

export function comparisonDurations(group, snapshot, answers) {
  const values = [snapshot?.poll?.config?.durationMinutes,
    ...(group.mode === 'schedule' ? (group.slots || []).map(slot => slot.durationMinutes) : [])].filter(Number.isFinite);
  return [...new Set(values.length ? values : [answers.find(value => value.answer)?.durationMinutes || 60])].sort((a, b) => a - b);
}

// Only compare exact lesson starts and durations; never infer a longer slot from short answers.
export function buildPlacementComparison({ student, answers = [], group, snapshot, duration }) {
  const poll = snapshot?.poll;
  const own = answers.find(value => value.durationMinutes === duration && value.answer);
  const ownSlots = new Map(availabilitySlots(own?.config).map(slot => [slot.id, slot]));
  const pollSlots = new Map((poll?.config?.durationMinutes === duration ? availabilitySlots(poll.config) : []).map(slot => [slot.id, slot]));
  const members = (poll?.members || group.members || []).filter(member => member.id !== student.id);
  const columns = [{ ...student, candidate: true }, ...members];
  const rows = new Map();
  for (const slot of ownSlots.values()) if (available(own.answer.choices?.[slot.id])) rows.set(slot.id, slot);
  for (const slot of pollSlots.values()) {
    if (members.some(member => available(poll.answers?.[member.id]?.choices?.[slot.id]))) rows.set(slot.id, slot);
  }
  const scheduled = (group.mode === 'schedule' ? group.slots || [] : []).filter(slot => slot.durationMinutes === duration);
  const scheduledIds = new Set(scheduled.map(slot => slot.id));
  for (const slot of scheduled) rows.set(slot.id, slot);
  return {
    columns,
    rows: [...rows.values()].map(slot => {
      const choices = columns.map(member => {
        const answer = member.candidate ? own?.answer : poll?.answers?.[member.id];
        const scope = member.candidate ? ownSlots : pollSlots;
        if (!answer) return 'pending';
        if (!scope.has(slot.id)) return 'outside';
        return answer.choices?.[slot.id] || 'unmarked';
      });
      const common = members.length > 0 && choices.every(available);
      return { ...slot, choices, common, flexible: common && choices.includes('maybe'), scheduled: scheduledIds.has(slot.id),
        blocked: Boolean(snapshot?.blocked?.[slot.id]?.length) };
    }).sort((a, b) => a.day - b.day || a.minutes - b.minutes),
    missingOwn: !own,
  };
}
