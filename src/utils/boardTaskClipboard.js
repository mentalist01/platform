export const BOARD_TASK_CLIPBOARD_VERSION = 1;
export const BOARD_TASK_CLIPBOARD_KIND = 'ege-board-task';
export const BOARD_TASK_CLIPBOARD_MIME = 'application/x-ege-board-task+json';
export const BOARD_TASK_CLIPBOARD_MARKER_PREFIX = '__EGE_BOARD_TASK_V1__:';
export const BOARD_TASK_CLIPBOARD_PACKET_PREFIX = '__EGE_BOARD_TASK_V2__:';
export const BOARD_TASK_CLIPBOARD_STORAGE_PREFIX = 'ege_board_task_clipboard_v1:';
export const BOARD_TASK_CLIPBOARD_TTL_MS = 15 * 60 * 1000;
export const BOARD_TASK_CLIPBOARD_MAX_PACKET_LENGTH = 4_000_000;

const MAX_QUESTION_TEXT_LENGTH = 100_000;
const MAX_SCREENSHOTS = 12;
const MAX_SCREENSHOT_URL_LENGTH = 8_192;
const MAX_ANSWER_COUNT = 100;
const MAX_ANSWER_LENGTH = 20_000;
const MAX_CODE_LENGTH = 20_000;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value) => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeText = (value, maxLength, { trim = true } = {}) => {
  if (value === null || typeof value === 'undefined') return '';
  const text = typeof value === 'string' ? value : String(value);
  const normalized = trim ? text.trim() : text;
  return normalized.slice(0, maxLength);
};

const normalizePositiveInteger = (value, max = Number.MAX_SAFE_INTEGER) => {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.min(number, max);
};

const normalizeNonNegativeInteger = (value, max = Number.MAX_SAFE_INTEGER) => {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(number, max);
};

const normalizeScreenshotUrl = (value) => {
  const url = normalizeText(value, MAX_SCREENSHOT_URL_LENGTH);
  const hasControlCharacter = Array.from(url).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
  if (!url || hasControlCharacter) return '';

  // Relative URLs are resolved by the board in the same application. For absolute
  // values, retain only image sources browsers can safely request or already own.
  if (/^(?:\/|\.\/|\.\.\/)/.test(url)) return url;
  if (/^https?:\/\//i.test(url) || /^blob:/i.test(url)) return url;
  return '';
};

const normalizeScreenshot = (value) => {
  const source = typeof value === 'string' ? { url: value } : value;
  if (!isRecord(source)) return null;
  const url = normalizeScreenshotUrl(source.url || source.src);
  if (!url) return null;

  const name = normalizeText(
    source.name || source.originalName || source.fileName || source.filename || source.storageName,
    500
  );
  const width = normalizePositiveInteger(source.width, 20_000);
  const height = normalizePositiveInteger(source.height, 20_000);
  const size = normalizeNonNegativeInteger(source.size ?? source.fileSize ?? source.bytes, 250_000_000);

  return {
    url,
    name,
    width,
    height,
    size,
  };
};

const normalizeAnswerArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || typeof value === 'undefined') return [];
  return [value];
};

const normalizeMetadata = (raw) => {
  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  const read = (key, fallbackKey = key) => (
    hasOwn(metadata, key) ? metadata[key] : raw[fallbackKey]
  );

  return {
    taskNumber: normalizePositiveInteger(read('taskNumber')),
    taskDisplayNumber: normalizeText(read('taskDisplayNumber'), 120),
    taskTitle: normalizeText(read('taskTitle'), 500),
    levelId: normalizeText(read('levelId'), 120),
    levelTitle: normalizeText(read('levelTitle'), 500),
    questionId: normalizeText(read('questionId'), 240),
    questionNumber: normalizePositiveInteger(read('questionNumber')),
    questionLabel: normalizeText(read('questionLabel'), 240),
  };
};

/**
 * Converts data from ProgressReviewModal into the only shape accepted by the board.
 * Unknown properties are deliberately discarded. Returns null for an empty task.
 */
