const MAX_ENTITY_ID_LENGTH = 160;
const MAX_ROOM_ID_LENGTH = 760;
const MAX_ATTENDANCE_COMMENT_LENGTH = 1000;

const LESSON_ROOM_PREFIX = 'lesson:';
const LESSON_RTC_ROOM_PREFIX = 'rtc:lesson:';
const LESSON_BOARD_DOC_PREFIX = 'board-lesson-';
const LESSON_COLLAB_DOC_PREFIX = 'collab-lesson-';

const SAFE_ROOM_TOKEN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._~-]*$/;
const INACTIVE_MEMBER_STATUSES = new Set(['left', 'removed', 'inactive', 'declined']);

export const LEARNING_ATTENDANCE_STATUS = Object.freeze({
  PENDING: 'pending',
  PRESENT: 'present',
  PARTIAL: 'partial',
  ABSENT: 'absent',
  EXCUSED: 'excused',
});

const LEARNING_ATTENDANCE_STATUSES = new Set(Object.values(LEARNING_ATTENDANCE_STATUS));

const isPlainObject = (value) => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
);

const normalizeText = (value, maxLength = MAX_ENTITY_ID_LENGTH) => (
  String(value || '').trim().slice(0, maxLength)
);

const normalizeRoomToken = (value) => {
  const normalized = normalizeText(value);
  return normalized && SAFE_ROOM_TOKEN_PATTERN.test(normalized) ? normalized : '';
};

const normalizeIsoTimestamp = (value) => {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
};

const getLatestIsoTimestamp = (left, right) => {
  const leftIso = normalizeIsoTimestamp(left);
  const rightIso = normalizeIsoTimestamp(right);
  if (!leftIso) return rightIso;
  if (!rightIso) return leftIso;
  return Date.parse(rightIso) >= Date.parse(leftIso) ? rightIso : leftIso;
};

const getEarliestIsoTimestamp = (left, right) => {
  const leftIso = normalizeIsoTimestamp(left);
  const rightIso = normalizeIsoTimestamp(right);
  if (!leftIso) return rightIso;
  if (!rightIso) return leftIso;
  return Date.parse(rightIso) <= Date.parse(leftIso) ? rightIso : leftIso;
};

const getLearningLessonWindowState = (session, nowMs = Date.now()) => {
  const startMs = Date.parse(String(session?.startAt || '').trim());
  const durationMinutes = Math.max(15, Number(session?.durationMinutes) || 60);
  const endMs = Number.isFinite(startMs)
    ? startMs + durationMinutes * 60 * 1000
    : NaN;
  return {
    startMs,
    endMs,
    notStarted: Number.isFinite(startMs) && startMs > nowMs,
    past: Number.isFinite(endMs) && endMs <= nowMs,
  };
};

const normalizeCollection = (value, propertyName) => {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value) && Array.isArray(value[propertyName])) return value[propertyName];
  return [];
};

const normalizeRoomId = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > MAX_ROOM_ID_LENGTH) return '';
  if (
    normalized.includes('\0')
    || normalized.includes('\r')
    || normalized.includes('\n')
    || normalized.includes('\\')
    || normalized.includes('/')
  ) return '';
  return normalized;
};

export const buildLearningLessonRoomId = (sessionId) => {
  const normalizedSessionId = normalizeRoomToken(sessionId);
  return normalizedSessionId ? `${LESSON_ROOM_PREFIX}${normalizedSessionId}` : '';
};

export const buildLearningLessonRtcRoomId = (sessionId) => {
  const normalizedSessionId = normalizeRoomToken(sessionId);
  return normalizedSessionId ? `${LESSON_RTC_ROOM_PREFIX}${normalizedSessionId}` : '';
};

export const buildLearningLessonBoardDocName = (sessionId) => {
  const normalizedSessionId = normalizeRoomToken(sessionId);
  return normalizedSessionId ? `${LESSON_BOARD_DOC_PREFIX}${normalizedSessionId}` : '';
};

export const buildLearningLessonCollabDocName = (sessionId) => {
  const normalizedSessionId = normalizeRoomToken(sessionId);
  return normalizedSessionId ? `${LESSON_COLLAB_DOC_PREFIX}${normalizedSessionId}` : '';
};

