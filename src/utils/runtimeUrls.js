const getEnvValue = (key) => {
  if (typeof import.meta === 'undefined') return '';
  const raw = import.meta.env?.[key];
  return typeof raw === 'string' ? raw.trim() : '';
};

const RUNTIME_API_BASE_STORAGE_KEY = 'ege_runtime_api_base_url';

const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

export const isAbsoluteUrl = (value) => /^[a-z][a-z\d+\-.]*:\/\//i.test(String(value || '').trim());

export const isNativeAppRuntime = () => {
  if (typeof window === 'undefined') return false;
  const capacitor = window.Capacitor;
  if (capacitor && typeof capacitor.isNativePlatform === 'function') {
    try {
      return Boolean(capacitor.isNativePlatform());
    } catch {}
  }
  return false;
};

const getRuntimeStorage = () => {
  if (!isNativeAppRuntime()) return null;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

const normalizeHttpBaseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = isAbsoluteUrl(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error('Укажите корректный адрес сайта, например https://example.ru');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Адрес сервера должен начинаться с http:// или https://');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return trimTrailingSlash(url.toString());
};

const getStoredRuntimeApiBaseUrl = () => {
  const storage = getRuntimeStorage();
  if (!storage) return '';
  try {
    return normalizeHttpBaseUrl(storage.getItem(RUNTIME_API_BASE_STORAGE_KEY) || '');
  } catch {
    return '';
  }
};

export const getConfiguredApiBaseUrl = () => {
  const runtimeBase = getStoredRuntimeApiBaseUrl();
  if (runtimeBase) return runtimeBase;
  return trimTrailingSlash(getEnvValue('VITE_API_BASE_URL'));
};

export const hasConfiguredApiBaseUrl = () => Boolean(getConfiguredApiBaseUrl());

export const saveRuntimeApiBaseUrl = (value) => {
  const storage = getRuntimeStorage();
  const normalized = normalizeHttpBaseUrl(value);
  if (storage) {
    storage.setItem(RUNTIME_API_BASE_STORAGE_KEY, normalized);
  }
  return normalized;
};

export const clearRuntimeApiBaseUrl = () => {
  const storage = getRuntimeStorage();
  if (!storage) return;
  try {
    storage.removeItem(RUNTIME_API_BASE_STORAGE_KEY);
  } catch {}
};

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
  const apiBase = getConfiguredApiBaseUrl();
  if (apiBase) return joinUrl(apiBase, raw);
  return raw;
};

export const resolveUploadsUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (isAbsoluteUrl(raw)) return raw;
  const uploadsBase = trimTrailingSlash(getEnvValue('VITE_UPLOADS_BASE_URL')) || getConfiguredApiBaseUrl();
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
  const runtimeWsBase = toWebSocketBase(getConfiguredApiBaseUrl());
  if (runtimeWsBase) return joinUrl(runtimeWsBase, fallbackPath);
  const wsBase = toWebSocketBase(getEnvValue('VITE_WS_BASE_URL'));
  if (wsBase) return joinUrl(wsBase, fallbackPath);
  return buildDefaultWsUrl(fallbackPath);
};

export const getCollabWsUrl = () => resolveWsUrl(getEnvValue('VITE_COLLAB_WS_URL'), '/collab');

export const getRtcWsUrl = () => resolveWsUrl(getEnvValue('VITE_RTC_WS_URL'), '/rtc');
