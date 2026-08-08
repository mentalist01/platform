const NO_ATTEMPTS_PRACTICE_KEYS = new Set(['new']);
const INSUFFICIENT_DATA_PRACTICE_KEYS = new Set(['unknown', 'unavailable']);

export const getProgressTopicStatus = ({ progress, practiceKey } = {}) => {
  const numericProgress = Number(progress);
  const normalizedProgress = Number.isFinite(numericProgress)
    ? Math.max(0, Math.min(100, numericProgress))
    : 0;
  const normalizedPracticeKey = String(practiceKey || '').trim().toLowerCase();

  if (normalizedProgress <= 0 && NO_ATTEMPTS_PRACTICE_KEYS.has(normalizedPracticeKey)) {
    return { key: 'neutral', label: 'Не начато' };
  }

  if (normalizedProgress <= 0 && INSUFFICIENT_DATA_PRACTICE_KEYS.has(normalizedPracticeKey)) {
    return { key: 'neutral', label: 'Недостаточно данных' };
  }

  if (normalizedProgress >= 85) return { key: 'strong', label: 'Выполнено 85%+' };
  if (normalizedProgress >= 60) return { key: 'active', label: 'В работе' };
  if (normalizedProgress >= 40) return { key: 'practice', label: 'Нужна практика' };
  return { key: 'focus', label: 'Зона внимания' };
};