export const normalizeBoardTaskClipboardPayload = (value) => {
  if (!isRecord(value)) return null;

  const questionText = normalizeText(
    hasOwn(value, 'questionText') ? value.questionText : value.question,
    MAX_QUESTION_TEXT_LENGTH,
    { trim: false }
  ).trim();
  const screenshots = (Array.isArray(value.screenshots) ? value.screenshots : [])
    .slice(0, MAX_SCREENSHOTS)
    .map(normalizeScreenshot)
    .filter(Boolean);

  if (!questionText && screenshots.length === 0) return null;

  const rawLabels = normalizeAnswerArray(value.answerLabels);
  const rawStudentAnswers = normalizeAnswerArray(value.studentAnswers);
  const requestedAnswerCount = normalizePositiveInteger(value.answerCount, MAX_ANSWER_COUNT);
  const inferredAnswerCount = Math.max(
    1,
    rawLabels.length,
    rawStudentAnswers.length
  );
  const answerCount = requestedAnswerCount || Math.min(inferredAnswerCount, MAX_ANSWER_COUNT);
  const answerLabels = Array.from({ length: answerCount }, (_, index) => (
    normalizeText(rawLabels[index], 240) || String(index + 1)
  ));
  const studentAnswers = Array.from({ length: answerCount }, (_, index) => (
    normalizeText(rawStudentAnswers[index], MAX_ANSWER_LENGTH, { trim: false })
  ));

  return {
    kind: BOARD_TASK_CLIPBOARD_KIND,
    version: BOARD_TASK_CLIPBOARD_VERSION,
    metadata: normalizeMetadata(value),
    questionText,
    screenshots,
    answerCount,
    answerLabels,
    studentAnswers,
    studentCode: normalizeText(value.studentCode ?? value.code, MAX_CODE_LENGTH, { trim: false }),
    sourceStudentId: normalizeText(value.sourceStudentId ?? value.studentId, 240),
  };
};

const resolveNow = (value) => {
  const candidate = typeof value === 'function' ? value() : value;
  if (candidate instanceof Date) return candidate.getTime();
  const number = Number(candidate);
  return Number.isFinite(number) ? number : Date.now();
};

const resolveStorage = (options) => {
  if (hasOwn(options, 'storage')) return options.storage;
  try {
    return globalThis?.localStorage || null;
  } catch {
    return null;
  }
};

const resolveClipboard = (options) => {
  if (hasOwn(options, 'clipboard')) return options.clipboard;
  try {
    return globalThis?.navigator?.clipboard || null;
  } catch {
    return null;
  }
};

const resolveDocument = (options) => {
  if (hasOwn(options, 'document')) return options.document;
  try {
    return globalThis?.document || null;
  } catch {
    return null;
  }
};

const getStorageKey = (token) => `${BOARD_TASK_CLIPBOARD_STORAGE_PREFIX}${token}`;

