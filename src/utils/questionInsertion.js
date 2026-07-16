export const QUESTION_INSERT_MODE_END = 'end';
export const QUESTION_INSERT_MODE_START = 'start';
export const QUESTION_INSERT_MODE_CUSTOM = 'custom';

export const normalizeQuestionInsertMode = (value) => (
  value === QUESTION_INSERT_MODE_START || value === QUESTION_INSERT_MODE_CUSTOM
    ? value
    : QUESTION_INSERT_MODE_END
);

export const resolveQuestionInsertIndex = (mode, rawPosition, questionCount) => {
  const safeCount = Math.max(0, Math.floor(Number(questionCount) || 0));
  const normalizedMode = normalizeQuestionInsertMode(mode);
  if (normalizedMode === QUESTION_INSERT_MODE_START) return 0;
  if (normalizedMode === QUESTION_INSERT_MODE_END) return safeCount;

  const normalizedPosition = String(rawPosition ?? '').trim();
  if (!/^\d+$/.test(normalizedPosition)) return null;
  const position = Number(normalizedPosition);
  if (!Number.isInteger(position) || position < 1 || position > safeCount + 1) return null;
  return position - 1;
};
