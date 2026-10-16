import { getMonthlyMockMonth, getMonthlyMockPeriod, getMonthlyMockPublication } from './monthlyMockExam.js';

const text = value => String(value ?? '').trim();
const time = value => Date.parse(text(value));

// Historical results remain stored. Only an actual teacher assignment makes an
// online attempt part of the pupil's measured exam progress.
export function isAssignedMockAttempt({ examId, exam, attempt = {}, studentData = {}, teacherId = '' }) {
  const snapshot = attempt.attemptSnapshot || {};
  const data = { ...snapshot, ...attempt };
  if (typeof data.assignedForStatistics === 'boolean') return data.assignedForStatistics;
  if (exam?.source === 'personal-random' || data.assignmentSource === 'self') return false;
  if (['homework', 'monthly'].includes(data.assignmentSource)) return true;
  if (text(data.homeworkId) || text(data.homeworkIssuedAt)) return true;
  const started = [data.timerStartedAt, data.modeLockedAt, data.finishedAt, data.timerFinishedAt, data.updatedAt]
    .map(time).find(Number.isFinite);
  if (!Number.isFinite(started)) return false;
  const month = getMonthlyMockMonth(started);
  for (const candidate of [exam, data.examSnapshot]) {
    const publication = getMonthlyMockPublication(candidate, teacherId, month);
    const serializedMonthly = Array.isArray(candidate?.monthlyAssignedMonths) && candidate.monthlyAssignedMonths.includes(month);
    const publishedAt = publication?.publishesAtMs ?? (serializedMonthly
      ? getMonthlyMockPeriod(month).startMs + (Math.max(1, Number(candidate.monthlyPublicationDay) || 1) - 1) * 86_400_000
      : null);
    if (publishedAt != null && started >= publishedAt) return true;
  }
  return (Array.isArray(studentData.homeworks) ? studentData.homeworks : []).some(homework => {
    const issued = time(homework.issuedAt || homework.createdAt);
    if (!Number.isFinite(issued) || issued > started) return false;
    const goals = Array.isArray(homework.goals) ? homework.goals : [homework];
    return goals.some(goal => (goal?.type === 'mock' || !goal?.type) && text(goal?.mockExamId) === text(examId));
  });
}
