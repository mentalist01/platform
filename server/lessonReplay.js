const REPLAY_VERSION = 1;

export const LESSON_REPLAY_MAX_EVENTS = 2400;
export const LESSON_REPLAY_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const LESSON_REPLAY_MAX_BATCH_EVENTS = 48;

const MAX_CODE_CHARS = 80_000;
const MAX_INPUT_CHARS = 20_000;
const MAX_OUTPUT_CHARS = 24_000;
const MAX_BOARD_ITEMS = 1200;
const MAX_BOARD_STROKE_POINTS = 900;
const MAX_EVENT_ID_CHARS = 160;
const MAX_BOARD_EVENT_BYTES = 384 * 1024;
const MAX_NORMALIZED_EVENT_BYTES = 512 * 1024;

const EVENT_TYPES = new Set([
  'session',
  'navigation',
  'task',
  'code',
  'board',
  'run',
]);

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clampText = (value, maxLength) => String(value ?? '').replace(/\0/g, '').slice(0, maxLength);

const clampNumber = (value, min, max, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const normalizePoint = (value) => {
  const point = {
    x: clampNumber(value?.x, -1_000_000, 1_000_000),
    y: clampNumber(value?.y, -1_000_000, 1_000_000),
  };
  const pressure = Number(value?.pressure);
  if (Number.isFinite(pressure)) point.pressure = clampNumber(pressure, 0, 1, 0.5);
  return point;
};

const compactPoints = (value) => {
  const points = (Array.isArray(value) ? value : []).map(normalizePoint);
  if (points.length <= MAX_BOARD_STROKE_POINTS) return points;
  const result = [];
  const step = (points.length - 1) / (MAX_BOARD_STROKE_POINTS - 1);
  for (let index = 0; index < MAX_BOARD_STROKE_POINTS; index += 1) {
    result.push(points[Math.min(points.length - 1, Math.round(index * step))]);
  }
  return result;
};

const normalizeBoardAssetUrl = (value) => {
  const raw = clampText(value, 2048).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://lesson-replay.local');
    return /^\/uploads\/board-asset-[a-f0-9]{64}\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname)
      ? url.pathname
      : '';
  } catch {
    return '';
  }
};

const normalizeBoardItem = (value) => {
  if (!isPlainObject(value)) return null;
  const id = clampText(value.id, 160).trim();
  const type = clampText(value.type, 20).trim().toLowerCase();
  if (!id || !type) return null;
  const base = {
    id,
    type,
    color: clampText(value.color, 32).trim() || '#6d28d9',
  };

  if (type === 'stroke') {
    const points = compactPoints(value.points);
    if (points.length === 0) return null;
    return { ...base, width: clampNumber(value.width, 0.5, 80, 3), points };
  }
  if (type === 'line' || type === 'arrow') {
    return {
      ...base,
      width: clampNumber(value.width, 0.5, 80, 3),
      start: normalizePoint(value.start),
      end: normalizePoint(value.end),
    };
  }
  if (type === 'shape') {
    return {
      ...base,
      shape: ['ellipse', 'diamond'].includes(value.shape) ? value.shape : 'rectangle',
      x: clampNumber(value.x, -1_000_000, 1_000_000),
      y: clampNumber(value.y, -1_000_000, 1_000_000),
      width: clampNumber(value.width, 1, 1_000_000, 1),
      height: clampNumber(value.height, 1, 1_000_000, 1),
      strokeWidth: clampNumber(value.strokeWidth, 0.5, 80, 3),
    };
  }
  if (type === 'text') {
    const text = clampText(value.text, 4000);
    if (!text.trim()) return null;
    return {
      ...base,
      text,
      x: clampNumber(value.x, -1_000_000, 1_000_000),
      y: clampNumber(value.y, -1_000_000, 1_000_000),
      width: clampNumber(value.width, 1, 1_000_000, 1),
      height: clampNumber(value.height, 1, 1_000_000, 1),
      fontSize: clampNumber(value.fontSize, 10, 160, 22),
    };
  }
  if (type === 'image') {
    const assetUrl = normalizeBoardAssetUrl(value.assetUrl || value.imageUrl);
    // Inline data URLs are intentionally not copied into a replay. Existing board
    // assets are referenced by their authenticated upload URL instead.
    if (!assetUrl) return null;
    return {
      ...base,
      assetUrl,
      x: clampNumber(value.x, -1_000_000, 1_000_000),
      y: clampNumber(value.y, -1_000_000, 1_000_000),
      width: clampNumber(value.width, 1, 1_000_000, 1),
      height: clampNumber(value.height, 1, 1_000_000, 1),
      flipX: Boolean(value.flipX),
    };
  }
  return null;
};

