const getItemId = (item) => String(item?.id || '').trim();

// Older recordings could retain a passive participant's board checkpoint
// before the author's own event arrived. New stroke objects still carry their
// real authorId, so use it only for an unambiguous all-new delta.
export const repairLessonReplayBoardActors = (events) => {
  const source = Array.isArray(events) ? events : [];
  const actorsById = new Map();
  source.forEach((event) => {
    const actorId = String(event?.actor?.id || '').trim();
    if (actorId && !actorsById.has(actorId)) actorsById.set(actorId, event.actor);
  });

  const currentItemIds = new Set();
  return source.map((event) => {
    if (event?.type !== 'board') return event;
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    let nextEvent = event;

    if (payload.mode === 'delta') {
      const upserts = (Array.isArray(payload.upserts) ? payload.upserts : [])
        .map((entry) => entry?.item)
        .filter((item) => getItemId(item));
      const allUpsertsAreNew = upserts.length > 0
        && upserts.every((item) => !currentItemIds.has(getItemId(item)));
      const authorIds = new Set(
        upserts.map((item) => String(item?.authorId || '').trim()).filter(Boolean)
      );
      const inferredActor = allUpsertsAreNew && authorIds.size === 1
        ? actorsById.get([...authorIds][0])
        : null;
      if (payload.actorVerified === true) {
        nextEvent = event;
      } else if (inferredActor && inferredActor.id !== event.actor?.id) {
        nextEvent = { ...event, actor: { ...inferredActor } };
      } else if (!inferredActor) {
        nextEvent = { ...event, actor: null };
      }

      (Array.isArray(payload.removedIds) ? payload.removedIds : [])
        .forEach((id) => currentItemIds.delete(String(id || '').trim()));
      upserts.forEach((item) => currentItemIds.add(getItemId(item)));
    } else {
      if (payload.actorVerified !== true) nextEvent = { ...event, actor: null };
      currentItemIds.clear();
      (Array.isArray(payload.items) ? payload.items : [])
        .forEach((item) => {
          const id = getItemId(item);
          if (id) currentItemIds.add(id);
        });
    }

    return nextEvent;
  });
};
