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
