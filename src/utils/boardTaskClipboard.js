export const BOARD_TASK_CLIPBOARD_VERSION = 1;
export const BOARD_TASK_CLIPBOARD_KIND = 'ege-board-task';
export const BOARD_TASK_CLIPBOARD_MIME = 'application/x-ege-board-task+json';
export const BOARD_TASK_CLIPBOARD_MARKER_PREFIX = '__EGE_BOARD_TASK_V1__:';
export const BOARD_TASK_CLIPBOARD_STORAGE_PREFIX = 'ege_board_task_clipboard_v1:';
export const BOARD_TASK_CLIPBOARD_TTL_MS = 15 * 60 * 1000;

const MAX_QUESTION_TEXT_LENGTH = 100_000;
const MAX_SCREENSHOTS = 12;
const MAX_SCREENSHOT_URL_LENGTH = 8_192;
const MAX_ANSWER_COUNT = 100;
const MAX_ANSWER_LENGTH = 20_000;
const MAX_STORAGE_ENTRIES_TO_SCAN = 200;

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
  if (typeof value !== 'string' || !value.trim()) return null;
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

const pruneExpiredStorageEntries = (storage, nowMs) => {
  if (!storage?.key || !Number.isFinite(Number(storage.length))) return;
  const keys = [];
  const count = Math.min(Number(storage.length), MAX_STORAGE_ENTRIES_TO_SCAN);
  for (let index = 0; index < count; index += 1) {
    try {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith(BOARD_TASK_CLIPBOARD_STORAGE_PREFIX)) {
        keys.push(key);
      }
    } catch {
      return;
    }
  }
  keys.forEach((key) => {
    try {
      const envelope = parseJsonRecord(storage.getItem(key));
      const expiresAt = Number(envelope?.expiresAt);
      if (!envelope || !Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        removeStorageItem(storage, key);
      }
    } catch {
      removeStorageItem(storage, key);
    }
  });
};

const normalizeToken = (value) => {
  const token = normalizeText(value, 128);
  return /^[A-Za-z0-9_-]{8,128}$/.test(token) ? token : '';
};

const createClipboardToken = (providedFactory, nowMs) => {
  if (typeof providedFactory === 'function') {
    const provided = normalizeToken(providedFactory());
    if (provided) return provided;
  }
  try {
    const uuid = normalizeToken(globalThis?.crypto?.randomUUID?.());
    if (uuid) return uuid;
  } catch {
    // Use a non-cryptographic identifier only when randomUUID is unavailable.
  }
  return normalizeToken(
    `${Math.max(0, Math.trunc(nowMs)).toString(36)}-${Math.random().toString(36).slice(2, 14)}`
  );
};

const copyMarkerWithDocument = (marker, documentObject) => {
  if (!documentObject?.createElement || !documentObject?.body?.appendChild) return false;
  const textarea = documentObject.createElement('textarea');
  textarea.value = marker;
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
 * Stores a short-lived payload in localStorage and puts only its opaque marker in
 * text/plain clipboard data. Resolves to the normalized payload on success, or
 * null when the input, storage, or clipboard is unavailable.
 */
export const writeBoardTaskToClipboard = async (value, options = {}) => {
  const normalized = normalizeBoardTaskClipboardPayload(value);
  if (!normalized) return null;

  const nowMs = resolveNow(hasOwn(options, 'now') ? options.now : Date.now);
  const requestedTtl = Number(options.ttlMs);
  const ttlMs = Number.isFinite(requestedTtl) && requestedTtl > 0
    ? requestedTtl
    : BOARD_TASK_CLIPBOARD_TTL_MS;
  const token = createClipboardToken(options.createToken, nowMs);
  const storage = resolveStorage(options);
  if (!token || !storage?.setItem) return null;

  const storageKey = getStorageKey(token);
  const envelope = {
    version: BOARD_TASK_CLIPBOARD_VERSION,
    createdAt: nowMs,
    expiresAt: nowMs + ttlMs,
    payload: normalized,
  };

  try {
    pruneExpiredStorageEntries(storage, nowMs);
    storage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    return null;
  }

  const marker = `${BOARD_TASK_CLIPBOARD_MARKER_PREFIX}${token}`;
  const clipboard = resolveClipboard(options);
  let copied = false;
  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(marker);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) copied = copyMarkerWithDocument(marker, resolveDocument(options));
  if (!copied) {
    removeStorageItem(storage, storageKey);
    return null;
  }

  return normalized;
};

const readClipboardData = (clipboardData, mime) => {
  try {
    return typeof clipboardData?.getData === 'function' ? clipboardData.getData(mime) : '';
  } catch {
    return '';
  }
};

const readMarkerToken = (value) => {
  const text = normalizeText(value, BOARD_TASK_CLIPBOARD_MARKER_PREFIX.length + 128);
  if (!text.startsWith(BOARD_TASK_CLIPBOARD_MARKER_PREFIX)) return '';
  return normalizeToken(text.slice(BOARD_TASK_CLIPBOARD_MARKER_PREFIX.length));
};

/**
 * Synchronously reads a task from a paste ClipboardEvent. A direct custom MIME
 * payload wins; ordinary text clipboard data is resolved through its TTL marker.
 */
export const readBoardTaskFromPasteEvent = (event, options = {}) => {
  const clipboardData = event?.clipboardData;
  if (!clipboardData) return null;
  const nowMs = resolveNow(hasOwn(options, 'now') ? options.now : Date.now);

  const direct = parseJsonRecord(readClipboardData(clipboardData, BOARD_TASK_CLIPBOARD_MIME));
  const directPayload = getEnvelopePayload(direct, nowMs);
  if (directPayload) return directPayload;

  const marker = readClipboardData(clipboardData, 'text/plain')
    || readClipboardData(clipboardData, 'Text');
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
