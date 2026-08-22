import { normalizeTelemostUrl, parseTelemostUrl } from '../src/utils/telemost.js';

const GROUP_STATUSES = new Set(['forming', 'ready', 'active', 'completed']);
const MEMBER_STATUSES = new Set(['active', 'removed']);
const LESSON_STATUSES = new Set(['scheduled', 'active', 'completed', 'cancelled']);
const ASSIGNMENT_STATUSES = new Set(['draft', 'assigned', 'closed']);
const SUBMISSION_STATUSES = new Set(['draft', 'submitted', 'reviewed', 'revision_requested']);
const ATTENDANCE_STATUSES = new Set(['pending', 'present', 'partial', 'absent', 'excused']);
const MATERIAL_VISIBILITIES = new Set(['group', 'lesson']);
const SCHEDULE_WEEKDAYS = new Set([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

export const LEARNING_GROUP_STATUS_FORMING = 'forming';
export const LEARNING_GROUP_STATUS_READY = 'ready';
export const LEARNING_GROUP_STATUS_ACTIVE = 'active';
export const LEARNING_GROUP_STATUS_COMPLETED = 'completed';
export const LEARNING_GROUP_MIN_STUDENTS = 2;
export const LEARNING_GROUP_MAX_STUDENTS = 5;

export class LearningGroupDomainError extends Error {
  constructor(message, { code = 'invalid_learning_group', statusCode = 400 } = {}) {
    super(message);
    this.name = 'LearningGroupDomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const fail = (message, code = 'invalid_learning_group', statusCode = 400) => {
  throw new LearningGroupDomainError(message, { code, statusCode });
};

const cleanText = (value, maxLength = 500) => String(value ?? '')
  .replace(/\0/g, '')
  .trim()
  .slice(0, maxLength);

const normalizeIsoTimestamp = (value, fallback = '') => {
  const parsed = Date.parse(cleanText(value, 80));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
};

const normalizeDayKey = (value) => {
  const normalized = cleanText(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) return '';
  return normalized;
};

const normalizeTime = (value) => {
  const normalized = cleanText(value, 10);
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const normalizeDurationMinutes = (value, fallback = 60) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 15 && parsed <= 360 ? parsed : fallback;
};

const normalizeStringIds = (value, limit = 100) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((entry) => {
    const id = cleanText(entry, 180);
    if (!id || seen.has(id) || result.length >= limit) return;
    seen.add(id);
    result.push(id);
  });
  return result;
};

const getNowIso = (value) => normalizeIsoTimestamp(value) || new Date().toISOString();

const getIdFactory = (options = {}) => (
  typeof options.idFactory === 'function' ? options.idFactory : () => ''
);

export const normalizeLearningGroupScheduleEntry = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const date = normalizeDayKey(value.date || value.dayKey);
  const weekdayKey = cleanText(value.weekdayKey, 20).toLowerCase();
  const time = normalizeTime(value.time);
  if (!id || !time || (!date && !SCHEDULE_WEEKDAYS.has(weekdayKey))) return null;
  return {
    id,
    date: date || null,
    weekdayKey: date ? '' : weekdayKey,
    time,
    durationMinutes: normalizeDurationMinutes(value.durationMinutes),
    subject: cleanText(value.subject || value.topic || 'Занятие', 240) || 'Занятие',
    note: cleanText(value.note, 1000),
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt),
  };
};

export const normalizeLearningGroupSchedule = (value) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((entry) => {
    const normalized = normalizeLearningGroupScheduleEntry(entry);
    if (!normalized || seen.has(normalized.id)) return;
    seen.add(normalized.id);
    result.push(normalized);
  });
  return result;
};

export const normalizeLearningGroupMember = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const studentId = cleanText(value.studentId || value.id, 180);
  if (!studentId) return null;
  const status = MEMBER_STATUSES.has(value.status) ? value.status : (value.leftAt ? 'removed' : 'active');
  return {
    studentId,
    status,
    joinedAt: normalizeIsoTimestamp(value.joinedAt || value.createdAt),
    leftAt: status === 'removed' ? normalizeIsoTimestamp(value.leftAt || value.updatedAt) : '',
    addedAfterStart: value.addedAfterStart === true,
    overrideReason: cleanText(value.overrideReason || value.lateAddReason, 1000),
    addedById: cleanText(value.addedById, 180),
    removedById: status === 'removed' ? cleanText(value.removedById, 180) : '',
  };
};

export const getActiveLearningGroupMembers = (group) => (
  Array.isArray(group?.members) ? group.members.filter((member) => member?.status === 'active') : []
);

