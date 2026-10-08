import path from 'node:path';

export const VERSION = '0.1.0';
export const MAX_WORKBOOK = 64 * 1024 * 1024;
export const MAX_TEXT = 16 * 1024 * 1024;
export const WORKBOOK_EXTENSIONS = new Set(['.xls', '.xlsx', '.xlsm', '.xlsb', '.ods', '.fods']);
export const shaPattern = /^[a-f0-9]{64}$/i;
export function parseLaunch(raw, { allowLoopback = false } = {}) {
  if (typeof raw !== 'string' || raw.length > 4096) throw new Error('Некорректная ссылка запуска.');
  const uri = new URL(raw);
  if (uri.protocol !== 'ivan-ege:' || uri.username || uri.password || uri.hash
    || !((uri.hostname === 'workbook' && uri.pathname === '/open') || (uri.hostname === 'open' && !uri.pathname))) throw new Error('Неизвестная команда помощника.');
  const names = [...uri.searchParams.keys()].map(key => key.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('Повторяющиеся параметры запуска.');
  const origin = new URL(uri.searchParams.get('origin'));
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Некорректный адрес платформы.');
  const trusted = origin.origin === 'https://ivan100.ru';
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) && ['http:', 'https:'].includes(origin.protocol);
  if (!trusted && !(allowLoopback && loopback)) throw new Error('Помощник открывает таблицы только с ivan100.ru.');
  const ticket = uri.searchParams.get('ticket') || '';
  if (!/^[a-zA-Z0-9_.~-]{16,512}$/.test(ticket)) throw new Error('Некорректный одноразовый билет.');
  return { origin: origin.origin, ticket };
}
export function safeFileName(value, text = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240) throw new Error('Некорректное имя файла.');
  const file = path.posix.basename(value.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f:*?"<>|]/g, '_');
  const ext = path.extname(file).toLowerCase();
  if (!(text ? ['.txt', '.csv', '.tsv'].includes(ext) : WORKBOOK_EXTENSIONS.has(ext))) throw new Error('Неподдерживаемый формат файла.');
  const stem = path.basename(file, path.extname(file)).trim().replace(/[. ]+$/, '').slice(0, 110) || 'Задание';
  if (stem.startsWith('.')) throw new Error('Скрытое имя файла не разрешено.');
  return stem + ext;
}
export function solutionName(value) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f\\/:*?"<>|]/.test(value)) throw new Error('Введите название без служебных символов.');
  let name = value.trim().replace(/\s+/g, ' ');
  if (WORKBOOK_EXTENSIONS.has(path.extname(name).toLowerCase())) name = name.slice(0, -path.extname(name).length).trim();
  if (!name || name.length > 100 || name.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) throw new Error('Выберите название от 1 до 100 символов.');
  return name;
}
export function validateGrant(origin, raw) {
  const data = raw.workbook || raw;
  const result = { origin, token: raw.token, workbookKey: data.workbookKey || raw.workbookKey, fileName: safeFileName(data.fileName || raw.fileName),
    revision: String(data.revision ?? raw.revision ?? ''), contentHash: String(data.contentHash || raw.contentHash || '').toLowerCase(),
    expiresAt: raw.expiresAt || data.expiresAt, requiresName: Boolean(data.requiresName ?? data.nameRequired ?? raw.requiresName ?? raw.nameRequired),
    solutionName: data.solutionName || raw.solutionName || '' };
  if (typeof result.token !== 'string' || !/^[a-zA-Z0-9_.~-]{16,4096}$/.test(result.token)
    || typeof result.workbookKey !== 'string' || !result.workbookKey || result.workbookKey.length > 512
    || !shaPattern.test(result.contentHash) || !/^\d+$/.test(result.revision)
    || !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now()) throw new Error('Сервер вернул неполную привязку таблицы.');
  if (raw.sourceText) {
    const source = raw.sourceText;
    if (!shaPattern.test(source.contentHash || '') || !Number.isSafeInteger(source.sizeBytes) || source.sizeBytes < 0 || source.sizeBytes > MAX_TEXT) throw new Error('Некорректный исходный текст задания.');
    result.sourceText = { fileName: safeFileName(source.fileName, true), contentHash: source.contentHash.toLowerCase(), sizeBytes: source.sizeBytes };
  }
  return result;
}