export const buildLearningLessonRoomNames = (sessionId) => {
  const normalizedSessionId = normalizeRoomToken(sessionId);
  if (!normalizedSessionId) return null;
  return {
    sessionId: normalizedSessionId,
    roomId: buildLearningLessonRoomId(normalizedSessionId),
    rtcRoomId: buildLearningLessonRtcRoomId(normalizedSessionId),
    boardDocName: buildLearningLessonBoardDocName(normalizedSessionId),
    collabDocName: buildLearningLessonCollabDocName(normalizedSessionId),
  };
};

export const parseLearningLessonRoomTarget = (value) => {
  const roomId = normalizeRoomId(value);
  if (!roomId) return null;

  const prefixes = [
    { prefix: LESSON_RTC_ROOM_PREFIX, kind: 'rtc' },
    { prefix: LESSON_BOARD_DOC_PREFIX, kind: 'board' },
    { prefix: LESSON_COLLAB_DOC_PREFIX, kind: 'collab' },
    { prefix: LESSON_ROOM_PREFIX, kind: 'lesson' },
  ];
  const match = prefixes.find((entry) => roomId.startsWith(entry.prefix));
  if (!match) return null;
  const sessionId = normalizeRoomToken(roomId.slice(match.prefix.length));
  if (!sessionId) return null;
  const names = buildLearningLessonRoomNames(sessionId);
  const expectedRoomId = {
    lesson: names.roomId,
    rtc: names.rtcRoomId,
    board: names.boardDocName,
    collab: names.collabDocName,
  }[match.kind];
  if (expectedRoomId !== roomId) return null;
  return {
    targetType: 'lesson',
    kind: match.kind,
    sessionId,
    roomId,
    canonicalRoomId: names.roomId,
    legacy: false,
  };
};

export const getLearningLessonParticipantIds = (session) => {
  if (!isPlainObject(session)) return [];
  const source = Array.isArray(session.participantIds)
    ? session.participantIds
    : (Array.isArray(session.studentIds) ? session.studentIds : []);
  return Array.from(new Set(source.map((value) => normalizeText(value)).filter(Boolean)));
};

const findLearningGroupForSession = (session, groups) => {
  const groupId = normalizeText(session?.groupId);
  if (!groupId) return null;
  return normalizeCollection(groups, 'groups').find((entry) => normalizeText(entry?.id) === groupId) || null;
};

export const isActiveLearningGroupMember = (member) => {
  if (typeof member === 'string') return Boolean(normalizeText(member));
  if (!isPlainObject(member) || !normalizeText(member.studentId || member.id)) return false;
  if (normalizeIsoTimestamp(member.leftAt)) return false;
  const status = normalizeText(member.status, 40).toLowerCase();
  return !INACTIVE_MEMBER_STATUSES.has(status);
};

export const canAccessLearningLessonSession = (auth, session, options = {}) => {
  const sessionId = normalizeText(session?.id);
  if (!auth || !sessionId) return false;
  const role = normalizeText(auth.role, 40).toLowerCase();
  const authId = normalizeText(auth.id);
  if (!role || !authId) return false;
  if (role === 'admin') return true;

  const group = options.group || findLearningGroupForSession(session, options.groups);
  const teacherId = normalizeText(session.teacherId || group?.teacherId);
  if (role === 'teacher') return Boolean(teacherId && authId === teacherId);
  if (role !== 'student') return false;

  const member = group && Array.isArray(group.members)
    ? group.members.find((entry) => (
      normalizeText(typeof entry === 'string' ? entry : (entry?.studentId || entry?.id)) === authId
    ))
    : null;
  if (getLearningLessonParticipantIds(session).includes(authId)) {
    // A removed student keeps the historical lesson snapshot, but not a
    // future lesson that happened to retain the old participantIds array.
    if (!member || isActiveLearningGroupMember(member)) return true;
    const leftAtMs = Date.parse(String(member?.leftAt || '').trim());
    const lessonAtMs = Date.parse(String(session?.startAt || session?.createdAt || '').trim());
    const lessonDurationMs = Math.max(15, Number(session?.durationMinutes) || 60) * 60 * 1000;
    const lessonEndMs = Number.isFinite(lessonAtMs) ? lessonAtMs + lessonDurationMs : NaN;
    // A stale `active` snapshot must not reopen the room for somebody who was
    // removed before that lesson ended.  The lifecycle sweep will eventually
    // mark it completed, but the ACL remains safe in the meantime.
    if (session?.status === 'active'
      && Number.isFinite(leftAtMs)
      && Number.isFinite(lessonEndMs)
      && leftAtMs < lessonEndMs) return false;
    const lessonHasEnded = session?.status === 'completed'
      || (Number.isFinite(lessonEndMs) && lessonEndMs <= Date.now());
    if (lessonHasEnded) {
      // Once the room is closed, preserve the historical snapshot even when
      // the participant left part-way through that lesson.
      return !Number.isFinite(leftAtMs)
        || !Number.isFinite(lessonAtMs)
        || lessonAtMs <= leftAtMs;
    }
    return !Number.isFinite(leftAtMs)
      || !Number.isFinite(lessonAtMs)
      || (Number.isFinite(lessonEndMs) && lessonEndMs <= leftAtMs);
  }
  if (!group || normalizeText(group.id) !== normalizeText(session.groupId)) return false;
  if (teacherId && normalizeText(group.teacherId) && normalizeText(group.teacherId) !== teacherId) return false;
  return (Array.isArray(group.members) ? group.members : []).some((member) => (
    normalizeText(typeof member === 'string' ? member : (member?.studentId || member?.id)) === authId
    && isActiveLearningGroupMember(member)
  ));
};

