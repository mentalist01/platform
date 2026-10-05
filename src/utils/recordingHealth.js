export function recordingHealthWarning({ enabled, active, settings, checkedAt, activeSince, now = Date.now() }) {
  if (!enabled || !active || !activeSince || now - activeSince < 20000) return null;
  if (!checkedAt || now - checkedAt > 20000) return { title: 'Не можем проверить запись', detail: 'Нет свежего подтверждения от платформы. Проверьте состояние записи в пульте.' };
  if (!settings?.devices?.some(device => device.online)) return { title: 'Пульт записи потерял связь', detail: 'Запись сейчас не подтверждена. Откройте пульт и проверьте, что OBS записывает урок.' };
  const jobs = (settings.jobs || []).filter(job => job.desired === 'record' && job.cutoffAt > now);
  if (jobs.some(job => job.status === 'recording')) return null;
  return { title: 'Запись урока не подтверждена', detail: jobs.find(job => job.status === 'error')?.error || 'Пульт ещё не подтвердил запуск OBS. Проверьте запись, чтобы не потерять часть урока.' };
}
