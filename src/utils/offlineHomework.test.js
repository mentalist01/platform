import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectOfflineHomeworkAssetUrls,
  sanitizeTestsDbForOfflineHomework,
} from './offlineHomework.js';

test('offline homework keeps conditions but strips answer keys recursively', () => {
  const source = {
    1: {
      basic: [{
        id: 'question-1',
        text: 'Условие',
        answer: '42',
        answer2: 'secret',
        answers: ['42'],
        correctAnswer: '42',
        correctAnswers: ['42'],
        correctIndex: 0,
        expectedAnswer: '42',
        expectedAnswers: ['42'],
        solution: 'Решение',
        answerCount: 2,
        nested: { answer: 'hidden', note: 'visible' },
      }],
    },
  };

  const result = sanitizeTestsDbForOfflineHomework(source);
  const question = result['1'].basic[0];

  assert.equal(question.text, 'Условие');
  assert.equal(question.answerCount, 2);
  assert.equal(question.nested.note, 'visible');
  assert.equal('answer' in question, false);
  assert.equal('correctAnswer' in question, false);
  assert.equal('solution' in question, false);
  assert.equal('answer' in question.nested, false);
  assert.equal(source['1'].basic[0].answer, '42');
});

test('asset collector downloads only files used by assigned questions', () => {
  const homeworkResponse = {
    homeworks: [{
      goals: [{
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetQuestionIds: ['question-2'],
      }],
    }],
  };
  const testsDb = {
    1: {
      basic: [
        { id: 'question-1', image: { url: '/uploads/not-assigned.png' } },
        {
          id: 'question-2',
          image: { url: '/uploads/condition.png' },
          attachment: { storageName: 'таблица 1.xlsx' },
        },
      ],
    },
  };

  assert.deepEqual(
    collectOfflineHomeworkAssetUrls(homeworkResponse, testsDb),
    ['/uploads/%D1%82%D0%B0%D0%B1%D0%BB%D0%B8%D1%86%D0%B0%201.xlsx', '/uploads/condition.png'],
  );
});