const buildLegacyRoomNames = (student) => {
  const studentId = normalizeText(student?.id);
  const teacherId = normalizeText(student?.teacherId);
  if (!studentId || !teacherId) return null;
  return {
    board: `board-${teacherId}-${studentId}`,
    collab: `collab-${teacherId}-${studentId}`,
    rtc: `rtc:${teacherId}:${studentId}`,
    pythonPrefix: `py-collab:py-sync:${studentId}:`,
  };
};

export const resolveLegacyLearningRoomTarget = (value, students) => {
  const roomId = normalizeRoomId(value);
  if (!roomId) return null;
  const entries = normalizeCollection(students, 'students');
  for (const student of entries) {
    const names = buildLegacyRoomNames(student);
    if (!names) continue;
    const exactKind = ['board', 'collab', 'rtc'].find((kind) => names[kind] === roomId);
    const isPythonRoom = roomId.startsWith(names.pythonPrefix)
      && roomId.length > names.pythonPrefix.length;
    if (!exactKind && !isPythonRoom) continue;
    return {
      targetType: 'student',
      kind: exactKind || 'python',
      teacherId: normalizeText(student.teacherId),
      studentId: normalizeText(student.id),
      roomId,
      legacy: true,
      student,
    };
  }
  return null;
};

export const canAccessLegacyLearningRoom = (auth, target) => {
  if (!auth || !target || target.targetType !== 'student') return false;
  const role = normalizeText(auth.role, 40).toLowerCase();
  const authId = normalizeText(auth.id);
  if (!role || !authId) return false;
  if (role === 'admin') return true;
  if (target.student?.deletedAt) return false;
  if (role === 'teacher') return authId === normalizeText(target.teacherId);
  if (role === 'student') {
    return authId === normalizeText(target.studentId)
      && (!normalizeText(auth.teacherId) || normalizeText(auth.teacherId) === normalizeText(target.teacherId));
  }
  return false;
};

export const hasActiveLearningGroupWorkspace = (studentIdValue, teacherIdValue, groups) => {
  const studentId = normalizeText(studentIdValue);
  const teacherId = normalizeText(teacherIdValue);
  if (!studentId || !teacherId) return false;
  return normalizeCollection(groups, 'groups').some((group) => (
    // Forming/ready groups already own the student's shared workspace.  Only
    // a completed group releases the legacy individual board/code room.
    ['forming', 'ready', 'active'].includes(normalizeText(group?.status, 40).toLowerCase())
    && normalizeText(group?.teacherId) === teacherId
    && (Array.isArray(group?.members) ? group.members : []).some((member) => (
      normalizeText(typeof member === 'string' ? member : (member?.studentId || member?.id)) === studentId
      && isActiveLearningGroupMember(member)
    ))
  ));
};

export const resolveLearningRealtimeRoomTarget = ({ roomId, sessions, students } = {}) => {
  const parsedLessonTarget = parseLearningLessonRoomTarget(roomId);
  if (parsedLessonTarget) {
    const session = normalizeCollection(sessions, 'sessions').find((entry) => (
      normalizeText(entry?.id) === parsedLessonTarget.sessionId
    ));
    if (session) return { ...parsedLessonTarget, session };
  }

  // Resolve legacy rooms by comparing complete generated names. Splitting on '-'
  // is ambiguous because both existing teacher and student ids may contain it.
  return resolveLegacyLearningRoomTarget(roomId, students);
};

