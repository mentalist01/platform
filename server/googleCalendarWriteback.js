import crypto from 'crypto';

export const GOOGLE_CALENDAR_CANCELLED_SUFFIX = '(ОТМЕНЕНО)';
export const GOOGLE_CALENDAR_CANCELLED_COLOR_ID = '11';
export const GOOGLE_CALENDAR_WRITE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const PLATFORM_CANCELLED_KEY = 'ivan100Cancelled';
const PLATFORM_ORIGINAL_SUMMARY_KEY = 'ivan100OriginalSummary';
const PLATFORM_ORIGINAL_COLOR_KEY = 'ivan100OriginalColor';
const PLATFORM_OCCURRENCE_KEY = 'ivan100Occurrence';
const NO_COLOR_SENTINEL = '__calendar_default__';

const normalizeText = (value) => String(value || '').trim();
const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(String(value || ''), 'base64url').toString('utf8');
const deriveEncryptionKey = (secret) => crypto.createHash('sha256').update(normalizeText(secret)).digest();
const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const appendGoogleCalendarCancelledSuffix = (summary) => {
  const normalized = normalizeText(summary);
  if (!normalized) return GOOGLE_CALENDAR_CANCELLED_SUFFIX;
  if (normalized.toLocaleUpperCase('ru-RU').endsWith(GOOGLE_CALENDAR_CANCELLED_SUFFIX)) return normalized;
  return `${normalized} ${GOOGLE_CALENDAR_CANCELLED_SUFFIX}`;
};

export const removeGoogleCalendarCancelledSuffix = (summary) => normalizeText(summary)
  .replace(/\s*\(\s*ОТМЕНЕНО\s*\)\s*$/iu, '')
  .trim();

export const encryptGoogleCalendarTokens = (tokens, secret) => {
  if (!normalizeText(secret)) throw new Error('Google Calendar token encryption secret is not configured');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens || {}), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
};

export const decryptGoogleCalendarTokens = (encrypted, secret) => {
  const [version, ivRaw, tagRaw, ciphertextRaw] = normalizeText(encrypted).split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw || !normalizeText(secret)) {
    throw new Error('Google Calendar token payload is invalid');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveEncryptionKey(secret),
    Buffer.from(ivRaw, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
};

export const createGoogleCalendarOAuthState = ({ teacherId, authToken, secret, expiresAtMs }) => {
  const payload = {
    teacherId: normalizeText(teacherId),
    authHash: crypto.createHash('sha256').update(normalizeText(authToken)).digest('base64url'),
    expiresAtMs: Number(expiresAtMs) || (Date.now() + 10 * 60 * 1000),
    nonce: crypto.randomBytes(18).toString('base64url'),
  };
  if (!payload.teacherId || !normalizeText(authToken) || !normalizeText(secret)) {
    throw new Error('Google Calendar OAuth state cannot be created');
  }
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};

export const verifyGoogleCalendarOAuthState = ({ state, authToken, secret, nowMs = Date.now() }) => {
  const [encoded, signature] = normalizeText(state).split('.');
  if (!encoded || !signature || !normalizeText(authToken) || !normalizeText(secret)) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    const authHash = crypto.createHash('sha256').update(normalizeText(authToken)).digest('base64url');
    if (!safeEqual(payload?.authHash, authHash)) return null;
    if (!normalizeText(payload?.teacherId) || Number(payload?.expiresAtMs) <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
};

export const buildGoogleCalendarAuthorizationUrl = ({ clientId, redirectUri, state }) => {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set('client_id', normalizeText(clientId));
  url.searchParams.set('redirect_uri', normalizeText(redirectUri));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_CALENDAR_WRITE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', normalizeText(state));
  return url.toString();
};

const readGoogleJsonResponse = async (response, fallbackMessage) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(
      normalizeText(payload?.error?.message || payload?.error_description || payload?.error)
      || fallbackMessage
    );
    error.status = response.status;
    error.code = normalizeText(payload?.error?.status || payload?.error);
    throw error;
  }
  return payload || {};
};

