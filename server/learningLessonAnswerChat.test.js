import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLearningLessonAnswerMessage,
  filterLearningLessonAnswerMessages,
  normalizeLearningLessonAnswerMessages,
} from './learningLessonAnswerChat.js';

const messages = [
  createLearningLessonAnswerMessage({ id: '1', groupId: 'g', lessonId: 'l', senderId: 'teacher', senderRole: 'teacher', senderName: 'Иван', text: 'Пишите ответ', createdAt: '2026-09-15T10:00:00.000Z' }),
  createLearningLessonAnswerMessage({ id: '2', groupId: 'g', lessonId: 'l', senderId: 'anna', senderRole: 'student', senderName: 'Анна', text: '42', createdAt: '2026-09-15T10:00:01.000Z' }),
  createLearningLessonAnswerMessage({ id: '3', groupId: 'g', lessonId: 'l', senderId: 'ilya', senderRole: 'student', senderName: 'Илья', text: '41', createdAt: '2026-09-15T10:00:02.000Z' }),
];

test('teacher sees the chronological group stream while each student sees only teacher and self', () => {
  assert.deepEqual(filterLearningLessonAnswerMessages(messages, { role: 'teacher', id: 'teacher' }).map(({ id }) => id), ['1', '2', '3']);
  assert.deepEqual(filterLearningLessonAnswerMessages(messages, { role: 'student', id: 'anna' }).map(({ id }) => id), ['1', '2']);
  assert.deepEqual(filterLearningLessonAnswerMessages(messages, { role: 'student', id: 'ilya' }).map(({ id }) => id), ['1', '3']);
  assert.deepEqual(filterLearningLessonAnswerMessages(messages, { role: 'student', id: 'other' }).map(({ id }) => id), ['1']);
});

test('normalization drops invalid and duplicate records and keeps the latest normalized copy', () => {
  const result = normalizeLearningLessonAnswerMessages([
    messages[1],
    { ...messages[1], text: '43' },
    { id: 'bad' },
    messages[0],
  ]);
  assert.deepEqual(result.map(({ id, text }) => [id, text]), [['1', 'Пишите ответ'], ['2', '43']]);
  assert.throws(() => createLearningLessonAnswerMessage({ text: '   ' }), /Введите ответ/);
});
