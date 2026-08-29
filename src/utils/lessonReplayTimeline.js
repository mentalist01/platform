export const getReplayAudioDurationMs = (event) => (
  Math.max(250, Number(event?.payload?.durationMs) || 30_000)
);

export const findReplayAudioEventIndex = (audioEvents, positionMs) => {
  const events = Array.isArray(audioEvents) ? audioEvents : [];
  const position = Math.max(0, Number(positionMs) || 0);
  let candidateIndex = -1;
  for (let index = 0; index < events.length; index += 1) {
    if (Number(events[index]?.offsetMs) > position) break;
    candidateIndex = index;
  }
  if (candidateIndex < 0) return -1;
  for (let index = candidateIndex; index >= 0; index -= 1) {
    const candidate = events[index];
    const segmentEnd = Number(candidate?.offsetMs) + getReplayAudioDurationMs(candidate);
    if (position <= segmentEnd + 50) return index;
  }
  return -1;
};

export const findUpcomingReplayAudioEventIndex = (audioEvents, positionMs) => {
  const events = Array.isArray(audioEvents) ? audioEvents : [];
  const position = Math.max(0, Number(positionMs) || 0);
  return events.findIndex((event) => Number(event?.offsetMs) > position);
};

export const getReplayTimelineDurationMs = (events, reportedDurationMs = 0) => {
  const source = Array.isArray(events) ? events : [];
  return Math.max(
    1000,
    Number(reportedDurationMs) || 0,
    ...source.map((event) => (
      (Number(event?.offsetMs) || 0)
      + (event?.type === 'audio' ? getReplayAudioDurationMs(event) : 0)
    ))
  );
};

const getActorLabel = (event) => {
  const role = event?.actor?.role || event?.payload?.sharedByRole || '';
  const name = String(event?.actor?.name || event?.payload?.sharedByName || '').trim();
  if (name) return name;
  if (role === 'teacher') return 'Учитель';
  if (role === 'student') return 'Ученик';
  return '';
};

const getSurfaceActionLabel = (event) => {
  if (!event) return 'начинает занятие';
  if (event.type === 'board') {
    if (event.payload?.mode === 'snapshot') return 'сохраняет состояние доски';
    const hasUpserts = Array.isArray(event.payload?.upserts) && event.payload.upserts.length > 0;
    const hasRemovals = Array.isArray(event.payload?.removedIds) && event.payload.removedIds.length > 0;
    if (hasRemovals && !hasUpserts) return 'стирает с доски';
    return 'рисует на доске';
  }
  if (event.type === 'board-view') return 'смотрит доску';
  if (event.type === 'code') {
    if (event.payload?.action === 'snapshot') return 'сохраняет состояние кода';
    if (event.payload?.action === 'run') return 'обновляет код перед запуском';
    return 'печатает в коде';
  }
  if (event.type === 'code-view') return 'смотрит код';
  if (event.type === 'run') return 'запускает код';
  if (event.type === 'screen') {
    return event.payload?.active === false ? 'останавливает демонстрацию экрана' : 'делится экраном';
  }
  if (event.type === 'viewport') {
    return event.payload?.surface === 'code' ? 'перемещается по коду' : 'перемещается по доске';
  }
  if (event.type === 'navigation') {
    return event.payload?.label
      ? `переходит в раздел «${event.payload.label}»`
      : 'переходит по платформе';
  }
  if (event.type === 'task') {
    if (event.payload?.active === false) return 'возвращается к списку заданий';
    return event.payload?.label ? `открывает «${event.payload.label}»` : 'открывает задание';
  }
  if (event.type === 'session') {
    if (event.payload?.action === 'switch') {
      return event.payload?.via === 'telemost' ? 'переходит в Телемост' : 'возвращается на платформу';
    }
    return event.payload?.action === 'end' ? 'завершает занятие' : 'начинает занятие';
  }
  if (event.type === 'audio') return 'записывает аудио';
  return 'выполняет действие';
};

export const getReplayEventNarration = (event) => {
  const actor = getActorLabel(event);
  const action = getSurfaceActionLabel(event);
  return actor ? `${actor} ${action}` : action;
};
