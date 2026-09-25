import test from 'node:test';
import assert from 'node:assert/strict';
import { isExplicitTrialLesson } from './calendarLessonType.js';

test('Google title identifies trial even for a matched student and parent in parentheses', () => {
  for (const subject of ['Александр (мама Виктория) пробное', 'Александр пробное (мама Виктория)', 'ПРОБНОЕ — Александр', 'Александр: пробный урок', 'Дмитрий пробная (отец Юрий)']) {
    assert.equal(isExplicitTrialLesson({ studentId: 'alexander', source: 'google-ical', subject }), true, subject);
  }
});
test('ordinary lessons and mock exams are not trials', () => {
  for (const subject of ['Александр (мама Виктория)', 'Разбор пробника', 'Пробников Александр', 'Беспробное', 'Пробные задания ЕГЭ']) {
    assert.equal(isExplicitTrialLesson({ subject }), false, subject);
  }
  assert.equal(isExplicitTrialLesson({ subject: 'Пробное', groupId: 'group' }), false);
  assert.equal(isExplicitTrialLesson({ note: 'в прошлый раз было пробное' }), false);
});
test('explicit metadata is supported; removing title marker removes inferred status', () => {
  assert.equal(isExplicitTrialLesson({ trial: true }), true);
  assert.equal(isExplicitTrialLesson({ subject: 'Александр' }), false);
  assert.equal(isExplicitTrialLesson({ googleCalendarTitle: 'Александр пробное' }), true);
});
