const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const formatAmount = (value, forms) => {
  const amount = Math.max(1, Math.floor(Number(value) || 1));
  const mod10 = amount % 10;
  const mod100 = amount % 100;
  if (mod10 === 1 && mod100 !== 11) return `${amount} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${amount} ${forms[1]}`;
  }
  return `${amount} ${forms[2]}`;
};

export const normalizeLastOnlineAt = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

export const formatLastOnlineAt = (value, now = Date.now()) => {
  const normalized = normalizeLastOnlineAt(value);
  if (!normalized) return '';

  const timestamp = Date.parse(normalized);
  const nowMs = Number(now);
  const elapsedMs = Number.isFinite(nowMs) ? Math.max(0, nowMs - timestamp) : 0;
  if (elapsedMs < MINUTE_MS) return 'только что';
  if (elapsedMs < HOUR_MS) {
    return `${formatAmount(elapsedMs / MINUTE_MS, ['минуту', 'минуты', 'минут'])} назад`;
  }
  if (elapsedMs < DAY_MS) {
    return `${formatAmount(elapsedMs / HOUR_MS, ['час', 'часа', 'часов'])} назад`;
  }
  if (elapsedMs < 7 * DAY_MS) {
    return `${formatAmount(elapsedMs / DAY_MS, ['день', 'дня', 'дней'])} назад`;
  }

  const date = new Date(timestamp);
  const nowDate = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  const includeYear = date.getFullYear() !== nowDate.getFullYear();
  const dateLabel = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).replace(/\.$/, '');
  const timeLabel = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel}, ${timeLabel}`;
};
