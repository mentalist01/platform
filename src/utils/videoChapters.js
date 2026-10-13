const MAX_CHAPTERS = 200;
export const formatChapterTime = (seconds) => {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  const parts = [Math.floor(n / 60), n % 60];
  if (n >= 3600) parts.splice(0, 1, Math.floor(n / 3600), Math.floor(n / 60) % 60);
  return parts.map(part => String(part).padStart(2, '0')).join(':');
};

export function parseVideoChapters(text) {
  const lines = String(text || '').split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  if (lines.length > MAX_CHAPTERS) throw Error(`Можно добавить до ${MAX_CHAPTERS} тайм-кодов`);
  let previous = -1;
  return lines.map((line, index) => {
    const match = line.match(/^(?:[-*•]\s*)?\[?(\d{1,4}:\d{2}(?::\d{2})?)\]?\s*(?:[-–—]\s*)?(.+)$/u);
    if (!match) throw Error(`Строка ${index + 1}: используйте формат 00:00 Название`);
    const parts = match[1].split(':').map(Number);
    if (parts.at(-1) > 59 || (parts.length === 3 && parts[1] > 59)) throw Error(`Строка ${index + 1}: неверное время`);
    const time = parts.reduce((sum, part) => sum * 60 + part, 0);
    const title = match[2].trim();
    if (!title || title.length > 160) throw Error(`Строка ${index + 1}: название должно содержать от 1 до 160 символов`);
    if (time <= previous || time > 7 * 24 * 3600) throw Error(`Строка ${index + 1}: время должно идти по порядку, без повторений`);
    previous = time;
    return { time, title };
  });
}

export function normalizeVideoChapters(value) {
  if (!Array.isArray(value) || value.length > MAX_CHAPTERS) return [];
  try {
    if (value.some(item => !Number.isSafeInteger(item?.time) || item.time < 0 || typeof item.title !== 'string')) return [];
    return parseVideoChapters(value.map(item => `${formatChapterTime(item.time)} ${item.title}`).join('\n'));
  } catch { return []; }
}
export const videoChapterMetadata = (value) => {
  const chapters = normalizeVideoChapters(value?.chapters);
  return chapters.length ? { chapters } : {};
};
export const chaptersToText = (chapters) => normalizeVideoChapters(chapters).map(item => `${formatChapterTime(item.time)} ${item.title}`).join('\n');
export const VIDEO_CHAPTERS_PROMPT = `Составь понятное оглавление учебного видео по расшифровке ниже. Используй только имеющиеся временные отметки: не придумывай время. Выдели объяснения понятий, примеры, начало разбора каждой задачи и важные типичные ошибки. Названия делай короткими и конкретными. Не добавляй пункт на каждую фразу; сохрани важные переходы темы. Проверь последовательность времени. Верни только строки формата:
00:00 Название раздела
05:30 Название следующего раздела
Для видео длиннее часа используй 01:05:30. Время должно относиться к окончательному видео после монтажа и ускорения. Если в расшифровке нет временных отметок, скажи, что нужны отметки, и не выдумывай тайм-коды.

Расшифровка окончательного видео:
[вставьте расшифровку с временными отметками]`;