const fetchWithTimeout = async (fetchImpl, url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const exchangeGoogleCalendarAuthorizationCode = async ({
  code,
  clientId,
  clientSecret,
  redirectUri,
  fetchImpl = fetch,
}) => {
  const body = new URLSearchParams({
    code: normalizeText(code),
    client_id: normalizeText(clientId),
    client_secret: normalizeText(clientSecret),
    redirect_uri: normalizeText(redirectUri),
    grant_type: 'authorization_code',
  });
  const response = await fetchWithTimeout(fetchImpl, GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await readGoogleJsonResponse(response, 'Google не выдал доступ к календарю');
  return {
    accessToken: normalizeText(payload.access_token),
    refreshToken: normalizeText(payload.refresh_token),
    expiresAtMs: Date.now() + (Math.max(60, Number(payload.expires_in) || 3600) * 1000),
    scope: normalizeText(payload.scope),
    tokenType: normalizeText(payload.token_type) || 'Bearer',
  };
};

export const refreshGoogleCalendarAccessToken = async ({
  refreshToken,
  clientId,
  clientSecret,
  fetchImpl = fetch,
}) => {
  const body = new URLSearchParams({
    refresh_token: normalizeText(refreshToken),
    client_id: normalizeText(clientId),
    client_secret: normalizeText(clientSecret),
    grant_type: 'refresh_token',
  });
  const response = await fetchWithTimeout(fetchImpl, GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await readGoogleJsonResponse(response, 'Не удалось обновить доступ к Google Calendar');
  return {
    accessToken: normalizeText(payload.access_token),
    expiresAtMs: Date.now() + (Math.max(60, Number(payload.expires_in) || 3600) * 1000),
    scope: normalizeText(payload.scope),
    tokenType: normalizeText(payload.token_type) || 'Bearer',
  };
};

const googleCalendarApiRequest = async ({ accessToken, path, method = 'GET', body, fetchImpl = fetch }) => {
  const response = await fetchWithTimeout(fetchImpl, `${GOOGLE_CALENDAR_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${normalizeText(accessToken)}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return readGoogleJsonResponse(response, 'Google Calendar временно недоступен');
};

export const listWritableGoogleCalendars = async ({ accessToken, fetchImpl = fetch }) => {
  const payload = await googleCalendarApiRequest({
    accessToken,
    path: '/users/me/calendarList?minAccessRole=writer&showHidden=false&maxResults=250',
    fetchImpl,
  });
  return (Array.isArray(payload.items) ? payload.items : [])
    .filter((entry) => normalizeText(entry?.id) && ['owner', 'writer'].includes(normalizeText(entry?.accessRole)))
    .map((entry) => ({
      id: normalizeText(entry.id),
      summary: normalizeText(entry.summary) || normalizeText(entry.id),
      primary: entry.primary === true,
      accessRole: normalizeText(entry.accessRole),
    }));
};

const getEventStartMs = (event) => {
  const raw = event?.originalStartTime?.dateTime || event?.start?.dateTime || '';
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const chooseOccurrence = (events, expectedStartMs) => {
  const candidates = (Array.isArray(events) ? events : [])
    .filter((event) => normalizeText(event?.id) && normalizeText(event?.status) !== 'cancelled');
  if (!Number.isFinite(expectedStartMs)) return candidates.length === 1 ? candidates[0] : null;
  const ranked = candidates
    .map((event) => ({ event, distance: Math.abs(getEventStartMs(event) - expectedStartMs) }))
    .filter((item) => Number.isFinite(item.distance))
    .sort((left, right) => left.distance - right.distance);
  return ranked[0]?.distance <= 15 * 60 * 1000 ? ranked[0].event : null;
};

const buildOccurrenceWindow = (expectedStartMs) => {
  const base = Number.isFinite(expectedStartMs) ? expectedStartMs : Date.now();
  return {
    timeMin: new Date(base - 36 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(base + 36 * 60 * 60 * 1000).toISOString(),
  };
};

export const patchGoogleCalendarOccurrenceCancellation = async ({
  accessToken,
  calendarId,
  iCalUid,
  expectedStartAt,
  occurrenceKey,
  cancelled,
  fetchImpl = fetch,
}) => {
  const normalizedCalendarId = normalizeText(calendarId);
  const normalizedUid = normalizeText(iCalUid);
  if (!normalizedCalendarId || !normalizedUid) throw new Error('Не удалось определить событие Google Calendar');
  const expectedStartMs = Date.parse(normalizeText(expectedStartAt));
  const window = buildOccurrenceWindow(expectedStartMs);
  const params = new URLSearchParams({
    iCalUID: normalizedUid,
    timeMin: window.timeMin,
    timeMax: window.timeMax,
    singleEvents: 'true',
    showDeleted: 'false',
    maxResults: '50',
  });
  const list = await googleCalendarApiRequest({
    accessToken,
    path: `/calendars/${encodeURIComponent(normalizedCalendarId)}/events?${params}`,
    fetchImpl,
  });
  const event = chooseOccurrence(list.items, expectedStartMs);
  if (!event) {
    const error = new Error('Конкретное занятие не найдено в выбранном Google Calendar');
    error.code = 'GOOGLE_EVENT_NOT_FOUND';
    throw error;
  }

  const existingPrivate = event?.extendedProperties?.private
    && typeof event.extendedProperties.private === 'object'
    ? event.extendedProperties.private
    : {};
  const currentSummary = normalizeText(event.summary);
  const currentColor = normalizeText(event.colorId);
  let summary = currentSummary;
  let colorId = currentColor || null;
  let privateProperties = { ...existingPrivate };

  if (cancelled) {
    summary = appendGoogleCalendarCancelledSuffix(currentSummary);
    colorId = GOOGLE_CALENDAR_CANCELLED_COLOR_ID;
    privateProperties = {
      ...privateProperties,
      [PLATFORM_CANCELLED_KEY]: '1',
      [PLATFORM_ORIGINAL_SUMMARY_KEY]: normalizeText(existingPrivate[PLATFORM_ORIGINAL_SUMMARY_KEY]) || currentSummary,
      [PLATFORM_ORIGINAL_COLOR_KEY]: Object.prototype.hasOwnProperty.call(existingPrivate, PLATFORM_ORIGINAL_COLOR_KEY)
        ? existingPrivate[PLATFORM_ORIGINAL_COLOR_KEY]
        : (currentColor || NO_COLOR_SENTINEL),
      [PLATFORM_OCCURRENCE_KEY]: normalizeText(occurrenceKey),
    };
  } else {
    const storedOriginalSummary = normalizeText(existingPrivate[PLATFORM_ORIGINAL_SUMMARY_KEY]);
    summary = storedOriginalSummary && appendGoogleCalendarCancelledSuffix(storedOriginalSummary) === currentSummary
      ? storedOriginalSummary
      : removeGoogleCalendarCancelledSuffix(currentSummary);
    const storedOriginalColor = normalizeText(existingPrivate[PLATFORM_ORIGINAL_COLOR_KEY]);
    if (currentColor === GOOGLE_CALENDAR_CANCELLED_COLOR_ID && storedOriginalColor) {
      colorId = storedOriginalColor === NO_COLOR_SENTINEL ? null : storedOriginalColor;
    }
    privateProperties = {
      ...privateProperties,
      [PLATFORM_CANCELLED_KEY]: null,
      [PLATFORM_ORIGINAL_SUMMARY_KEY]: null,
      [PLATFORM_ORIGINAL_COLOR_KEY]: null,
      [PLATFORM_OCCURRENCE_KEY]: null,
    };
  }

  await googleCalendarApiRequest({
    accessToken,
    path: `/calendars/${encodeURIComponent(normalizedCalendarId)}/events/${encodeURIComponent(event.id)}?sendUpdates=none`,
    method: 'PATCH',
    body: {
      summary,
      colorId,
      extendedProperties: { private: privateProperties },
    },
    fetchImpl,
  });
  return {
    eventId: normalizeText(event.id),
    summary,
    cancelled: Boolean(cancelled),
  };
};

