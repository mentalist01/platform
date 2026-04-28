export const getTargetLevelXpRequirement = (level) => {
  const targetLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (targetLevel <= 30) return Math.max(0, (targetLevel - 1) * 75);
  if (targetLevel <= 100) return ((targetLevel - 29) * 450) + 2500;
  return ((targetLevel - 100) * 900) + 34500;
};

export const getNextLevelXpRequirement = (currentLevel) => {
  const level = Math.max(1, Math.floor(Number(currentLevel) || 1));
  return Math.max(1, getTargetLevelXpRequirement(level + 1));
};

const normalizeXp = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number);
};

export const getLevelProgressFromXp = (value) => {
  let remainingXp = normalizeXp(value);
  let level = 1;
  let xpForNextLevel = getNextLevelXpRequirement(level);
  let guard = 0;

  while (remainingXp >= xpForNextLevel && guard < 100000) {
    remainingXp -= xpForNextLevel;
    level += 1;
    xpForNextLevel = getNextLevelXpRequirement(level);
    guard += 1;
  }

  const progressPercent = xpForNextLevel > 0
    ? Math.max(0, Math.min(100, Math.round((remainingXp / xpForNextLevel) * 100)))
    : 0;

  return {
    level,
    xpIntoLevel: remainingXp,
    xpForNextLevel,
    progressPercent,
  };
};

export const getLevelFromXp = (value) => getLevelProgressFromXp(value).level;
