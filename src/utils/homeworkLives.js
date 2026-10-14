export const MAX_HOMEWORK_LIVES = 3;
export const MONTHLY_HOMEWORK_DAMAGE = 8;
export const formatLives = value => Math.max(0, Number(value) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
export const lifeFractions = value => Array.from({ length: 3 }, (_, index) => Math.max(0, Math.min(1, Number(value) - index)));
export const nextLivesMonth = month => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7);
};
