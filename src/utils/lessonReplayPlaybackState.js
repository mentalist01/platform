const createRoleState = () => ({
  current: null,
  navigation: null,
  task: null,
  code: null,
  codeSolutionId: null,
  codeView: null,
  board: null,
  boardView: null,
  run: null,
  screen: null,
  codeSnapshots: new Map(),
  codeRuns: new Map(),
  codeViews: new Map(),
});

const createPlaybackState = () => ({
  ...createRoleState(),
  audio: null,
  actors: {
    teacher: createRoleState(),
    student: createRoleState(),
  },
});

const clonePlaybackState = (state) => ({
  ...state,
  actors: {
    teacher: { ...state.actors.teacher },
    student: { ...state.actors.student },
  },
});

export const getLessonReplayActorRole = (event) => {
  if (
    event?.type === 'code'
    && event.payload?.action === 'snapshot'
    && event.payload?.actorVerified !== true
    && event.payload?.solutionSelected !== true
  ) return '';
  const role = event?.type === 'screen'
    ? (event?.payload?.sharedByRole || event?.actor?.role)
    : (event?.actor?.role || event?.payload?.sharedByRole);
  return role === 'teacher' || role === 'student' ? role : '';
};

export const isSharedLessonReplaySurfaceEvent = (event) => (
  ['code', 'board', 'run'].includes(event?.type)
);

export const getLessonReplayCodeSolutionId = (payload) => String(payload?.solutionId || '').trim() || 'main';

export const isPassiveLessonReplayCodeSnapshot = (event) => (
  event?.type === 'code'
  && Boolean(String(event.payload?.solutionId || '').trim())
  && event.payload?.action === 'snapshot'
  && event.payload?.solutionSelected !== true
);

export const shouldSelectLessonReplayCodeEvent = (currentCode, event) => (
  !currentCode
  || !isPassiveLessonReplayCodeSnapshot(event)
  || getLessonReplayCodeSolutionId(currentCode.payload) === getLessonReplayCodeSolutionId(event?.payload)
);

const applyEventToState = (state, event, options = {}) => {
  if (options.updateCurrent !== false && !isPassiveLessonReplayCodeSnapshot(event)) state.current = event;
  const solutionId = getLessonReplayCodeSolutionId(event.payload);
  const activeSolutionId = getLessonReplayCodeSolutionId(state.code?.payload);
  const sourceRole = event.actor?.role;
  const followsVersionedActor = options.followedRole
    && ['teacher', 'student'].includes(sourceRole)
    && (Boolean(event.payload?.solutionId) || state.codeSolutionId !== null);
  if (followsVersionedActor && sourceRole === options.followedRole) {
    if ((event.type === 'code' && (state.codeSolutionId === null || !isPassiveLessonReplayCodeSnapshot(event)))
      || event.type === 'run') state.codeSolutionId = solutionId;
  }
  const maySelectSolution = !followsVersionedActor
    || solutionId === (state.codeSolutionId || activeSolutionId)
    || (!state.code && state.codeSolutionId === null);
  if (event.type === 'task') state.task = event.payload?.active === false ? null : event;
  else if (event.type === 'screen') state.screen = event.payload?.active === false ? null : event;
  else if (event.type === 'board-view') state.boardView = event;
  else if (event.type === 'viewport' && event.payload?.surface === 'board') state.boardView = event;
  else if (event.type === 'code-view' || (event.type === 'viewport' && event.payload?.surface === 'code')) {
    // Copy on write keeps earlier indexed playback snapshots immutable.
    state.codeViews = new Map(state.codeViews).set(solutionId, event);
    if (solutionId === activeSolutionId) state.codeView = event;
  } else if (event.type === 'run') {
    state.codeRuns = new Map(state.codeRuns).set(solutionId, event);
    const matchingCode = state.codeSnapshots.get(solutionId);
    if (matchingCode && maySelectSolution) {
      state.code = matchingCode;
      state.run = event;
      state.codeView = state.codeViews.get(solutionId) || null;
    } else if (solutionId === activeSolutionId) state.run = event;
  } else if (event.type === 'code') {
    state.codeSnapshots = new Map(state.codeSnapshots).set(solutionId, event);
    // Both clients emit checkpoints while looking at independent tabs. Keep
    // their content available without treating a heartbeat as a tab click.
    if (maySelectSolution && (shouldSelectLessonReplayCodeEvent(state.code, event)
      || (followsVersionedActor && state.codeSolutionId === solutionId))) {
      state.code = event;
      state.run = state.codeRuns.get(solutionId) || null;
      state.codeView = state.codeViews.get(solutionId) || null;
    }
  }
  else if (Object.prototype.hasOwnProperty.call(state, event.type)) state[event.type] = event;
};