const parseJsonRecord = (value) => {
  if (typeof value !== 'string' || value.length > BOARD_TASK_CLIPBOARD_MAX_PACKET_LENGTH || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getEnvelopePayload = (value, nowMs) => {
  if (!isRecord(value)) return null;
  if (!hasOwn(value, 'payload')) return normalizeBoardTaskClipboardPayload(value);
  const expiresAt = Number(value.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return null;
  return normalizeBoardTaskClipboardPayload(value.payload);
};

const removeStorageItem = (storage, key) => {
  try {
    storage?.removeItem?.(key);
  } catch {
    // Storage cleanup is best effort only.
  }
};

const normalizeToken = (value) => {
  const token = normalizeText(value, 128);
  return /^[A-Za-z0-9_-]{8,128}$/.test(token) ? token : '';
};

const copyTextWithDocument = (text, documentObject) => {
  if (!documentObject?.createElement || !documentObject?.body?.appendChild) return false;
  const textarea = documentObject.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute?.('readonly', '');
  if (textarea.style) {
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
  }
  documentObject.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.select?.();
    copied = documentObject.execCommand?.('copy') === true;
  } catch {
    copied = false;
  } finally {
    textarea.remove?.();
  }
  return copied;
};

/**
 * Copies the complete, short-lived task in text/plain so a different browser or
 * desktop profile can paste it without access to the source profile's storage.
 * Only normalized task fields are included; correct answers are never copied.
 */
export const writeBoardTaskToClipboard = async (value, options = {}) => {
  const normalized = normalizeBoardTaskClipboardPayload(value);
  if (!normalized) return null;

  const nowMs = resolveNow(hasOwn(options, 'now') ? options.now : Date.now);
  const requestedTtl = Number(options.ttlMs);
  const ttlMs = Number.isFinite(requestedTtl) && requestedTtl > 0
    ? Math.min(requestedTtl, BOARD_TASK_CLIPBOARD_TTL_MS)
    : BOARD_TASK_CLIPBOARD_TTL_MS;
  const envelope = {
    version: BOARD_TASK_CLIPBOARD_VERSION,
    createdAt: nowMs,
    expiresAt: nowMs + ttlMs,
    payload: normalized,
  };

  const packet = `${BOARD_TASK_CLIPBOARD_PACKET_PREFIX}${JSON.stringify(envelope)}`;
  if (packet.length > BOARD_TASK_CLIPBOARD_MAX_PACKET_LENGTH) return null;
  const clipboard = resolveClipboard(options);
  let copied = false;
  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(packet);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) copied = copyTextWithDocument(packet, resolveDocument(options));
  if (!copied) return null;

  return normalized;
};

const readClipboardData = (clipboardData, mime) => {
  try {
    const value = clipboardData?.getData?.(mime);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
};

const readMarkerToken = (value) => {
  if (typeof value !== 'string' || value.length > BOARD_TASK_CLIPBOARD_MARKER_PREFIX.length + 128) return '';
  const text = value.trim();
  if (!text.startsWith(BOARD_TASK_CLIPBOARD_MARKER_PREFIX)) return '';
  return normalizeToken(text.slice(BOARD_TASK_CLIPBOARD_MARKER_PREFIX.length));
};

const readClipboardText = (clipboardData) => (
  readClipboardData(clipboardData, 'text/plain') || readClipboardData(clipboardData, 'Text')
);

const readPortablePacket = (text, nowMs) => {
  if (typeof text !== 'string' || text.length > BOARD_TASK_CLIPBOARD_MAX_PACKET_LENGTH) return null;
  if (!text.startsWith(BOARD_TASK_CLIPBOARD_PACKET_PREFIX)) return null;
  const envelope = parseJsonRecord(text.slice(BOARD_TASK_CLIPBOARD_PACKET_PREFIX.length));
  if (envelope?.version !== BOARD_TASK_CLIPBOARD_VERSION
    || envelope.payload?.kind !== BOARD_TASK_CLIPBOARD_KIND
    || envelope.payload?.version !== BOARD_TASK_CLIPBOARD_VERSION) return null;
  const createdAt = envelope.createdAt;
  const expiresAt = envelope.expiresAt;
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)
    || createdAt > nowMs || expiresAt <= nowMs || expiresAt <= createdAt
    || expiresAt - createdAt > BOARD_TASK_CLIPBOARD_TTL_MS) return null;
  return normalizeBoardTaskClipboardPayload(envelope.payload);
};

// Used to explain an expired or old cross-profile marker instead of silently
// ignoring a task paste. Ordinary clipboard text/images are unaffected.
export const hasBoardTaskClipboardData = (event) => {
  const data = event?.clipboardData;
  const text = readClipboardText(data);
  return Boolean(readClipboardData(data, BOARD_TASK_CLIPBOARD_MIME))
    || text.startsWith(BOARD_TASK_CLIPBOARD_PACKET_PREFIX)
    || text.startsWith(BOARD_TASK_CLIPBOARD_MARKER_PREFIX);
};

/**
 * Synchronously reads a task from a paste ClipboardEvent. A direct custom MIME
 * payload wins; portable text packets work across profiles. Legacy storage
 * markers remain readable in their original profile until their TTL expires.
 */
export const readBoardTaskFromPasteEvent = (event, options = {}) => {
  const clipboardData = event?.clipboardData;
  if (!clipboardData) return null;
  const nowMs = resolveNow(hasOwn(options, 'now') ? options.now : Date.now);

  const direct = parseJsonRecord(readClipboardData(clipboardData, BOARD_TASK_CLIPBOARD_MIME));
  const directPayload = getEnvelopePayload(direct, nowMs);
  if (directPayload) return directPayload;

  const marker = readClipboardText(clipboardData);
  if (marker.startsWith(BOARD_TASK_CLIPBOARD_PACKET_PREFIX)) return readPortablePacket(marker, nowMs);
  const token = readMarkerToken(marker);
  if (!token) return null;

  const storage = resolveStorage(options);
  if (!storage?.getItem) return null;
  const storageKey = getStorageKey(token);
  let envelope = null;
  try {
    envelope = parseJsonRecord(storage.getItem(storageKey));
  } catch {
    return null;
  }
  const payload = getEnvelopePayload(envelope, nowMs);
  if (!payload) removeStorageItem(storage, storageKey);
  return payload;
};