export const deriveLearningGroupStatus = (group) => {
  if (normalizeIsoTimestamp(group?.completedAt) || group?.status === LEARNING_GROUP_STATUS_COMPLETED) {
    return LEARNING_GROUP_STATUS_COMPLETED;
  }
  if (normalizeIsoTimestamp(group?.startedAt) || group?.status === LEARNING_GROUP_STATUS_ACTIVE) {
    return LEARNING_GROUP_STATUS_ACTIVE;
  }
  return getActiveLearningGroupMembers(group).length >= LEARNING_GROUP_MIN_STUDENTS
    ? LEARNING_GROUP_STATUS_READY
    : LEARNING_GROUP_STATUS_FORMING;
};

export const normalizeLearningGroup = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const teacherId = cleanText(value.teacherId, 180);
  const name = cleanText(value.name, 160);
  if (!id || !teacherId || !name) return null;
  const rawMaxStudents = Math.round(Number(value.maxStudents));
  const maxStudents = Number.isFinite(rawMaxStudents)
    ? Math.min(LEARNING_GROUP_MAX_STUDENTS, Math.max(LEARNING_GROUP_MIN_STUDENTS, rawMaxStudents))
    : LEARNING_GROUP_MAX_STUDENTS;
  const members = [];
  const memberIndex = new Map();
  (Array.isArray(value.members) ? value.members : []).forEach((entry) => {
    const member = normalizeLearningGroupMember(entry);
    if (!member) return;
    const previousIndex = memberIndex.get(member.studentId);
    if (typeof previousIndex === 'number') members[previousIndex] = member;
    else {
      memberIndex.set(member.studentId, members.length);
      members.push(member);
    }
  });
  const startedAt = normalizeIsoTimestamp(value.startedAt);
  const completedAt = normalizeIsoTimestamp(value.completedAt);
  const base = {
    id,
    teacherId,
    name,
    plannedStartDate: normalizeDayKey(value.plannedStartDate || value.startDate),
    maxStudents,
    admissionsOpen: !startedAt && !completedAt && value.admissionsOpen !== false,
    members,
    schedule: normalizeLearningGroupSchedule(value.schedule),
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt),
    startedAt,
    completedAt,
    deletedAt: normalizeIsoTimestamp(value.deletedAt),
  };
  return { ...base, status: deriveLearningGroupStatus(base) };
};

export const normalizeLearningGroupsStore = (value) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((entry) => {
    const group = normalizeLearningGroup(entry);
    if (!group || seen.has(group.id)) return;
    seen.add(group.id);
    result.push(group);
  });
  return result;
};

export const createLearningGroup = (payload = {}, options = {}) => {
  const id = cleanText(options.id || payload.id, 180);
  const teacherId = cleanText(options.teacherId || payload.teacherId, 180);
  const name = cleanText(payload.name, 160);
  const maxStudents = Math.round(Number(payload.maxStudents ?? LEARNING_GROUP_MAX_STUDENTS));
  if (!id || !teacherId) fail('Не удалось определить группу и преподавателя');
  if (!name) fail('Введите название группы', 'group_name_required');
  if (!Number.isInteger(maxStudents) || maxStudents < LEARNING_GROUP_MIN_STUDENTS || maxStudents > LEARNING_GROUP_MAX_STUDENTS) {
    fail('Максимальное количество учеников должно быть от 2 до 5', 'invalid_group_capacity');
  }
  const rawPlannedStart = cleanText(payload.plannedStartDate || payload.startDate, 20);
  const plannedStartDate = rawPlannedStart ? normalizeDayKey(rawPlannedStart) : '';
  if (rawPlannedStart && !plannedStartDate) fail('Некорректная дата старта', 'invalid_start_date');
  const now = getNowIso(options.now);
  return normalizeLearningGroup({
    id,
    teacherId,
    name,
    plannedStartDate,
    maxStudents,
    admissionsOpen: true,
    members: [],
    schedule: [],
    createdAt: now,
    updatedAt: now,
  });
};

export const updateLearningGroup = (groupValue, patch = {}, options = {}) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group || group.deletedAt) fail('Группа не найдена', 'group_not_found', 404);
  const next = { ...group };
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    const name = cleanText(patch.name, 160);
    if (!name) fail('Введите название группы', 'group_name_required');
    next.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'plannedStartDate') || Object.prototype.hasOwnProperty.call(patch, 'startDate')) {
    const raw = cleanText(patch.plannedStartDate ?? patch.startDate, 20);
    const plannedStartDate = raw ? normalizeDayKey(raw) : '';
    if (raw && !plannedStartDate) fail('Некорректная дата старта', 'invalid_start_date');
    next.plannedStartDate = plannedStartDate;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxStudents')) {
    const maxStudents = Math.round(Number(patch.maxStudents));
    if (!Number.isInteger(maxStudents) || maxStudents < LEARNING_GROUP_MIN_STUDENTS || maxStudents > LEARNING_GROUP_MAX_STUDENTS) {
      fail('Максимальное количество учеников должно быть от 2 до 5', 'invalid_group_capacity');
    }
    if (getActiveLearningGroupMembers(group).length > maxStudents) {
      fail('Сначала удалите лишних учеников из группы', 'group_capacity_below_members', 409);
    }
    next.maxStudents = maxStudents;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'admissionsOpen') && !group.startedAt && !group.completedAt) {
    next.admissionsOpen = patch.admissionsOpen === true;
  }
  next.updatedAt = getNowIso(options.now);
  return normalizeLearningGroup(next);
};

