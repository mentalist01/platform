import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addHomeworkLessonBasketItem,
  clearHomeworkLessonBasket,
  getHomeworkLessonBasketItemKey,
  getHomeworkLessonBasketItems,
  loadHomeworkLessonBaskets,
  normalizeHomeworkLessonBasketItem,
  saveHomeworkLessonBaskets,
} from './homeworkLessonBasket.js';

test('normalizes a lesson basket item and builds a stable question key', () => {
  const item = normalizeHomeworkLessonBasketItem({
    taskNumber: '15',
    levelId: ' basic ',
    questionId: ' q-7 ',
    questionNumber: '7',
    taskTitle: ' Логика ',
  }, { now: new Date('2026-07-30T10:00:00.000Z') });

  assert.deepEqual(item, {
    taskNumber: 15,
    levelId: 'basic',
    questionId: 'q-7',
    questionNumber: 7,
    taskTitle: 'Логика',
    addedAt: '2026-07-30T10:00:00.000Z',
  });
  assert.equal(getHomeworkLessonBasketItemKey(item), '15:basic:id:q-7');
});

test('keeps independent baskets per student and deduplicates repeated questions', () => {
  const first = addHomeworkLessonBasketItem(null, 'student-a', {
    taskNumber: 2,
    levelId: 'advanced',
    questionId: 'question-3',
    questionNumber: 3,
  }, { now: new Date('2026-07-30T10:00:00.000Z') });
  const duplicate = addHomeworkLessonBasketItem(first, 'student-a', {
    taskNumber: 2,
    levelId: 'advanced',
    questionId: 'question-3',
    questionNumber: 99,
  }, { now: new Date('2026-07-30T10:05:00.000Z') });
  const secondStudent = addHomeworkLessonBasketItem(duplicate, 'student-b', {
    taskNumber: 101,
    levelId: 'python',
    questionNumber: 1,
  });

  assert.equal(getHomeworkLessonBasketItems(secondStudent, 'student-a').length, 1);
  assert.equal(getHomeworkLessonBasketItems(secondStudent, 'student-a')[0].questionNumber, 3);
  assert.equal(getHomeworkLessonBasketItems(secondStudent, 'student-b').length, 1);
  assert.equal(getHomeworkLessonBasketItems(clearHomeworkLessonBasket(secondStudent, 'student-a'), 'student-a').length, 0);
});

test('saves and restores a normalized basket database', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const database = addHomeworkLessonBasketItem(null, 'student-a', {
    taskNumber: 27,
    levelId: 'basic',
    questionNumber: 4,
  }, { now: new Date('2026-07-30T10:00:00.000Z') });

  assert.equal(saveHomeworkLessonBaskets('teacher-a', database, storage), true);
  const restored = loadHomeworkLessonBaskets('teacher-a', storage);
  assert.equal(getHomeworkLessonBasketItems(restored, 'student-a').length, 1);
  assert.equal(getHomeworkLessonBasketItems(restored, 'student-a')[0].taskNumber, 27);
});
