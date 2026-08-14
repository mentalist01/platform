export const formatQuickHomeworkPlanMinutes = (value) => {
  const minutes = Math.max(1, Math.ceil(Number(value) || 0));
  const mod10 = minutes % 10;
  const mod100 = minutes % 100;
  const unit = mod10 === 1 && mod100 !== 11
    ? 'минуту'
    : (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'минуты' : 'минут');
  return `${minutes} ${unit}`;
};

export const getQuickHomeworkPlanPresentation = (progress) => {
  const total = Math.max(0, Math.floor(Number(progress?.total) || 0));
  const completed = Math.max(0, Math.min(total, Math.floor(Number(progress?.completed) || 0)));
  const budgetMinutes = Math.max(0, Math.ceil(Number(progress?.budgetMinutes) || 0));
  const active = total > 0 && budgetMinutes > 0;
  const label = budgetMinutes > 0
    ? `План на ≈${formatQuickHomeworkPlanMinutes(budgetMinutes)}`
    : 'Быстрый план';
  return {
    active,
    total,
    completed,
    budgetMinutes,
    label,
    progressLabel: `${label} · ${completed}/${total}`,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
};
