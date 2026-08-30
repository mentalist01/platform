import { compactLessonReplayBoardItems, splitLessonReplayBoardPayload } from '../src/utils/lessonReplayBoardRecording.js';

const getItemId = (item) => String(item?.id || '').trim();
const getOffsetMs = (event) => Math.max(0, Math.round(Number(event?.offsetMs) || 0));

const getBoardPayloadItems = (payload = {}) => (
  payload.mode === 'delta'
    ? (Array.isArray(payload.upserts) ? payload.upserts.map((entry) => entry?.item) : [])
    : (Array.isArray(payload.items) ? payload.items : [])
);

const getReplayActorsById = (events) => {
  const actors = new Map();
  (Array.isArray(events) ? events : []).forEach((event) => {
    const id = String(event?.actor?.id || '').trim();
    if (id && !actors.has(id)) actors.set(id, event.actor);
  });
  return actors;
};

const getFallbackActor = (replay, actorsById) => (
  [...actorsById.values()].find((actor) => actor?.role === 'teacher')
  || [...actorsById.values()][0]
  || {
    id: String(replay?.occurrence?.studentId || '').trim(),
    role: 'student',
    name: '',
  }
);

const buildRecoveryId = (offsetMs, actorId, sequence, part) => (
  `board-recovery-${Math.max(0, Math.round(Number(offsetMs) || 0)).toString(36)}`
  + `-${String(actorId || 'unknown').replace(/[^0-9a-z-]/gi, '').slice(0, 32) || 'unknown'}`
  + `-${sequence}-${part}`
);

export const buildLessonReplayBoardRecovery = (replay, rawFinalItems, options = {}) => {
  const sourceEvents = Array.isArray(replay?.events) ? replay.events.filter(Boolean) : [];
  const finalItems = compactLessonReplayBoardItems(rawFinalItems, {
    maxItems: Math.max(1, Math.round(Number(options.maxItems) || 2500)),
  });
  const finalIndexById = new Map();
  finalItems.forEach((item, index) => {
    const id = getItemId(item);
    if (id && !finalIndexById.has(id)) finalIndexById.set(id, index);
  });

  const knownIds = new Set();
  sourceEvents.forEach((event) => {
    if (event?.type !== 'board') return;
    getBoardPayloadItems(event.payload).forEach((item) => {
      const id = getItemId(item);
      if (id) knownIds.add(id);
    });
  });

  const missing = finalItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !knownIds.has(getItemId(item)));
  const actorsById = getReplayActorsById(sourceEvents);
  const fallbackActor = getFallbackActor(replay, actorsById);
  const timelineStartMs = Number(replay?.timelineStartMs) || Number(replay?.occurrence?.startMs) || 0;
  const boardEvents = sourceEvents
    .map((event, sourceIndex) => ({ event, sourceIndex }))
    .filter(({ event }) => event?.type === 'board')
    .sort((left, right) => getOffsetMs(left.event) - getOffsetMs(right.event) || left.sourceIndex - right.sourceIndex);
  const recoveryEvents = [];
  let missingCursor = 0;
  let frontier = -1;
  let recoverySequence = 0;

  const appendRecoveryItems = (entries, rawOffsetMs) => {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const offsetMs = Math.max(0, Math.round(Number(rawOffsetMs) || 0));
    const byActorId = new Map();
    entries.forEach((entry) => {
      const actorId = String(entry.item?.authorId || fallbackActor.id || '').trim();
      if (!byActorId.has(actorId)) byActorId.set(actorId, []);
      byActorId.get(actorId).push(entry);
    });
    byActorId.forEach((actorEntries, actorId) => {
      const sequence = recoverySequence;
      recoverySequence += 1;
      const actor = actorsById.get(actorId) || {
        ...fallbackActor,
        ...(actorId ? { id: actorId } : {}),
      };
      const payloads = splitLessonReplayBoardPayload({
        mode: 'delta',
        upserts: actorEntries.map(({ item, index }) => ({ index, item })),
        removedIds: [],
      });
      payloads.forEach((payload, part) => {
        recoveryEvents.push({
          id: buildRecoveryId(offsetMs, actor.id, sequence, part),
          type: 'board',
          occurredAt: new Date(timelineStartMs + offsetMs).toISOString(),
          offsetMs,
          actor: {
            id: String(actor.id || '').trim(),
            role: ['teacher', 'student'].includes(actor.role) ? actor.role : '',
            name: String(actor.name || '').trim(),
          },
          payload: {
            ...payload,
            actorVerified: false,
            recoveredFromBoardSnapshot: true,
          },
        });
      });
    });
  };

  boardEvents.forEach(({ event }) => {
    getBoardPayloadItems(event.payload).forEach((item) => {
      const finalIndex = finalIndexById.get(getItemId(item));
      if (Number.isFinite(finalIndex)) frontier = Math.max(frontier, finalIndex);
    });
    if (frontier < 0) return;
    const recoveredAtEvent = [];
    while (missingCursor < missing.length && missing[missingCursor].index <= frontier) {
      recoveredAtEvent.push(missing[missingCursor]);
      missingCursor += 1;
    }
    appendRecoveryItems(recoveredAtEvent, getOffsetMs(event) + 1);
  });

  const lastOffsetMs = sourceEvents.reduce((maximum, event) => (
    Math.max(maximum, getOffsetMs(event))
  ), 0);
  const recoveredAtEnd = missing.slice(missingCursor);
  appendRecoveryItems(recoveredAtEnd, lastOffsetMs + 1);

  return {
    events: recoveryEvents,
    stats: {
      finalItemCount: finalItems.length,
      knownFinalItemCount: finalItems.length - missing.length,
      recoveredItemCount: missing.length,
      inferredItemCount: missing.length - recoveredAtEnd.length,
      recoveredAtEndCount: recoveredAtEnd.length,
      finalFrontier: frontier,
    },
  };
};
