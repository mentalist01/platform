import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEACHER_BASE_NOTE_TEXT,
  applyTeacherBaseNotes,
  countSolvedTestingQuestions,
} from './teacherBaseNotes.js';

const makeSolved = (count, prefix = 'q') => (
  Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`)
);

test('adds the base note after ten unique solved testing questions', () => {
  const result = applyTeacherBaseNotes({
    notesByTask: {},
    solvedByTask: {
      1: {
        basic: { solved: makeSolved(7, 'basic') },
        advanced: { solved: makeSolved(3, 'advanced') },
      },
    },
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.addedTaskNumbers, [1]);
  assert.equal(result.notesByTask['1'], TEACHER_BASE_NOTE_TEXT);
});

test('does not add the note before the threshold', () => {
  const notesByTask = {};
  const result = applyTeacherBaseNotes({
    notesByTask,
    solvedByTask: { 2: { basic: { solved: makeSolved(9) } } },
  });

  assert.equal(result.changed, false);
  assert.equal(result.notesByTask, notesByTask);
});

test('does not overwrite an existing teacher note', () => {
  const result = applyTeacherBaseNotes({
    notesByTask: { 3: 'Нужно повторить теорию' },
    solvedByTask: { 3: { basic: { solved: makeSolved(12) } } },
  });

  assert.equal(result.changed, false);
  assert.equal(result.notesByTask['3'], 'Нужно повторить теорию');
});

test('counts duplicate ids once within a level and separately across levels', () => {
  assert.equal(countSolvedTestingQuestions({
    basic: { solved: ['1', '1', '2'] },
    advanced: { solved: ['1', '2'] },
  }), 4);
});

test('combines tasks 19-21 into their shared teacher note', () => {
  const result = applyTeacherBaseNotes({
    notesByTask: {},
    solvedByTask: {
      19: { basic: { solved: makeSolved(4, 'task-19') } },
      20: { basic: { solved: makeSolved(3, 'task-20') } },
      21: { basic: { solved: makeSolved(3, 'task-21') } },
    },
  });

  assert.equal(result.notesByTask['19'], TEACHER_BASE_NOTE_TEXT);
  assert.deepEqual(result.addedTaskNumbers, [19]);
});

test('a note on any task 19-21 prevents the automatic shared note', () => {
  const result = applyTeacherBaseNotes({
    notesByTask: { 20: 'Дополнить разбор' },
    solvedByTask: { 19: { basic: { solved: makeSolved(10) } } },
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.notesByTask, { 20: 'Дополнить разбор' });
});
