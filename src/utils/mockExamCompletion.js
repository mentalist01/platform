const timestamp = value => Date.parse(String(value || ''));

export function isMockAttemptFinished(attempt) {
  return Boolean(attempt?.timerFinishedAt || attempt?.finishedAt || attempt?.status === 'finished' || attempt?.finalized === true);
}

// The finish timestamp, not the viewer's clock, owns a completed countdown.
// Historical results must show the same remaining time next week as today.
export function getMockExamRemainingMs(attempt, nowMs = Date.now(), fallbackMs = null) {
  const finished = isMockAttemptFinished(attempt);
  const paused = Boolean(attempt?.timerPausedAt);
  if (paused && Number.isFinite(Number(attempt?.timerRemainingMs))) return Math.max(0, Number(attempt.timerRemainingMs));
  const expires = timestamp(attempt?.timerExpiresAt);
  if (!Number.isFinite(expires)) return finished ? 0 : fallbackMs;
  const reference = finished ? timestamp(attempt?.timerFinishedAt || attempt?.finishedAt) : nowMs;
  if (!Number.isFinite(reference)) return finished ? 0 : fallbackMs;
  return Math.max(0, expires - reference);
}

// These are the teacher's preparation milestones, not national exam norms.
export function getMockExamResultFeedback(value, completedAt) {
  const score = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const date = timestamp(completedAt);
  const month = Number.isFinite(date) ? Number(new Intl.DateTimeFormat('en', {timeZone:'Europe/Moscow',month:'numeric'}).format(date)) : 0;
  const stage = [9,10,11].includes(month) ? {min:0,max:30,label:'Начало учебного года'}
    : month === 12 ? {min:30,max:50,label:'Декабрь'}
    : [1,2].includes(month) ? {min:60,max:80,label:'Январь — февраль'}
    : [3,4,5].includes(month) ? {min:80,max:100,label:'Финишная прямая'} : null;
  const tone = score === 100 || stage && score > stage.max ? 'excellent' : stage && score < stage.min ? 'support' : 'steady';
  return {score,stage,tone,
    title: score === 100 ? 'Все 100. Блестящая работа!' : tone === 'excellent' ? 'Вот это результат!' : tone === 'support' ? 'Есть понятный следующий шаг' : score === 0 ? 'Это твоя точка старта' : 'Ты уверенно идёшь вперёд',
    message: score === 100 ? 'Ты справился со всем пробником. Поздравляем! Теперь важно сохранить эту уверенность до экзамена.'
      : tone === 'excellent' ? 'Ты уже выше ориентира на этот этап подготовки. Отличная работа — твои усилия дают результат!'
      : tone === 'support' ? 'Сейчас стоит укрепить базу и спокойно разобрать сложные задания. Этот балл не предел: пойдём дальше шаг за шагом.'
      : score === 0 ? 'Теперь мы знаем, с чего начать. Разберём первые задания вместе — каждый понятный шаг станет опорой для следующего результата.'
      : stage ? 'Хорошая работа: результат соответствует этому этапу подготовки. Закрепим то, что получилось, и разберём то, что пока вызывает вопросы.'
      : 'Пробник пройден, и теперь виден следующий шаг. Закрепим удачные решения и спокойно разберём сложные задания.',
  };
}
