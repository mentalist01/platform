import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LESSON_SHARE_MODE_COMMON,
  LESSON_SHARE_MODE_PRIVATE,
  LESSON_SHARE_MODE_TEMPLATE,
  getNotesLessonShareMode,
  isNotesCommonSharedFile,
  isNotesSharedTemplateFile,
  normalizeNotesLessonShareMode,
} from '../src/utils/notesSharing.js';

test('notes sharing exposes private, common and template as distinct modes', () => {
  const privateImage = { name: 'diagram.png' };
  const commonImage = { name: 'diagram.png', sharedScope: 'lesson-files' };
  const templateImage = {
    name: 'diagram.png',
    sharedScope: 'lesson-files',
    lessonShareMode: LESSON_SHARE_MODE_TEMPLATE,
  };

  assert.equal(getNotesLessonShareMode(privateImage), LESSON_SHARE_MODE_PRIVATE);
  assert.equal(getNotesLessonShareMode(commonImage), LESSON_SHARE_MODE_COMMON);
  assert.equal(getNotesLessonShareMode(templateImage), LESSON_SHARE_MODE_TEMPLATE);
  assert.equal(isNotesCommonSharedFile(commonImage), true);
  assert.equal(isNotesSharedTemplateFile(templateImage), true);
});

test('legacy code templates stay templates while an explicit common mode wins', () => {
  const legacyTemplate = {
    name: 'solution.py',
    sharedScope: 'lesson-files',
    memory: { source: 'collab-code' },
  };
  const explicitCommon = {
    ...legacyTemplate,
    lessonShareMode: LESSON_SHARE_MODE_COMMON,
  };

  assert.equal(getNotesLessonShareMode(legacyTemplate), LESSON_SHARE_MODE_TEMPLATE);
  assert.equal(getNotesLessonShareMode(explicitCommon), LESSON_SHARE_MODE_COMMON);
});

test('share mode normalization rejects unknown values', () => {
  assert.equal(normalizeNotesLessonShareMode(' TEMPLATE '), LESSON_SHARE_MODE_TEMPLATE);
  assert.equal(normalizeNotesLessonShareMode('private'), LESSON_SHARE_MODE_PRIVATE);
  assert.equal(normalizeNotesLessonShareMode('unknown'), '');
});
