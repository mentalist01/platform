const ABSOLUTE_URL_RE = /^[a-z][a-z\d+\-.]*:/i;

export const buildDownloadUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw || /^blob:|^data:/i.test(raw)) return raw;

  try {
    const baseOrigin = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://downloads.local';
    const resolved = new URL(raw, baseOrigin);
    resolved.searchParams.set('download', '1');

    if (ABSOLUTE_URL_RE.test(raw) || raw.startsWith('//')) {
      return resolved.toString();
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    const separator = raw.includes('?') ? '&' : '?';
    return `${raw}${separator}download=1`;
  }
};