export const authorizeLearningRealtimeRoom = ({
  auth,
  roomId,
  sessions,
  groups,
  students,
  allowedKinds,
  allowedSessionStatuses,
  authorizeAdditionalRoom,
} = {}) => {
  if (!auth || !normalizeText(auth.id) || !normalizeText(auth.role, 40)) {
    return { allowed: false, reason: 'unauthenticated', target: null };
  }
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedRoomId) return { allowed: false, reason: 'invalid-room', target: null };

  const target = resolveLearningRealtimeRoomTarget({
    roomId: normalizedRoomId,
    sessions,
    students,
  });
  if (!target) {
    const additional = typeof authorizeAdditionalRoom === 'function'
      ? authorizeAdditionalRoom({ auth, roomId: normalizedRoomId })
      : null;
    if (additional === true || additional?.allowed === true) {
      return {
        allowed: true,
        reason: '',
        target: additional?.target || {
          targetType: 'registered',
          kind: additional?.kind || 'registered',
          roomId: normalizedRoomId,
          legacy: true,
        },
      };
    }
    return { allowed: false, reason: 'unknown-room', target: null };
  }

  const acceptedKinds = Array.isArray(allowedKinds)
    ? new Set(allowedKinds.map((value) => normalizeText(value, 40)).filter(Boolean))
    : null;
  if (acceptedKinds && !acceptedKinds.has(target.kind)) {
    return { allowed: false, reason: 'invalid-room-kind', target };
  }

  const acceptedSessionStatuses = Array.isArray(allowedSessionStatuses)
    ? new Set(allowedSessionStatuses.map((value) => normalizeText(value, 40)).filter(Boolean))
    : null;
  if (
    target.targetType === 'lesson'
    && acceptedSessionStatuses
    && !acceptedSessionStatuses.has(normalizeText(target.session?.status, 40))
  ) {
    return { allowed: false, reason: 'session-not-live', target };
  }

  const windowState = target.targetType === 'lesson'
    ? getLearningLessonWindowState(target.session)
    : { notStarted: false, past: false };
  // A scheduled room may be opened by the teacher for preparation, but a
  // student must not enter the call before its start time.  Past lesson rooms
  // remain readable for board/code history, never writable.
  if (
    target.targetType === 'lesson'
    && target.kind === 'rtc'
    && (windowState.notStarted || windowState.past)
    && normalizeText(auth.role, 40).toLowerCase() === 'student'
  ) {
    return { allowed: false, reason: 'session-not-live', target, windowState };
  }

  if (
    target.targetType === 'student'
    && ['board', 'collab'].includes(target.kind)
    && hasActiveLearningGroupWorkspace(target.studentId, target.teacherId, groups)
  ) {
    return { allowed: false, reason: 'group-workspace-required', target };
  }

  const allowed = target.targetType === 'lesson'
    ? canAccessLearningLessonSession(auth, target.session, { groups })
    : canAccessLegacyLearningRoom(auth, target);
  return {
    allowed,
    reason: allowed ? '' : 'forbidden',
    target,
    windowState,
    readOnly: target.targetType === 'lesson' && (
      windowState.past
      || windowState.notStarted
      || normalizeText(target.session?.status, 40).toLowerCase() === 'completed'
      || normalizeText(target.session?.status, 40).toLowerCase() === 'cancelled'
    ),
  };
};

export const extractCollabDocNameFromRequestUrl = (requestUrl) => {
  try {
    const url = new URL(String(requestUrl || ''), 'http://learning-collab.local');
    const prefix = '/collab/';
    if (!url.pathname.startsWith(prefix)) return '';
    const encodedName = url.pathname.slice(prefix.length);
    if (!encodedName || encodedName.includes('/')) return '';
    const decodedName = decodeURIComponent(encodedName);
    return normalizeRoomId(decodedName);
  } catch {
    return '';
  }
};

// Intended upgrade flow:
// 1. resolve the auth session before handleUpgrade;
// 2. call this helper with the current lesson/group/student stores;
// 3. reject unless `allowed`; then pass the unchanged request to y-websocket.
// `authorizeAdditionalRoom` is deliberately an explicit registry callback so
// existing sandbox documents can be retained without allowing arbitrary names.
export const authorizeLearningCollabUpgrade = ({ requestUrl, ...options } = {}) => {
  const docName = extractCollabDocNameFromRequestUrl(requestUrl);
  if (!docName) return { allowed: false, reason: 'invalid-room', target: null, docName: '' };
  const access = authorizeLearningRealtimeRoom({
    ...options,
    roomId: docName,
    allowedKinds: ['board', 'collab', 'python'],
    allowedSessionStatuses: Array.isArray(options.allowedSessionStatuses)
      ? options.allowedSessionStatuses
      : ['scheduled', 'active', 'completed'],
  });
  const readOnly = Boolean(
    access.allowed
    && access.target?.targetType === 'lesson'
    && (access.readOnly || normalizeText(access.target?.session?.status, 40) === 'completed')
  );
  return { ...access, readOnly, docName };
};

