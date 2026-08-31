import { sortLessonReplayEvents } from './lessonReplayEventOrder.js';
import {
  removeLessonReplaySyncArtifacts,
  repairLessonReplayInitialBoardState,
} from './lessonReplaySyncArtifacts.js';

export const LESSON_REPLAY_BRANCH_SCHEMA_VERSION = 1;

const LESSON_REPLAY_BRANCH_KIND = 'lesson-replay-time-machine-branch';

const cloneValue = (value, seen = new WeakMap()) => {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const result = [];
    seen.set(value, result);
    value.forEach((entry) => result.push(cloneValue(entry, seen)));
    return result;
  }

  const result = {};
  seen.set(value, result);
  Object.keys(value).forEach((key) => {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: cloneValue(value[key], seen),
      writable: true,
    });
  });
  return result;
};

const normalizePositionMs = (value) => Math.max(0, Math.round(Number(value) || 0));

const normalizeEventOffsetMs = (event) => normalizePositionMs(event?.offsetMs);

const getOrderedReplayEvents = (replay) => (
  removeLessonReplaySyncArtifacts(
    repairLessonReplayInitialBoardState(
      sortLessonReplayEvents(
        (Array.isArray(replay?.events) ? replay.events : [])
          .filter((event) => event && typeof event === 'object')
      )
    )
  )
);

const normalizeCodeState = (value = {}) => {
  const source = value && typeof value === 'object' ? cloneValue(value) : {};
  return {
    ...source,
    language: String(source.language || 'python').trim() || 'python',
    code: String(source.code || ''),
    input: String(source.input || ''),
    testFile: String(source.testFile || ''),
    output: String(source.output || ''),
    error: String(source.error || ''),
    status: String(source.status || 'idle'),
  };
};

const normalizeBoardState = (value = {}) => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? cloneValue(value)
    : {};
  const items = Array.isArray(value) ? value : source.items;
  return {
    ...source,
    items: cloneValue(Array.isArray(items) ? items : []),
  };
};

const applyBoardReplayEvent = (currentItems, event) => {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  if (payload.mode !== 'delta') {
    return cloneValue(Array.isArray(payload.items) ? payload.items : []);
  }

  const removedIds = new Set(
    (Array.isArray(payload.removedIds) ? payload.removedIds : [])
      .map((id) => String(id || ''))
      .filter(Boolean)
  );
  const upserts = (Array.isArray(payload.upserts) ? payload.upserts : [])
    .filter((entry) => entry?.item && typeof entry.item === 'object')
    .map((entry, sourceIndex) => ({
      index: Math.max(0, Math.round(Number(entry.index) || 0)),
      item: cloneValue(entry.item),
      sourceIndex,
    }))
    .sort((left, right) => left.index - right.index || left.sourceIndex - right.sourceIndex);
  const upsertIds = new Set(
    upserts.map((entry) => String(entry.item?.id || '')).filter(Boolean)
  );
  const nextItems = (Array.isArray(currentItems) ? currentItems : [])
    .filter((item) => {
      const id = String(item?.id || '');
      return !removedIds.has(id) && !upsertIds.has(id);
    })
    .map((item) => cloneValue(item));

  upserts.forEach((entry) => {
    const index = Math.min(nextItems.length, entry.index);
    nextItems.splice(index, 0, entry.item);
  });
  return nextItems;
};

const hashBranchIdentity = (value) => {
  const source = String(value || '');
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
    right ^= right >>> 13;
  }
  return [left, right]
    .map((part) => (part >>> 0).toString(36).padStart(7, '0'))
    .join('');
};

const getAnchorEvent = (events, positionMs) => {
  let anchorEvent = null;
  for (const event of events) {
    if (normalizeEventOffsetMs(event) > positionMs) break;
    anchorEvent = event;
  }
  return anchorEvent;
};