const applyPlaybackEvent = (state, event) => {
  applyEventToState(state, event);
  if (event.type === 'audio' && (event.payload?.url || event.payload?.playbackUrl)) state.audio = event;
  const role = getLessonReplayActorRole(event);
  if (isSharedLessonReplaySurfaceEvent(event)) {
    applyEventToState(state.actors.teacher, event, { followedRole: 'teacher', updateCurrent: role === 'teacher' || !role });
    applyEventToState(state.actors.student, event, { followedRole: 'student', updateCurrent: role === 'student' || !role });
  } else if (role) applyEventToState(state.actors[role], event);
};

const findLastEventIndexAtOrBefore = (events, positionMs) => {
  let low = 0;
  let high = events.length - 1;
  let match = -1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const offsetMs = Math.max(0, Number(events[middle]?.offsetMs) || 0);
    if (offsetMs <= positionMs) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match;
};

export const createLessonReplayPlaybackIndex = (events, rawCheckpointInterval = 128) => {
  const source = Array.isArray(events) ? events : [];
  const checkpointInterval = Math.max(16, Math.floor(Number(rawCheckpointInterval) || 128));
  const checkpoints = [];
  const state = createPlaybackState();
  source.forEach((event, index) => {
    applyPlaybackEvent(state, event);
    if ((index + 1) % checkpointInterval === 0) {
      checkpoints.push({ index, state: clonePlaybackState(state) });
    }
  });
  return { source, checkpointInterval, checkpoints };
};

export const buildLessonReplayPlaybackState = (events, rawPositionMs, playbackIndex = null) => {
  const positionMs = Math.max(0, Number(rawPositionMs) || 0);
  const source = Array.isArray(events) ? events : [];
  const targetIndex = findLastEventIndexAtOrBefore(source, positionMs);
  if (targetIndex < 0) return createPlaybackState();

  let state = createPlaybackState();
  let startIndex = 0;
  if (playbackIndex?.source === source && Array.isArray(playbackIndex.checkpoints)) {
    const checkpointNumber = Math.floor((targetIndex + 1) / playbackIndex.checkpointInterval) - 1;
    const checkpoint = checkpointNumber >= 0 ? playbackIndex.checkpoints[checkpointNumber] : null;
    if (checkpoint && checkpoint.index <= targetIndex) {
      state = clonePlaybackState(checkpoint.state);
      startIndex = checkpoint.index + 1;
    }
  }
  for (let index = startIndex; index <= targetIndex; index += 1) {
    applyPlaybackEvent(state, source[index]);
  }
  return state;
};

// Build once per recording. Queries share immutable snapshots until the next
// event, so ticking the clock does not replay the entire lesson or redraw it.
export const createLessonReplayPlaybackLookup = (events) => {
  const source = Array.isArray(events) ? events : [];
  const initialState = createPlaybackState();
  const snapshots = [];
  let previous = initialState;
  for (const event of source) {
    const state = clonePlaybackState(previous);
    applyPlaybackEvent(state, event);
    snapshots.push(state);
    previous = state;
  }
  return (rawPositionMs) => {
    const positionMs = Math.max(0, Number(rawPositionMs) || 0);
    return snapshots[findLastEventIndexAtOrBefore(source, positionMs)] || initialState;
  };
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
    if (isPassiveLessonReplayCodeSnapshot(event)) continue;
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
