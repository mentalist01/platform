export const TELEMOST_URL_MAX_LENGTH = 2048;
export const TELEMOST_URL_ERROR = 'Нужна ссылка вида https://telemost.yandex.ru/j/...';

const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export const parseTelemostUrl = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { url: '', error: '' };
  if (raw.length > TELEMOST_URL_MAX_LENGTH) {
    return { url: '', error: TELEMOST_URL_ERROR };
  }

  const candidate = HAS_SCHEME_RE.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { url: '', error: TELEMOST_URL_ERROR };
  }

  const pathname = String(parsed.pathname || '');
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== 'telemost.yandex.ru'
    || parsed.port
    || parsed.username
    || parsed.password
    || !/^\/j\/[^/]+\/?$/.test(pathname)
  ) {
    return { url: '', error: TELEMOST_URL_ERROR };
  }

  parsed.hash = '';
  const url = parsed.toString();
  if (url.length > TELEMOST_URL_MAX_LENGTH) {
    return { url: '', error: TELEMOST_URL_ERROR };
  }
  return { url, error: '' };
};

export const normalizeTelemostUrl = (value) => parseTelemostUrl(value).url;

export const isTelemostUrl = (value) => Boolean(normalizeTelemostUrl(value));
