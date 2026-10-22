import { isOptionalHomeworkGoal } from './homeworkAssignmentTier.js';

// Python homework is preparation for a lesson, not a graded obligation.
// Use stored directions and concrete goals; never guess from a free-form title.
export const isPythonHomeworkGoal = goal => goal?.type !== 'mock' && !goal?.mockExamId
  && (Number(goal?.taskNumber) >= 100 || goal?.levelId === 'python');

const goalsOf = homework => Array.isArray(homework?.goals) && homework.goals.length
  ? homework.goals : Number(homework?.taskNumber) > 0 ? [homework] : [];

export const hasPythonHomeworkPractice = homework => homework?.studyTrack === 'python'
  || goalsOf(homework).some(isPythonHomeworkGoal);

export const isPythonPracticeHomework = homework => {
  const goals = goalsOf(homework);
  return goals.length ? goals.every(isPythonHomeworkGoal) : homework?.studyTrack === 'python';
};

// Overall completion measures required EGE work; Python keeps its real progress.
export const getHomeworkCompletionProgress = (homework, goalProgress = [], checklistItems = []) => {
  const practiceOnly = isPythonPracticeHomework(homework);
  const goals = goalProgress.filter(goal => !isPythonHomeworkGoal(goal) && !isOptionalHomeworkGoal(goal));
  const totalCount = practiceOnly ? 0 : goals.reduce((sum, goal) => sum + Math.max(0, Number(goal.totalCount) || 0), 0);
  const completedCount = practiceOnly ? 0 : goals.reduce((sum, goal) => sum
    + Math.max(0, Math.min(Number(goal.totalCount) || 0, Number(goal.solvedCount) || 0)), 0);
  const total = totalCount || (practiceOnly ? 0 : checklistItems.length);
  const completed = totalCount ? completedCount : (practiceOnly ? 0 : checklistItems.filter(item => item.completedAt).length);
  return {
    practiceOnly,
    totalCount: total,
    completedCount: completed,
    percent: practiceOnly ? 100 : total > 0 ? Math.round(100 * completed / total) : null,
  };
};
