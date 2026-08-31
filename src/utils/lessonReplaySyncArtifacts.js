const CODE_RESTORE_WINDOW_MS = 45_000;
const NAVIGATION_CAPTURE_WINDOW_MS = 2_500;
const LEGACY_BOARD_EVENT_LIMIT_BYTES = 384 * 1024;
const LEGACY_TRUNCATION_SIZE_THRESHOLD = Math.floor(LEGACY_BOARD_EVENT_LIMIT_BYTES * 0.9);
const LEGACY_INITIAL_BOARD_SYNC_MAX_OFFSET_MS = 2 * 60_000;
const LEGACY_INITIAL_BOARD_SYNC_MIN_NEW_ITEMS = 64;
const LEGACY_INITIAL_BOARD_SYNC_CLUSTER_GAP_MS = 25;

const normalizeOffsetMs = (event) => Math.max(0, Number(event?.offsetMs) || 0);

const getActorKey = (event) => {
  const actor = event?.actor && typeof event.actor === 'object' ? event.actor : {};
  const role = ['teacher', 'student'].includes(actor.role) ? actor.role : '';
  const identity = String(actor.id || actor.name || '').trim();
  return role || identity ? `${role}:${identity}` : '';
};

const getItemId = (item) => String(item?.id || '').trim();

