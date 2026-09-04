const clampAnswerCount = (value) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(50, parsed));
};

export const normalizeComparableAnswer = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

export const normalizeAnswerVector = (value, count) => {
  const safeCount = clampAnswerCount(count);
  const source = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' && Array.isArray(value.answers)
        ? value.answers
        : [value]);
  return Array.from({ length: safeCount }, (_, index) => String(source[index] ?? '').trim());
};

export const getPrimaryAnswerVector = (question, count) => {
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
      return [String(directAnswer).trim()];
    }
    const fromArray = Array.isArray(question?.answers) ? question.answers : [];
    if (fromArray.length > 0 && String(fromArray[0] ?? '').trim() !== '') {
      return [String(fromArray[0]).trim()];
    }
    return [String(fallback ?? '').trim()];
  }
  const fromArray = Array.isArray(question.answers) ? question.answers : [];
  if (fromArray.length > 0) return normalizeAnswerVector(fromArray, safeCount);
  return Array.from({ length: safeCount }, (_, index) => {
    const key = index === 0 ? 'answer' : `answer${index + 1}`;
    return String(question?.[key] ?? '').trim();
  });
};

export const getAnswerVectorSignature = (values, count) => normalizeAnswerVector(values, count)
  .map(normalizeComparableAnswer)
  .join('\u0000');

export const getAcceptedAnswerVariants = (question, count) => {
  const safeCount = clampAnswerCount(count);
  const primary = getPrimaryAnswerVector(question, safeCount);
  const rawVariants = Array.isArray(question?.acceptedAnswerVariants)
    ? question.acceptedAnswerVariants.slice(0, 50)
    : [];
  const candidates = [primary];

  if (safeCount <= 1) {
    rawVariants.forEach((variant) => candidates.push(normalizeAnswerVector(variant, safeCount)));
  } else if (rawVariants.length > 0 && rawVariants.every((variant) => !Array.isArray(variant) && !(variant && typeof variant === 'object'))) {
    candidates.push(normalizeAnswerVector(rawVariants, safeCount));
  } else {
    rawVariants.forEach((variant) => candidates.push(normalizeAnswerVector(variant, safeCount)));
  }

  const seen = new Set();
  return candidates.reduce((result, candidate) => {
    const vector = normalizeAnswerVector(candidate, safeCount);
    if (vector.every((value) => !value)) return result;
    const signature = getAnswerVectorSignature(vector, safeCount);
    if (seen.has(signature)) return result;
    seen.add(signature);
    result.push(vector);
    return result;
  }, []);
};

export const answerVectorsMatch = (left, right, count) => (
  getAnswerVectorSignature(left, count) === getAnswerVectorSignature(right, count)
);