export const addLearningGroupMember = (groupValue, studentValue, options = {}) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group || group.deletedAt) fail('Группа не найдена', 'group_not_found', 404);
  if (group.status === LEARNING_GROUP_STATUS_COMPLETED) fail('Завершённую группу нельзя изменять', 'group_completed', 409);
  const studentId = cleanText(studentValue?.id || studentValue?.studentId, 180);
  const studentTeacherId = cleanText(studentValue?.teacherId, 180);
  if (!studentId) fail('Ученик не найден', 'student_not_found', 404);
  if (!studentTeacherId || studentTeacherId !== group.teacherId) {
    fail('Ученик должен заниматься у преподавателя этой группы', 'student_teacher_mismatch', 409);
  }
  if (getActiveLearningGroupMembers(group).some((member) => member.studentId === studentId)) {
    fail('Ученик уже состоит в группе', 'member_already_active', 409);
  }
  if (getActiveLearningGroupMembers(group).length >= group.maxStudents) {
    fail('В группе уже достигнуто максимальное количество учеников', 'group_capacity_reached', 409);
  }
  const isLateAdd = group.status === LEARNING_GROUP_STATUS_ACTIVE;
  const overrideReason = cleanText(options.overrideReason || options.lateAddReason, 1000);
  if (isLateAdd && !overrideReason) {
    fail('После старта укажите причину добавления ученика', 'late_add_reason_required', 409);
  }
  const now = getNowIso(options.now);
  const nextMembers = group.members.filter((member) => member.studentId !== studentId);
  nextMembers.push({
    studentId,
    status: 'active',
    joinedAt: now,
    leftAt: '',
    addedAfterStart: isLateAdd,
    overrideReason: isLateAdd ? overrideReason : '',
    addedById: cleanText(options.actorId, 180),
    removedById: '',
  });
  return normalizeLearningGroup({ ...group, members: nextMembers, updatedAt: now });
};

export const removeLearningGroupMember = (groupValue, studentIdValue, options = {}) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group || group.deletedAt) fail('Группа не найдена', 'group_not_found', 404);
  if (group.status === LEARNING_GROUP_STATUS_COMPLETED) fail('Завершённую группу нельзя изменять', 'group_completed', 409);
  const studentId = cleanText(studentIdValue, 180);
  const index = group.members.findIndex((member) => member.studentId === studentId && member.status === 'active');
  if (index < 0) fail('Ученик не состоит в группе', 'member_not_found', 404);
  const now = getNowIso(options.now);
  const members = group.members.map((member, memberIndex) => memberIndex === index ? {
    ...member,
    status: 'removed',
    leftAt: now,
    removedById: cleanText(options.actorId, 180),
  } : member);
  return normalizeLearningGroup({ ...group, members, updatedAt: now });
};

export const startLearningGroup = (groupValue, options = {}) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group || group.deletedAt) fail('Группа не найдена', 'group_not_found', 404);
  if (group.status === LEARNING_GROUP_STATUS_COMPLETED) fail('Группа уже завершена', 'group_completed', 409);
  if (group.status === LEARNING_GROUP_STATUS_ACTIVE) fail('Группа уже занимается', 'group_already_started', 409);
  if (getActiveLearningGroupMembers(group).length < LEARNING_GROUP_MIN_STUDENTS) {
    fail('Для старта группы нужны минимум два ученика', 'not_enough_members', 409);
  }
  const now = getNowIso(options.now);
  return normalizeLearningGroup({
    ...group,
    startedAt: now,
    admissionsOpen: false,
    updatedAt: now,
  });
};

export const completeLearningGroup = (groupValue, options = {}) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group || group.deletedAt) fail('Группа не найдена', 'group_not_found', 404);
  if (group.status === LEARNING_GROUP_STATUS_COMPLETED) return group;
  if (group.status !== LEARNING_GROUP_STATUS_ACTIVE) {
    fail('Завершить можно только начавшую занятия группу', 'group_not_started', 409);
  }
  const now = getNowIso(options.now);
  return normalizeLearningGroup({ ...group, completedAt: now, admissionsOpen: false, updatedAt: now });
};

