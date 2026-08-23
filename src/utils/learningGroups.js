export const LEARNING_GROUP_STATUS_FORMING = 'forming';
export const LEARNING_GROUP_STATUS_READY = 'ready';
export const LEARNING_GROUP_STATUS_ACTIVE = 'active';
export const LEARNING_GROUP_STATUS_COMPLETED = 'completed';

export const LEARNING_GROUP_STATUS_META = {
  [LEARNING_GROUP_STATUS_FORMING]: {
    label: 'Формируется',
    tone: 'amber',
  },
  [LEARNING_GROUP_STATUS_READY]: {
    label: 'Готова к старту',
    tone: 'emerald',
  },
  [LEARNING_GROUP_STATUS_ACTIVE]: {
    label: 'Занимается',
    tone: 'violet',
  },
  [LEARNING_GROUP_STATUS_COMPLETED]: {
    label: 'Завершена',
    tone: 'slate',
  },
};

export const LEARNING_GROUP_WEEKDAYS = [
  { value: 'monday', label: 'Понедельник', shortLabel: 'Пн', order: 1 },
  { value: 'tuesday', label: 'Вторник', shortLabel: 'Вт', order: 2 },
  { value: 'wednesday', label: 'Среда', shortLabel: 'Ср', order: 3 },
  { value: 'thursday', label: 'Четверг', shortLabel: 'Чт', order: 4 },
  { value: 'friday', label: 'Пятница', shortLabel: 'Пт', order: 5 },
  { value: 'saturday', label: 'Суббота', shortLabel: 'Сб', order: 6 },
  { value: 'sunday', label: 'Воскресенье', shortLabel: 'Вс', order: 7 },
];

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);
const cleanString = (value) => String(value ?? '').trim();

const getFirstArray = (...values) => {
  const match = values.find(Array.isArray);
  return Array.isArray(match) ? match : [];
};

const getWeekdayMeta = (value) => {
  const normalized = cleanString(value).toLocaleLowerCase('ru-RU').replace(/\.$/u, '');
  const aliases = {
    monday: ['monday', 'mon', 'понедельник', 'пн'],
    tuesday: ['tuesday', 'tue', 'вторник', 'вт'],
    wednesday: ['wednesday', 'wed', 'среда', 'ср'],
    thursday: ['thursday', 'thu', 'четверг', 'чт'],
    friday: ['friday', 'fri', 'пятница', 'пт'],
    saturday: ['saturday', 'sat', 'суббота', 'сб'],
    sunday: ['sunday', 'sun', 'воскресенье', 'вс'],
  };
  return LEARNING_GROUP_WEEKDAYS.find((entry) => aliases[entry.value]?.includes(normalized)) || null;
};

export const normalizeLearningGroupStatus = (value, memberCount = 0) => {
  const normalized = cleanString(value).toLocaleLowerCase('ru-RU').replace(/[\s_-]+/gu, '');
  if (['completed', 'complete', 'finished', 'завершена', 'завершен'].includes(normalized)) {
    return LEARNING_GROUP_STATUS_COMPLETED;
  }
  if (['active', 'started', 'inprogress', 'занимается', 'идет', 'идёт'].includes(normalized)) {
    return LEARNING_GROUP_STATUS_ACTIVE;
  }
  if (['ready', 'readytostart', 'готова', 'готовакстарту'].includes(normalized)) {
    return LEARNING_GROUP_STATUS_READY;
  }
  if (['forming', 'draft', 'recruiting', 'формируется'].includes(normalized)) {
    return LEARNING_GROUP_STATUS_FORMING;
  }
  return Number(memberCount) >= 1
    ? LEARNING_GROUP_STATUS_READY
    : LEARNING_GROUP_STATUS_FORMING;
};

export const normalizeLearningGroupScheduleEntry = (value, index = 0) => {
  const source = asObject(value);
  const weekday = getWeekdayMeta(source.weekdayKey ?? source.weekday ?? source.day);
  const rawDuration = Number(source.durationMinutes ?? source.duration);
  const durationMinutes = Number.isFinite(rawDuration) && rawDuration > 0
    ? Math.max(15, Math.min(360, Math.round(rawDuration)))
    : 60;
  return {
    ...source,
    id: cleanString(source.id || source.scheduleId) || `schedule-${index}`,
    weekdayKey: weekday?.value || cleanString(source.weekdayKey || source.weekday || source.day),
    weekdayLabel: weekday?.label || cleanString(source.weekdayLabel || source.weekday || source.day) || 'День',
    weekdayShortLabel: weekday?.shortLabel || cleanString(source.weekdayShortLabel) || '—',
    weekdayOrder: weekday?.order || Number(source.weekdayOrder) || 99,
    time: cleanString(source.time || source.startTime),
    durationMinutes,
  };
};

