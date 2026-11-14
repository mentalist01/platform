const PRIMARY_TO_SECONDARY = {
  1: 7,
  2: 14,
  3: 20,
  4: 27,
  5: 34,
  6: 40,
  7: 43,
  8: 46,
  9: 48,
  10: 51,
  11: 54,
  12: 56,
  13: 59,
  14: 62,
  15: 64,
  16: 67,
  17: 70,
  18: 72,
  19: 75,
  20: 78,
  21: 80,
  22: 83,
  23: 85,
  24: 88,
  25: 90,
  26: 93,
  27: 95,
  28: 98,
  29: 100,
};

export const MOCK_PAIR_SCORING = 'fipi-2027-pair';
export const isMockPairScored = (taskNumber, question) => (
  [26, 27].includes(Number(taskNumber)) && question?.scoring === MOCK_PAIR_SCORING
);

export const getMockPairPartialCredit = (provided, variants, normalize) => {
  const [first, second] = provided.map(normalize);
  if (!first && !second) return 0;
  return variants.some((variant) => {
    const [expectedFirst, expectedSecond] = variant.map(normalize);
    return Boolean(expectedFirst && expectedSecond && (
      (first && first === expectedFirst)
      || (second && second === expectedSecond)
      || (first === expectedSecond && second === expectedFirst)
    ));
  }) ? 1 : 0;
};

export const getMockPrimaryScoreFromSolved = (solvedMap, partialCredit) => {
  const solved = solvedMap && typeof solvedMap === 'object' ? solvedMap : {};
  return Array.from({ length: 27 }, (_, index) => index + 1).reduce((sum, taskNumber) => (
    solved[String(taskNumber)]
      ? sum + ([26, 27].includes(taskNumber) ? 2 : 1)
      : sum + ([26, 27].includes(taskNumber) && partialCredit?.[taskNumber] === 1 ? 1 : 0)
  ), 0);
};

export const getMockSecondaryScoreFromSolved = (solvedMap, partialCredit) => {
  return getMockSecondaryScoreFromPrimary(getMockPrimaryScoreFromSolved(solvedMap, partialCredit));
};

export const getMockSecondaryScoreFromPrimary = value => {
  const primaryScore = Math.max(0, Math.min(29, Math.round(Number(value) || 0)));
  return primaryScore > 0 ? PRIMARY_TO_SECONDARY[primaryScore] || 0 : 0;
};