const normalizeAttendanceStatus = (value, fallback = LEARNING_ATTENDANCE_STATUS.PENDING) => {
  const normalized = normalizeText(value, 40).toLowerCase();
  return LEARNING_ATTENDANCE_STATUSES.has(normalized) ? normalized : fallback;
};

const normalizePresentSeconds = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(numeric));
};

const normalizeConnectionIds = (value) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
)).slice(0, 50);

export const buildLearningAttendanceKey = (sessionId, studentId) => {
  const normalizedSessionId = normalizeText(sessionId);
  const normalizedStudentId = normalizeText(studentId);
  return normalizedSessionId && normalizedStudentId
    ? `${normalizedSessionId}:${normalizedStudentId}`
    : '';
};

export const normalizeLearningAttendanceRecord = (value) => {
  if (!isPlainObject(value)) return null;
  const sessionId = normalizeText(value.sessionId);
  const studentId = normalizeText(value.studentId);
  if (!sessionId || !studentId) return null;
  const firstJoinedAt = normalizeIsoTimestamp(value.firstJoinedAt);
  const activeConnectionIds = normalizeConnectionIds(value.activeConnectionIds);
  const activeSince = activeConnectionIds.length > 0
    ? normalizeIsoTimestamp(value.activeSince || value.lastJoinedAt || firstJoinedAt)
    : '';
  const fallbackStatus = firstJoinedAt
    ? LEARNING_ATTENDANCE_STATUS.PRESENT
    : LEARNING_ATTENDANCE_STATUS.PENDING;
  const presentSeconds = normalizePresentSeconds(value.presentSeconds ?? value.attendedSeconds);
  return {
    id: normalizeText(value.id) || buildLearningAttendanceKey(sessionId, studentId),
    groupId: normalizeText(value.groupId),
    sessionId,
    studentId,
    status: normalizeAttendanceStatus(value.status, fallbackStatus),
    presentSeconds,
    attendedSeconds: presentSeconds,
    firstJoinedAt,
    lastJoinedAt: normalizeIsoTimestamp(value.lastJoinedAt || firstJoinedAt),
    lastLeftAt: normalizeIsoTimestamp(value.lastLeftAt),
    activeSince,
    activeConnectionIds,
    markedAt: normalizeIsoTimestamp(value.markedAt),
    markedById: normalizeText(value.markedById),
    comment: normalizeText(value.comment, MAX_ATTENDANCE_COMMENT_LENGTH),
  };
};

export const normalizeLearningAttendanceRecords = (value) => {
  const source = normalizeCollection(value, 'records');
  const byKey = new Map();
  source.forEach((entry) => {
    const normalized = normalizeLearningAttendanceRecord(entry);
    if (!normalized) return;
    byKey.set(buildLearningAttendanceKey(normalized.sessionId, normalized.studentId), normalized);
  });
  return Array.from(byKey.values());
};

export const createLearningAttendanceRecord = ({ groupId, sessionId, studentId, ...value } = {}) => (
  normalizeLearningAttendanceRecord({ ...value, groupId, sessionId, studentId })
);

export const createLearningAttendanceRoster = (session, existingRecords = []) => {
  const sessionId = normalizeText(session?.id);
  if (!sessionId) return [];
  const existingByKey = new Map(normalizeLearningAttendanceRecords(existingRecords).map((entry) => (
    [buildLearningAttendanceKey(entry.sessionId, entry.studentId), entry]
  )));
  return getLearningLessonParticipantIds(session).map((studentId) => {
    const key = buildLearningAttendanceKey(sessionId, studentId);
    return existingByKey.get(key) || createLearningAttendanceRecord({
      groupId: session.groupId,
      sessionId,
      studentId,
    });
  });
};

const isManuallyMarkedAttendance = (record) => Boolean(record?.markedAt);

const getAttendanceEventBase = (record, event) => {
  const normalizedRecord = normalizeLearningAttendanceRecord(record);
  if (normalizedRecord) return normalizedRecord;
  return createLearningAttendanceRecord({
    groupId: event?.groupId,
    sessionId: event?.sessionId,
    studentId: event?.studentId,
  });
};

