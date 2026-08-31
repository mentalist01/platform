const REPLAY_VERSION = 1;

export const LESSON_REPLAY_MAX_EVENTS = 6000;
export const LESSON_REPLAY_MAX_FILE_BYTES = 32 * 1024 * 1024;
export const LESSON_REPLAY_MAX_BATCH_EVENTS = 48;

const MAX_CODE_CHARS = 80_000;
const MAX_INPUT_CHARS = 20_000;
const MAX_OUTPUT_CHARS = 24_000;
const MAX_BOARD_ITEMS = 2500;
const MAX_BOARD_STROKE_POINTS = 900;
const MAX_EVENT_ID_CHARS = 160;
const MAX_BOARD_EVENT_BYTES = 384 * 1024;
const MAX_NORMALIZED_EVENT_BYTES = 512 * 1024;
const MAX_SCREEN_SNAPSHOT_ID_CHARS = 80;
const MAX_AUDIO_ID_CHARS = 96;

const EVENT_TYPES = new Set([
  'session',
  'navigation',
  'task',
  'code',
  'board',
  'run',
  'screen',
  'viewport',
  'audio',
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
    authorId: clampText(value.authorId, 160).trim(),
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
  if (type === 'task') {
    const answerCount = Math.round(clampNumber(value.answerCount, 1, 50, 1));
    const normalizeAnswers = (answers) => Array.from(
      { length: answerCount },
      (_, index) => clampText(answers?.[index], 500)
    );
    const screenshots = (Array.isArray(value.screenshots) ? value.screenshots : [])
      .slice(0, 8)
      .map((image) => {
        const assetUrl = normalizeBoardAssetUrl(image?.assetUrl || image?.imageUrl);
        if (!assetUrl) return null;
        return {
          assetUrl,
          name: clampText(image?.name, 240),
          naturalWidth: clampNumber(image?.naturalWidth || image?.width, 1, 16_384, 1),
          naturalHeight: clampNumber(image?.naturalHeight || image?.height, 1, 16_384, 1),
          displayHeight: clampNumber(image?.displayHeight, 40, 720, 220),
        };
      })
      .filter(Boolean);
    const taskNumber = Number(value.taskNumber);
    const questionNumber = Number(value.questionNumber);
    return {
      ...base,
      x: clampNumber(value.x, -1_000_000, 1_000_000),
      y: clampNumber(value.y, -1_000_000, 1_000_000),
      width: clampNumber(value.width, 420, 1_600, 720),
      height: clampNumber(value.height, 220, 4_000, 640),
      contentWidth: clampNumber(value.contentWidth || value.width, 420, 1_600, 720),
      contentHeight: clampNumber(value.contentHeight || value.height, 220, 4_000, 640),
      codePanelLayoutVersion: Math.round(clampNumber(value.codePanelLayoutVersion, 0, 100, 0)),
      heading: clampText(value.heading, 240),
      taskNumber: Number.isFinite(taskNumber) ? Math.max(0, Math.round(taskNumber)) : null,
      taskDisplayNumber: clampText(value.taskDisplayNumber, 40),
      taskTitle: clampText(value.taskTitle, 240),
      levelId: clampText(value.levelId, 80),
      levelLabel: clampText(value.levelLabel, 120),
      questionId: clampText(value.questionId, 160),
      questionNumber: Number.isFinite(questionNumber) ? Math.max(1, Math.round(questionNumber)) : null,
      questionLabel: clampText(value.questionLabel, 160),
      questionText: clampText(value.questionText, 12_000),
      screenshots,
      answerCount,
      answerLabels: Array.from(
        { length: answerCount },
        (_, index) => clampText(value.answerLabels?.[index] ?? index + 1, 40)
      ),
      userAnswers: normalizeAnswers(value.userAnswers),
      studentAnswers: normalizeAnswers(value.studentAnswers),
      studentCode: clampText(value.studentCode, 20_000),
      codeSavedAt: clampText(value.codeSavedAt, 80),
      codeSavedByName: clampText(value.codeSavedByName, 120),
      codeSavedByRole: ['teacher', 'student'].includes(value.codeSavedByRole) ? value.codeSavedByRole : '',
      checkState: ['correct', 'wrong'].includes(value.checkState) ? value.checkState : 'idle',
      sourceStudentId: clampText(value.sourceStudentId, 160),
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
  if (source.length === 0) return { items: [], truncated: false };
  const normalizedByIndex = new Map();
  source.forEach((value, index) => {
    const item = normalizeBoardItem(value);
    if (item) normalizedByIndex.set(index, item);
  });
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
    const item = normalizedByIndex.get(index);
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
  const fittedItems = selected
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.item);
  return {
    items: fittedItems,
    truncated: fittedItems.length < normalizedByIndex.size,
  };
};

const fitBoardDeltaToByteLimit = (rawUpserts, rawRemovedIds, maxBytes = MAX_BOARD_EVENT_BYTES) => {
  const removedIds = [];
  const seenRemovedIds = new Set();
  (Array.isArray(rawRemovedIds) ? rawRemovedIds : []).slice(0, MAX_BOARD_ITEMS).forEach((value) => {
    const id = clampText(value, 160).trim();
    if (!id || seenRemovedIds.has(id)) return;
    seenRemovedIds.add(id);
    removedIds.push(id);
  });

  const sourceUpserts = Array.isArray(rawUpserts) ? rawUpserts : [];
  const upserts = [];
  let normalizedUpsertCount = 0;
  let usedBytes = Buffer.byteLength(JSON.stringify({ mode: 'delta', upserts: [], removedIds }), 'utf8');
  sourceUpserts.slice(0, MAX_BOARD_ITEMS).forEach((entry) => {
    const item = normalizeBoardItem(entry?.item || entry);
    if (!item) return;
    normalizedUpsertCount += 1;
    const normalized = {
      index: Math.round(clampNumber(entry?.index, 0, MAX_BOARD_ITEMS - 1, upserts.length)),
      item,
    };
    const entryBytes = Buffer.byteLength(JSON.stringify(normalized), 'utf8') + (upserts.length > 0 ? 1 : 0);
    if (usedBytes + entryBytes > maxBytes) return;
    upserts.push(normalized);
    usedBytes += entryBytes;
  });
  return {
    upserts,
    removedIds,
    truncated: (
      upserts.length < normalizedUpsertCount
      || sourceUpserts.length > MAX_BOARD_ITEMS
      || (Array.isArray(rawRemovedIds) && rawRemovedIds.length > MAX_BOARD_ITEMS)
    ),
  };
};

const normalizePayload = (type, value) => {
  const source = isPlainObject(value) ? value : {};
  if (type === 'session') {
    return {
      action: ['start', 'switch', 'end'].includes(source.action) ? source.action : 'start',
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
      action: ['edit', 'run', 'snapshot'].includes(source.action) ? source.action : 'edit',
      // A snapshot can be emitted while a participant is joining and only
      // reflects the already-shared document. Keep that distinction in the
      // replay so the player does not attribute a passive checkpoint to the
      // participant whose client happened to flush it.
      actorVerified: source.actorVerified === true,
      code: clampText(source.code, MAX_CODE_CHARS),
      input: clampText(source.input, MAX_INPUT_CHARS),
      testFile: clampText(source.testFile, MAX_INPUT_CHARS),
      output: clampText(source.output, MAX_OUTPUT_CHARS),
      error: clampText(source.error, MAX_OUTPUT_CHARS),
    };
  }
  if (type === 'board') {
    if (source.mode === 'delta') {
      const fitted = fitBoardDeltaToByteLimit(source.upserts, source.removedIds);
      return {
        mode: 'delta',
        actorVerified: source.actorVerified === true,
        ...(source.initialState === true ? { initialState: true } : {}),
        ...fitted,
        truncated: source.truncated === true || fitted.truncated,
      };
    }
    const sourceItems = (Array.isArray(source.items) ? source.items : []).slice(0, MAX_BOARD_ITEMS);
    const fitted = fitBoardItemsToByteLimit(sourceItems);
    return {
      mode: 'snapshot',
      actorVerified: source.actorVerified === true,
      ...(source.initialState === true ? { initialState: true } : {}),
      items: fitted.items,
      truncated: source.truncated === true || fitted.truncated || (Array.isArray(source.items) && source.items.length > MAX_BOARD_ITEMS),
    };
  }
  if (type === 'run') {
    return {
      status: clampText(source.status, 40).trim(),
      output: clampText(source.output, MAX_OUTPUT_CHARS),
      error: clampText(source.error, MAX_OUTPUT_CHARS),
    };
  }
  if (type === 'screen') {
    const active = source.active !== false;
    const snapshotId = clampText(source.snapshotId, MAX_SCREEN_SNAPSHOT_ID_CHARS)
      .trim()
      .replace(/[^0-9a-z_-]/gi, '');
    return {
      active,
      snapshotId,
      width: Math.round(clampNumber(source.width, 1, 3840, 1280)),
      height: Math.round(clampNumber(source.height, 1, 2160, 720)),
      sizeBytes: Math.round(clampNumber(source.sizeBytes, 0, 512 * 1024, 0)),
      mimeType: ['image/webp', 'image/jpeg'].includes(source.mimeType)
        ? source.mimeType
        : 'image/webp',
      checksum: /^[0-9a-f]{64}$/i.test(String(source.checksum || '').trim())
        ? String(source.checksum).trim().toLowerCase()
        : '',
      sharedByRole: ['teacher', 'student'].includes(source.sharedByRole)
        ? source.sharedByRole
        : '',
      sharedByName: clampText(source.sharedByName, 160).trim(),
    };
  }
  if (type === 'viewport') {
    const surface = source.surface === 'code' ? 'code' : 'board';
    if (surface === 'code') {
      return {
        surface,
        scrollTopRatio: clampNumber(source.scrollTopRatio, 0, 1, 0),
        scrollLeftRatio: clampNumber(source.scrollLeftRatio, 0, 1, 0),
        firstVisibleLine: Math.round(clampNumber(source.firstVisibleLine, 1, 2_000_000, 1)),
        cursorLine: Math.round(clampNumber(source.cursorLine, 1, 2_000_000, 1)),
        cursorColumn: Math.round(clampNumber(source.cursorColumn, 1, 2_000_000, 1)),
      };
    }
    return {
      surface,
      zoom: clampNumber(source.zoom, 0.05, 32, 1),
      offset: {
        x: clampNumber(source.offset?.x, -1_000_000, 1_000_000, 0),
        y: clampNumber(source.offset?.y, -1_000_000, 1_000_000, 0),
      },
      width: Math.round(clampNumber(source.width, 1, 16_384, 900)),
      height: Math.round(clampNumber(source.height, 1, 16_384, 520)),
    };
  }
  if (type === 'audio') {
    const audioId = clampText(source.audioId, MAX_AUDIO_ID_CHARS)
      .trim()
      .replace(/[^0-9a-z_-]/gi, '');
    return {
      audioId,
      durationMs: Math.round(clampNumber(source.durationMs, 250, 10 * 60 * 1000, 30_000)),
      sizeBytes: Math.round(clampNumber(source.sizeBytes, 1, 4 * 1024 * 1024, 1)),
      storage: source.storage === 'local' ? 'local' : 's3',
      mimeType: [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/ogg',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].includes(source.mimeType) ? source.mimeType : 'audio/webm',
    };
  }
  return {};
};

const stableSignature = (event) => JSON.stringify([event.type, event.payload]);

const isSharedSurfaceEvent = (event) => ['code', 'board', 'run'].includes(event?.type);

// Event offsets are the primary timeline coordinate, but several legitimate
// recording paths can produce the same offset (for example, events captured
// before an occurrence start is known are all normalized to 0).  Sorting ties
// by the random event id makes the resulting scene nondeterministic and can
// apply a board delta before its snapshot.  Keep the original array order as
// the final tie breaker and use the event timestamp before it.
const getReplayEventOccurredAtMs = (event) => {
  const parsed = Date.parse(String(event?.occurredAt || '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export const compareLessonReplayEvents = (left, right) => {
  const leftOffset = Number(left?.offsetMs);
  const rightOffset = Number(right?.offsetMs);
  const normalizedLeftOffset = Number.isFinite(leftOffset) ? leftOffset : 0;
  const normalizedRightOffset = Number.isFinite(rightOffset) ? rightOffset : 0;
  if (normalizedLeftOffset !== normalizedRightOffset) {
    return normalizedLeftOffset - normalizedRightOffset;
  }

  const leftOccurredAt = getReplayEventOccurredAtMs(left);
  const rightOccurredAt = getReplayEventOccurredAtMs(right);
  if (leftOccurredAt !== null && rightOccurredAt !== null && leftOccurredAt !== rightOccurredAt) {
    return leftOccurredAt - rightOccurredAt;
  }
  if (leftOccurredAt === null && rightOccurredAt !== null) return 1;
  if (leftOccurredAt !== null && rightOccurredAt === null) return -1;
  return 0;
};

const sortLessonReplayEvents = (events) => (
  (Array.isArray(events) ? events : [])
    .map((event, sourceIndex) => ({ event, sourceIndex }))
    .sort((left, right) => (
      compareLessonReplayEvents(left.event, right.event)
      || left.sourceIndex - right.sourceIndex
    ))
    .map(({ event }) => event)
);

const actorEventTypeKey = (event) => JSON.stringify([
  event.type,
  isSharedSurfaceEvent(event) ? 'shared' : (event.actor?.role || ''),
  isSharedSurfaceEvent(event) ? '' : (event.actor?.id || ''),
  event.type === 'viewport' ? (event.payload?.surface || '') : '',
]);

const eventStateKey = (event) => JSON.stringify([
  event.type,
  isSharedSurfaceEvent(event) ? 'shared' : (event.actor?.role || ''),
  isSharedSurfaceEvent(event) ? '' : (event.actor?.id || ''),
  event.type === 'viewport' ? (event.payload?.surface || '') : '',
]);

const getProgressiveTimelineOrder = (events) => {
  const source = Array.isArray(events) ? events : [];
  if (source.length <= 2) return source;
  const ordered = [];
  const seen = new Set();
  const add = (index) => {
    if (index < 0 || index >= source.length || seen.has(index)) return;
    seen.add(index);
    ordered.push(source[index]);
  };
  add(0);
  add(source.length - 1);
  const ranges = [[0, source.length - 1]];
  for (let cursor = 0; cursor < ranges.length; cursor += 1) {
    const [left, right] = ranges[cursor];
    if (right - left <= 1) continue;
    const middle = Math.floor((left + right) / 2);
    add(middle);
    ranges.push([left, middle], [middle, right]);
  }
  return ordered;
};

const surfaceEventHasContent = (event) => {
  if (event?.type === 'board') {
    return (
      (Array.isArray(event.payload?.items) && event.payload.items.length > 0)
      || (Array.isArray(event.payload?.upserts) && event.payload.upserts.length > 0)
      || (Array.isArray(event.payload?.removedIds) && event.payload.removedIds.length > 0)
    );
  }
  if (event?.type === 'code') {
    return ['code', 'input', 'testFile', 'output', 'error']
      .some((key) => String(event.payload?.[key] || '').length > 0);
  }
  return false;
};

// Compaction must keep the lesson timeline, not only its final state. In
// particular, a final empty board must not erase everything drawn before it.
const getCompactionPriorityEvents = (events) => {
  const source = Array.isArray(events) ? events : [];
  const ordered = [];
  const seenIds = new Set();
  const add = (event) => {
    if (!event || seenIds.has(event.id)) return;
    seenIds.add(event.id);
    ordered.push(event);
  };

  add(source.find((event) => event.type === 'session' && event.payload?.action === 'start') || source[0]);

  // A board delta is only meaningful relative to the latest preceding
  // snapshot.  Reserve the first and last keyframes before filling the
  // priority list with per-state/progressive events, otherwise byte/count
  // compaction can retain a delta chain with no baseline and render an empty
  // board until the next keyframe.
  const boardSnapshots = source.filter(
    (event) => event.type === 'board' && event.payload?.mode === 'snapshot'
  );
  add(boardSnapshots[0]);
  add(boardSnapshots.at(-1));
  source.filter((event) => event.type === 'audio').slice(-360).forEach(add);

  const latestByState = new Map();
  source.forEach((event) => latestByState.set(eventStateKey(event), event));
  latestByState.forEach(add);

  const surfaceGroups = ['board', 'code'].map((type) => source.filter((event) => event.type === type));
  surfaceGroups.forEach((group) => {
    add(group.find(surfaceEventHasContent));
    add([...group].reverse().find(surfaceEventHasContent));
    group.filter((event) => event.type === 'board' && event.payload?.mode === 'snapshot').forEach(add);
  });
  const surfaceOrders = surfaceGroups.map(getProgressiveTimelineOrder);
  const surfaceLength = Math.max(0, ...surfaceOrders.map((group) => group.length));
  for (let index = 0; index < surfaceLength; index += 1) {
    surfaceOrders.forEach((group) => add(group[index]));
  }

  getProgressiveTimelineOrder(source).forEach(add);
  for (let index = source.length - 1; index >= 0; index -= 1) add(source[index]);
  return ordered;
};

export const normalizeLessonReplayEvent = (value, context = {}) => {
  if (!isPlainObject(value)) return null;
  const type = clampText(value.type, 40).trim().toLowerCase();
  if (!EVENT_TYPES.has(type)) return null;
  const rawAt = Date.parse(String(value.occurredAt || '').trim());
  const fallbackAt = Number(context.nowMs) || Date.now();
  const occurredAtMs = Number.isFinite(rawAt) ? rawAt : fallbackAt;
  const validationStartMs = Number.isFinite(Number(context.validationStartMs))
    ? Number(context.validationStartMs)
    : Number(context.startMs);
  const minimumAt = Number.isFinite(validationStartMs)
    ? validationStartMs - (30 * 60 * 1000)
    : occurredAtMs;
  const maximumAt = Number.isFinite(Number(context.endMs))
    ? Number(context.endMs) + (2 * 60 * 60 * 1000)
    : occurredAtMs;
  if (occurredAtMs < minimumAt || occurredAtMs > maximumAt) return null;
  const id = clampText(value.id, MAX_EVENT_ID_CHARS).trim();
  const payload = normalizePayload(type, value.payload);
  if (type === 'screen' && payload.active !== false && !payload.snapshotId) return null;
  if (type === 'audio' && !payload.audioId) return null;
  const timelineStartMs = Number.isFinite(Number(context.timelineStartMs))
    ? Number(context.timelineStartMs)
    : Number(context.startMs);
  const normalized = {
    id: id || `${occurredAtMs}-${Math.random().toString(36).slice(2, 12)}`,
    type,
    occurredAt: new Date(occurredAtMs).toISOString(),
    offsetMs: Number.isFinite(timelineStartMs)
      ? Math.max(0, Math.round(occurredAtMs - timelineStartMs))
      : 0,
    actor: {
      role: ['teacher', 'student'].includes(context.actorRole) ? context.actorRole : '',
      id: clampText(context.actorId, 160).trim(),
      name: clampText(context.actorName, 160).trim(),
    },
    payload,
  };
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_NORMALIZED_EVENT_BYTES) return null;
  return normalized;
};

const trimEventsToCountLimit = (events, maxEvents = LESSON_REPLAY_MAX_EVENTS) => {
  const source = Array.isArray(events) ? events : [];
  if (source.length <= maxEvents) return source;
  const keepIds = new Set(
    getCompactionPriorityEvents(source).slice(0, maxEvents).map((event) => event.id)
  );
  return source.filter((event) => keepIds.has(event.id));
};

export const normalizeLessonReplay = (value) => {
  const source = isPlainObject(value) ? value : {};
  const occurrence = isPlainObject(source.occurrence) ? source.occurrence : {};
  const startMs = Number(occurrence.startMs);
  const endMs = Number(occurrence.endMs);
  const scope = occurrence.scope === 'learning-group' ? 'learning-group' : 'student';
  const participantIds = Array.from(new Set(
    (Array.isArray(occurrence.participantIds) ? occurrence.participantIds : [])
      .map((entry) => clampText(entry, 160).trim())
      .filter(Boolean)
  )).slice(0, 5);
  const normalizedOccurrenceStartMs = Number.isFinite(startMs) ? startMs : 0;
  const minimumTimelineStartMs = normalizedOccurrenceStartMs > 0
    ? normalizedOccurrenceStartMs - (30 * 60 * 1000)
    : 0;
  const storedTimelineStartMs = Number(source.timelineStartMs);
  const timelineStartMs = Number.isFinite(storedTimelineStartMs) && storedTimelineStartMs > 0
    ? Math.max(
      minimumTimelineStartMs,
      normalizedOccurrenceStartMs > 0
        ? Math.min(normalizedOccurrenceStartMs, storedTimelineStartMs)
        : storedTimelineStartMs
    )
    : normalizedOccurrenceStartMs;
  const normalized = {
    version: REPLAY_VERSION,
    occurrence: {
      key: clampText(occurrence.key, 760).trim(),
      studentId: clampText(occurrence.studentId, 160).trim(),
      scope,
      groupId: scope === 'learning-group' ? clampText(occurrence.groupId, 160).trim() : '',
      lessonId: scope === 'learning-group' ? clampText(occurrence.lessonId, 160).trim() : '',
      participantIds: scope === 'learning-group' ? participantIds : [],
      dayKey: clampText(occurrence.dayKey, 20).trim(),
      time: clampText(occurrence.time, 12).trim(),
      durationMinutes: clampNumber(occurrence.durationMinutes, 15, 360, 60),
      startMs: normalizedOccurrenceStartMs,
      endMs: Number.isFinite(endMs) ? endMs : 0,
    },
    timelineStartMs,
    createdAt: clampText(source.createdAt, 40).trim(),
    updatedAt: clampText(source.updatedAt, 40).trim(),
    events: [],
  };
  const seenIds = new Set();
  (Array.isArray(source.events) ? source.events : []).forEach((entry) => {
    const event = normalizeLessonReplayEvent(entry, {
      startMs: normalized.occurrence.startMs,
      validationStartMs: normalized.occurrence.startMs,
      timelineStartMs: normalized.timelineStartMs,
      endMs: normalized.occurrence.endMs,
      actorRole: entry?.actor?.role,
      actorId: entry?.actor?.id,
      actorName: entry?.actor?.name,
    });
    if (!event || seenIds.has(event.id)) return;
    seenIds.add(event.id);
    normalized.events.push(event);
  });
  const earliestEventAtMs = normalized.events.reduce((earliest, event) => {
    const occurredAtMs = Date.parse(event.occurredAt);
    return Number.isFinite(occurredAtMs) ? Math.min(earliest, occurredAtMs) : earliest;
  }, Number.POSITIVE_INFINITY);
  if (Number.isFinite(earliestEventAtMs) && earliestEventAtMs < normalized.timelineStartMs) {
    normalized.timelineStartMs = Math.max(minimumTimelineStartMs, earliestEventAtMs);
  }
  normalized.events.forEach((event) => {
    const occurredAtMs = Date.parse(event.occurredAt);
    event.offsetMs = Number.isFinite(occurredAtMs) && normalized.timelineStartMs > 0
      ? Math.max(0, Math.round(occurredAtMs - normalized.timelineStartMs))
      : Math.max(0, Math.round(Number(event.offsetMs) || 0));
  });
  normalized.events = sortLessonReplayEvents(normalized.events);
  normalized.events = trimEventsToCountLimit(normalized.events);
  return normalized;
};

const trimReplayToByteLimit = (replay, maxBytes, currentBytes = null) => {
  const normalizedMaxBytes = Math.max(512, Number(maxBytes) || LESSON_REPLAY_MAX_FILE_BYTES);
  const initialBytes = Number.isFinite(Number(currentBytes))
    ? Number(currentBytes)
    : Buffer.byteLength(JSON.stringify(replay), 'utf8');
  if (initialBytes <= normalizedMaxBytes) return replay;

  const events = replay.events;

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
  getCompactionPriorityEvents(events).forEach(addIfFits);
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
  const replay = context.normalizedReplay === true && rawReplay?.version === REPLAY_VERSION
    ? {
      ...rawReplay,
      occurrence: { ...(rawReplay.occurrence || {}) },
      events: Array.isArray(rawReplay.events) ? rawReplay.events.map((event) => ({ ...event })) : [],
    }
    : normalizeLessonReplay(rawReplay);
  const occurrenceStartMs = Number(replay.occurrence.startMs);
  const minimumTimelineStartMs = Number.isFinite(occurrenceStartMs) && occurrenceStartMs > 0
    ? occurrenceStartMs - (30 * 60 * 1000)
    : 0;
  const storedTimelineStartMs = Number(replay.timelineStartMs);
  replay.timelineStartMs = Number.isFinite(storedTimelineStartMs) && storedTimelineStartMs > 0
    ? Math.max(
      minimumTimelineStartMs,
      Number.isFinite(occurrenceStartMs) && occurrenceStartMs > 0
        ? Math.min(occurrenceStartMs, storedTimelineStartMs)
        : storedTimelineStartMs
    )
    : (Number.isFinite(occurrenceStartMs) ? occurrenceStartMs : 0);
  const knownIds = new Set(replay.events.map((event) => event.id));
  const latestSignatureByActorAndType = new Map();
  replay.events.forEach((event) => latestSignatureByActorAndType.set(actorEventTypeKey(event), {
    signature: stableSignature(event),
    occurredAtMs: Date.parse(event.occurredAt),
  }));
  let added = 0;

  const incomingEvents = (Array.isArray(rawEvents) ? rawEvents : [])
    .slice(0, LESSON_REPLAY_MAX_BATCH_EVENTS)
    .map((entry) => normalizeLessonReplayEvent(entry, {
      ...context,
      startMs: replay.occurrence.startMs,
      validationStartMs: replay.occurrence.startMs,
      timelineStartMs: replay.timelineStartMs,
      endMs: replay.occurrence.endMs,
    }))
    .filter(Boolean);
  const earliestIncomingAtMs = incomingEvents.reduce((earliest, event) => {
    const occurredAtMs = Date.parse(event.occurredAt);
    return Number.isFinite(occurredAtMs) ? Math.min(earliest, occurredAtMs) : earliest;
  }, Number.POSITIVE_INFINITY);
  if (Number.isFinite(earliestIncomingAtMs) && earliestIncomingAtMs < replay.timelineStartMs) {
    replay.timelineStartMs = Math.max(minimumTimelineStartMs, earliestIncomingAtMs);
    [...replay.events, ...incomingEvents].forEach((event) => {
      const occurredAtMs = Date.parse(event.occurredAt);
      if (Number.isFinite(occurredAtMs)) {
        event.offsetMs = Math.max(0, Math.round(occurredAtMs - replay.timelineStartMs));
      }
    });
  }

  incomingEvents.forEach((event) => {
    if (!event || knownIds.has(event.id)) return;
    const signature = stableSignature(event);
    const actorTypeKey = actorEventTypeKey(event);
    const previous = latestSignatureByActorAndType.get(actorTypeKey);
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
    latestSignatureByActorAndType.set(actorTypeKey, { signature, occurredAtMs });
    added += 1;
  });

  replay.events = sortLessonReplayEvents(replay.events);
  replay.events = trimEventsToCountLimit(replay.events);
  const now = new Date(Number(context.nowMs) || Date.now()).toISOString();
  replay.createdAt = replay.createdAt || now;
  if (added > 0) replay.updatedAt = now;
  const maxBytes = Number(context.maxBytes) || LESSON_REPLAY_MAX_FILE_BYTES;
  let bytes = Buffer.byteLength(JSON.stringify(replay), 'utf8');
  if (bytes > maxBytes) {
    trimReplayToByteLimit(replay, maxBytes, bytes);
    bytes = Buffer.byteLength(JSON.stringify(replay), 'utf8');
  }

  return {
    replay,
    added,
    bytes,
  };
};

export const createLessonReplay = (occurrence, nowMs = Date.now()) => normalizeLessonReplay({
  version: REPLAY_VERSION,
  occurrence,
  createdAt: new Date(nowMs).toISOString(),
  updatedAt: new Date(nowMs).toISOString(),
  events: [],
});

export const summarizeLessonReplay = (value, bytes = null, options = {}) => {
  const replay = options.normalized === true ? value : normalizeLessonReplay(value);
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

export const summarizeLessonReplayStorage = (value, options = {}) => {
  const replay = options.normalized === true ? value : normalizeLessonReplay(value);
  const dataBytes = Number.isFinite(Number(options.dataBytes))
    ? Math.max(0, Math.round(Number(options.dataBytes)))
    : Buffer.byteLength(JSON.stringify(replay), 'utf8');
  const referencedSnapshotBytes = replay.events.reduce((sum, event) => (
    event?.type === 'screen' ? sum + Math.max(0, Number(event.payload?.sizeBytes) || 0) : sum
  ), 0);
  const snapshotBytes = Number.isFinite(Number(options.snapshotBytes))
    ? Math.max(0, Math.round(Number(options.snapshotBytes)))
    : referencedSnapshotBytes;
  const audioBytes = replay.events.reduce((sum, event) => (
    event?.type === 'audio' ? sum + Math.max(0, Number(event.payload?.sizeBytes) || 0) : sum
  ), 0);
  return {
    dataBytes,
    snapshotBytes,
    audioBytes,
    totalBytes: dataBytes + snapshotBytes + audioBytes,
  };
};