export const normalizeLearningGroupMember = (value, index = 0) => {
  const source = asObject(value);
  const student = asObject(source.student);
  const studentId = cleanString(
    source.studentId || student.id || student.studentId || source.userId || source.id
  );
  return {
    ...student,
    ...source,
    id: studentId || cleanString(source.id) || `member-${index}`,
    studentId,
    name: cleanString(
      source.studentName || source.name || student.nickname || student.name
    ) || 'Ученик',
    joinedAt: cleanString(source.joinedAt || source.createdAt),
    lateAddReason: cleanString(source.lateAddReason || source.overrideReason),
  };
};

export const normalizeLearningGroupMaterial = (value, index = 0) => {
  const source = asObject(value);
  return {
    ...source,
    id: cleanString(source.id || source.materialId || source.fileId) || `material-${index}`,
    title: cleanString(source.title || source.name || source.fileName) || `Материал ${index + 1}`,
    url: cleanString(source.url || source.fileUrl || source.downloadUrl),
    fileId: cleanString(source.fileId),
    lessonId: cleanString(source.lessonId),
  };
};

export const normalizeLearningGroupLesson = (value, index = 0) => {
  const source = asObject(value);
  const startDate = cleanString(source.startsAt || source.startAt || source.dateTime || source.startDateTime);
  const date = cleanString(source.date || source.dayKey);
  const time = cleanString(source.time || source.startTime);
  const startsAt = startDate || (date && time ? `${date}T${time}` : date);
  const rawDuration = Number(source.durationMinutes ?? source.duration);
  return {
    ...source,
    id: cleanString(source.id || source.lessonId || source.occurrenceId) || `lesson-${index}`,
    lessonId: cleanString(source.lessonId || source.id || source.occurrenceId) || `lesson-${index}`,
    startsAt,
    date,
    time,
    durationMinutes: Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : 60,
    topic: cleanString(source.topic || source.subject || source.title) || 'Тема будет объявлена',
    status: cleanString(source.status),
    materials: getFirstArray(source.materials, source.files)
      .map(normalizeLearningGroupMaterial),
  };
};

export const normalizeLearningGroupAssignment = (value, index = 0) => {
  const source = asObject(value);
  return {
    ...source,
    id: cleanString(source.id || source.assignmentId || source.homeworkId) || `assignment-${index}`,
    assignmentId: cleanString(source.assignmentId || source.id || source.homeworkId) || `assignment-${index}`,
    title: cleanString(source.title || source.name) || `Домашнее задание ${index + 1}`,
    instructions: cleanString(source.instructions || source.content || source.text || source.description),
    dueAt: cleanString(source.dueAt || source.deadline),
    status: cleanString(source.status),
  };
};

const unwrapSingleGroup = (value) => {
  const source = asObject(value);
  return asObject(source.group || source.learningGroup || source.data || source.result || source);
};

