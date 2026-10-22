import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeworkStatistics, homeworkAssessmentEntries, summarizeHomeworkStatistics, isHomeworkReadyForOverallStatistics } from './homeworkStats.js';
import { buildStudentMonthlyReport } from './studentMonthlyReport.js';
import { getHomeworkCompletionProgress, isPythonPracticeHomework } from './homeworkAssessment.js';
import { buildCalendarHomeworkProgressEntries, resolveCalendarEventHomeworkProgress } from './calendarHomeworkProgress.js';
import { buildTeacherLessonBriefing } from './teacherLessonBriefing.js';

const nowMs = Date.parse('2026-10-17T12:00Z');
const goal = (taskNumber, levelId, id) => ({ type: 'task', taskNumber, levelId, targetQuestions: [1], targetQuestionIds: [id] });
const python = goal(101, 'python', 'py'), ege = goal(7, 'basic', 'ege');
const work = (id, goals, extra = {}) => ({ id, issuedAt: '2026-10-01T12:00Z', dueAt: '2026-10-08T12:00Z', goals, ...extra });
const testsDb = { 101: { python: [{ id: 'py' }] }, 7: { basic: [{ id: 'ege' }] } };
const success = { correct: true, submittedAt: '2026-10-04T12:00Z' };
const data = { solvedByTask: { 7: { basic: { solved: ['ege'], answerHistory: { ege: [success] } } }, 101: { python: { solved: [], answerHistory: { py: [{ ...success, correct: false }] } } } } };
const stats = homeworks => buildHomeworkStatistics({ homeworks, studentData: data, testsDb, nowMs });

test('Python progress and attempts survive, while only EGE contributes to grades', () => {
  for (const source of [undefined, 'learning-group']) {
    const entries = stats([work('py', [python], { source }), work('ege', [ege], { source })]);
    const practice = entries.find(e => e.id === 'py');
    assert.equal(practice.percent, 0);
    assert.equal(practice.wrongCount, 1);
    assert.equal(practice.goals[0].items[0].attemptCount, 1);
    assert.equal(isHomeworkReadyForOverallStatistics(practice, nowMs), false);
    assert.deepEqual(homeworkAssessmentEntries(entries).map(e => e.id), ['ege']);
    assert.equal(summarizeHomeworkStatistics(entries).averagePercent, 100);
    assert.equal(summarizeHomeworkStatistics(entries).homeworkCount, 1);
  }
});

test('a mixed homework is assessed using only EGE, including the deadline result', () => {
  const [mixed] = stats([work('mixed', [python, ege])]);
  assert.equal(mixed.percent, 50);
  const [assessment] = homeworkAssessmentEntries([mixed]);
  assert.equal(assessment.percent, 100);
  assert.equal(assessment.checkpointPercent, 100);
  assert.equal(assessment.completedOnTime, true);
  assert.equal(assessment.totalWrongAttempts, 0);
  assert.equal(assessment.goals.length, 1);
  assert.equal(assessment.goals[0].taskNumber, 7);
  assert.equal(mixed.goals.length, 2);
  const [unfinished] = buildHomeworkStatistics({ homeworks: [work('mixed', [python, ege])], testsDb, nowMs,
    studentData: { solvedByTask: { 101: { python: { solved: ['py'], answerHistory: { py: [success] } } } } } });
  assert.equal(homeworkAssessmentEntries([unfinished])[0].percent, 0);
});

test('legacy Python, theory-only practice and empty banks never become zero-percent graded homework', () => {
  for (const homework of [work('theory', [], { studyTrack: 'python', checklistItems: [{ id: 'watch', text: 'Видео' }] }),
    work('old', undefined, { taskNumber: 101, levelId: 'python', targetQuestions: [1] })]) {
    const entries = buildHomeworkStatistics({ homeworks: [homework], testsDb: {}, nowMs });
    assert.equal(homeworkAssessmentEntries(entries).length, 0);
    assert.equal(summarizeHomeworkStatistics(entries).homeworkCount, 0);
  }
  assert.equal(isPythonPracticeHomework(work('mixed-direction', [python, ege], { studyTrack: 'python' })), false);
  assert.equal(isPythonPracticeHomework(work('mock', [{ type: 'mock', mockExamId: 'exam' }])), false);
});

test('issuing Python does not close the current individual EGE completion window', () => {
  const entries = stats([work('ege', [ege]), work('py', [python], { issuedAt: '2026-10-02T12:00Z' })]);
  assert.equal(homeworkAssessmentEntries(entries)[0].percent, 100);
  assert.equal(entries.find(e => e.id === 'py').wrongCount, 1);
});