const fitBoardItemsToByteLimit = (items, maxBytes = MAX_BOARD_EVENT_BYTES) => {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) return [];
  const priorityIndexes = [];
  const seenIndexes = new Set();
  const addPriorityIndex = (index) => {
    if (index < 0 || index >= source.length || seenIndexes.has(index)) return;
    seenIndexes.add(index);
    priorityIndexes.push(index);
  };
  // Keep the beginning of the scene (usually axes/background) and then prefer
  // the most recently added objects. The final array is restored to scene order.
  for (let index = 0; index < Math.min(40, source.length); index += 1) addPriorityIndex(index);
  for (let index = source.length - 1; index >= 40; index -= 1) addPriorityIndex(index);

  const selected = [];
  let usedBytes = Buffer.byteLength('{"items":[]}', 'utf8');
  let consecutiveMisses = 0;
  for (const index of priorityIndexes) {
    const item = normalizeBoardItem(source[index]);
    if (!item) continue;
    const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8') + (selected.length > 0 ? 1 : 0);
    if (usedBytes + itemBytes > maxBytes) {
      consecutiveMisses += 1;
      if (consecutiveMisses >= 64) break;
      continue;
    }
    selected.push({ index, item });
    usedBytes += itemBytes;
    consecutiveMisses = 0;
  }
  return selected.sort((left, right) => left.index - right.index).map((entry) => entry.item);
};

const normalizePayload = (type, value) => {
  const source = isPlainObject(value) ? value : {};
  if (type === 'session') {
    return {
      action: source.action === 'end' ? 'end' : 'start',
      via: ['platform', 'telemost'].includes(source.via) ? source.via : 'platform',
    };
  }
  if (type === 'navigation') {
    return {
      view: clampText(source.view, 80).trim(),
      label: clampText(source.label, 160).trim(),
    };
  }
  if (type === 'task') {
    const taskNumber = Number(source.taskNumber);
    const questionIndex = Number(source.questionIndex);
    const questionNumber = Number(source.questionNumber);
    return {
      active: source.active !== false,
      taskNumber: Number.isFinite(taskNumber) ? Math.max(0, Math.round(taskNumber)) : null,
      questionIndex: Number.isFinite(questionIndex) ? Math.max(0, Math.round(questionIndex)) : null,
      questionNumber: Number.isFinite(questionNumber) ? Math.max(0, Math.round(questionNumber)) : null,
      levelId: clampText(source.levelId, 80).trim(),
      label: clampText(source.label, 200).trim(),
    };
  }
  if (type === 'code') {
    return {
      language: clampText(source.language || 'python', 40).trim() || 'python',
      code: clampText(source.code, MAX_CODE_CHARS),
      input: clampText(source.input, MAX_INPUT_CHARS),
      testFile: clampText(source.testFile, MAX_INPUT_CHARS),
      output: clampText(source.output, MAX_OUTPUT_CHARS),
      error: clampText(source.error, MAX_OUTPUT_CHARS),
    };
  }
  if (type === 'board') {
    return {
      items: fitBoardItemsToByteLimit(
        (Array.isArray(source.items) ? source.items : []).slice(0, MAX_BOARD_ITEMS)
      ),
    };
  }
  if (type === 'run') {
    return {
      status: clampText(source.status, 40).trim(),
      output: clampText(source.output, MAX_OUTPUT_CHARS),
      error: clampText(source.error, MAX_OUTPUT_CHARS),
    };
  }
  return {};
};

const stableSignature = (event) => JSON.stringify([event.type, event.payload]);

