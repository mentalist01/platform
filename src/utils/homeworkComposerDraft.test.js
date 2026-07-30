import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOMEWORK_COMPOSER_DRAFT_VERSION,
  createHomeworkComposerDraft,
  normalizeHomeworkComposerDraft,
  normalizeHomeworkComposerDraftForm,
} from './homeworkComposerDraft.js';

test('homework composer draft keeps incomplete form values and carryover metadata', () => {
  const draft = createHomeworkComposerDraft({
    form: {
      homeWork: '  Прочитать параграф  ',
      lessonLink: ' https://lesson.example ',
      dueAt: '2026-08-02T18:30',
      dueAtMode: 'next-lesson',
      daysToComplete: 4,
      goals: [{
        type: 'task',
        taskNumber: '2',
        levelId: 'advanced',
        targetInput: '1-22',
        targetQuestionIds: ['q-1', 'q-2'],
        origin: 'carryover',
        carryover: {
          sourceHomeworkId: 'homework-old',
          sourceGoalIndex: 1,
          originalCount: 22,
          remainingCount: 12,
        },
      }],
      dayPlanEnabled: true,
      dayPlanSessionCount: 4,
      dayPlanWeekdays: [1, 3, 5],
    },
    carryoverSummary: {
      hasSourceHomework: true,
      sourceHomeworkId: 'homework-old',
      pendingGoalCount: 1,
      pendingQuestionCount: 12,
      pendingChecklistCount: 0,
    },
    baseHomeworkId: 'homework-old',
    baseHomeworkUpdatedAt: '2026-07-28T10:00:00.000Z',
    now: new Date('2026-07-29T10:00:00.000Z'),
  });

  assert.equal(draft.version, HOMEWORK_COMPOSER_DRAFT_VERSION);
  assert.equal(draft.form.homeWork, 'Прочитать параграф');
  assert.equal(draft.form.dueAtMode, 'next-lesson');
  assert.equal(draft.form.goals[0].taskNumber, 2);
  assert.equal(draft.form.goals[0].targetInput, '1-22');
  assert.equal(draft.form.goals[0].carryover.remainingCount, 12);
  assert.deepEqual(draft.form.dayPlanWeekdays, [1, 3, 5]);
  assert.equal(draft.carryoverSummary.pendingQuestionCount, 12);
  assert.equal(draft.baseHomeworkId, 'homework-old');
  assert.equal(draft.updatedAt, '2026-07-29T10:00:00.000Z');
});

test('homework composer draft supports incomplete mock rows without final validation', () => {
  const form = normalizeHomeworkComposerDraftForm({
    goals: [
      { type: 'mock', mockExamId: '', targetTaskKeys: ['1', '1', '2'], mode: 'classic' },
      { type: 'task', taskNumber: '', targetInput: '' },
    ],
    dayPlanSessionCount: 99,
    dayPlanWeekdays: [7, 2, 9, 2],
  });

  assert.equal(form.goals.length, 2);
  assert.deepEqual(form.goals[0].targetTaskKeys, ['1', '2']);
  assert.equal(form.goals[1].taskNumber, '');
  assert.equal(form.dayPlanSessionCount, 7);
  assert.deepEqual(form.dayPlanWeekdays, [2, 7]);
});

test('homework composer draft rejects unknown versions and invalid roots', () => {
  assert.equal(normalizeHomeworkComposerDraft(null), null);
  assert.equal(normalizeHomeworkComposerDraft({ version: 99, form: {} }), null);
  assert.equal(normalizeHomeworkComposerDraft({ version: 1, form: null }), null);
});

test('updating a homework composer draft preserves its original creation time', () => {
  const first = createHomeworkComposerDraft({
    form: { goals: [] },
    now: new Date('2026-07-29T10:00:00.000Z'),
  });
  const second = createHomeworkComposerDraft({
    form: { homeWork: 'Новый текст', goals: [] },
    existingDraft: first,
    now: new Date('2026-07-29T12:00:00.000Z'),
  });

  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.updatedAt, '2026-07-29T12:00:00.000Z');
  assert.equal(second.form.homeWork, 'Новый текст');
});