export const setLearningGroupSchedule = (groupValue, scheduleValue, options = {}) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group || group.deletedAt) fail('Группа не найдена', 'group_not_found', 404);
  if (!Array.isArray(scheduleValue)) fail('Расписание должно быть массивом', 'invalid_group_schedule');
  const now = getNowIso(options.now);
  const idFactory = getIdFactory(options);
  const rawEntries = scheduleValue.map((entry) => ({
    ...(entry && typeof entry === 'object' ? entry : {}),
    id: cleanText(entry?.id, 180) || cleanText(idFactory(), 180),
    createdAt: normalizeIsoTimestamp(entry?.createdAt) || now,
    updatedAt: now,
  }));
  const schedule = normalizeLearningGroupSchedule(rawEntries);
  if (schedule.length !== rawEntries.length) fail('Некорректное расписание группы', 'invalid_group_schedule');
  return normalizeLearningGroup({ ...group, schedule, updatedAt: now });
};

export const normalizeLearningLessonSession = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const groupId = cleanText(value.groupId, 180);
  const teacherId = cleanText(value.teacherId, 180);
  const startAt = normalizeIsoTimestamp(value.startAt);
  if (!id || !groupId || !teacherId || !startAt) return null;
  const participantIds = normalizeStringIds(value.participantIds || value.participantIdsSnapshot, 5);
  const status = LESSON_STATUSES.has(value.status) ? value.status : 'scheduled';
  return {
    id,
    groupId,
    teacherId,
    participantIds,
    startAt,
    durationMinutes: normalizeDurationMinutes(value.durationMinutes),
    topic: cleanText(value.topic || value.subject, 500),
    note: cleanText(value.note, 2000),
    telemostUrl: normalizeTelemostUrl(value.telemostUrl),
    scheduleEntryId: cleanText(value.scheduleEntryId, 180),
    source: cleanText(value.source, 80),
    externalCalendarProvider: cleanText(value.externalCalendarProvider, 120),
    externalEventId: cleanText(value.externalEventId, 500),
    externalOccurrenceId: cleanText(value.externalOccurrenceId, 240),
    status,
    roomId: `lesson:${id}`,
    rtcRoomId: `rtc:lesson:${id}`,
    boardDocName: `board-lesson-${id}`,
    collabDocName: `collab-lesson-${id}`,
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt),
    completedAt: status === 'completed' ? normalizeIsoTimestamp(value.completedAt || value.updatedAt) : '',
    cancelledAt: status === 'cancelled' ? normalizeIsoTimestamp(value.cancelledAt || value.updatedAt) : '',
  };
};

export const normalizeLearningLessonSessionsStore = (value) => (
  Array.isArray(value) ? value.map(normalizeLearningLessonSession).filter(Boolean) : []
);

export const createLearningLessonSession = (groupValue, payload = {}, options = {}) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group || group.deletedAt) fail('Группа не найдена', 'group_not_found', 404);
  if (group.status !== LEARNING_GROUP_STATUS_ACTIVE) {
    fail('Занятия можно создавать только после старта группы', 'group_not_active', 409);
  }
  const id = cleanText(options.id || payload.id, 180);
  const startAt = normalizeIsoTimestamp(payload.startAt);
  if (!id || !startAt) fail('Укажите корректное время занятия', 'invalid_lesson_start');
  const telemost = parseTelemostUrl(payload.telemostUrl);
  if (telemost.error) fail(telemost.error, 'invalid_lesson_telemost_url');
  const now = getNowIso(options.now);
  return normalizeLearningLessonSession({
    id,
    groupId: group.id,
    teacherId: group.teacherId,
    participantIds: getActiveLearningGroupMembers(group).map((member) => member.studentId),
    startAt,
    durationMinutes: normalizeDurationMinutes(payload.durationMinutes),
    topic: payload.topic || payload.subject,
    note: payload.note,
    telemostUrl: telemost.url,
    scheduleEntryId: payload.scheduleEntryId,
    source: payload.source,
    externalCalendarProvider: payload.externalCalendarProvider,
    externalEventId: payload.externalEventId,
    externalOccurrenceId: payload.externalOccurrenceId,
    status: 'scheduled',
    createdAt: now,
    updatedAt: now,
  });
};

