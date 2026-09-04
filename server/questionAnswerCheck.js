import {
  answerVectorsMatch,
  getAcceptedAnswerVariants,
  getPrimaryAnswerVector,
  normalizeComparableAnswer,
} from '../src/utils/answerVariants.js';

const clampAnswerCount = (value) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(50, parsed));
};

export const createQuestionAnswerRules = ({ getAnswerCountForTask }) => {
  if (typeof getAnswerCountForTask !== 'function') {
    throw new TypeError('getAnswerCountForTask must be a function');
  }

  const normalizeAnswerValue = normalizeComparableAnswer;

  const getExpectedAnswersForQuestion = (question, count) => {
    return getPrimaryAnswerVector(question, clampAnswerCount(count));
  };

  const parseSubmittedAnswers = (rawValue, count) => {
    const safeCount = clampAnswerCount(count);
    if (safeCount <= 1) return [String(rawValue ?? '')];
    if (typeof rawValue !== 'string') {
      return Array.from({ length: safeCount }, () => '');
    }
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return Array.from({ length: safeCount }, () => '');
    }
    let values = null;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) values = parsed;
        else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.answers)) values = parsed.answers;
          else if (typeof parsed.answer !== 'undefined') values = [parsed.answer];
        }
      } catch {
        values = null;
      }
    }
    if (!Array.isArray(values)) values = [trimmed];
    return Array.from({ length: safeCount }, (_, index) => String(values[index] ?? ''));
  };

  const getAnswerCountForQuestion = (question, taskNumber) => {
    const override = Math.trunc(Number(question?.answerCountOverride));
    if (Number.isFinite(override) && override > 0 && override <= 50) return override;
    return clampAnswerCount(getAnswerCountForTask(taskNumber));
  };

  const isSolvedAnswerValid = (question, rawValue, taskNumber) => {
    const answerCount = getAnswerCountForQuestion(question, taskNumber);
    const acceptedVariants = getAcceptedAnswerVariants(question, answerCount);
    const providedAnswers = parseSubmittedAnswers(rawValue, answerCount);
    if (providedAnswers.every((value) => !String(value ?? '').trim())) return false;
    return acceptedVariants.some((variant) => answerVectorsMatch(variant, providedAnswers, answerCount));
  };

  return {
    getAnswerCountForQuestion,
    getAcceptedAnswerVariantsForQuestion: getAcceptedAnswerVariants,
    getExpectedAnswersForQuestion,
    isSolvedAnswerValid,
    normalizeAnswerValue,
    parseSubmittedAnswers,
  };
};

export const buildQuestionCheckRawValue = (answers, answerCount) => {
  const safeCount = clampAnswerCount(answerCount);
  const source = Array.isArray(answers) ? answers : [];
  const normalized = Array.from(
    { length: safeCount },
    (_, index) => String(source[index] ?? '')
  );
  return safeCount <= 1
    ? normalized[0]
    : JSON.stringify({ answers: normalized });
};
