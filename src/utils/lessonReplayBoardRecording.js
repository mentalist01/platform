const DEFAULT_BOARD_PAYLOAD_MAX_BYTES = 256 * 1024;

const getUtf8ByteLength = (value) => {
  const serialized = JSON.stringify(value);
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(serialized).byteLength;
  return serialized.length;
};

const normalizeBoardItemId = (item) => String(item?.id || '').trim();

const partitionBoardUpserts = (upserts, maxBytes, removedIds = []) => {
  const groups = [];
  let current = [];

  (Array.isArray(upserts) ? upserts : []).forEach((entry) => {
    const candidate = [...current, entry];
    const candidatePayload = {
      mode: 'delta',
      upserts: candidate,
      removedIds: groups.length === 0 ? removedIds : [],
    };
    if (current.length > 0 && getUtf8ByteLength(candidatePayload) > maxBytes) {
      groups.push(current);
      current = [entry];
      return;
    }
    current = candidate;
  });

  if (current.length > 0) groups.push(current);
  return groups;
};

// Board events are normalized independently by the server. Splitting large
// keyframes before upload keeps every object instead of letting the server
// silently select only the subset that fits its per-event safety limit.
export const splitLessonReplayBoardPayload = (
  payload,
  maxBytes = DEFAULT_BOARD_PAYLOAD_MAX_BYTES
) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  const normalizedMaxBytes = Math.max(16 * 1024, Number(maxBytes) || DEFAULT_BOARD_PAYLOAD_MAX_BYTES);
  if (getUtf8ByteLength(source) <= normalizedMaxBytes) return [source];

  if (source.mode === 'delta') {
    const removedIds = Array.isArray(source.removedIds) ? source.removedIds : [];
    const groups = partitionBoardUpserts(source.upserts, normalizedMaxBytes, removedIds);
    if (groups.length === 0) return [source];
    return groups.map((upserts, index) => ({
      mode: 'delta',
      upserts,
      removedIds: index === 0 ? removedIds : [],
    }));
  }

  const items = Array.isArray(source.items) ? source.items : [];
  const indexedItems = items.map((item, index) => ({ index, item }));
  const groups = partitionBoardUpserts(indexedItems, normalizedMaxBytes);
  if (groups.length <= 1) return [source];
  return groups.map((group, index) => (
    index === 0
      ? { mode: 'snapshot', items: group.map((entry) => entry.item) }
      : { mode: 'delta', upserts: group, removedIds: [] }
  ));
};

export const createLessonReplayBoardRecordingState = () => ({
  initialized: false,
  itemIds: new Set(),
});

const applyBoardPayloadToRecordingState = (state, payload) => {
  const source = state && typeof state === 'object'
    ? state
    : createLessonReplayBoardRecordingState();
  const currentIds = new Set(source.itemIds instanceof Set ? source.itemIds : []);

  if (payload?.mode === 'delta') {
    (Array.isArray(payload.removedIds) ? payload.removedIds : []).forEach((id) => {
      currentIds.delete(String(id || '').trim());
    });
    (Array.isArray(payload.upserts) ? payload.upserts : []).forEach((entry) => {
      const id = normalizeBoardItemId(entry?.item || entry);
      if (id) currentIds.add(id);
    });
    return { initialized: true, itemIds: currentIds };
  }

  const snapshotIds = new Set(
    (Array.isArray(payload?.items) ? payload.items : [])
      .map(normalizeBoardItemId)
      .filter(Boolean)
  );
  return { initialized: true, itemIds: snapshotIds };
};

export const evaluateLessonReplayBoardPayload = (state, payload) => {
  const source = state && typeof state === 'object'
    ? state
    : createLessonReplayBoardRecordingState();
  const isPassiveEmptySnapshot = (
    payload?.mode !== 'delta'
    && Array.isArray(payload?.items)
    && payload.items.length === 0
    && payload.actorVerified !== true
  );
  if (isPassiveEmptySnapshot && source.initialized && source.itemIds?.size > 0) {
    return { accepted: false, state: source };
  }
  return {
    accepted: true,
    state: applyBoardPayloadToRecordingState(source, payload),
  };
};