export const applyLearningAttendanceEvent = (record, event) => {
  if (!isPlainObject(event)) return normalizeLearningAttendanceRecord(record);
  const current = getAttendanceEventBase(record, event);
  if (!current) return null;
  const type = normalizeText(event.type, 40).toLowerCase();

  if (type === 'join') {
    const joinedAt = normalizeIsoTimestamp(event.at || event.joinedAt);
    const clientId = normalizeText(event.clientId || 'default');
    if (!joinedAt || !clientId || current.activeConnectionIds.includes(clientId)) return current;
    const wasDisconnected = current.activeConnectionIds.length === 0;
    return normalizeLearningAttendanceRecord({
      ...current,
      status: isManuallyMarkedAttendance(current) ? current.status : LEARNING_ATTENDANCE_STATUS.PRESENT,
      firstJoinedAt: getEarliestIsoTimestamp(current.firstJoinedAt, joinedAt),
      lastJoinedAt: getLatestIsoTimestamp(current.lastJoinedAt, joinedAt),
      activeSince: wasDisconnected ? joinedAt : current.activeSince,
      activeConnectionIds: [...current.activeConnectionIds, clientId],
    });
  }

  if (type === 'leave') {
    const leftAt = normalizeIsoTimestamp(event.at || event.leftAt);
    const clientId = normalizeText(event.clientId || 'default');
    if (!leftAt || !clientId || !current.activeConnectionIds.includes(clientId)) return current;
    const activeConnectionIds = current.activeConnectionIds.filter((id) => id !== clientId);
    if (activeConnectionIds.length > 0) {
      return normalizeLearningAttendanceRecord({ ...current, activeConnectionIds });
    }
    const activeStartMs = Date.parse(current.activeSince);
    const leftAtMs = Date.parse(leftAt);
    const addedSeconds = Number.isFinite(activeStartMs) && Number.isFinite(leftAtMs) && leftAtMs > activeStartMs
      ? Math.floor((leftAtMs - activeStartMs) / 1000)
      : 0;
    return normalizeLearningAttendanceRecord({
      ...current,
      status: isManuallyMarkedAttendance(current) ? current.status : LEARNING_ATTENDANCE_STATUS.PRESENT,
      presentSeconds: current.presentSeconds + addedSeconds,
      lastLeftAt: getLatestIsoTimestamp(current.lastLeftAt, leftAt),
      activeSince: '',
      activeConnectionIds: [],
    });
  }

  if (type === 'mark') {
    const markedAt = normalizeIsoTimestamp(event.at || event.markedAt);
    const markedById = normalizeText(event.markedById || event.actorId);
    if (!markedAt || !markedById) return current;
    return normalizeLearningAttendanceRecord({
      ...current,
      status: normalizeAttendanceStatus(event.status, current.status),
      presentSeconds: Object.prototype.hasOwnProperty.call(event, 'presentSeconds')
        ? normalizePresentSeconds(event.presentSeconds)
        : current.presentSeconds,
      markedAt,
      markedById,
      comment: Object.prototype.hasOwnProperty.call(event, 'comment') ? event.comment : current.comment,
    });
  }

  if (type === 'unmark') {
    const inferredStatus = current.firstJoinedAt || current.presentSeconds > 0
      ? LEARNING_ATTENDANCE_STATUS.PRESENT
      : LEARNING_ATTENDANCE_STATUS.PENDING;
    return normalizeLearningAttendanceRecord({
      ...current,
      status: inferredStatus,
      markedAt: '',
      markedById: '',
    });
  }

  return current;
};

export const finalizeLearningAttendanceRecord = (record, endedAt) => {
  let current = normalizeLearningAttendanceRecord(record);
  if (!current) return null;
  const normalizedEndedAt = normalizeIsoTimestamp(endedAt);
  if (normalizedEndedAt && current.activeConnectionIds.length > 0) {
    current.activeConnectionIds.forEach((clientId) => {
      current = applyLearningAttendanceEvent(current, {
        type: 'leave',
        clientId,
        at: normalizedEndedAt,
      });
    });
  }
  if (!isManuallyMarkedAttendance(current)) {
    current = normalizeLearningAttendanceRecord({
      ...current,
      status: current.firstJoinedAt || current.presentSeconds > 0
        ? LEARNING_ATTENDANCE_STATUS.PRESENT
        : LEARNING_ATTENDANCE_STATUS.ABSENT,
    });
  }
  return current;
};
