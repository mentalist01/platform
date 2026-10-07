import crypto from 'node:crypto';

export const MIN_CLIP = 0.04;
const time = value => Math.round(Number(value) * 1000) / 1000;
export function recordingSeconds(status) {
  const parts = String(status?.outputTimecode || '').split(':').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n) || n < 0)) return 0;
  return time(parts[0] * 3600 + parts[1] * 60 + parts[2]);
}
export const createTimeline = () => ({ version: 1, revision: 0, clips: [], history: [], future: [], openStart: 0, sourceEnd: 0, approved: false });
const snapshot = (clips, related) => ({ clips: structuredClone(clips), knownIds: [...new Set([...clips, ...related].map(clip => clip.id))] });
const remember = (timeline, next) => {
  timeline.history.push(snapshot(timeline.clips, next));
  timeline.history = timeline.history.slice(-30);
  timeline.future = [];
};
export function observeTimeline(timeline, seconds) {
  if (!timeline || !Number.isFinite(seconds)) return;
  timeline.sourceEnd = Math.max(timeline.sourceEnd, time(seconds));
}
export function closeTimelineClip(timeline, seconds) {
  if (!timeline) return;
  observeTimeline(timeline, seconds);
  if (timeline.openStart === null) return;
  if (timeline.sourceEnd - timeline.openStart >= MIN_CLIP) {
    timeline.clips.push({ id: crypto.randomUUID(), start: timeline.openStart, end: timeline.sourceEnd });
    timeline.revision++;
  }
  timeline.openStart = null;
}
export function resumeTimeline(timeline, seconds) {
  if (!timeline || timeline.openStart !== null) return;
  observeTimeline(timeline, seconds);
  timeline.openStart = timeline.sourceEnd;
}
export function finishTimeline(timeline, seconds) {
  if (!timeline) return;
  timeline.pendingTailStart = timeline.openStart;
  closeTimelineClip(timeline, seconds);
}
export function finalizeTimeline(timeline, duration) {
  if (!timeline || timeline.finalized || !Number.isFinite(duration) || duration < 0) return;
  const last = timeline.clips.at(-1);
  if (timeline.pendingTailStart !== null && timeline.pendingTailStart !== undefined) {
    if (last && last.start === timeline.pendingTailStart && last.end === timeline.sourceEnd) last.end = time(duration);
    else if (duration - timeline.pendingTailStart >= MIN_CLIP) timeline.clips.push({ id: crypto.randomUUID(), start: timeline.pendingTailStart, end: time(duration) });
  }
  timeline.sourceEnd = time(duration); timeline.finalized = true; delete timeline.pendingTailStart; timeline.revision++;
}
export function editTimeline(timeline, { revision, action, clipId, at, start, end, direction, beforeId }) {
  if (!timeline || timeline.version !== 1 || timeline.approved) throw Error('Этот монтаж уже отправлен или недоступен');
  if (revision !== timeline.revision) throw Error('Монтаж изменился. Обновите ленту и повторите действие.');
  if (action === 'undo' || action === 'redo') {
    const from = action === 'undo' ? timeline.history : timeline.future;
    const previous = from?.at(-1);
    if (!previous) throw Error(action === 'undo' ? 'Нет действий для отмены' : 'Нет действий для возврата');
    const newlyRecorded = timeline.clips.filter(clip => !previous.knownIds.includes(clip.id));
    const next = [...structuredClone(previous.clips), ...newlyRecorded];
    if (next.length > 300) throw Error('В ленте уже 300 фрагментов');
    const opposite = action === 'undo' ? (timeline.future ||= []) : timeline.history;
    opposite.push(snapshot(timeline.clips, next));
    if (opposite.length > 30) opposite.shift();
    from.pop(); timeline.clips = next; timeline.revision++; return;
  }
  const index = timeline.clips.findIndex(clip => clip.id === clipId);
  const clip = timeline.clips[index];
  if (!clip) throw Error('Выберите завершённый фрагмент. Текущий дубль сначала поставьте на паузу.');
  let next;
  if (action === 'delete') next = timeline.clips.filter(item => item.id !== clipId);
  else if (action === 'split') {
    const point = time(at);
    if (!Number.isFinite(point) || point - clip.start < MIN_CLIP || clip.end - point < MIN_CLIP) throw Error('Место разделения должно быть внутри фрагмента');
    if (timeline.clips.length >= 300) throw Error('В ленте уже 300 фрагментов');
    next = timeline.clips.flatMap(item => item.id === clipId ? [{ ...clip, end: point }, { id: crypto.randomUUID(), start: point, end: clip.end }] : [item]);
  } else if (action === 'trim') {
    const from = time(start), to = time(end);
    if (![from, to].every(Number.isFinite) || from < clip.start || to > clip.end || to - from < MIN_CLIP) throw Error('Укажите начало и конец внутри выбранного фрагмента');
    next = timeline.clips.map(item => item.id === clipId ? { ...clip, start: from, end: to } : item);
  } else if (action === 'move') {
    if (![-1, 1].includes(direction) || !timeline.clips[index + direction]) throw Error('Фрагмент уже на краю ленты');
    next = [...timeline.clips]; [next[index], next[index + direction]] = [next[index + direction], next[index]];
  } else if (action === 'reorder') {
    if (beforeId !== null && !timeline.clips.some(item => item.id === beforeId)) throw Error('Место перемещения изменилось. Обновите ленту.');
    if (beforeId === clipId) return;
    next = timeline.clips.filter(item => item.id !== clipId);
    next.splice(beforeId === null ? next.length : next.findIndex(item => item.id === beforeId), 0, clip);
    if (next.every((item, position) => item.id === timeline.clips[position].id)) return;
  } else if (action === 'duplicate') {
    if (timeline.clips.length >= 300) throw Error('В ленте уже 300 фрагментов');
    next = [...timeline.clips]; next.splice(index + 1, 0, { ...clip, id: crypto.randomUUID() });
  } else if (action === 'join') {
    const after = timeline.clips[index + 1];
    if (!after || Math.abs(clip.end - after.start) > .001) throw Error('Объединить можно соседние части одного непрерывного исходника');
    next = timeline.clips.flatMap((item, position) => position === index ? [{ ...clip, end: after.end }] : position === index + 1 ? [] : [item]);
  } else throw Error('Неизвестное действие монтажа');
  remember(timeline, next); timeline.clips = next; timeline.revision++;
}
export function approveTimeline(timeline, revision) {
  if (!timeline || timeline.approved || revision !== timeline.revision || timeline.openStart !== null) throw Error('Завершите запись и обновите монтаж');
  if (!timeline.clips.length) throw Error('В итоговом видео должен остаться хотя бы один фрагмент');
  for (const clip of timeline.clips) {
    if (![clip.start, clip.end].every(Number.isFinite) || clip.start < 0 || clip.end > timeline.sourceEnd + .01 || clip.end - clip.start < MIN_CLIP) throw Error('Некорректная граница фрагмента');
  }
  timeline.approved = true;
}
export const timelineDuration = timeline => timeline?.clips.reduce((sum, clip) => sum + clip.end - clip.start, 0) || 0;
