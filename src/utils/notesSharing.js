export const LESSON_SHARED_SCOPE = 'lesson-files';
export const LEARNING_GROUP_NOTES_SCOPE = 'learning-group-notes';
export const LESSON_SHARE_MODE_COMMON = 'common';
export const LESSON_SHARE_MODE_TEMPLATE = 'template';
export const LESSON_SHARE_MODE_PRIVATE = 'private';

export const normalizeNotesLessonShareMode = (value, { allowPrivate = true } = {}) => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === LESSON_SHARE_MODE_COMMON || mode === LESSON_SHARE_MODE_TEMPLATE) return mode;
  if (allowPrivate && mode === LESSON_SHARE_MODE_PRIVATE) return mode;
  return '';
};

export const isNotesLessonSharedFile = (file) => (
  file?.sharedScope === LESSON_SHARED_SCOPE
  || file?.sharedScope === LEARNING_GROUP_NOTES_SCOPE
  || file?.isLessonShared === true
);

export const isNotesLearningGroupSharedFile = (file) => (
  file?.sharedScope === LEARNING_GROUP_NOTES_SCOPE || file?.isLearningGroupShared === true
);

const isLegacyNotesTemplateFile = (file) => {
  const name = String(file?.name || '').trim();
  if (!/\.py$/i.test(name)) return false;
  const memory = file?.memory && typeof file.memory === 'object' ? file.memory : {};
  const source = String(memory?.source || file?.source || '').trim();
  const kind = String(memory?.kind || '').trim();
  return source === 'notes-cheatsheet'
    || source === 'collab-code'
    || kind === 'cheatsheet'
    || Boolean(memory?.boardSnapshot?.url);
};

export const getNotesLessonShareMode = (file) => {
  if (!isNotesLessonSharedFile(file)) return LESSON_SHARE_MODE_PRIVATE;
  const explicitMode = normalizeNotesLessonShareMode(file?.lessonShareMode, { allowPrivate: false });
  if (explicitMode) return explicitMode;
  return isLegacyNotesTemplateFile(file) ? LESSON_SHARE_MODE_TEMPLATE : LESSON_SHARE_MODE_COMMON;
};

export const isNotesSharedTemplateFile = (file) => (
  getNotesLessonShareMode(file) === LESSON_SHARE_MODE_TEMPLATE
);

export const isNotesCommonSharedFile = (file) => (
  getNotesLessonShareMode(file) === LESSON_SHARE_MODE_COMMON
);
