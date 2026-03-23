const getEnvValue = (key) => {
  if (typeof import.meta === 'undefined') return '';
  const raw = import.meta.env?.[key];
  return typeof raw === 'string' ? raw.trim() : '';
};

const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

export const isAbsoluteUrl = (value) => /^[a-z][a-z\d+\-.]*:\/\//i.test(String(value || '').trim());

const normalizeRelativePath = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '/';
  return `/${trimmed.replace(/^\/+/, '')}`;
};

const joinUrl = (base, nextPath) => {
  const normalizedBase = trimTrailingSlash(base);
  const normalizedPath = normalizeRelativePath(nextPath);
  if (!normalizedBase) return normalizedPath;
  try {
    const url = new URL(normalizedBase);
    const basePath = trimTrailingSlash(url.pathname || '') || '';
    if (!basePath || basePath === '/') {
      url.pathname = normalizedPath;
    } else if (normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`)) {
      url.pathname = normalizedPath;
    } else {
      url.pathname = `${basePath}${normalizedPath}`;
    }
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return `${normalizedBase}${normalizedPath}`;
  }
};

const toWebSocketBase = (value) => {
  const normalized = trimTrailingSlash(value);
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return normalized;
  }
};

export const resolveApiUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (isAbsoluteUrl(raw)) return raw;
  const apiBase = getEnvValue('VITE_API_BASE_URL');
  if (apiBase) return joinUrl(apiBase, raw);
  return raw;
};

export const resolveUploadsUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (isAbsoluteUrl(raw)) return raw;
  const uploadsBase = getEnvValue('VITE_UPLOADS_BASE_URL') || getEnvValue('VITE_API_BASE_URL');
  if (uploadsBase) return joinUrl(uploadsBase, raw);
  return raw;
};

const buildDefaultWsUrl = (path) => {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, port, host } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  if ((import.meta?.env?.DEV || port === '5173') && port === '5173') {
    return `${wsProtocol}://${hostname}:5175${normalizeRelativePath(path)}`;
  }
  return `${wsProtocol}://${host}${normalizeRelativePath(path)}`;
};

const resolveWsUrl = (explicitUrl, fallbackPath) => {
  const normalizedExplicit = trimTrailingSlash(explicitUrl);
  if (normalizedExplicit) return normalizedExplicit;
  const wsBase = toWebSocketBase(getEnvValue('VITE_WS_BASE_URL'));
  if (wsBase) return joinUrl(wsBase, fallbackPath);
  return buildDefaultWsUrl(fallbackPath);
};

export const getCollabWsUrl = () => resolveWsUrl(getEnvValue('VITE_COLLAB_WS_URL'), '/collab');

export const getRtcWsUrl = () => resolveWsUrl(getEnvValue('VITE_RTC_WS_URL'), '/rtc');
