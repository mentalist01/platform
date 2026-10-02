import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachGoogleCalendarEntryStudentMatch,
  googleCalendarEntryMatchesStudent,
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

test('cached unmatched calendar entry attaches to a student added later', () => {
  const cachedEntry = {
    id: 'google-ical-egor',
    subject: 'Егор',
    studentId: '',
    studentName: 'Егор',
    isTeacherSlot: true,
  };

  assert.deepEqual(
    attachGoogleCalendarEntryStudentMatch(cachedEntry, [{ id: 'egor-id', name: 'Егор' }]),
    {
      ...cachedEntry,
      studentId: 'egor-id',
      studentName: 'Егор',
      isTeacherSlot: false,
    },
  );
});

test('cached group and already linked student entries keep their existing owner', () => {
  const groupEntry = { subject: 'Егор', groupId: 'group-1', isLearningGroupEvent: true };
  const linkedEntry = { subject: 'Егор', studentId: 'previous-id', studentName: 'Другой Егор' };
  const roster = [{ id: 'egor-id', name: 'Егор' }];

  assert.equal(attachGoogleCalendarEntryStudentMatch(groupEntry, roster), groupEntry);
  assert.equal(attachGoogleCalendarEntryStudentMatch(linkedEntry, roster), linkedEntry);
});

test('plain duplicate name selects the student without a different calendar nickname', () => {
  const namesakes = [
    { id: 'egor-with-alias', name: 'Егор', nickname: 'Егор1' },
    { id: 'plain-egor', name: 'Егор' },
  ];

  assert.equal(resolveGoogleCalendarStudentMatch({ summary: 'Егор' }, namesakes)?.id, 'plain-egor');
  assert.equal(resolveGoogleCalendarStudentMatch({ summary: 'Егор1' }, namesakes)?.id, 'egor-with-alias');
});

test('individual schedule import honours the resolved owner of a namesake event', () => {
  const namesakes = [
    { id: 'group-egor', name: 'Егор', nickname: 'Егор1' },
    { id: 'individual-egor', name: 'Егор' },
  ];
  const event = { subject: 'Егор', studentId: 'individual-egor' };
  assert.equal(googleCalendarEntryMatchesStudent(event, namesakes[0], namesakes), false);
  assert.equal(googleCalendarEntryMatchesStudent(event, namesakes[1], namesakes), true);
  assert.equal(googleCalendarEntryMatchesStudent({ subject: 'Егор' }, namesakes[0], namesakes), false);
  assert.equal(googleCalendarEntryMatchesStudent({ subject: 'Егор1' }, namesakes[0], namesakes), true);
});

test('unresolved ambiguous events and group events cannot become individual lessons', () => {
  const namesakes = [{ id: 'one', name: 'Егор' }, { id: 'two', name: 'Егор' }];
  for (const student of namesakes) {
    assert.equal(googleCalendarEntryMatchesStudent({ subject: 'Егор' }, student, namesakes), false);
    assert.equal(googleCalendarEntryMatchesStudent({ subject: 'Егор', groupId: 'group' }, student, namesakes), false);
    assert.equal(googleCalendarEntryMatchesStudent({ subject: 'Егор', isLearningGroupEvent: true }, student, namesakes), false);
  }
});