export const updateLearningLessonSession = (sessionValue, patch = {}, options = {}) => {
  const session = normalizeLearningLessonSession(sessionValue);
  if (!session) fail('Занятие не найдено', 'lesson_not_found', 404);
  const next = { ...session };
  if (Object.prototype.hasOwnProperty.call(patch, 'startAt')) {
    const startAt = normalizeIsoTimestamp(patch.startAt);
    if (!startAt) fail('Укажите корректное время занятия', 'invalid_lesson_start');
    next.startAt = startAt;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'durationMinutes')) {
    const duration = Math.round(Number(patch.durationMinutes));
    if (!Number.isFinite(duration) || duration < 15 || duration > 360) fail('Некорректная длительность занятия', 'invalid_lesson_duration');
    next.durationMinutes = duration;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'topic')) next.topic = cleanText(patch.topic, 500);
  if (Object.prototype.hasOwnProperty.call(patch, 'note')) next.note = cleanText(patch.note, 2000);
  if (Object.prototype.hasOwnProperty.call(patch, 'telemostUrl')) {
    const telemost = parseTelemostUrl(patch.telemostUrl);
    if (telemost.error) fail(telemost.error, 'invalid_lesson_telemost_url');
    next.telemostUrl = telemost.url;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    const status = cleanText(patch.status, 30);
    if (!LESSON_STATUSES.has(status)) fail('Некорректный статус занятия', 'invalid_lesson_status');
    next.status = status;
  }
  const now = getNowIso(options.now);
  next.updatedAt = now;
  if (next.status === 'completed') next.completedAt = session.completedAt || now;
  if (next.status === 'cancelled') next.cancelledAt = session.cancelledAt || now;
  return normalizeLearningLessonSession(next);
};

export const normalizeLearningAssignment = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const groupId = cleanText(value.groupId, 180);
  const teacherId = cleanText(value.teacherId, 180);
  if (!id || !groupId || !teacherId) return null;
  const status = ASSIGNMENT_STATUSES.has(value.status) ? value.status : 'assigned';
  return {
    id,
    groupId,
    teacherId,
    lessonId: cleanText(value.lessonId, 180),
    title: cleanText(value.title, 240),
    content: cleanText(value.content ?? value.homeWork, 50000),
    dueAt: normalizeIsoTimestamp(value.dueAt),
    materialIds: normalizeStringIds(value.materialIds, 100),
    recipientIds: normalizeStringIds(value.recipientIds, 5),
    status,
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt),
    deletedAt: normalizeIsoTimestamp(value.deletedAt),
  };
};

export const normalizeLearningAssignmentsStore = (value) => (
  Array.isArray(value) ? value.map(normalizeLearningAssignment).filter(Boolean) : []
);

export const createLearningAssignment = (groupValue, payload = {}, options = {}) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group || group.deletedAt) fail('Группа не найдена', 'group_not_found', 404);
  const id = cleanText(options.id || payload.id, 180);
  const title = cleanText(payload.title, 240);
  const content = cleanText(payload.content ?? payload.homeWork, 50000);
  if (!id || (!title && !content)) fail('Заполните домашнее задание', 'assignment_content_required');
  const rawDueAt = cleanText(payload.dueAt, 80);
  const dueAt = rawDueAt ? normalizeIsoTimestamp(rawDueAt) : '';
  if (rawDueAt && !dueAt) fail('Некорректный срок задания', 'invalid_assignment_due_at');
  const now = getNowIso(options.now);
  return normalizeLearningAssignment({
    id,
    groupId: group.id,
    teacherId: group.teacherId,
    lessonId: payload.lessonId,
    title,
    content,
    dueAt,
    materialIds: payload.materialIds,
    recipientIds: getActiveLearningGroupMembers(group).map((member) => member.studentId),
    status: payload.status === 'draft' ? 'draft' : 'assigned',
    createdAt: now,
    updatedAt: now,
  });
};

export const updateLearningAssignment = (assignmentValue, patch = {}, options = {}) => {
  const assignment = normalizeLearningAssignment(assignmentValue);
  if (!assignment || assignment.deletedAt) fail('Задание не найдено', 'assignment_not_found', 404);
  const next = { ...assignment };
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) next.title = cleanText(patch.title, 240);
  if (Object.prototype.hasOwnProperty.call(patch, 'content') || Object.prototype.hasOwnProperty.call(patch, 'homeWork')) {
    next.content = cleanText(patch.content ?? patch.homeWork, 50000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'dueAt')) {
    const raw = cleanText(patch.dueAt, 80);
    const dueAt = raw ? normalizeIsoTimestamp(raw) : '';
    if (raw && !dueAt) fail('Некорректный срок задания', 'invalid_assignment_due_at');
    next.dueAt = dueAt;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'materialIds')) next.materialIds = normalizeStringIds(patch.materialIds, 100);
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    const status = cleanText(patch.status, 30);
    if (!ASSIGNMENT_STATUSES.has(status)) fail('Некорректный статус задания', 'invalid_assignment_status');
    next.status = status;
  }
  if (!next.title && !next.content) fail('Заполните домашнее задание', 'assignment_content_required');
  next.updatedAt = getNowIso(options.now);
  return normalizeLearningAssignment(next);
};

export const normalizeLearningAnswerRefs = (value) => {
  const result = [];
  (Array.isArray(value) ? value : []).slice(0, 50).forEach((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const type = ['file', 'link', 'text'].includes(entry.type) ? entry.type : '';
    const id = cleanText(entry.id, 180);
    const url = cleanText(entry.url, 2000);
    const text = cleanText(entry.text, 10000);
    if (!type || (type === 'file' && !id) || (type === 'link' && !url) || (type === 'text' && !text)) return;
    result.push({ type, id, url, text, label: cleanText(entry.label, 240) });
  });
  return result;
};

