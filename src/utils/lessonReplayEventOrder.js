// Replay events are usually ordered by their normalized timeline offset.  A
// number of older recordings, however, contain several events at offset 0
// because they happened before the scheduled lesson start.  Never use the
// random event id as a tie breaker: it can put a board delta before the
// snapshot it belongs to and make the same recording render differently on
// every load.
const parseOccurredAt = (event) => {
  const value = Date.parse(String(event?.occurredAt || '').trim());
  return Number.isFinite(value) ? value : null;
};

export const compareLessonReplayEvents = (left, right) => {
  const leftOffset = Number(left?.offsetMs);
  const rightOffset = Number(right?.offsetMs);
  const normalizedLeftOffset = Number.isFinite(leftOffset) ? leftOffset : 0;
  const normalizedRightOffset = Number.isFinite(rightOffset) ? rightOffset : 0;
  if (normalizedLeftOffset !== normalizedRightOffset) {
    return normalizedLeftOffset - normalizedRightOffset;
  }

  const leftOccurredAt = parseOccurredAt(left);
  const rightOccurredAt = parseOccurredAt(right);
  if (leftOccurredAt !== null && rightOccurredAt !== null && leftOccurredAt !== rightOccurredAt) {
    return leftOccurredAt - rightOccurredAt;
  }
  if (leftOccurredAt === null && rightOccurredAt !== null) return 1;
  if (leftOccurredAt !== null && rightOccurredAt === null) return -1;
  return 0;
};

export const sortLessonReplayEvents = (events) => (
  (Array.isArray(events) ? events : [])
    .map((event, sourceIndex) => ({ event, sourceIndex }))
    .sort((left, right) => (
      compareLessonReplayEvents(left.event, right.event)
      || left.sourceIndex - right.sourceIndex
    ))
    .map(({ event }) => event)
);
