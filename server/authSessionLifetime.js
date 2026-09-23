// Account sessions persist until logout or explicit revocation. Cookie expiry
// is renewed on authenticated requests; it is not a server-side logout timer.
export const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export function normalizeAuthSessionExpiry(entry, now = Date.now()) {
  if (entry?.expiresAtMs === null) return null;
  const raw = entry?.expiresAtMs;
  const expiresAtMs = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return undefined;
  // Migrate still-valid sessions only. Never revive a previously expired entry.
  return null;
}

export function isAuthSessionExpired(session, now = Date.now()) {
  if (!session) return true;
  if (session.expiresAtMs === null) return false;
  return typeof session.expiresAtMs !== 'number' || !Number.isFinite(session.expiresAtMs) || session.expiresAtMs <= now;
}