export const normalizeLearningSubmission = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const assignmentId = cleanText(value.assignmentId, 180);
  const groupId = cleanText(value.groupId, 180);
  const studentId = cleanText(value.studentId, 180);
  if (!id || !assignmentId || !groupId || !studentId) return null;
  const status = SUBMISSION_STATUSES.has(value.status) ? value.status : 'submitted';
  const grade = typeof value.grade === 'number' && Number.isFinite(value.grade)
    ? value.grade
    : cleanText(value.grade, 80);
  return {
    id,
    assignmentId,
    groupId,
    studentId,
    content: cleanText(value.content, 100000),
    answerRefs: normalizeLearningAnswerRefs(value.answerRefs),
    status,
    submittedAt: normalizeIsoTimestamp(value.submittedAt),
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt),
    grade,
    privateComment: cleanText(value.privateComment, 10000),
    reviewedAt: normalizeIsoTimestamp(value.reviewedAt),
    reviewedById: cleanText(value.reviewedById, 180),
  };
};

export const normalizeLearningSubmissionsStore = (value) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((entry) => {
    const submission = normalizeLearningSubmission(entry);
    if (!submission) return;
    const key = `${submission.assignmentId}\0${submission.studentId}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(submission);
  });
  return result;
};

export const upsertLearningSubmission = (existingValue, assignmentValue, studentIdValue, payload = {}, options = {}) => {
  const assignment = normalizeLearningAssignment(assignmentValue);
  const studentId = cleanText(studentIdValue, 180);
  if (!assignment || assignment.deletedAt) fail('Задание не найдено', 'assignment_not_found', 404);
  if (!studentId || !assignment.recipientIds.includes(studentId)) fail('Задание не назначено этому ученику', 'assignment_not_for_student', 403);
  const existing = normalizeLearningSubmission(existingValue);
  const status = payload.status === 'draft' ? 'draft' : 'submitted';
  const answerRefs = [
    ...normalizeLearningAnswerRefs(payload.answerRefs),
    ...normalizeStringIds(payload.fileIds, 50).map((id) => ({ type: 'file', id, url: '', text: '', label: '' })),
  ].slice(0, 50);
  const content = cleanText(payload.content, 100000);
  if (status === 'submitted' && !content && answerRefs.length === 0) {
    fail('Добавьте решение или файл', 'submission_content_required');
  }
  const now = getNowIso(options.now);
  return normalizeLearningSubmission({
    id: existing?.id || cleanText(options.id, 180),
    assignmentId: assignment.id,
    groupId: assignment.groupId,
    studentId,
    content,
    answerRefs,
    status,
    submittedAt: status === 'submitted' ? now : '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    grade: '',
    privateComment: '',
    reviewedAt: '',
    reviewedById: '',
  });
};

export const reviewLearningSubmission = (submissionValue, payload = {}, options = {}) => {
  const submission = normalizeLearningSubmission(submissionValue);
  if (!submission) fail('Работа ученика не найдена', 'submission_not_found', 404);
  const status = cleanText(payload.status || 'reviewed', 40);
  if (!['submitted', 'reviewed', 'revision_requested'].includes(status)) {
    fail('Некорректный статус проверки', 'invalid_review_status');
  }
  let grade = submission.grade;
  if (Object.prototype.hasOwnProperty.call(payload, 'grade')) {
    grade = payload.grade === null
      ? ''
      : (typeof payload.grade === 'number' && Number.isFinite(payload.grade)
          ? payload.grade
          : cleanText(payload.grade, 80));
  }
  const now = getNowIso(options.now);
  return normalizeLearningSubmission({
    ...submission,
    status,
    grade,
    privateComment: Object.prototype.hasOwnProperty.call(payload, 'privateComment')
      ? cleanText(payload.privateComment, 10000)
      : submission.privateComment,
    reviewedAt: now,
    reviewedById: cleanText(options.actorId, 180),
    updatedAt: now,
  });
};

export const normalizeLearningAttendanceRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const groupId = cleanText(value.groupId, 180);
  const sessionId = cleanText(value.sessionId || value.lessonId, 180);
  const studentId = cleanText(value.studentId, 180);
  if (!id || !groupId || !sessionId || !studentId) return null;
  const status = ATTENDANCE_STATUSES.has(value.status) ? value.status : 'pending';
  const presentSecondsRaw = Math.floor(Number(value.presentSeconds ?? value.attendedSeconds));
  const presentSeconds = Number.isFinite(presentSecondsRaw) ? Math.max(0, presentSecondsRaw) : 0;
  const activeConnectionIds = normalizeStringIds(value.activeConnectionIds, 50);
  return {
    id,
    groupId,
    sessionId,
    studentId,
    status,
    presentSeconds,
    attendedSeconds: presentSeconds,
    firstJoinedAt: normalizeIsoTimestamp(value.firstJoinedAt),
    lastJoinedAt: normalizeIsoTimestamp(value.lastJoinedAt || value.firstJoinedAt),
    lastLeftAt: normalizeIsoTimestamp(value.lastLeftAt),
    activeSince: activeConnectionIds.length > 0 ? normalizeIsoTimestamp(value.activeSince) : '',
    activeConnectionIds,
    markedAt: normalizeIsoTimestamp(value.markedAt || value.updatedAt),
    markedById: cleanText(value.markedById, 180),
    comment: cleanText(value.comment, 2000),
  };
};

export const normalizeLearningAttendanceStore = (value) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((entry) => {
    const record = normalizeLearningAttendanceRecord(entry);
    if (!record) return;
    const key = `${record.sessionId}\0${record.studentId}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(record);
  });
  return result;
};