test('parent and student reports do not criticize Python practice and retain real lesson/practice counts', () => {
  const solvedData = structuredClone(data);
  solvedData.solvedByTask[101].python = { solved: ['py'], answerHistory: { py: [success] } };
  const entries = buildHomeworkStatistics({ homeworks: [work('py', [python]), work('mixed', [ege, python])], studentData: solvedData, testsDb, nowMs });
  const report = buildStudentMonthlyReport({ student: { id: 's', name: 'Лев' }, month: '2026-10', homeworkEntries: entries,
    lessonEntries: [{ dayKey: '2026-10-01', durationMinutes: 60, topic: { title: 'Python', taskNumbers: [101] } }], nowMs });
  assert.equal(report.metrics.homework.averagePercent, 100);
  assert.equal(report.metrics.homework.assignedCount, 1);
  assert.equal(report.metrics.homework.pythonPracticeCount, 2);
  assert.equal(report.metrics.homework.practice.find(p => p.taskNumber === 101).solvedCount, 1);
  assert.equal(report.metrics.lessons.count, 1);
  assert.equal(report.metrics.lessons.minutes, 60);
  const onlyPython = buildStudentMonthlyReport({ student: { name: 'Лев' }, month: '2026-10', homeworkEntries: stats([work('py', [python])]), nowMs });
  assert.equal(onlyPython.metrics.homework.averagePercent, 100);
  assert.equal(onlyPython.metrics.homework.practiceOnly, true);
  assert.equal(onlyPython.metrics.homework.evaluatedCount, 0);
  for (const text of [onlyPython.parentText, onlyPython.studentText]) {
    assert.match(text, /100%/u);
    assert.match(text, /разбер[её]м|разбираем/u);
    assert.doesNotMatch(text, /очень плохо|слабый результат|(?<!\d)0%|заданий в этом месяце не было/u);
  }
});

test('calendar shows a neutral Python-only 100% without adding assessed tasks', () => {
  const entries = stats([work('py', [python], { dueAt: '2026-10-18T12:00Z' }), work('mixed', [python, ege], { dueAt: '2026-10-18T12:00Z' })]);
  const rows = buildCalendarHomeworkProgressEntries({ statistics: entries, nowMs, getDateParts: () => ({ dayKey: '2026-10-18', time: '15:00' }) });
  assert.deepEqual(rows.map(row => [row.homeworkId, row.percent, row.totalCount]).sort(), [['mixed', 100, 1], ['py', 100, 0]]);
  const pendingEge = { ...rows.find(row => row.homeworkId === 'mixed'), percent: 0, completedCount: 0 };
  const event = { studentHomeworkProgress: [{ studentId: 'a', entries: [rows.find(row => row.homeworkId === 'py')] }, { studentId: 'b', entries: [pendingEge] }] };
  assert.equal(resolveCalendarEventHomeworkProgress(event, '2026-10-18', 900).percent, 0);
});

test('Python-only completion is 100%, with real unsolved practice and no graded history', () => {
  const entry = work('py', [python]);
  const views = [{ ...python, totalCount: 5, solvedCount: 0 }];
  const before = structuredClone(views);
  assert.deepEqual(getHomeworkCompletionProgress(entry, views), { practiceOnly: true, percent: 100, totalCount: 0, completedCount: 0 });
  assert.deepEqual(views, before);
  const summary = summarizeHomeworkStatistics(stats([entry]));
  assert.equal(summary.averagePercent, 100);
  assert.equal(summary.practiceOnly, true);
  assert.equal(summary.homeworkCount, 0);
  assert.equal(summary.fullyCompletedCount, 0);
  assert.equal(summary.incompleteCount, 0);
  const briefing = buildTeacherLessonBriefing({ homeworkEntry: entry, homeworkGoalSummary: { totalCount: 5, solvedCount: 0, requiredGoals: views }, homeworkDueAt: entry.dueAt, now: nowMs });
  assert.equal(briefing.homework.percent, 100);
  assert.equal(briefing.homework.overdue, false);
  assert.match(briefing.homework.statusLabel, /ЕГЭ не задано/u);
});

test('mixed completion uses only EGE and Python cannot raise an incomplete EGE grade', () => {
  const entry = work('mixed', [python, ege]);
  const views = [{ ...python, totalCount: 5, solvedCount: 0 }, { ...ege, totalCount: 4, solvedCount: 2 }];
  assert.equal(getHomeworkCompletionProgress(entry, views).percent, 50);
  views[0].solvedCount = 5;
  assert.equal(getHomeworkCompletionProgress(entry, views).percent, 50);
  const entries = buildHomeworkStatistics({ homeworks: [work('py', [python]), work('ege', [ege])], testsDb, nowMs });
  assert.equal(summarizeHomeworkStatistics(entries).averagePercent, 0);
  const report = buildStudentMonthlyReport({ month: '2026-10', homeworkEntries: entries, nowMs });
  assert.equal(report.metrics.homework.averagePercent, 0);
  assert.equal(report.metrics.homework.practiceOnly, false);
  assert.equal(summarizeHomeworkStatistics([]).averagePercent, 0);
  assert.equal(getHomeworkCompletionProgress(null).percent, null);
});
