import { mergeMockExamFollowupQueueIntoTestsDb } from './mockExamFollowup.js';
import { resolveMockTaskBankNumber } from './mockExamTaskRouting.js';

// Repair an unattempted question and split homework goals that span two banks.
// Unknown links or saved answers stop the repair rather than losing their data.
export function repairMockExamFollowupRouting({ studentData, sourceKey, taskCatalog, testsDb, expectedFrom, expectedTo }) {
  const queue = studentData?.mockTestingQueue || [];
  const matches = queue.filter(row => row.sourceKey === sourceKey);
  if (matches.length !== 1) throw Error('Expected exactly one queued question');
  const entry = matches[0];
  const history = (studentData.mockAttemptResults || []).find(row => row.attemptId === entry.attemptId);
  const exam = history?.examSnapshot || { tasks: history?.tasks || {} };
  const destination = resolveMockTaskBankNumber({ slotNumber: entry.sourceMockTaskNumber, question: entry.question, exam, taskCatalog });
  if (destination !== expectedTo) throw Error('Destination does not match the verified catalog');
  if (entry.destinationTaskNumber === destination) return { studentData, changed: false, from: destination, to: destination };
  if (entry.destinationTaskNumber !== expectedFrom) throw Error('Queued question changed since the audit');
  const { mockTestingQueue: ignored, ...otherData } = structuredClone(studentData);
  for (const homework of [...(otherData.homeworks || []), otherData.nextLesson].filter(Boolean)) {
    for (const goal of homework.goals || []) {
      if (!goal.targetQuestionIds?.includes(entry.question.id)) continue;
      if (goal.type !== 'task' || Number(goal.taskNumber) !== expectedFrom || goal.levelId !== entry.levelId || goal.includeAll === true) {
        throw Error('Unsupported linked homework goal');
      }
      goal.targetQuestionIds = goal.targetQuestionIds.filter(id => id !== entry.question.id);
    }
  }
  if (JSON.stringify(otherData).includes(String(entry.question.id))) throw Error('Question has linked progress or assignments; a linked-record migration is required');
  const remaining = queue.filter(row => row !== entry);
  const merged = mergeMockExamFollowupQueueIntoTestsDb({ testsDb, queue: remaining });
  const solved = new Set(studentData.solvedByTask?.[destination]?.[entry.levelId]?.solved || []);
  const anchor = (merged[destination]?.[entry.levelId] || []).findLast(question => solved.has(String(question.id)))?.id || null;
  const nextQueue = queue.map(row => row === entry ? { ...row, destinationTaskNumber: destination, afterQuestionId: anchor }
    : row.destinationTaskNumber === expectedFrom && row.levelId === entry.levelId && row.afterQuestionId === entry.question.id
      ? { ...row, afterQuestionId: entry.afterQuestionId || null } : row);
  const nextTests = mergeMockExamFollowupQueueIntoTestsDb({ testsDb, queue: nextQueue });
  let homeworkGoalsUpdated = 0;
  const fixHomework = homework => {
    if (!homework?.goals?.some(goal => goal.targetQuestionIds?.includes(entry.question.id))) return homework;
    const goals = homework.goals.flatMap(goal => {
      if (!goal.targetQuestionIds?.includes(entry.question.id)) return [goal];
      const makeGoal = (taskNumber, ids) => ({ ...goal, taskNumber, includeAll: false,
        targetQuestionIds: ids, targetQuestions: ids.map(id => {
          const index = (nextTests[taskNumber]?.[entry.levelId] || []).findIndex(question => String(question.id) === String(id));
          if (index < 0) throw Error('Linked homework question could not be resolved');
          return index + 1;
        }) });
      const remainingIds = goal.targetQuestionIds.filter(id => id !== entry.question.id);
      homeworkGoalsUpdated += 1;
      return [...(remainingIds.length ? [makeGoal(expectedFrom, remainingIds)] : []), makeGoal(destination, [entry.question.id])];
    });
    return { ...homework, goals };
  };
  return { studentData: { ...studentData, mockTestingQueue: nextQueue,
    ...(Array.isArray(studentData.homeworks) ? { homeworks: studentData.homeworks.map(fixHomework) } : {}),
    ...(studentData.nextLesson ? { nextLesson: fixHomework(studentData.nextLesson) } : {}),
  }, changed: true, homeworkGoalsUpdated,
    from: entry.destinationTaskNumber, to: destination, questionId: entry.question.id, afterQuestionId: anchor };
}