export const upsertLearningAttendanceRecord = (existingValue, sessionValue, studentIdValue, payload = {}, options = {}) => {
  const session = normalizeLearningLessonSession(sessionValue);
  const studentId = cleanText(studentIdValue, 180);
  if (!session) fail('Занятие не найдено', 'lesson_not_found', 404);
  if (!studentId || !session.participantIds.includes(studentId)) {
    fail('Ученик не является участником занятия', 'student_not_in_lesson', 409);
  }
  const existing = normalizeLearningAttendanceRecord(existingValue);
  const status = cleanText(payload.status || existing?.status || 'pending', 30);
  if (!ATTENDANCE_STATUSES.has(status)) fail('Некорректный статус посещаемости', 'invalid_attendance_status');
  const hasDuration = Object.prototype.hasOwnProperty.call(payload, 'presentSeconds')
    || Object.prototype.hasOwnProperty.call(payload, 'attendedSeconds');
  const presentSecondsRaw = hasDuration
    ? Math.floor(Number(payload.presentSeconds ?? payload.attendedSeconds))
    : (existing?.presentSeconds || 0);
  if (!Number.isFinite(presentSecondsRaw) || presentSecondsRaw < 0) {
    fail('Некорректное время присутствия', 'invalid_attendance_duration');
  }
  const now = getNowIso(options.now);
  return normalizeLearningAttendanceRecord({
    id: existing?.id || cleanText(options.id, 180),
    groupId: session.groupId,
    sessionId: session.id,
    studentId,
    status,
    presentSeconds: presentSecondsRaw,
    firstJoinedAt: payload.firstJoinedAt ?? existing?.firstJoinedAt,
    lastJoinedAt: payload.lastJoinedAt ?? existing?.lastJoinedAt,
    lastLeftAt: payload.lastLeftAt ?? existing?.lastLeftAt,
    activeSince: existing?.activeSince,
    activeConnectionIds: existing?.activeConnectionIds,
    markedAt: now,
    markedById: cleanText(options.actorId, 180),
    comment: Object.prototype.hasOwnProperty.call(payload, 'comment') ? payload.comment : existing?.comment,
  });
};

export const normalizeLearningMaterial = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const groupId = cleanText(value.groupId, 180);
  const teacherId = cleanText(value.teacherId, 180);
  if (!id || !groupId || !teacherId) return null;
  const visibility = MATERIAL_VISIBILITIES.has(value.visibility) ? value.visibility : 'group';
  const lessonId = visibility === 'lesson' ? cleanText(value.lessonId, 180) : '';
  if (visibility === 'lesson' && !lessonId) return null;
  const content = cleanText(value.content, 50000);
  const url = cleanText(value.url, 2000);
  const fileId = cleanText(value.fileId, 180);
  const storageName = cleanText(value.storageName, 500);
  if (!content && !url && !fileId && !storageName) return null;
  return {
    id,
    groupId,
    teacherId,
    title: cleanText(value.title, 240) || 'Материал',
    content,
    url,
    fileId,
    storageName,
    originalName: cleanText(value.originalName, 500),
    mimeType: cleanText(value.mimeType, 160),
    sizeBytes: Math.max(0, Math.floor(Number(value.sizeBytes) || 0)),
    visibility,
    lessonId,
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt),
    deletedAt: normalizeIsoTimestamp(value.deletedAt),
  };
};

export const normalizeLearningMaterialsStore = (value) => (
  Array.isArray(value) ? value.map(normalizeLearningMaterial).filter(Boolean) : []
);

