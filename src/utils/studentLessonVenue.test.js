import test from 'node:test';
import assert from 'node:assert/strict';
import { studentLessonVenue } from './studentLessonVenue.js';

test('existing pupils use platform even if they have a backup Telemost URL', () => {
  assert.equal(studentLessonVenue().telemost, false);
  assert.equal(studentLessonVenue({ telemostUrl: 'https://telemost.yandex.ru/j/12345678901234' }).joinLabel, 'Войти в урок на платформе');
});
test('preferred Telemost provides its saved link or asks to configure it without starting a platform call', () => {
  const chosen = studentLessonVenue({ lessonVenue: 'telemost', telemostUrl: 'https://telemost.yandex.ru/j/12345678901234' });
  assert.equal(chosen.telemost, true); assert.equal(chosen.joinLabel, 'Открыть Телемост'); assert.ok(chosen.url);
  const missing = studentLessonVenue({ lessonVenue: 'telemost', telemostUrl: 'https://example.com/' });
  assert.equal(missing.url, ''); assert.equal(missing.joinLabel, 'Настроить Телемост');
});