const getSerializedByteLength = (value) => {
  try {
    const serialized = JSON.stringify(value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(serialized).byteLength;
    return serialized.length;
  } catch {
    return 0;
  }
};

const applyBoardPayload = (currentItems, payload = {}) => {
  if (payload.mode !== 'delta') {
    return Array.isArray(payload.items) ? [...payload.items] : [];
  }
  const removedIds = new Set(
    (Array.isArray(payload.removedIds) ? payload.removedIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  const upserts = (Array.isArray(payload.upserts) ? payload.upserts : [])
    .filter((entry) => getItemId(entry?.item))
    .map((entry, sourceIndex) => ({
      entry,
      sourceIndex,
      index: Math.max(0, Math.round(Number(entry.index) || 0)),
    }))
    .sort((left, right) => left.index - right.index || left.sourceIndex - right.sourceIndex);
  const upsertIds = new Set(upserts.map(({ entry }) => getItemId(entry.item)));
  const nextItems = (Array.isArray(currentItems) ? currentItems : []).filter((item) => {
    const id = getItemId(item);
    return !removedIds.has(id) && !upsertIds.has(id);
  });
  upserts.forEach(({ entry, index }) => {
    nextItems.splice(Math.min(nextItems.length, index), 0, entry.item);
  });
  return nextItems;
};

const getBoardPayloadItems = (payload = {}) => (
  payload.mode === 'delta'
    ? (Array.isArray(payload.upserts) ? payload.upserts.map((entry) => entry?.item) : [])
    : (Array.isArray(payload.items) ? payload.items : [])
);

const isPassiveAddOnlyBoardState = (event) => {
  if (event?.type !== 'board' || event.payload?.actorVerified === true) return false;
  if (event.payload?.mode !== 'delta') return Array.isArray(event.payload?.items);
  return (
    Array.isArray(event.payload?.upserts)
    && event.payload.upserts.length > 0
    && (!Array.isArray(event.payload?.removedIds) || event.payload.removedIds.length === 0)
  );
};

// A legacy collaborative board could finish its initial Yjs synchronization
// long after the lesson timeline had started. The recorder then stored the
// already-existing board as several large, passive deltas at the sync time, so
// hundreds of objects appeared at once during playback. Collapse only large
// all-new passive bursts from the first two minutes (and before any verified
// board edit) into one neutral initial snapshot. Modern recordings mark their
// initial checkpoint explicitly and do not need the size heuristic.
export const repairLessonReplayInitialBoardState = (events) => {
  const source = Array.isArray(events) ? events.filter(Boolean) : [];
  if (source.length === 0) return source;

  const firstVerifiedBoardOffset = source.reduce((minimum, event) => (
    event?.type === 'board' && event.payload?.actorVerified === true
      ? Math.min(minimum, normalizeOffsetMs(event))
      : minimum
  ), Infinity);
  const selectedIndexes = new Set();
  const seenItemIds = new Set();
  const legacyCandidates = [];

  source.forEach((event, index) => {
    if (event?.type !== 'board') return;
    const items = getBoardPayloadItems(event.payload);
    let newItemCount = 0;
    items.forEach((item) => {
      const id = getItemId(item);
      if (!id || seenItemIds.has(id)) return;
      seenItemIds.add(id);
      newItemCount += 1;
    });

    if (event.payload?.initialState === true && event.payload?.actorVerified !== true) {
      selectedIndexes.add(index);
      return;
    }

    const offsetMs = normalizeOffsetMs(event);
    if (
      offsetMs > LEGACY_INITIAL_BOARD_SYNC_MAX_OFFSET_MS
      || offsetMs >= firstVerifiedBoardOffset
      || !isPassiveAddOnlyBoardState(event)
    ) return;
    legacyCandidates.push({ index, offsetMs, newItemCount });
  });

  let cluster = [];
  const flushCluster = () => {
    if (
      cluster.reduce((sum, entry) => sum + entry.newItemCount, 0)
      >= LEGACY_INITIAL_BOARD_SYNC_MIN_NEW_ITEMS
    ) {
      cluster.forEach((entry) => selectedIndexes.add(entry.index));
    }
    cluster = [];
  };
  legacyCandidates.forEach((candidate) => {
    const previous = cluster.at(-1);
    if (
      previous
      && candidate.offsetMs - previous.offsetMs > LEGACY_INITIAL_BOARD_SYNC_CLUSTER_GAP_MS
    ) flushCluster();
    cluster.push(candidate);
  });
  flushCluster();

  if (selectedIndexes.size === 0) return source;

  let initialItems = [];
  let firstInitialEvent = null;
  const remainingEvents = [];
  source.forEach((event, index) => {
    if (!selectedIndexes.has(index)) {
      remainingEvents.push(event);
      return;
    }
    if (!firstInitialEvent) firstInitialEvent = event;
    initialItems = applyBoardPayload(initialItems, event.payload);
  });

  const initialEvent = {
    ...firstInitialEvent,
    id: `board-initial-${String(firstInitialEvent?.id || 'state')}`,
    offsetMs: 0,
    actor: null,
    payload: {
      mode: 'snapshot',
      actorVerified: false,
      initialState: true,
      recoveredInitialState: firstInitialEvent?.payload?.initialState !== true,
      items: initialItems,
      truncated: false,
    },
  };
  return [initialEvent, ...remainingEvents];
};

const hasSameBoardState = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

const isEmptyBoardSnapshot = (event) => (
  event?.type === 'board'
  && event.payload?.mode !== 'delta'
  && Array.isArray(event.payload?.items)
  && event.payload.items.length === 0
);

const hasSubstantialBoardRestore = (previousItems, candidateItems) => {
  if (!Array.isArray(previousItems) || previousItems.length === 0 || !Array.isArray(candidateItems)) {
    return false;
  }
  const previousIds = new Set(previousItems.map(getItemId).filter(Boolean));
  if (previousIds.size === 0) return false;
  const restoredIds = new Set(candidateItems.map(getItemId).filter(Boolean));
  let overlap = 0;
  previousIds.forEach((id) => {
    if (restoredIds.has(id)) overlap += 1;
  });
  const requiredOverlap = previousIds.size <= 3
    ? previousIds.size
    : Math.ceil(previousIds.size * 0.6);
  return overlap >= requiredOverlap;
};

const isTruncatedBoardSnapshot = (event, previousItems) => {
  const payload = event?.payload;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (event?.type !== 'board' || payload?.mode === 'delta' || items.length === 0) return false;
  if (payload.truncated === true) return true;
  return (
    Array.isArray(previousItems)
    && previousItems.length > items.length
    && hasSubstantialBoardRestore(previousItems, items)
    && getSerializedByteLength(payload) >= LEGACY_TRUNCATION_SIZE_THRESHOLD
  );
};

const convertTruncatedBoardSnapshotToDelta = (event) => ({
  ...event,
  payload: {
    ...event.payload,
    mode: 'delta',
    upserts: (Array.isArray(event.payload?.items) ? event.payload.items : []).map((item, index) => ({
      index,
      item,
    })),
    removedIds: [],
    recoveredFromTruncatedSnapshot: true,
  },
});

const CODE_STATE_FIELDS = ['code', 'input', 'testFile', 'output', 'error'];
const CODE_SOURCE_FIELDS = ['code', 'input', 'testFile'];

const isEmptyCodeSnapshot = (event) => (
  event?.type === 'code'
  && CODE_STATE_FIELDS.every((field) => String(event.payload?.[field] || '') === '')
);

const hasCodeContent = (payload) => (
  CODE_STATE_FIELDS.some((field) => String(payload?.[field] || '') !== '')
);

const hasSameCodeSource = (left, right) => {
  const hasSource = CODE_SOURCE_FIELDS.some((field) => String(left?.[field] || '') !== '');
  const fields = hasSource ? CODE_SOURCE_FIELDS : CODE_STATE_FIELDS;
  return fields.every((field) => String(left?.[field] || '') === String(right?.[field] || ''));
};

const hasSameCodeState = (left, right) => (
  Boolean(left && right)
  && String(left.language || 'python') === String(right.language || 'python')
  && CODE_STATE_FIELDS.every((field) => String(left[field] || '') === String(right[field] || ''))
);

const isNavigationWarmup = (event, navigationByActor, expectedSurface) => {
  const actorKey = getActorKey(event);
  const navigation = actorKey ? navigationByActor.get(actorKey) : null;
  if (!navigation) return false;
  const elapsedMs = normalizeOffsetMs(event) - normalizeOffsetMs(navigation);
  if (elapsedMs < 0 || elapsedMs > NAVIGATION_CAPTURE_WINDOW_MS) return false;
  const view = String(navigation.payload?.view || '').trim();
  if (expectedSurface === 'code') return view === 'collab' || view === 'python';
  return view !== 'board';
};

const findNextActorEvent = (events, startIndex, sourceEvent, type, windowMs) => {
  const actorKey = getActorKey(sourceEvent);
  const startMs = normalizeOffsetMs(sourceEvent);
  if (!actorKey) return null;
  for (let index = startIndex + 1; index < events.length; index += 1) {
    const candidate = events[index];
    const elapsedMs = normalizeOffsetMs(candidate) - startMs;
    if (elapsedMs > windowMs) break;
    if (candidate?.type === type && getActorKey(candidate) === actorKey) return candidate;
  }
  return null;
};

// Older clients could emit an empty checkpoint while a collaborative Yjs
// document was mounting or unmounting. Legacy recordings did not mark an
// event's author, while real modern clears are explicitly actor-verified.
// Therefore an unverified empty snapshot must never erase an already visible
// board. Intentional deletions in legacy recordings were stored as deltas.
export const removeLessonReplaySyncArtifacts = (events) => {
  const source = Array.isArray(events) ? events.filter(Boolean) : [];
  const navigationByActor = new Map();
  const repaired = [];
  let boardItems = [];
  let codePayload = null;

  source.forEach((sourceEvent, index) => {
    let event = sourceEvent;
    const actorKey = getActorKey(event);
    if (event?.type === 'navigation' && actorKey) navigationByActor.set(actorKey, event);

    if (
      isEmptyBoardSnapshot(event)
      && boardItems.length > 0
      && event.payload?.actorVerified !== true
    ) {
      return;
    }

    if (
      isEmptyCodeSnapshot(event)
      && isNavigationWarmup(event, navigationByActor, 'code')
    ) {
      const nextCodeEvent = findNextActorEvent(source, index, event, 'code', CODE_RESTORE_WINDOW_MS);
      const nextPayload = nextCodeEvent?.payload;
      if (
        hasCodeContent(nextPayload)
        && (!hasCodeContent(codePayload) || hasSameCodeSource(codePayload, nextPayload))
      ) return;
    }

    if (isTruncatedBoardSnapshot(event, boardItems)) {
      event = convertTruncatedBoardSnapshotToDelta(event);
    }

    if (event?.type === 'board') {
      const nextBoardItems = applyBoardPayload(boardItems, event.payload);
      if (hasSameBoardState(boardItems, nextBoardItems)) return;
      boardItems = nextBoardItems;
    } else if (event?.type === 'code') {
      const nextCodePayload = event.payload || {};
      if (event.payload?.action !== 'run' && hasSameCodeState(codePayload, nextCodePayload)) return;
      codePayload = nextCodePayload;
    }
    repaired.push(event);
  });

  return repaired;
};