export const getLessonReplayStateAt = (replay, rawPositionMs, options = {}) => {
  const positionMs = normalizePositionMs(rawPositionMs);
  const actorRole = ['teacher', 'student'].includes(options?.actorRole)
    ? options.actorRole
    : '';
  const events = getOrderedReplayEvents(replay);
  let boardItems = [];
  let codeEvent = null;
  let runEvent = null;
  let boardViewport = null;
  let codeViewport = null;
  let actorBoardViewport = null;
  let actorCodeViewport = null;

  for (const event of events) {
    if (normalizeEventOffsetMs(event) > positionMs) break;
    if (event.type === 'board') boardItems = applyBoardReplayEvent(boardItems, event);
    else if (event.type === 'code') codeEvent = event;
    else if (event.type === 'run') runEvent = event;
    else if (event.type === 'viewport' && event?.payload?.surface === 'board') {
      boardViewport = cloneValue(event.payload);
      if (actorRole && event?.actor?.role === actorRole) actorBoardViewport = cloneValue(event.payload);
    } else if (event.type === 'viewport' && event?.payload?.surface === 'code') {
      codeViewport = cloneValue(event.payload);
      if (actorRole && event?.actor?.role === actorRole) actorCodeViewport = cloneValue(event.payload);
    }
  }

  const code = normalizeCodeState(codeEvent?.payload);
  const resolvedCodeViewport = actorCodeViewport || codeViewport;
  if (resolvedCodeViewport) code.viewport = cloneValue(resolvedCodeViewport);
  if (
    runEvent
    && normalizeEventOffsetMs(runEvent) >= normalizeEventOffsetMs(codeEvent)
  ) {
    const runPayload = runEvent.payload && typeof runEvent.payload === 'object'
      ? runEvent.payload
      : {};
    code.status = String(runPayload.status || '');
    code.output = String(runPayload.output || '');
    code.error = String(runPayload.error || '');
  }

  return {
    code,
    board: normalizeBoardState({
      items: boardItems,
      ...(actorBoardViewport || boardViewport
        ? { viewport: cloneValue(actorBoardViewport || boardViewport) }
        : {}),
    }),
  };
};

export const createLessonReplayBranchMetadata = (replay, rawPositionMs) => {
  const positionMs = normalizePositionMs(rawPositionMs);
  const occurrence = replay?.occurrence && typeof replay.occurrence === 'object'
    ? replay.occurrence
    : {};
  const occurrenceKey = String(occurrence.key || '');
  const studentId = String(occurrence.studentId || '');
  const events = getOrderedReplayEvents(replay);
  const anchorEvent = getAnchorEvent(events, positionMs);
  const fallbackOccurrenceIdentity = [
    occurrence.dayKey,
    occurrence.time,
    occurrence.startMs,
    occurrence.endMs,
  ];
  const identity = JSON.stringify([
    LESSON_REPLAY_BRANCH_SCHEMA_VERSION,
    studentId,
    occurrenceKey || fallbackOccurrenceIdentity,
    positionMs,
  ]);

  return {
    schemaVersion: LESSON_REPLAY_BRANCH_SCHEMA_VERSION,
    kind: LESSON_REPLAY_BRANCH_KIND,
    branchId: `lesson-replay-branch-${hashBranchIdentity(identity)}`,
    studentId,
    occurrenceKey,
    positionMs,
    sourceEventId: String(anchorEvent?.id || ''),
    sourceEventOffsetMs: anchorEvent ? normalizeEventOffsetMs(anchorEvent) : 0,
  };
};

export const createLessonReplayBranch = (replay, rawPositionMs, options = {}) => {
  const metadata = createLessonReplayBranchMetadata(replay, rawPositionMs);
  const state = getLessonReplayStateAt(replay, metadata.positionMs, options);
  return {
    branchId: metadata.branchId,
    metadata: cloneValue(metadata),
    revision: 0,
    code: normalizeCodeState(state.code),
    board: normalizeBoardState(state.board),
  };
};

const cloneBranchForUpdate = (branch) => {
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
    throw new TypeError('Lesson replay branch must be an object');
  }
  const next = cloneValue(branch);
  next.revision = Math.max(0, Math.floor(Number(branch.revision) || 0)) + 1;
  return next;
};

export const updateLessonReplayBranchCode = (branch, update) => {
  const next = cloneBranchForUpdate(branch);
  const draft = normalizeCodeState(branch.code);
  let candidate;

  if (typeof update === 'function') {
    const result = update(draft);
    candidate = result === undefined ? draft : result;
  } else if (typeof update === 'string') {
    candidate = { ...draft, code: update };
  } else {
    candidate = {
      ...draft,
      ...(update && typeof update === 'object' ? cloneValue(update) : {}),
    };
  }

  next.code = normalizeCodeState(candidate);
  return next;
};

export const updateLessonReplayBranchBoard = (branch, update) => {
  const next = cloneBranchForUpdate(branch);
  const draft = normalizeBoardState(branch.board);
  let candidate;

  if (typeof update === 'function') {
    const result = update(draft.items, draft);
    if (Array.isArray(result)) candidate = { ...draft, items: result };
    else if (result && typeof result === 'object') candidate = { ...draft, ...result };
    else candidate = draft;
  } else if (Array.isArray(update)) {
    candidate = { ...draft, items: update };
  } else {
    candidate = {
      ...draft,
      ...(update && typeof update === 'object' ? cloneValue(update) : {}),
    };
  }

  next.board = normalizeBoardState(candidate);
  return next;
};
