import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherLessonBriefing } from './teacherLessonBriefing.js';

test('builds a concrete lesson plan from unfinished homework goals', () => {
  const briefing = buildTeacherLessonBriefing({
    studentLabel: 'Артём',
    lessonStart: '2026-08-08T18:00:00+03:00',
    lessonSubject: 'Информатика',
    homeworkEntry: { id: 'homework-1' },
    homeworkGoalSummary: { totalCount: 10, solvedCount: 6 },
    homeworkDueAt: '2026-08-08T17:00:00+03:00',
    focusLabels: ['Задание 17 · Базовый', 'Задание 14 · Базовый'],
    now: '2026-08-08T12:00:00+03:00',
  });

  assert.equal(briefing.studentLabel, 'Артём');
  assert.equal(briefing.lesson.hasLesson, true);
  assert.equal(briefing.lesson.dayLabel, 'Сегодня');
  assert.equal(briefing.homework.percent, 60);
  assert.equal(briefing.homework.remainingCount, 4);
  assert.equal(briefing.homework.overdue, false);
  assert.deepEqual(briefing.planSteps, [
    'Начать с незавершённого: Задание 17 · Базовый',
    'Закрепить: Задание 14 · Базовый',
    'Зафиксировать результат и выдать следующее ДЗ',
  ]);
});

test('falls back to checklist progress and marks an overdue homework', () => {
  const briefing = buildTeacherLessonBriefing({
    homeworkEntry: { id: 'homework-2' },
    homeworkChecklistItems: [
      { id: 'one', completedAt: '2026-08-01T10:00:00Z' },
      { id: 'two', completedAt: null },
    ],
    homeworkDueAt: '2026-08-07T18:00:00+03:00',
    now: '2026-08-08T12:00:00+03:00',
  });

  assert.equal(briefing.lesson.hasLesson, false);
  assert.equal(briefing.homework.percent, 50);
  assert.equal(briefing.homework.overdue, true);
  assert.equal(briefing.planSteps[0], 'Разобрать незавершённое ДЗ: 1');
});

test('keeps the card useful when neither a lesson nor homework exists', () => {
  const briefing = buildTeacherLessonBriefing({ studentLabel: 'Ирина' });

  assert.equal(briefing.lesson.dayLabel, 'Ближайший урок не запланирован');
  assert.equal(briefing.homework.statusLabel, 'Домашка не назначена');
  assert.deepEqual(briefing.planSteps, [
    'Определить цель и ожидаемый результат урока',
    'Зафиксировать результат и выдать следующее ДЗ',
  ]);
});
