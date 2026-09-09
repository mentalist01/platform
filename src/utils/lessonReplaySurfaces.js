const normalizePositionMs = (value) => Math.max(0, Number(value) || 0);

const getScreenOwnerRole = (event) => {
  const role = event?.payload?.sharedByRole || event?.actor?.role;
  return role === 'teacher' || role === 'student' ? role : '';
};

const isReplayScreenSnapshot = (event) => (
  event?.type === 'screen'
  && event?.payload?.active !== false
  && Boolean(String(event?.payload?.snapshotId || '').trim())
);

export const getReplayScreenSnapshotEvents = (events) => (
  (Array.isArray(events) ? events : [])
    .filter(isReplayScreenSnapshot)
    .sort((left, right) => normalizePositionMs(left?.offsetMs) - normalizePositionMs(right?.offsetMs))
);

export const findReplayScreenJumpEvent = (events, rawPositionMs) => {
  const positionMs = normalizePositionMs(rawPositionMs);
  const snapshots = getReplayScreenSnapshotEvents(events);
  return snapshots.find((event) => normalizePositionMs(event.offsetMs) >= positionMs)
    || snapshots[0]
    || null;
};

export const getActiveReplayScreenEvent = (events, rawPositionMs, role = 'student') => {
  const targetRole = role === 'teacher' || role === 'student' ? role : '';
  const positionMs = normalizePositionMs(rawPositionMs);
  const activeByRole = new Map();

  (Array.isArray(events) ? events : []).forEach((event) => {
    const ownerRole = getScreenOwnerRole(event);
    if (
      event?.type !== 'screen'
      || normalizePositionMs(event.offsetMs) > positionMs
      || !ownerRole
      || (targetRole && ownerRole !== targetRole)
    ) return;

    if (event.payload?.active === false) {
      activeByRole.delete(ownerRole);
      return;
    }
    if (String(event.payload?.snapshotId || '').trim()) activeByRole.set(ownerRole, event);
  });

  if (targetRole) return activeByRole.get(targetRole) || null;
  return Array.from(activeByRole.values()).reduce((latest, event) => (
    !latest || normalizePositionMs(event.offsetMs) >= normalizePositionMs(latest.offsetMs)
      ? event
      : latest
  ), null);
};
