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

export const getMockPrimaryScoreFromSolved = (solvedMap) => {
  const solved = solvedMap && typeof solvedMap === 'object' ? solvedMap : {};
  return Array.from({ length: 27 }, (_, index) => index + 1).reduce((sum, taskNumber) => (
    solved[String(taskNumber)]
      ? sum + ([26, 27].includes(taskNumber) ? 2 : 1)
      : sum
  ), 0);
};

export const getMockSecondaryScoreFromSolved = (solvedMap) => {
  return getMockSecondaryScoreFromPrimary(getMockPrimaryScoreFromSolved(solvedMap));
};

export const getMockSecondaryScoreFromPrimary = value => {
  const primaryScore = Math.max(0, Math.min(29, Math.round(Number(value) || 0)));
  return primaryScore > 0 ? PRIMARY_TO_SECONDARY[primaryScore] || 0 : 0;
};

