const createRoleState = () => ({
  current: null,
  navigation: null,
  task: null,
  code: null,
  codeView: null,
  board: null,
  boardView: null,
  run: null,
  screen: null,
});

export const getLessonReplayActorRole = (event) => {
  const role = event?.type === 'screen'
    ? (event?.payload?.sharedByRole || event?.actor?.role)
    : (event?.actor?.role || event?.payload?.sharedByRole);
  return role === 'teacher' || role === 'student' ? role : '';
};

export const isSharedLessonReplaySurfaceEvent = (event) => (
  ['code', 'board', 'run'].includes(event?.type)
);

const applyEventToState = (state, event, options = {}) => {
  if (options.updateCurrent !== false) state.current = event;
  if (event.type === 'task') state.task = event.payload?.active === false ? null : event;
  else if (event.type === 'screen') state.screen = event.payload?.active === false ? null : event;
  else if (event.type === 'board-view') state.boardView = event;
  else if (event.type === 'code-view') state.codeView = event;
  else if (event.type === 'viewport' && event.payload?.surface === 'board') state.boardView = event;
  else if (event.type === 'viewport' && event.payload?.surface === 'code') state.codeView = event;
  else if (Object.prototype.hasOwnProperty.call(state, event.type)) state[event.type] = event;
};

export const buildLessonReplayPlaybackState = (events, rawPositionMs) => {
  const positionMs = Math.max(0, Number(rawPositionMs) || 0);
  const state = {
    ...createRoleState(),
    audio: null,
    actors: {
      teacher: createRoleState(),
      student: createRoleState(),
    },
  };
  for (const event of Array.isArray(events) ? events : []) {
    if (Math.max(0, Number(event?.offsetMs) || 0) > positionMs) break;
    applyEventToState(state, event);
    if (event.type === 'audio' && (event.payload?.url || event.payload?.playbackUrl)) state.audio = event;
    const role = getLessonReplayActorRole(event);
    if (isSharedLessonReplaySurfaceEvent(event)) {
      applyEventToState(state.actors.teacher, event, { updateCurrent: role === 'teacher' || !role });
      applyEventToState(state.actors.student, event, { updateCurrent: role === 'student' || !role });
    } else if (role) applyEventToState(state.actors[role], event);
  }
  return state;
};

const getSurfaceForEvent = (event) => {
  if (event?.type === 'board' || event?.type === 'board-view') return 'board';
  if (event?.type === 'code' || event?.type === 'code-view' || event?.type === 'run') return 'code';
  if (event?.type === 'viewport') return event.payload?.surface === 'code' ? 'code' : 'board';
  if (event?.type === 'navigation') {
    if (event.payload?.view === 'board') return 'board';
    if (['collab', 'python'].includes(event.payload?.view)) return 'code';
  }
  return '';
};

export const getLessonReplayFollowSurface = (events, rawPositionMs, role) => {
  const positionMs = Math.max(0, Number(rawPositionMs) || 0);
  let screenEnded = false;
  let sharedFallback = '';
  const source = Array.isArray(events) ? events : [];
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const event = source[index];
    if (Math.max(0, Number(event?.offsetMs) || 0) > positionMs) continue;
    const eventRole = getLessonReplayActorRole(event);
    if (isSharedLessonReplaySurfaceEvent(event) && eventRole !== role) {
      if (!sharedFallback) sharedFallback = getSurfaceForEvent(event);
      continue;
    }
    if (eventRole !== role) continue;
    if (event.type === 'screen') {
      if (event.payload?.active === false) {
        screenEnded = true;
        continue;
      }
      if (!screenEnded) return 'screen';
      continue;
    }
    const surface = getSurfaceForEvent(event);
    if (surface) return surface;
  }
  return sharedFallback || 'board';
};
