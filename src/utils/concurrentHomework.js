const WEEK_MS = 7 * 86400000;

export const normalizeHomeworkStudyTrack = value => ['ege', 'python'].includes(value) ? value : '';
export const homeworkStudyTrackLabel = value => value === 'python' ? 'Python' : value === 'ege' ? 'ЕГЭ' : '';

// A weekly assignment keeps its explicit deadline when the other weekly
// lesson is added or rescheduled. Moscow has a fixed UTC+3 calendar.
export const weeklyHomeworkDeadline = (now = Date.now()) => new Date(Number(now) + WEEK_MS).toISOString();

export const weeklyHomeworkLessonChoices = (schedule = [], now = Date.now()) => {
  const minimum = Number(now) + 6 * 86400000;
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const local = new Date(minimum + 3 * 3600000);
  const choices = [];
  for (const entry of schedule) {
    if (!/^\d{2}:\d{2}$/.test(entry?.time || '')) continue;
    const [hours, minutes] = entry.time.split(':').map(Number);
    if (hours > 23 || minutes > 59) continue;
    let day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hours - 3, minutes));
    if (entry.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) continue;
      day = new Date(`${entry.date}T${entry.time}:00+03:00`);
    } else {
      const weekday = weekdays.indexOf(entry.weekdayKey);
      if (weekday < 0) continue;
      day = new Date(day.getTime() + ((weekday - local.getUTCDay() + 7) % 7) * 86400000);
      if (day.getTime() < minimum) day = new Date(day.getTime() + WEEK_MS);
    }
    if (!Number.isFinite(day.getTime()) || day.getTime() < minimum) continue;
    const dueAt = day.toISOString();
    if (!choices.some(choice => choice.dueAt === dueAt)) choices.push({ dueAt, subject: entry.subject || '' });
  }
  return choices.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
};

export const partitionConcurrentHomeworks = (entries = [], now = Date.now()) => {
  const latestIndividual = entries.find(entry => entry.source !== 'learning-group');
  const active = [], history = [];
  for (const entry of entries) {
    const group = entry.source === 'learning-group';
    const due = Date.parse(entry.dueAt);
    const open = group
      ? entry.learningAssignmentStatus !== 'closed' && (!Number.isFinite(due) || due > now)
      : entry === latestIndividual;
    (open ? active : history).push(entry);
  }
  active.sort((a, b) => (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity));
  return { active, history };
};