export const normalizeLearningGroup = (value, index = 0) => {
  const source = unwrapSingleGroup(value);
  const workspace = asObject(source.workspace || source.projection || source.dashboard);
  const rawMembers = getFirstArray(source.members, source.participants, source.students, workspace.members);
  const members = rawMembers.map(normalizeLearningGroupMember).filter((member) => member.studentId);
  const reportedMemberCount = Number(source.memberCount ?? source.participantCount ?? source.studentsCount);
  const memberCount = Number.isFinite(reportedMemberCount) && reportedMemberCount >= 0
    ? Math.floor(reportedMemberCount)
    : members.length;
  const rawMaximum = Number(source.maxStudents ?? source.maxMembers ?? source.capacity);
  const maxStudents = Number.isFinite(rawMaximum)
    ? Math.max(2, Math.min(5, Math.round(rawMaximum)))
    : 5;
  const schedule = getFirstArray(source.schedule, source.weeklySchedule, source.scheduleEntries, workspace.schedule)
    .map(normalizeLearningGroupScheduleEntry)
    .sort((left, right) => (left.weekdayOrder - right.weekdayOrder) || left.time.localeCompare(right.time, 'ru'));
  const lessons = getFirstArray(source.lessons, workspace.lessons)
    .map(normalizeLearningGroupLesson);
  const assignments = getFirstArray(source.assignments, source.homeworks, workspace.assignments, workspace.homeworks)
    .map(normalizeLearningGroupAssignment);
  const materials = getFirstArray(source.materials, source.files, workspace.materials)
    .map(normalizeLearningGroupMaterial);
  const nextLessonValue = source.nextLesson || workspace.nextLesson || null;
  const nextLesson = nextLessonValue ? normalizeLearningGroupLesson(nextLessonValue) : null;
  return {
    ...source,
    id: cleanString(source.id || source.groupId || source._id) || `group-${index}`,
    groupId: cleanString(source.groupId || source.id || source._id) || `group-${index}`,
    name: cleanString(source.name || source.title) || `Мини-группа ${index + 1}`,
    telemostUrl: cleanString(source.telemostUrl),
    plannedStartDate: cleanString(
      source.plannedStartDate || source.plannedStart || source.startDate
    ),
    maxStudents,
    memberCount,
    members,
    participantIds: members.map((member) => member.studentId),
    status: normalizeLearningGroupStatus(source.status, memberCount),
    schedule,
    lessons,
    nextLesson,
    assignments,
    materials,
    progress: source.progress || source.myProgress || workspace.progress || workspace.myProgress || null,
    attendance: source.attendance || source.myAttendance || workspace.attendance || workspace.myAttendance || null,
    mySubmission: source.mySubmission || workspace.mySubmission || null,
  };
};

export const normalizeLearningGroupList = (payload) => {
  if (Array.isArray(payload)) return payload.map(normalizeLearningGroup);
  const source = asObject(payload);
  const list = getFirstArray(
    source.groups,
    source.learningGroups,
    source.items,
    source.data,
    source.results
  );
  if (list.length > 0) return list.map(normalizeLearningGroup);
  const single = source.group || source.learningGroup;
  return single ? [normalizeLearningGroup(single)] : [];
};

export const mergeLearningGroupProjection = (group, payloads = {}) => {
  const base = normalizeLearningGroup(group);
  const detail = normalizeLearningGroup(payloads.detail || base);
  const lessonsSource = asObject(payloads.lessons);
  const assignmentsSource = asObject(payloads.assignments);
  const materialsSource = asObject(payloads.materials);
  const lessons = getFirstArray(
    payloads.lessons,
    lessonsSource.lessons,
    lessonsSource.items,
    detail.lessons
  ).map(normalizeLearningGroupLesson);
  const assignments = getFirstArray(
    payloads.assignments,
    assignmentsSource.assignments,
    assignmentsSource.items,
    detail.assignments
  ).map(normalizeLearningGroupAssignment);
  const materials = getFirstArray(
    payloads.materials,
    materialsSource.materials,
    materialsSource.items,
    detail.materials
  ).map(normalizeLearningGroupMaterial);
  return normalizeLearningGroup({
    ...base,
    ...detail,
    lessons,
    assignments,
    materials,
    progress: payloads.progress || detail.progress || base.progress,
  });
};

export const normalizeLearningGroupAttendance = (payload, members = []) => {
  const source = asObject(payload);
  const rawRecords = getFirstArray(payload, source.records, source.attendance, source.items);
  const recordByStudentId = new Map(rawRecords.map((record) => {
    const normalized = asObject(record);
    const studentId = cleanString(normalized.studentId || normalized.userId || normalized.id);
    const status = cleanString(normalized.status) || (normalized.present === true ? 'present' : 'unknown');
    return [studentId, { ...normalized, studentId, status }];
  }).filter(([studentId]) => studentId));
  asArray(members).forEach((member, index) => {
    const normalizedMember = normalizeLearningGroupMember(member, index);
    if (!normalizedMember.studentId || recordByStudentId.has(normalizedMember.studentId)) return;
    recordByStudentId.set(normalizedMember.studentId, {
      studentId: normalizedMember.studentId,
      studentName: normalizedMember.name,
      status: 'unknown',
      attendedSeconds: 0,
    });
  });
  return Array.from(recordByStudentId.values());
};

export const getLearningGroupStatusMeta = (status) => (
  LEARNING_GROUP_STATUS_META[normalizeLearningGroupStatus(status)]
  || LEARNING_GROUP_STATUS_META[LEARNING_GROUP_STATUS_FORMING]
);
