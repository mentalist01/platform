const BOARD_RESTORE_WINDOW_MS = 10 * 60_000;
const CODE_RESTORE_WINDOW_MS = 45_000;
const NAVIGATION_CAPTURE_WINDOW_MS = 2_500;
const LEGACY_SURFACE_SWITCH_WINDOW_MS = 2_500;
const LEGACY_BOARD_REMOUNT_WINDOW_MS = 15_000;
const LEGACY_BOARD_EVENT_LIMIT_BYTES = 384 * 1024;
const LEGACY_TRUNCATION_SIZE_THRESHOLD = Math.floor(LEGACY_BOARD_EVENT_LIMIT_BYTES * 0.9);

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

const isBoardRestoredAfterEmptySnapshot = (events, startIndex, previousItems) => {
  const startMs = normalizeOffsetMs(events[startIndex]);
  let candidateItems = [];
  for (let index = startIndex + 1; index < events.length; index += 1) {
    const candidate = events[index];
    if (normalizeOffsetMs(candidate) - startMs > BOARD_RESTORE_WINDOW_MS) break;
    if (candidate?.type !== 'board') continue;
    // New recordings mark real local clears. Never reinterpret one of those
    // as a mount/unmount artifact, even if an undo later restores the board.
    if (isEmptyBoardSnapshot(candidate) && candidate.payload?.actorVerified === true) return false;
    candidateItems = applyBoardPayload(candidateItems, candidate.payload);
    if (hasSubstantialBoardRestore(previousItems, candidateItems)) return true;
  }
  return false;
};

const isPassiveCodeSwitchAfterEmptyBoard = (events, startIndex) => {
  const startMs = normalizeOffsetMs(events[startIndex]);
  for (let index = startIndex + 1; index < events.length; index += 1) {
    const candidate = events[index];
    const elapsedMs = normalizeOffsetMs(candidate) - startMs;
    if (elapsedMs > LEGACY_SURFACE_SWITCH_WINDOW_MS) break;
    if (candidate?.type === 'board' && candidate.payload?.actorVerified === true) return false;
    if (candidate?.type === 'code') return candidate.payload?.actorVerified !== true;
  }
  return false;
};

const isPassiveBoardRemountAfterEmptySnapshot = (events, startIndex) => {
  const startMs = normalizeOffsetMs(events[startIndex]);
  for (let index = startIndex + 1; index < events.length; index += 1) {
    const candidate = events[index];
    if (normalizeOffsetMs(candidate) - startMs > LEGACY_BOARD_REMOUNT_WINDOW_MS) break;
    if (candidate?.type !== 'board') continue;
    return (
      candidate.payload?.mode === 'delta'
      && candidate.payload?.actorVerified !== true
      && Array.isArray(candidate.payload?.upserts)
      && candidate.payload.upserts.length > 0
      && (!Array.isArray(candidate.payload?.removedIds) || candidate.payload.removedIds.length === 0)
    );
  }
  return false;
};

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
// document was mounting or unmounting. In real legacy lessons the restored
// keyframe can arrive minutes later, so navigation proximity alone is not a
// reliable signal. Remove an unverified empty frame only when most of the same
// object ids are subsequently restored; explicit modern clears remain intact.
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
      && (
        isBoardRestoredAfterEmptySnapshot(source, index, boardItems)
        || isPassiveCodeSwitchAfterEmptyBoard(source, index)
        || isPassiveBoardRemountAfterEmptySnapshot(source, index)
      )
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
