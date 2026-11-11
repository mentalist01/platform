import { mergeMockExamFollowupQueueIntoTestsDb } from './mockExamFollowup.js';
import { resolveMockTaskBankNumber } from './mockExamTaskRouting.js';

// Repair an unattempted queued question without changing its ID or any history.
// Attempted/assigned questions need a separate migration of their linked records.
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
  const { mockTestingQueue: ignored, ...otherData } = studentData;
  if (JSON.stringify(otherData).includes(String(entry.question.id))) throw Error('Question has linked progress or assignments; a linked-record migration is required');
  const remaining = queue.filter(row => row !== entry);
  const merged = mergeMockExamFollowupQueueIntoTestsDb({ testsDb, queue: remaining });
  const solved = new Set(studentData.solvedByTask?.[destination]?.[entry.levelId]?.solved || []);
  const anchor = (merged[destination]?.[entry.levelId] || []).findLast(question => solved.has(String(question.id)))?.id || null;
  const nextQueue = queue.map(row => row === entry ? { ...row, destinationTaskNumber: destination, afterQuestionId: anchor }
    : row.destinationTaskNumber === expectedFrom && row.levelId === entry.levelId && row.afterQuestionId === entry.question.id
      ? { ...row, afterQuestionId: entry.afterQuestionId || null } : row);
  return { studentData: { ...studentData, mockTestingQueue: nextQueue }, changed: true,
    from: entry.destinationTaskNumber, to: destination, questionId: entry.question.id, afterQuestionId: anchor };
}
