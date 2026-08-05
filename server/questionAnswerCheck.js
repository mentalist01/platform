const clampAnswerCount = (value) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(50, parsed));
};

export const createQuestionAnswerRules = ({ getAnswerCountForTask }) => {
  if (typeof getAnswerCountForTask !== 'function') {
    throw new TypeError('getAnswerCountForTask must be a function');
  }

  const normalizeAnswerValue = (value) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  const getExpectedAnswersForQuestion = (question, count) => {
    const safeCount = clampAnswerCount(count);
    if (!question || typeof question !== 'object') {
      return Array.from({ length: safeCount }, () => '');
    }
    if (safeCount <= 1) {
      const fallback = Array.isArray(question?.options)
        ? question.options[question.correctIndex]
        : '';
      const directAnswer = question?.answer;
      if (directAnswer !== undefined && directAnswer !== null && String(directAnswer).trim() !== '') {
        return [directAnswer];
      }
      const fromArray = Array.isArray(question?.answers) ? question.answers : [];
      if (fromArray.length > 0 && String(fromArray[0] ?? '').trim() !== '') {
        return [fromArray[0]];
      }
      return [fallback ?? ''];
    }
    const fromArray = Array.isArray(question.answers) ? question.answers : [];
    if (fromArray.length > 0) {
      const filled = [...fromArray];
      while (filled.length < safeCount) filled.push('');
      return filled.slice(0, safeCount);
    }
    const answers = [];
    for (let index = 1; index <= safeCount; index += 1) {
      const key = index === 1 ? 'answer' : `answer${index}`;
      answers.push(question?.[key] ?? '');
    }
    return answers;
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
    const expectedAnswers = getExpectedAnswersForQuestion(question, answerCount);
    const providedAnswers = parseSubmittedAnswers(rawValue, answerCount);
    if (answerCount <= 1) {
      if (!String(providedAnswers[0] ?? '').trim()) return false;
      return normalizeAnswerValue(providedAnswers[0]) === normalizeAnswerValue(expectedAnswers[0]);
    }
    if (providedAnswers.every((value) => !String(value ?? '').trim())) return false;
    return expectedAnswers.every((expected, index) => (
      normalizeAnswerValue(expected) === normalizeAnswerValue(providedAnswers[index])
    ));
  };

  return {
    getAnswerCountForQuestion,
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
