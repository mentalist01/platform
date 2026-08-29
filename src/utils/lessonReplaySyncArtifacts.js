const BOARD_RESTORE_WINDOW_MS = 10_000;
const CODE_RESTORE_WINDOW_MS = 45_000;
const NAVIGATION_CAPTURE_WINDOW_MS = 2_500;

const normalizeOffsetMs = (event) => Math.max(0, Number(event?.offsetMs) || 0);

const getActorKey = (event) => {
  const actor = event?.actor && typeof event.actor === 'object' ? event.actor : {};
  const role = ['teacher', 'student'].includes(actor.role) ? actor.role : '';
  const identity = String(actor.id || actor.name || '').trim();
  return role || identity ? `${role}:${identity}` : '';
};

const getItemId = (item) => String(item?.id || '').trim();

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

const hasSameBoardIds = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
    return false;
  }
  const leftIds = left.map(getItemId);
  const rightIds = new Set(right.map(getItemId));
  return leftIds.every((id) => Boolean(id) && rightIds.has(id));
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
// document was mounting or unmounting. Those checkpoints sit next to a
// navigation event and are followed by the same shared state being restored.
// Remove only that narrow pattern so genuine clears remain visible.
export const removeLessonReplaySyncArtifacts = (events) => {
  const source = Array.isArray(events) ? events.filter(Boolean) : [];
  const navigationByActor = new Map();
  const repaired = [];
  let boardItems = [];
  let codePayload = null;

  source.forEach((event, index) => {
    const actorKey = getActorKey(event);
    if (event?.type === 'navigation' && actorKey) navigationByActor.set(actorKey, event);

    if (
      isEmptyBoardSnapshot(event)
      && boardItems.length > 0
      && isNavigationWarmup(event, navigationByActor, 'board')
    ) {
      const nextBoardEvent = findNextActorEvent(source, index, event, 'board', BOARD_RESTORE_WINDOW_MS);
      const restoredItems = nextBoardEvent ? applyBoardPayload([], nextBoardEvent.payload) : [];
      if (hasSameBoardIds(boardItems, restoredItems)) return;
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
