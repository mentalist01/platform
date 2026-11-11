import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMockTaskBankSnapshot, resolveMockTaskBankNumber, withMockTaskBankSnapshot } from './mockExamTaskRouting.js';
import { finalizeMockExamFollowup, mergeMockExamFollowupQueueIntoTestsDb, normalizeMockExamFollowupQueue } from './mockExamFollowup.js';

const catalog = [{ taskNumber: 13, slotNumber: 10 }, { taskNumber: 23, slotNumber: 13 },
  { taskNumber: 28, slotNumber: 23 }, { taskNumber: 19, slotNumber: 19 }];
const finalize = extra => finalizeMockExamFollowup({
  exam: { id: 'exam', tasks: { 13: { id: 'executor' }, 23: { id: 'graph', files: [{ name: '23_31518.txt' }] },
    19: { id: 'game1' }, 20: { id: 'game2' }, 21: { id: 'game3' } } },
  attempt: { solved: {} }, attemptId: 'attempt', finishedAt: '2026-11-11T12:00:00Z',
  testsDb: { 23: { basic: [{ id: 'executor-base' }] }, 28: { basic: [{ id: 'graph-base' }] } },
  solvedByTask: { 23: { basic: { solved: ['executor-base'] } }, 28: { basic: { solved: ['graph-base'] } } },
  taskCatalog: catalog, ...extra,
});

test('manual mock positions go to the teacher banks, including IDs above 27 and correct insertion anchors', () => {
  const result = finalize();
  const executor = result.queue.find(q => q.sourceMockTaskNumber === 13);
  const graph = result.queue.find(q => q.sourceMockTaskNumber === 23);
  assert.equal(executor.destinationTaskNumber, 23);
  assert.equal(executor.afterQuestionId, 'executor-base');
  assert.equal(graph.destinationTaskNumber, 28);
  assert.equal(graph.afterQuestionId, 'graph-base');
  assert.equal(graph.question.sourceTaskNumber, 28);
  assert.deepEqual(graph.question.files, [{ name: '23_31518.txt' }]);
  assert.equal(normalizeMockExamFollowupQueue(result.queue).length, 5);
  const merged = mergeMockExamFollowupQueueIntoTestsDb({ testsDb: { 23: { basic: [{ id: 'executor-base' }] }, 28: { basic: [{ id: 'graph-base' }] } }, queue: result.queue });
  assert.deepEqual(merged['23'].basic.map(q => q.id), ['executor-base', executor.question.id]);
  assert.deepEqual(merged['28'].basic.map(q => q.id), ['graph-base', graph.question.id]);
  assert.deepEqual(result.queue.filter(q => [19, 20, 21].includes(q.sourceMockTaskNumber)).map(q => [q.destinationTaskNumber, q.answerCountOverride]), [[19, 1], [19, 2], [19, 1]]);
});

test('question source identity and frozen attempt mapping survive later renumbering', () => {
  const frozen = withMockTaskBankSnapshot({ id: 'exam', tasks: { 23: { id: 'g' } } }, catalog);
  const changed = [{ taskNumber: 29, slotNumber: 23 }];
  assert.equal(resolveMockTaskBankNumber({ slotNumber: 23, exam: frozen, taskCatalog: changed }), 28);
  assert.equal(withMockTaskBankSnapshot(frozen, changed).taskBankSnapshot['23'], 28);
  assert.equal(resolveMockTaskBankNumber({ slotNumber: 23, question: { sourceTaskNumber: 13 }, exam: frozen, taskCatalog: changed }), 13);
  assert.equal(resolveMockTaskBankNumber({ slotNumber: 13, taskCatalog: [] }), null);
  assert.equal(resolveMockTaskBankNumber({ slotNumber: 20 }), 19);
  assert.deepEqual(buildMockTaskBankSnapshot(catalog), { 10: 13, 13: 23, 19: 19, 20: 19, 21: 19, 23: 28 });
});

test('personal random mock sources are not replaced by exam positions', () => {
  const result = finalize({ exam: { id: 'personal', tasks: { 10: { id: 'sequence', sourceTaskNumber: 17, sourceLevelId: 'advanced' }, 23: { id: 'new-bank', sourceTaskNumber: 31 } } } });
  assert.deepEqual(result.queue.map(q => [q.destinationTaskNumber, q.levelId]), [[17, 'advanced'], [31, 'basic']]);
  assert.equal(normalizeMockExamFollowupQueue(result.queue)[1].destinationTaskNumber, 31);
});
