import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPythonHomeworkTheoryChoices,
  getPythonHomeworkTheoryDetails,
  getPythonHomeworkTheorySelection,
} from './pythonTheoryHomework.js';

const taskEntry = {
  python: [
    { id: 'q-1', subsectionId: 'basics', prompt: 'Задача 1' },
    { id: 'q-2', subsectionId: 'basics', prompt: 'Задача 2' },
  ],
  pythonSubsections: [{ id: 'basics', title: 'Основы цикла for' }],
  pythonTheoryBySubsection: {
    basics: {
      text: { type: 'text', content: 'Текст теории' },
      gdoc: { type: 'gdoc', content: 'https://docs.google.com/document/d/example/edit' },
      recording: { type: 'recording', content: { id: 'recording-1' } },
    },
  },
};

test('python homework theory exposes every saved format for a subsection', () => {
  const choices = getPythonHomeworkTheoryChoices(taskEntry);
  assert.deepEqual(
    choices.map(({ subsectionId, subsectionTitle, type }) => ({ subsectionId, subsectionTitle, type })),
    [
      { subsectionId: 'basics', subsectionTitle: 'Основы цикла for', type: 'recording' },
      { subsectionId: 'basics', subsectionTitle: 'Основы цикла for', type: 'text' },
      { subsectionId: 'basics', subsectionTitle: 'Основы цикла for', type: 'gdoc' },
    ],
  );
});

test('python homework theory selection resolves to a student-facing description', () => {
  const goal = {
    pythonTheorySubsectionId: 'basics',
    pythonTheoryType: 'gdoc',
  };
  assert.deepEqual(getPythonHomeworkTheorySelection(goal), {
    subsectionId: 'basics',
    type: 'gdoc',
  });
  assert.deepEqual(getPythonHomeworkTheoryDetails(taskEntry, goal), {
    key: 'basics::gdoc',
    subsectionId: 'basics',
    subsectionTitle: 'Основы цикла for',
    type: 'gdoc',
    typeLabel: 'Теория в Google Docs',
    available: true,
  });
});
