const normalizePositionMs = (value) => Math.max(0, Number(value) || 0);

const getScreenOwnerRole = (event) => {
  const role = event?.payload?.sharedByRole || event?.actor?.role;
  return role === 'teacher' || role === 'student' ? role : '';
};

export const getActiveReplayScreenEvent = (events, rawPositionMs, role = 'student') => {
  const targetRole = role === 'teacher' ? 'teacher' : 'student';
  const positionMs = normalizePositionMs(rawPositionMs);
  let activeEvent = null;

  (Array.isArray(events) ? events : []).forEach((event) => {
    if (
      event?.type !== 'screen'
      || normalizePositionMs(event.offsetMs) > positionMs
      || getScreenOwnerRole(event) !== targetRole
    ) return;

    if (event.payload?.active === false) {
      activeEvent = null;
      return;
    }
    if (String(event.payload?.snapshotId || '').trim()) activeEvent = event;
  });

  return activeEvent;
};