export const createLearningMaterial = (groupValue, payload = {}, options = {}) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group || group.deletedAt) fail('Группа не найдена', 'group_not_found', 404);
  const visibility = cleanText(payload.visibility || 'group', 30);
  if (!MATERIAL_VISIBILITIES.has(visibility)) fail('Некорректная видимость материала', 'invalid_material_visibility');
  const lessonId = visibility === 'lesson' ? cleanText(payload.lessonId, 180) : '';
  if (visibility === 'lesson' && !lessonId) fail('Укажите занятие для материала', 'material_lesson_required');
  const now = getNowIso(options.now);
  const material = normalizeLearningMaterial({
    id: options.id || payload.id,
    groupId: group.id,
    teacherId: group.teacherId,
    title: payload.title,
    content: payload.content,
    url: payload.url,
    fileId: payload.fileId,
    storageName: payload.storageName,
    originalName: payload.originalName,
    mimeType: payload.mimeType,
    sizeBytes: payload.sizeBytes,
    visibility,
    lessonId,
    createdAt: now,
    updatedAt: now,
  });
  if (!material) fail('Добавьте содержимое, ссылку или файл', 'material_content_required');
  return material;
};

const normalizeLearningBoardAnswers = (value) => {
  const result = [];
  (Array.isArray(value) ? value : []).slice(0, 100).forEach((entry) => {
    try {
      const serialized = JSON.stringify(entry);
      if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > 20000) return;
      result.push(JSON.parse(serialized));
    } catch {
      // Ignore cyclic and otherwise non-serializable answers.
    }
  });
  return result;
};

export const normalizeLearningBoardResponse = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const groupId = cleanText(value.groupId, 180);
  const sessionId = cleanText(value.sessionId || value.lessonId, 180);
  const boardItemId = cleanText(value.boardItemId, 240);
  const studentId = cleanText(value.studentId, 180);
  if (!id || !groupId || !sessionId || !boardItemId || !studentId) return null;
  let checkState = null;
  if (value.checkState !== null && typeof value.checkState !== 'undefined') {
    try {
      const serialized = JSON.stringify(value.checkState);
      if (typeof serialized === 'string' && Buffer.byteLength(serialized, 'utf8') <= 20000) {
        checkState = JSON.parse(serialized);
      }
    } catch {
      checkState = null;
    }
  }
  return {
    id,
    groupId,
    sessionId,
    boardItemId,
    studentId,
    answers: normalizeLearningBoardAnswers(value.answers),
    code: String(value.code ?? '').replace(/\0/g, '').slice(0, 50000),
    checkState,
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt),
  };
};

export const normalizeLearningBoardResponsesStore = (value) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((entry) => {
    const response = normalizeLearningBoardResponse(entry);
    if (!response) return;
    const key = `${response.sessionId}\0${response.boardItemId}\0${response.studentId}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(response);
  });
  return result;
};

export const upsertLearningBoardResponse = (existingValue, sessionValue, boardItemIdValue, studentIdValue, payload = {}, options = {}) => {
  const session = normalizeLearningLessonSession(sessionValue);
  const boardItemId = cleanText(boardItemIdValue, 240);
  const studentId = cleanText(studentIdValue, 180);
  if (!session) fail('Занятие не найдено', 'lesson_not_found', 404);
  if (session.status !== 'scheduled' && session.status !== 'active') {
    fail('Завершённое или отменённое занятие доступно только для просмотра', 'lesson_read_only', 409);
  }
  if (!boardItemId) fail('Некорректный элемент доски', 'invalid_board_item');
  if (!session.participantIds.includes(studentId)) {
    fail('Ученик не является участником занятия', 'student_not_in_lesson', 403);
  }
  const existing = normalizeLearningBoardResponse(existingValue);
  const now = getNowIso(options.now);
  const response = normalizeLearningBoardResponse({
    id: existing?.id || options.id,
    groupId: session.groupId,
    sessionId: session.id,
    boardItemId,
    studentId,
    answers: Object.prototype.hasOwnProperty.call(payload, 'answers') ? payload.answers : existing?.answers,
    code: Object.prototype.hasOwnProperty.call(payload, 'code') ? payload.code : existing?.code,
    checkState: Object.prototype.hasOwnProperty.call(payload, 'checkState') ? payload.checkState : existing?.checkState,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  if (!response) fail('Некорректный ответ на доске', 'invalid_board_response');
  return response;
};

export const serializeLearningGroup = (groupValue) => {
  const group = normalizeLearningGroup(groupValue);
  if (!group) return null;
  return {
    ...group,
    memberCount: getActiveLearningGroupMembers(group).length,
  };
};

export const serializeLearningSubmissionForStudent = (submissionValue, studentIdValue) => {
  const submission = normalizeLearningSubmission(submissionValue);
  const studentId = cleanText(studentIdValue, 180);
  return submission && submission.studentId === studentId ? submission : null;
};

export const isLearningGroupStatus = (value) => GROUP_STATUSES.has(value);
