import test from 'node:test';
import assert from 'node:assert/strict';
import {
  googleCalendarTitleMatchesStudent,
  resolveGoogleCalendarStudentMatch,
  stripCalendarEventParentheticalText,
} from './googleCalendarStudentMatch.js';

const students = [
  { id: 'dmitry', name: 'Дмитрий' },
  { id: 'yuri', name: 'Юрий' },
  { id: 'emilia', name: 'Эмилия' },
  { id: 'maria', name: 'Мария' },
];

test('calendar student matching ignores parent names in parentheses', () => {
  const match = resolveGoogleCalendarStudentMatch(
    { summary: 'Дмитрий пробная (отец Юрий)' },
    students,
  );

  assert.equal(match?.id, 'dmitry');
});

test('calendar event stays unmatched when its only known student name is in parentheses', () => {
  const match = resolveGoogleCalendarStudentMatch(
    { summary: 'Новый ученик пробная (мама Мария)' },
    students,
  );

  assert.equal(match, null);
});

test('calendar matching supports nested and full-width parentheses', () => {
  assert.equal(
    stripCalendarEventParentheticalText('Эмилия пробная （мама Мария (Telegram)）'),
    'Эмилия пробная',
  );
  assert.equal(
    resolveGoogleCalendarStudentMatch(
      { summary: 'Эмилия пробная （мама Мария (Telegram)）' },
      students,
    )?.id,
    'emilia',
  );
});

test('exact calendar-to-student sync matching also ignores parentheses', () => {
  assert.equal(
    googleCalendarTitleMatchesStudent('Дмитрий (отец Юрий)', students[0]),
    true,
  );
  assert.equal(
    googleCalendarTitleMatchesStudent('Дмитрий (отец Юрий)', students[1]),
    false,
  );
});

test('exact nickname keeps a former namesake calendar event on the former student', () => {
  const namesakes = [
    {
      id: 'current-nikita',
      name: 'Никита',
      nickname: 'Никита1',
      studyStatus: 'active',
    },
    {
      id: 'former-nikita',
      name: 'Никита',
      nickname: 'Никита 2000',
      studyStatus: 'inactive',
    },
  ];

  assert.equal(
    resolveGoogleCalendarStudentMatch(
      { summary: 'Никита 2000' },
      namesakes,
    )?.id,
    'former-nikita',
  );
  assert.equal(
    resolveGoogleCalendarStudentMatch(
      { summary: 'Никита1 пробное (мама Оксана), 4Р' },
      namesakes,
    )?.id,
    'current-nikita',
  );
});