export const normalizeLessonReplayEvent = (value, context = {}) => {
  if (!isPlainObject(value)) return null;
  const type = clampText(value.type, 40).trim().toLowerCase();
  if (!EVENT_TYPES.has(type)) return null;
  const rawAt = Date.parse(String(value.occurredAt || '').trim());
  const fallbackAt = Number(context.nowMs) || Date.now();
  const occurredAtMs = Number.isFinite(rawAt) ? rawAt : fallbackAt;
  const minimumAt = Number.isFinite(Number(context.startMs))
    ? Number(context.startMs) - (30 * 60 * 1000)
    : occurredAtMs;
  const maximumAt = Number.isFinite(Number(context.endMs))
    ? Number(context.endMs) + (2 * 60 * 60 * 1000)
    : occurredAtMs;
  if (occurredAtMs < minimumAt || occurredAtMs > maximumAt) return null;
  const id = clampText(value.id, MAX_EVENT_ID_CHARS).trim();
  const normalized = {
    id: id || `${occurredAtMs}-${Math.random().toString(36).slice(2, 12)}`,
    type,
    occurredAt: new Date(occurredAtMs).toISOString(),
    offsetMs: Number.isFinite(Number(context.startMs))
      ? Math.max(0, Math.round(occurredAtMs - Number(context.startMs)))
      : 0,
    actor: {
      role: ['teacher', 'student'].includes(context.actorRole) ? context.actorRole : 'student',
      id: clampText(context.actorId, 160).trim(),
      name: clampText(context.actorName, 160).trim(),
    },
    payload: normalizePayload(type, value.payload),
  };
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_NORMALIZED_EVENT_BYTES) return null;
  return normalized;
};

const trimEventsToCountLimit = (events, maxEvents = LESSON_REPLAY_MAX_EVENTS) => {
  const source = Array.isArray(events) ? events : [];
  if (source.length <= maxEvents) return source;
  const keepIds = new Set();
  const firstSession = source.find((event) => event.type === 'session' && event.payload?.action === 'start');
  keepIds.add((firstSession || source[0]).id);
  const latestByType = new Map();
  source.forEach((event) => latestByType.set(event.type, event));
  latestByType.forEach((event) => keepIds.add(event.id));
  for (let index = source.length - 1; index >= 0 && keepIds.size < maxEvents; index -= 1) {
    keepIds.add(source[index].id);
  }
  return source.filter((event) => keepIds.has(event.id));
};

export const normalizeLessonReplay = (value) => {
  const source = isPlainObject(value) ? value : {};
  const occurrence = isPlainObject(source.occurrence) ? source.occurrence : {};
  const startMs = Number(occurrence.startMs);
  const endMs = Number(occurrence.endMs);
  const normalized = {
    version: REPLAY_VERSION,
    occurrence: {
      key: clampText(occurrence.key, 760).trim(),
      studentId: clampText(occurrence.studentId, 160).trim(),
      dayKey: clampText(occurrence.dayKey, 20).trim(),
      time: clampText(occurrence.time, 12).trim(),
      durationMinutes: clampNumber(occurrence.durationMinutes, 15, 360, 60),
      startMs: Number.isFinite(startMs) ? startMs : 0,
      endMs: Number.isFinite(endMs) ? endMs : 0,
    },
    createdAt: clampText(source.createdAt, 40).trim(),
    updatedAt: clampText(source.updatedAt, 40).trim(),
    events: [],
  };
  const seenIds = new Set();
  (Array.isArray(source.events) ? source.events : []).forEach((entry) => {
    const event = normalizeLessonReplayEvent(entry, {
      startMs: normalized.occurrence.startMs,
      endMs: normalized.occurrence.endMs,
      actorRole: entry?.actor?.role,
      actorId: entry?.actor?.id,
      actorName: entry?.actor?.name,
    });
    if (!event || seenIds.has(event.id)) return;
    seenIds.add(event.id);
    normalized.events.push(event);
  });
  normalized.events.sort((left, right) => (
    left.offsetMs - right.offsetMs || left.id.localeCompare(right.id)
  ));
  normalized.events = trimEventsToCountLimit(normalized.events);
  return normalized;
};

