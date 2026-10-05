import { buildWeeklyTaskPracticeStats, WEEKLY_TASK_PRACTICE_TARGET, WEEKLY_TASK_PRACTICE_REFRESH_TARGET } from './weeklyTaskPractice.js';

export function buildPythonPracticeTargets(testsDb = {}, levelId = 'python') {
  const targets = {};
  Object.entries(testsDb || {}).forEach(([key, entry]) => {
    if (!Number.isInteger(Number(key)) || Number(key) < 100 || !Array.isArray(entry?.[levelId])) return;
    const count = new Set(entry[levelId].map((question, index) => String(question?.id ?? index))).size;
    if (!count) return;
    targets[key] = { target: Math.min(WEEKLY_TASK_PRACTICE_TARGET, count), refreshTarget: Math.min(WEEKLY_TASK_PRACTICE_REFRESH_TARGET, count) };
  });
  return targets;
}

export function buildPracticeStatsForTests(studentData, testsDb, options = {}) {
  const taskTargets = buildPythonPracticeTargets(testsDb);
  const stats = buildWeeklyTaskPracticeStats(studentData, { ...options, taskTargets });
  const milestones = { ...studentData?.weeklyTaskPracticeMilestones };
  let migrated = false;
  Object.entries(taskTargets).forEach(([key, { target }]) => {
    if (stats[key]?.hasEstablishedPractice || !(Number(studentData?.progress?.[key]) >= 85)) return;
    const knownIds = new Set((testsDb[key]?.python || []).map((question, index) => String(question?.id ?? index)));
    const solvedIds = new Set((studentData?.solvedByTask?.[key]?.python?.solved || []).map(String).filter(id => knownIds.has(id)));
    if (solvedIds.size < target) return;
    // Older Python topics may have been tracked against the ordinary ten-task
    // norm. Already learned topics can enter review without earning it again.
    milestones[key] = { ...milestones[key], tracked: true, established: true, legacy: true, ...(stats[key]?.lastSolvedAt ? { qualifiedAt: stats[key].lastSolvedAt } : {}) };
    migrated = true;
  });
  return migrated
    ? buildWeeklyTaskPracticeStats({ ...studentData, weeklyTaskPracticeMilestones: milestones }, { ...options, taskTargets })
    : stats;
}

export const isPythonReviewDue = indicator => indicator?.phase === 'refresh'
  && ['due', 'stale', 'unknown', 'building-low', 'building-mid', 'building-high'].includes(indicator?.key);

export function pythonReviewDraftKey({ studentId, taskNumber, questionId, cycle }) {
  return `python-review:${JSON.stringify([String(studentId || ''), String(taskNumber), String(questionId), String(cycle || '')])}`;
}

export function getPythonReviewSolvedIds(history, cycle, referenceDate = new Date()) {
  const referenceDay = Math.floor(Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()) / 86400000);
  const windowStart = Math.max(Number(cycle) || 0, referenceDay - 6);
  return new Set(Object.entries(history || {}).filter(([, entries]) => Array.isArray(entries) && entries.some(entry => {
    if (entry?.correct !== true) return false;
    const date = new Date(entry.localDay ? entry.localDay + 'T12:00:00' : entry.submittedAt);
    const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    return day >= windowStart && day <= referenceDay;
  })).map(([id]) => String(id)));
}

export function getPythonReviewQuestionIndex({ task, testsDb, studentData, stats }) {
  const questions = testsDb?.[task.number]?.python || [];
  const solved = new Set((studentData?.solvedByTask?.[task.number]?.python?.solved || []).map(String));
  const history = studentData?.solvedByTask?.[task.number]?.python?.answerHistory || {};
  const windowStart = Math.max(Number(stats?.nextDueDay) || 0, Number(stats?.referenceDay) - 6);
  const items = questions.map((question, index) => {
    const id = String(question.id ?? index);
    const attempted = (history[id] || []).some(entry => {
      const date = new Date(entry.localDay ? entry.localDay + 'T12:00:00' : entry.submittedAt);
      const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
      return day >= windowStart && day <= stats?.referenceDay;
    });
    return { index, attempted, solved: solved.has(id) };
  });
  return items.find(item => item.solved && !item.attempted)?.index
    ?? items.find(item => !item.attempted)?.index ?? 0;
}