const trimReplayToByteLimit = (replay, maxBytes) => {
  const normalizedMaxBytes = Math.max(512, Number(maxBytes) || LESSON_REPLAY_MAX_FILE_BYTES);
  if (Buffer.byteLength(JSON.stringify(replay), 'utf8') <= normalizedMaxBytes) return replay;

  const events = replay.events;
  const essentialIds = new Set();
  const firstSession = events.find((event) => event.type === 'session' && event.payload?.action === 'start');
  if (firstSession || events[0]) essentialIds.add((firstSession || events[0]).id);
  const latestByType = new Map();
  events.forEach((event) => latestByType.set(event.type, event));
  latestByType.forEach((event) => essentialIds.add(event.id));

  const baseBytes = Buffer.byteLength(JSON.stringify({ ...replay, events: [] }), 'utf8');
  let selectedBytes = baseBytes;
  const selectedIds = new Set();
  const addIfFits = (event) => {
    if (!event || selectedIds.has(event.id)) return;
    const eventBytes = Buffer.byteLength(JSON.stringify(event), 'utf8') + (selectedIds.size > 0 ? 1 : 0);
    if (selectedBytes + eventBytes > normalizedMaxBytes) return;
    selectedIds.add(event.id);
    selectedBytes += eventBytes;
  };
  events.filter((event) => essentialIds.has(event.id)).forEach(addIfFits);
  for (let index = events.length - 1; index >= 0; index -= 1) addIfFits(events[index]);
  replay.events = events.filter((event) => selectedIds.has(event.id));

  // This should only be needed for unusually tiny custom limits, but keeps the
  // persisted representation strictly bounded in every case.
  while (
    replay.events.length > 0
    && Buffer.byteLength(JSON.stringify(replay), 'utf8') > normalizedMaxBytes
  ) replay.events.shift();
  return replay;
};

export const appendLessonReplayEvents = (rawReplay, rawEvents, context = {}) => {
  const replay = normalizeLessonReplay(rawReplay);
  const knownIds = new Set(replay.events.map((event) => event.id));
  const latestSignatureByType = new Map();
  replay.events.forEach((event) => latestSignatureByType.set(event.type, {
    signature: stableSignature(event),
    occurredAtMs: Date.parse(event.occurredAt),
  }));
  let added = 0;

  (Array.isArray(rawEvents) ? rawEvents : []).slice(0, LESSON_REPLAY_MAX_BATCH_EVENTS).forEach((entry) => {
    const event = normalizeLessonReplayEvent(entry, {
      ...context,
      startMs: replay.occurrence.startMs,
      endMs: replay.occurrence.endMs,
    });
    if (!event || knownIds.has(event.id)) return;
    const signature = stableSignature(event);
    const previous = latestSignatureByType.get(event.type);
    const occurredAtMs = Date.parse(event.occurredAt);
    if (
      previous
      && previous.signature === signature
      && Number.isFinite(previous.occurredAtMs)
      && Number.isFinite(occurredAtMs)
      && occurredAtMs - previous.occurredAtMs < 60_000
    ) {
      return;
    }
    replay.events.push(event);
    knownIds.add(event.id);
    latestSignatureByType.set(event.type, { signature, occurredAtMs });
    added += 1;
  });

  replay.events.sort((left, right) => (
    left.offsetMs - right.offsetMs || left.id.localeCompare(right.id)
  ));
  replay.events = trimEventsToCountLimit(replay.events);
  const now = new Date(Number(context.nowMs) || Date.now()).toISOString();
  replay.createdAt = replay.createdAt || now;
  if (added > 0) replay.updatedAt = now;
  trimReplayToByteLimit(replay, Number(context.maxBytes) || LESSON_REPLAY_MAX_FILE_BYTES);

  return {
    replay,
    added,
    bytes: Buffer.byteLength(JSON.stringify(replay), 'utf8'),
  };
};

export const createLessonReplay = (occurrence, nowMs = Date.now()) => normalizeLessonReplay({
  version: REPLAY_VERSION,
  occurrence,
  createdAt: new Date(nowMs).toISOString(),
  updatedAt: new Date(nowMs).toISOString(),
  events: [],
});

export const summarizeLessonReplay = (value, bytes = null) => {
  const replay = normalizeLessonReplay(value);
  const eventTypes = Array.from(new Set(replay.events.map((event) => event.type)));
  const lastEvent = replay.events[replay.events.length - 1] || null;
  return {
    available: replay.events.length > 0,
    eventCount: replay.events.length,
    durationMs: lastEvent ? Math.max(0, lastEvent.offsetMs) : 0,
    eventTypes,
    bytes: bytes !== null && typeof bytes !== 'undefined' && Number.isFinite(Number(bytes))
      ? Math.max(0, Math.round(Number(bytes)))
      : Buffer.byteLength(JSON.stringify(replay), 'utf8'),
    updatedAt: replay.updatedAt || '',
  };
};
