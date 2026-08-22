import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  PanelTop,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { api, resolveAuthenticatedApiUrl, withStoredAuthToken } from '../services/api';
import {
  LEARNING_GROUP_STATUS_ACTIVE,
  LEARNING_GROUP_STATUS_COMPLETED,
  LEARNING_GROUP_STATUS_FORMING,
  LEARNING_GROUP_STATUS_READY,
  LEARNING_GROUP_WEEKDAYS,
  getLearningGroupStatusMeta,
  normalizeLearningGroup,
  normalizeLearningGroupAssignment,
  normalizeLearningGroupAttendance,
  normalizeLearningGroupLesson,
  normalizeLearningGroupList,
  normalizeLearningGroupMaterial,
} from '../utils/learningGroups';
import { parseTelemostUrl } from '../utils/telemost';

const GROUP_TONE_CLASSES = {
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  slate: 'border-slate-200 bg-slate-100 text-slate-600',
};

const LESSON_STATUS_META = {
  scheduled: { label: 'Запланировано', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  active: { label: 'Идёт сейчас', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  completed: { label: 'Завершено', className: 'border-slate-200 bg-slate-100 text-slate-600' },
  cancelled: { label: 'Отменено', className: 'border-rose-200 bg-rose-50 text-rose-700' },
};

const ASSIGNMENT_STATUS_META = {
  draft: { label: 'Черновик', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  assigned: { label: 'Назначено', className: 'border-violet-200 bg-violet-50 text-violet-700' },
  closed: { label: 'Закрыто', className: 'border-slate-200 bg-slate-100 text-slate-600' },
};

const SUBMISSION_STATUS_META = {
  missing: { label: 'Не сдано', className: 'border-slate-200 bg-slate-50 text-slate-500' },
  draft: { label: 'Черновик', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  submitted: { label: 'На проверке', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  reviewed: { label: 'Проверено', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  revision_requested: { label: 'Нужна доработка', className: 'border-rose-200 bg-rose-50 text-rose-700' },
};

const ATTENDANCE_STATUS_META = {
  pending: { label: 'Не отмечено', className: 'border-slate-200 bg-slate-50 text-slate-500' },
  unknown: { label: 'Не отмечено', className: 'border-slate-200 bg-slate-50 text-slate-500' },
  present: { label: 'Был(а)', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  partial: { label: 'Часть урока', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  absent: { label: 'Отсутствовал(а)', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  excused: { label: 'Уважительная причина', className: 'border-sky-200 bg-sky-50 text-sky-700' },
};

const TAB_ITEMS = [
  { id: 'overview', label: 'Состав', icon: Users },
  { id: 'schedule', label: 'Расписание', icon: CalendarDays },
  { id: 'lessons', label: 'Занятия', icon: Video },
  { id: 'materials', label: 'Материалы', icon: BookOpen },
  { id: 'assignments', label: 'Домашние задания', icon: ClipboardList },
  { id: 'attendance', label: 'Посещаемость', icon: UserCheck },
];

const EMPTY_GROUP_FORM = {
  name: '',
  plannedStartDate: '',
  maxStudents: 5,
};

const EMPTY_LESSON_FORM = {
  startAt: '',
  durationMinutes: 60,
  topic: '',
  note: '',
  telemostUrl: '',
};

const EMPTY_MATERIAL_FORM = {
  title: '',
  content: '',
  url: '',
  visibility: 'group',
  lessonId: '',
};

const EMPTY_ASSIGNMENT_FORM = {
  title: '',
  content: '',
  dueAt: '',
  lessonId: '',
  status: 'assigned',
};

const LEARNING_MATERIAL_MAX_FILE_BYTES = 64 * 1024 * 1024;

const asObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const cleanString = (value) => String(value ?? '').trim();

const uniqueStrings = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : []).map(cleanString).filter(Boolean)
));

const findArrayInPayload = (payload, keys) => {
  if (Array.isArray(payload)) return payload;
  const source = asObject(payload);
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
  }
  for (const containerKey of ['data', 'result', 'workspace', 'dashboard']) {
    const nested = source[containerKey];
    if (!nested || nested === payload) continue;
    const match = findArrayInPayload(nested, keys);
    if (match.length > 0) return match;
  }
  return [];
};

const findEntityInPayload = (payload, keys) => {
  const source = asObject(payload);
  for (const key of keys) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      return source[key];
    }
  }
  for (const containerKey of ['data', 'result']) {
    const nested = source[containerKey];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const match = findEntityInPayload(nested, keys);
      if (Object.keys(match).length > 0) return match;
      return nested;
    }
  }
  return source;
};

const getStudentId = (student) => cleanString(student?.id || student?.studentId || student?.userId);

const getStudentName = (student) => cleanString(
  student?.nickname || student?.name || student?.studentName
) || 'Ученик';

const isActiveMember = (member) => !['removed', 'left', 'inactive'].includes(
  cleanString(member?.status).toLowerCase()
);

const decorateGroup = (groupValue, students = []) => {
  const group = normalizeLearningGroup(groupValue);
  const studentById = new Map((Array.isArray(students) ? students : []).map((student) => [
    getStudentId(student),
    student,
  ]).filter(([id]) => id));
  const members = (Array.isArray(group?.members) ? group.members : [])
    .filter(isActiveMember)
    .map((member) => {
      const student = studentById.get(cleanString(member.studentId));
      return {
        ...member,
        name: student ? getStudentName(student) : (cleanString(member.name) || 'Ученик'),
        avatarDataUrl: member.avatarDataUrl || student?.avatarDataUrl || '',
      };
    });
  return {
    ...group,
    members,
    memberCount: members.length,
    participantIds: members.map((member) => member.studentId),
  };
};

const upsertGroup = (groups, nextGroup) => {
  const normalizedId = cleanString(nextGroup?.id || nextGroup?.groupId);
  if (!normalizedId) return groups;
  const index = groups.findIndex((group) => cleanString(group.id) === normalizedId);
  if (index < 0) return [nextGroup, ...groups];
  return groups.map((group, groupIndex) => (groupIndex === index ? nextGroup : group));
};

const parseGroupPayload = (payload, fallback, students) => {
  const entity = findEntityInPayload(payload, ['group', 'learningGroup']);
  const normalized = normalizeLearningGroup(entity) || normalizeLearningGroup(fallback);
  return normalized ? decorateGroup(normalized, students) : null;
};

const parseLessonsPayload = (payload) => findArrayInPayload(
  payload,
  ['lessons', 'sessions', 'items']
).map(normalizeLearningGroupLesson);

const parseAssignmentsPayload = (payload) => findArrayInPayload(
  payload,
  ['assignments', 'homeworks', 'items']
).map(normalizeLearningGroupAssignment);

const parseMaterialsPayload = (payload) => findArrayInPayload(
  payload,
  ['materials', 'files', 'items']
).map(normalizeLearningGroupMaterial);

const normalizeSubmission = (value, index = 0) => {
  const source = asObject(value);
  const studentId = cleanString(source.studentId || source.userId || source.student?.id);
  return {
    ...source,
    id: cleanString(source.id || source.submissionId) || `submission-${index}`,
    studentId,
    content: cleanString(source.content || source.text || source.answer),
    status: cleanString(source.status) || 'missing',
    grade: source.grade ?? '',
    privateComment: cleanString(source.privateComment || source.comment),
    submittedAt: cleanString(source.submittedAt || source.updatedAt),
    answerRefs: Array.isArray(source.answerRefs) ? source.answerRefs : [],
  };
};

const parseSubmissionsPayload = (payload) => findArrayInPayload(
  payload,
  ['submissions', 'items']
).map(normalizeSubmission).filter((submission) => submission.studentId);

const parseSingleSubmissionPayload = (payload) => {
  const source = findEntityInPayload(payload, ['submission', 'mySubmission']);
  if (!source || Object.keys(source).length === 0) return null;
  const normalized = normalizeSubmission(source);
  return normalized.studentId || normalized.content || normalized.status !== 'missing' ? normalized : null;
};

const parseProgressPayload = (payload) => {
  const source = findEntityInPayload(payload, ['progress', 'myProgress']);
  return Object.keys(source).length > 0 ? source : null;
};

const formatDate = (value, options = {}) => {
  const parsed = Date.parse(cleanString(value));
  if (!Number.isFinite(parsed)) return 'Дата не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: options.withYear === false ? undefined : 'numeric',
    ...(options.withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(parsed));
};

const formatDuration = (minutesValue) => {
  const minutes = Math.max(0, Math.round(Number(minutesValue) || 0));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
};

const formatFileSize = (bytesValue) => {
  const bytes = Math.max(0, Number(bytesValue) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
};

const toDateTimeLocal = (value) => {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const toIsoDateTime = (value) => {
  const parsed = Date.parse(cleanString(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
};

const getLessonStart = (lesson) => cleanString(
  lesson?.startsAt || lesson?.startAt || lesson?.dateTime
);

const getLessonId = (lesson) => cleanString(lesson?.lessonId || lesson?.id);

const getLessonTelemostUrl = (lesson) => parseTelemostUrl(lesson?.telemostUrl).url;

const getAssignmentId = (assignment) => cleanString(assignment?.assignmentId || assignment?.id);

const getMaterialId = (material) => cleanString(material?.materialId || material?.id);

const getMaterialHref = (material) => {
  const value = cleanString(material?.downloadUrl || material?.url);
  if (!value || !value.startsWith('/api/')) return value;
  return withStoredAuthToken(resolveAuthenticatedApiUrl(value));
};

const getLessonParticipants = (lesson, group) => {
  const snapshot = uniqueStrings(lesson?.participantIds || lesson?.participantIdsSnapshot);
  return snapshot.length > 0 ? snapshot : uniqueStrings(group?.participantIds);
};

const getStatusMeta = (map, status, fallbackKey) => map[cleanString(status)] || map[fallbackKey];

const StatusPill = ({ meta }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.className}`}>
    {meta.label}
  </span>
);

const GroupStatusPill = ({ status }) => {
  const meta = getLearningGroupStatusMeta(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${GROUP_TONE_CLASSES[meta.tone] || GROUP_TONE_CLASSES.slate}`}>
      {meta.label}
    </span>
  );
};

const Field = ({ label, hint, children }) => (
  <label className="block min-w-0">
    <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
      <span>{label}</span>
      {hint && <span className="font-medium text-slate-400">{hint}</span>}
    </span>
    {children}
  </label>
);

const inputClassName = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const SectionCard = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
    {(title || action) && (
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <h3 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h3>}
          {subtitle && <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

const EmptyState = ({ icon = Users, title, text, action }) => (
  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-10 text-center">
    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-violet-600 shadow-sm">
      {React.createElement(icon, { size: 24 })}
    </span>
    <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
    {text && <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-500">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const BusyButtonContent = ({ busy, busyLabel, icon: Icon, children }) => (
  <>
    {busy ? <Loader2 size={16} className="animate-spin" /> : (Icon ? <Icon size={16} /> : null)}
    <span>{busy ? busyLabel : children}</span>
  </>
);

const LearningGroupsSection = ({
  role,
  userId,
  teacherId,
  students = [],
  studentsLoading = false,
  activeLearningLesson = null,
  onOpenLessonRoom,
}) => {
  const isTeacher = role === 'teacher';
  const [groups, setGroups] = useState([]);
  const groupsRef = useRef([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [tab, setTab] = useState('overview');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_GROUP_FORM);
  const [editForm, setEditForm] = useState(EMPTY_GROUP_FORM);
  const [addStudentId, setAddStudentId] = useState('');
  const [lateAddReason, setLateAddReason] = useState('');
  const [scheduleDraft, setScheduleDraft] = useState([]);
  const [lessonForm, setLessonForm] = useState(() => ({
    ...EMPTY_LESSON_FORM,
    startAt: toDateTimeLocal(),
  }));
  const [editingLessonId, setEditingLessonId] = useState('');
  const [lessonEditForm, setLessonEditForm] = useState(EMPTY_LESSON_FORM);
  const [materialForm, setMaterialForm] = useState(EMPTY_MATERIAL_FORM);
  const [materialMode, setMaterialMode] = useState('content');
  const [materialFile, setMaterialFile] = useState(null);
  const materialFileInputRef = useRef(null);
  const [assignmentForm, setAssignmentForm] = useState(EMPTY_ASSIGNMENT_FORM);
  const [expandedAssignmentId, setExpandedAssignmentId] = useState('');
  const [submissionsByAssignment, setSubmissionsByAssignment] = useState({});
  const [submissionDrafts, setSubmissionDrafts] = useState({});
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [attendanceLessonId, setAttendanceLessonId] = useState('');
  const [attendanceState, setAttendanceState] = useState({
    loading: false,
    error: '',
    records: [],
  });
  const [attendanceDrafts, setAttendanceDrafts] = useState({});

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const selectedGroup = useMemo(() => (
    groups.find((group) => cleanString(group.id) === selectedGroupId) || null
  ), [groups, selectedGroupId]);

  const visibleGroups = useMemo(() => (
    showCompleted
      ? groups
      : groups.filter((group) => group.status !== LEARNING_GROUP_STATUS_COMPLETED)
  ), [groups, showCompleted]);

  const studentById = useMemo(() => new Map(
    (Array.isArray(students) ? students : []).map((student) => [getStudentId(student), student]).filter(([id]) => id)
  ), [students]);

  const availableStudents = useMemo(() => {
    if (!selectedGroup) return [];
    const memberIds = new Set(selectedGroup.participantIds || []);
    return (Array.isArray(students) ? students : []).filter((student) => {
      const id = getStudentId(student);
      const studyStatus = cleanString(student?.studyStatus || student?.status).toLowerCase();
      return id && !memberIds.has(id) && !['deleted', 'archived', 'inactive'].includes(studyStatus);
    });
  }, [selectedGroup, students]);

  const lessons = useMemo(() => (
    [...(Array.isArray(selectedGroup?.lessons) ? selectedGroup.lessons : [])]
      .sort((left, right) => Date.parse(getLessonStart(left)) - Date.parse(getLessonStart(right)))
  ), [selectedGroup?.lessons]);

  const assignments = useMemo(() => (
    Array.isArray(selectedGroup?.assignments) ? selectedGroup.assignments : []
  ), [selectedGroup?.assignments]);

  const materials = useMemo(() => (
    Array.isArray(selectedGroup?.materials) ? selectedGroup.materials : []
  ), [selectedGroup?.materials]);

  const refreshGroups = useCallback(async (preferredGroupId = '') => {
    setLoading(true);
    setError('');
    try {
      const payload = await api.getLearningGroups({
        includeCompleted: true,
        ...(isTeacher
          ? { teacherId: cleanString(teacherId || userId) }
          : { studentId: cleanString(userId) }),
      });
      const normalized = normalizeLearningGroupList(payload).map((group) => decorateGroup(group, students));
      setGroups(normalized);
      const preferredId = cleanString(preferredGroupId);
      setSelectedGroupId((currentId) => {
        if (preferredId && normalized.some((group) => group.id === preferredId)) return preferredId;
        if (currentId && normalized.some((group) => group.id === currentId)) return currentId;
        return normalized.find((group) => group.status !== LEARNING_GROUP_STATUS_COMPLETED)?.id
          || normalized[0]?.id
          || '';
      });
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось загрузить мини-группы.');
    } finally {
      setLoading(false);
    }
  }, [isTeacher, students, teacherId, userId]);

  useEffect(() => {
    void refreshGroups();
  }, [refreshGroups]);

  const loadGroupDetails = useCallback(async (groupId) => {
    const normalizedGroupId = cleanString(groupId);
    if (!normalizedGroupId) return;
    setDetailLoading(true);
    setError('');
    const baseGroup = groupsRef.current.find((group) => group.id === normalizedGroupId) || null;
    try {
      const results = await Promise.allSettled([
        api.getLearningGroup(normalizedGroupId),
        api.getLearningGroupLessons(normalizedGroupId),
        api.getLearningGroupAssignments(normalizedGroupId),
        api.getLearningGroupMaterials(normalizedGroupId),
        api.getLearningGroupProgress(normalizedGroupId),
      ]);
      const successfulValue = (index) => results[index].status === 'fulfilled' ? results[index].value : null;
      const detailPayload = successfulValue(0);
      const detail = parseGroupPayload(detailPayload, baseGroup, students);
      if (!detail) throw new Error('Группа не найдена.');
      const lessonsPayload = successfulValue(1) || detailPayload;
      const assignmentsPayload = successfulValue(2) || detailPayload;
      const materialsPayload = successfulValue(3) || detailPayload;
      const progressPayload = successfulValue(4) || detailPayload;
      const nextGroup = decorateGroup({
        ...detail,
        lessons: parseLessonsPayload(lessonsPayload),
        assignments: parseAssignmentsPayload(assignmentsPayload),
        materials: parseMaterialsPayload(materialsPayload),
        progress: parseProgressPayload(progressPayload) || detail.progress || null,
      }, students);
      setGroups((current) => upsertGroup(current, nextGroup));
      const firstRejected = results.find((result) => result.status === 'rejected');
      if (firstRejected) {
        setNotice('Основные данные загружены, но часть статистики пока недоступна.');
      }
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось открыть мини-группу.');
    } finally {
      setDetailLoading(false);
    }
  }, [students]);

  useEffect(() => {
    if (!selectedGroupId) return;
    void loadGroupDetails(selectedGroupId);
  }, [loadGroupDetails, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroup) return;
    setEditForm({
      name: selectedGroup.name,
      plannedStartDate: selectedGroup.plannedStartDate || '',
      maxStudents: selectedGroup.maxStudents || 5,
    });
    setScheduleDraft((selectedGroup.schedule || []).map((entry) => ({ ...entry })));
    setAddStudentId('');
    setLateAddReason('');
    setExpandedAssignmentId('');
    setAttendanceLessonId((current) => (
      current && (selectedGroup.lessons || []).some((lesson) => getLessonId(lesson) === current)
        ? current
        : getLessonId((selectedGroup.lessons || []).find((lesson) => lesson.status === 'active')
          || (selectedGroup.lessons || [])[0])
    ));
  }, [selectedGroup]);

  useEffect(() => {
    setEditingLessonId('');
    setLessonEditForm(EMPTY_LESSON_FORM);
  }, [selectedGroupId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const runAction = useCallback(async (key, action, successText, options = {}) => {
    if (busyKey) return null;
    setBusyKey(key);
    setError('');
    try {
      const result = await action();
      if (successText) setNotice(successText);
      const preferredId = cleanString(options.groupId || selectedGroupId);
      if (options.refreshList) await refreshGroups(preferredId);
      else if (options.refreshGroup !== false && preferredId) await loadGroupDetails(preferredId);
      return result;
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось выполнить действие.');
      return null;
    } finally {
      setBusyKey('');
    }
  }, [busyKey, loadGroupDetails, refreshGroups, selectedGroupId]);

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    const result = await runAction(
      'create-group',
      () => api.createLearningGroup({
        name: cleanString(createForm.name),
        plannedStartDate: createForm.plannedStartDate,
        maxStudents: Number(createForm.maxStudents),
      }),
      'Мини-группа создана.',
      { refreshGroup: false }
    );
    if (!result) return;
    const created = parseGroupPayload(result, null, students);
    setCreateForm(EMPTY_GROUP_FORM);
    setShowCreateForm(false);
    await refreshGroups(created?.id || '');
  };

  const handleUpdateGroup = async (event) => {
    event.preventDefault();
    if (!selectedGroup) return;
    await runAction(
      'update-group',
      () => api.updateLearningGroup(selectedGroup.id, {
        name: cleanString(editForm.name),
        plannedStartDate: editForm.plannedStartDate,
        maxStudents: Number(editForm.maxStudents),
      }),
      'Настройки группы сохранены.'
    );
  };

  const handleAddMember = async (event) => {
    event.preventDefault();
    if (!selectedGroup || !addStudentId) return;
    const result = await runAction(
      `add-member:${addStudentId}`,
      () => api.addLearningGroupMember(selectedGroup.id, addStudentId, {
        lateAddReason: lateAddReason,
      }),
      'Ученик добавлен в группу.'
    );
    if (result) {
      setAddStudentId('');
      setLateAddReason('');
    }
  };

  const handleRemoveMember = async (member) => {
    if (!selectedGroup) return;
    const name = member.name || 'ученика';
    if (!window.confirm(`Удалить ${name} из мини-группы?`)) return;
    await runAction(
      `remove-member:${member.studentId}`,
      () => api.removeLearningGroupMember(selectedGroup.id, member.studentId),
      'Ученик удалён из группы.'
    );
  };

  const handleSaveSchedule = async () => {
    if (!selectedGroup) return;
    const payload = scheduleDraft.map((entry) => ({
      id: cleanString(entry.id).startsWith('draft-') ? '' : cleanString(entry.id),
      date: entry.date || null,
      weekdayKey: entry.date ? '' : entry.weekdayKey,
      time: entry.time,
      durationMinutes: Number(entry.durationMinutes),
      subject: cleanString(entry.subject || entry.topic) || 'Занятие',
      note: cleanString(entry.note),
    }));
    await runAction(
      'save-schedule',
      () => api.updateLearningGroupSchedule(selectedGroup.id, payload),
      'Расписание сохранено.'
    );
  };

  const handleCreateLesson = async (event) => {
    event.preventDefault();
    if (!selectedGroup) return;
    const parsedTelemost = parseTelemostUrl(lessonForm.telemostUrl);
    if (!parsedTelemost.url) {
      setError(parsedTelemost.error || 'Укажите ссылку на встречу в Телемосте.');
      return;
    }
    const result = await runAction(
      'create-lesson',
      () => api.createLearningGroupLesson(selectedGroup.id, {
        startAt: toIsoDateTime(lessonForm.startAt),
        durationMinutes: Number(lessonForm.durationMinutes),
        topic: cleanString(lessonForm.topic),
        note: cleanString(lessonForm.note),
        telemostUrl: parsedTelemost.url,
      }),
      'Занятие добавлено.'
    );
    if (result) {
      setLessonForm({ ...EMPTY_LESSON_FORM, startAt: toDateTimeLocal(Date.now() + 24 * 60 * 60 * 1000) });
    }
  };

  const handleBeginEditLesson = (lesson) => {
    const lessonId = getLessonId(lesson);
    if (!lessonId) return;
    setEditingLessonId(lessonId);
    setLessonEditForm({
      startAt: toDateTimeLocal(getLessonStart(lesson)),
      durationMinutes: Number(lesson.durationMinutes) || 60,
      topic: cleanString(lesson.topic),
      note: cleanString(lesson.note),
      telemostUrl: getLessonTelemostUrl(lesson),
    });
    setError('');
  };

  const handleSaveLesson = async (event, lesson) => {
    event.preventDefault();
    if (!selectedGroup) return;
    const lessonId = getLessonId(lesson);
    const parsedTelemost = parseTelemostUrl(lessonEditForm.telemostUrl);
    if (!parsedTelemost.url) {
      setError(parsedTelemost.error || 'Укажите ссылку на встречу в Телемосте.');
      return;
    }
    const result = await runAction(
      `update-lesson:${lessonId}`,
      () => api.updateLearningGroupLesson(selectedGroup.id, lessonId, {
        startAt: toIsoDateTime(lessonEditForm.startAt),
        durationMinutes: Number(lessonEditForm.durationMinutes),
        topic: cleanString(lessonEditForm.topic),
        note: cleanString(lessonEditForm.note),
        telemostUrl: parsedTelemost.url,
      }),
      'Занятие обновлено.'
    );
    if (result) setEditingLessonId('');
  };

  const handleUpdateLessonStatus = async (lesson, status) => {
    if (!selectedGroup) return;
    const lessonId = getLessonId(lesson);
    await runAction(
      `lesson-status:${lessonId}:${status}`,
      () => api.updateLearningGroupLesson(selectedGroup.id, lessonId, { status }),
      status === 'active' ? 'Занятие начато.' : 'Статус занятия обновлён.'
    );
  };

  const handleOpenLesson = (lesson, surface) => {
    if (!selectedGroup || !['board', 'collab'].includes(surface) || typeof onOpenLessonRoom !== 'function') return;
    onOpenLessonRoom({
      lessonId: getLessonId(lesson),
      groupId: selectedGroup.id,
      participantIds: getLessonParticipants(lesson, selectedGroup),
      groupName: selectedGroup.name,
      topic: lesson.topic,
      startsAt: getLessonStart(lesson),
      telemostUrl: getLessonTelemostUrl(lesson),
      readOnly: String(lesson?.status || '').trim() === 'completed',
      surface,
    });
  };

  const handleCreateMaterial = async (event) => {
    event.preventDefault();
    if (!selectedGroup) return;
    const isFileUpload = materialMode === 'file';
    if (isFileUpload && !materialFile) {
      setError('Выберите файл материала.');
      return;
    }
    const result = await runAction(
      isFileUpload ? 'upload-material' : 'create-material',
      () => isFileUpload
        ? api.uploadLearningGroupMaterial(selectedGroup.id, materialFile, {
          title: cleanString(materialForm.title) || materialFile.name,
          visibility: materialForm.visibility,
          ...(materialForm.visibility === 'lesson' ? { lessonId: materialForm.lessonId } : {}),
        })
        : api.createLearningGroupMaterial(selectedGroup.id, {
          title: cleanString(materialForm.title),
          content: cleanString(materialForm.content),
          url: cleanString(materialForm.url),
          visibility: materialForm.visibility,
          ...(materialForm.visibility === 'lesson' ? { lessonId: materialForm.lessonId } : {}),
        }),
      isFileUpload ? 'Файл загружен.' : 'Материал добавлен.'
    );
    if (result) {
      setMaterialForm(EMPTY_MATERIAL_FORM);
      setMaterialFile(null);
      if (materialFileInputRef.current) materialFileInputRef.current.value = '';
    }
  };

  const handleMaterialFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setMaterialFile(null);
      return;
    }
    if (file.size > LEARNING_MATERIAL_MAX_FILE_BYTES) {
      setMaterialFile(null);
      event.target.value = '';
      setError('Файл больше 64 МБ. Выберите файл меньшего размера.');
      return;
    }
    setError('');
    setMaterialFile(file);
    setMaterialForm((current) => ({
      ...current,
      title: cleanString(current.title) || file.name,
    }));
  };

  const handleDeleteMaterial = async (material) => {
    if (!selectedGroup || typeof api.deleteLearningGroupMaterial !== 'function') return;
    if (!window.confirm(`Удалить материал «${material.title}»?`)) return;
    await runAction(
      `delete-material:${getMaterialId(material)}`,
      () => api.deleteLearningGroupMaterial(selectedGroup.id, getMaterialId(material)),
      'Материал удалён.'
    );
  };

  const handleCreateAssignment = async (event) => {
    event.preventDefault();
    if (!selectedGroup) return;
    const result = await runAction(
      'create-assignment',
      () => api.createLearningGroupAssignment(selectedGroup.id, {
        title: cleanString(assignmentForm.title),
        content: cleanString(assignmentForm.content),
        dueAt: assignmentForm.dueAt ? toIsoDateTime(assignmentForm.dueAt) : '',
        lessonId: assignmentForm.lessonId,
        status: assignmentForm.status,
      }),
      assignmentForm.status === 'draft' ? 'Черновик сохранён.' : 'Домашнее задание назначено.'
    );
    if (result) setAssignmentForm(EMPTY_ASSIGNMENT_FORM);
  };

  const handleAssignmentStatus = async (assignment, status) => {
    if (!selectedGroup) return;
    const assignmentId = getAssignmentId(assignment);
    await runAction(
      `assignment-status:${assignmentId}:${status}`,
      () => api.updateLearningGroupAssignment(selectedGroup.id, assignmentId, { status }),
      'Статус задания обновлён.'
    );
  };

  const handleDeleteAssignment = async (assignment) => {
    if (!selectedGroup || !window.confirm(`Удалить задание «${assignment.title}»?`)) return;
    const assignmentId = getAssignmentId(assignment);
    const result = await runAction(
      `delete-assignment:${assignmentId}`,
      () => api.deleteLearningGroupAssignment(selectedGroup.id, assignmentId),
      'Задание удалено.'
    );
    if (result) setExpandedAssignmentId('');
  };

  const loadAssignmentSubmissions = useCallback(async (assignmentId) => {
    if (!selectedGroup || !assignmentId) return;
    setSubmissionsByAssignment((current) => ({
      ...current,
      [assignmentId]: { ...(current[assignmentId] || {}), loading: true, error: '' },
    }));
    try {
      if (isTeacher) {
        const payload = await api.getLearningGroupAssignmentSubmissions(selectedGroup.id, assignmentId);
        const submissions = parseSubmissionsPayload(payload);
        setSubmissionsByAssignment((current) => ({
          ...current,
          [assignmentId]: { loading: false, error: '', submissions },
        }));
        setReviewDrafts((current) => {
          const next = { ...current };
          submissions.forEach((submission) => {
            const key = `${assignmentId}:${submission.studentId}`;
            if (!next[key]) {
              next[key] = {
                grade: submission.grade ?? '',
                privateComment: submission.privateComment || '',
                status: submission.status === 'revision_requested' ? 'revision_requested' : 'reviewed',
              };
            }
          });
          return next;
        });
      } else {
        const payload = await api.getLearningGroupAssignmentSubmission(selectedGroup.id, assignmentId);
        const submission = parseSingleSubmissionPayload(payload);
        setSubmissionsByAssignment((current) => ({
          ...current,
          [assignmentId]: { loading: false, error: '', submission },
        }));
        setSubmissionDrafts((current) => ({
          ...current,
          [assignmentId]: current[assignmentId] ?? submission?.content ?? '',
        }));
      }
    } catch (requestError) {
      setSubmissionsByAssignment((current) => ({
        ...current,
        [assignmentId]: {
          ...(current[assignmentId] || {}),
          loading: false,
          error: requestError?.message || 'Не удалось загрузить решения.',
        },
      }));
    }
  }, [isTeacher, selectedGroup]);

  const toggleAssignment = (assignment) => {
    const assignmentId = getAssignmentId(assignment);
    if (expandedAssignmentId === assignmentId) {
      setExpandedAssignmentId('');
      return;
    }
    setExpandedAssignmentId(assignmentId);
    void loadAssignmentSubmissions(assignmentId);
  };

  const handleSaveSubmission = async (assignment, status) => {
    if (!selectedGroup) return;
    const assignmentId = getAssignmentId(assignment);
    const result = await runAction(
      `save-submission:${assignmentId}:${status}`,
      () => api.saveLearningGroupAssignmentSubmission(selectedGroup.id, assignmentId, {
        content: submissionDrafts[assignmentId] || '',
        status,
      }),
      status === 'draft' ? 'Черновик сохранён.' : 'Решение отправлено.',
      { refreshGroup: false }
    );
    if (result) await loadAssignmentSubmissions(assignmentId);
  };

  const handleReviewSubmission = async (assignmentId, studentId) => {
    if (!selectedGroup) return;
    const key = `${assignmentId}:${studentId}`;
    const draft = reviewDrafts[key] || {};
    const result = await runAction(
      `review-submission:${key}`,
      () => api.reviewLearningGroupAssignmentSubmission(
        selectedGroup.id,
        assignmentId,
        studentId,
        {
          grade: draft.grade ?? '',
          privateComment: draft.privateComment || '',
          status: draft.status || 'reviewed',
        }
      ),
      'Проверка сохранена.',
      { refreshGroup: false }
    );
    if (result) await loadAssignmentSubmissions(assignmentId);
  };

  const loadAttendance = useCallback(async (lessonId) => {
    if (!selectedGroup || !lessonId) return;
    setAttendanceState({ loading: true, error: '', records: [] });
    try {
      const payload = await api.getLearningGroupLessonAttendance(selectedGroup.id, lessonId);
      const records = normalizeLearningGroupAttendance(payload, selectedGroup.members)
        .filter((record) => isTeacher || cleanString(record.studentId) === cleanString(userId))
        .map((record) => ({
          ...record,
          studentName: studentById.has(cleanString(record.studentId))
            ? getStudentName(studentById.get(cleanString(record.studentId)))
            : (cleanString(record.studentName) || 'Ученик'),
        }));
      setAttendanceState({ loading: false, error: '', records });
      setAttendanceDrafts(Object.fromEntries(records.map((record) => [
        record.studentId,
        {
          status: ['unknown', ''].includes(record.status) ? 'pending' : record.status,
          presentSeconds: Number(record.presentSeconds ?? record.attendedSeconds) || 0,
          comment: record.comment || '',
        },
      ])));
    } catch (requestError) {
      setAttendanceState({
        loading: false,
        error: requestError?.message || 'Не удалось загрузить посещаемость.',
        records: [],
      });
    }
  }, [isTeacher, selectedGroup, studentById, userId]);

  useEffect(() => {
    if (tab !== 'attendance' || !attendanceLessonId) return;
    void loadAttendance(attendanceLessonId);
  }, [attendanceLessonId, loadAttendance, tab]);

  const handleSaveAttendance = async () => {
    if (!selectedGroup || !attendanceLessonId) return;
    const records = Object.entries(attendanceDrafts).map(([studentId, draft]) => ({
      studentId,
      status: draft.status,
      presentSeconds: Math.max(0, Math.floor(Number(draft.presentSeconds) || 0)),
      comment: cleanString(draft.comment),
    }));
    const result = await runAction(
      `save-attendance:${attendanceLessonId}`,
      () => api.updateLearningGroupLessonAttendance(selectedGroup.id, attendanceLessonId, records),
      'Посещаемость сохранена.',
      { refreshGroup: false }
    );
    if (result) await loadAttendance(attendanceLessonId);
  };

  const progress = asObject(selectedGroup?.progress);
  const progressSummary = asObject(progress.summary || progress.totals || progress);
  const progressMembers = Array.isArray(progress.members) ? progress.members : [];
  const selfProgress = asObject(
    progress.self
    || progressMembers.find((entry) => cleanString(entry?.studentId) === cleanString(userId))
  );
  const selfAttendance = asObject(selfProgress.attendance);
  const selfAssignments = asObject(selfProgress.assignments);
  const completedLessons = Number(
    progressSummary.completedLessons
    ?? progressSummary.lessonsCompleted
    ?? lessons.filter((lesson) => lesson.status === 'completed').length
  );
  const totalLessons = Number(
    progressSummary.totalLessons
    ?? progressSummary.lessonsTotal
    ?? progress.lessonCount
    ?? lessons.length
  );
  const recordedAttendanceTotal = Number(selfAttendance.total) || 0;
  const recordedAttendancePresent = (Number(selfAttendance.present) || 0) + (Number(selfAttendance.partial) || 0);
  const attendancePercent = Number(
    progressSummary.attendancePercent
    ?? progressSummary.attendanceRate
    ?? (recordedAttendanceTotal > 0 ? (recordedAttendancePresent / recordedAttendanceTotal) * 100 : Number.NaN)
  );
  const completedAssignments = Number(
    progressSummary.completedAssignments
    ?? progressSummary.assignmentsCompleted
    ?? selfAssignments.submitted
  );
  const totalAssignments = Number(
    progressSummary.totalAssignments
    ?? progressSummary.assignmentsTotal
    ?? selfAssignments.total
    ?? progress.assignmentCount
    ?? assignments.length
  );

  if (loading && groups.length === 0) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
          <Loader2 size={20} className="animate-spin text-violet-600" />
          Загружаем мини-группы...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 pb-4">
      <header className="overflow-hidden rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-5 text-white shadow-lg shadow-violet-200/50 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-100">
              <Users size={16} />
              Обучение вместе
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Мини-группы</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-violet-100 sm:text-base">
              {isTeacher
                ? 'Состав, расписание, занятия и персональная проверка работ — в одном рабочем пространстве.'
                : 'Все занятия, материалы и домашние задания вашей группы собраны здесь.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshGroups(selectedGroupId)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
              Обновить
            </button>
            {isTeacher && (
              <button
                type="button"
                onClick={() => setShowCreateForm((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-bold text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {showCreateForm ? <X size={16} /> : <Plus size={16} />}
                {showCreateForm ? 'Закрыть' : 'Создать группу'}
              </button>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} className="rounded-lg p-1 hover:bg-rose-100" aria-label="Закрыть">
            <X size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          {notice}
        </div>
      )}

      {showCreateForm && isTeacher && (
        <SectionCard title="Новая мини-группа" subtitle="После создания добавьте от 2 до 5 учеников и настройте расписание.">
          <form onSubmit={handleCreateGroup} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_140px_auto] md:items-end">
            <Field label="Название">
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                className={inputClassName}
                placeholder="Например, Python · вторник"
                maxLength={160}
                required
              />
            </Field>
            <Field label="Планируемый старт">
              <input
                type="date"
                value={createForm.plannedStartDate}
                onChange={(event) => setCreateForm((current) => ({ ...current, plannedStartDate: event.target.value }))}
                className={inputClassName}
              />
            </Field>
            <Field label="Вместимость">
              <select
                value={createForm.maxStudents}
                onChange={(event) => setCreateForm((current) => ({ ...current, maxStudents: Number(event.target.value) }))}
                className={inputClassName}
              >
                {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} учеников</option>)}
              </select>
            </Field>
            <button
              type="submit"
              disabled={busyKey === 'create-group'}
              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
            >
              <BusyButtonContent busy={busyKey === 'create-group'} busyLabel="Создаём..." icon={Plus}>Создать</BusyButtonContent>
            </button>
          </form>
        </SectionCard>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title={isTeacher ? 'Пока нет мини-групп' : 'Вы пока не добавлены в мини-группу'}
          text={isTeacher
            ? 'Создайте первую группу, добавьте учеников и начните совместные занятия.'
            : 'Когда преподаватель добавит вас в группу, она появится в этом разделе.'}
          action={isTeacher ? (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
            >
              <Plus size={16} /> Создать группу
            </button>
          ) : null}
        />
      ) : (
        <div className="grid min-h-[580px] gap-4 lg:grid-cols-[285px_minmax(0,1fr)]">
          <aside className="self-start rounded-3xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-4">
            <div className="mb-2 flex items-center justify-between gap-2 px-2 py-1">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">Ваши группы</span>
              {groups.some((group) => group.status === LEARNING_GROUP_STATUS_COMPLETED) && (
                <button
                  type="button"
                  onClick={() => setShowCompleted((current) => !current)}
                  className="text-[11px] font-bold text-violet-600 hover:text-violet-800"
                >
                  {showCompleted ? 'Скрыть архив' : 'Показать архив'}
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:max-h-[calc(100vh-250px)] lg:space-y-2 lg:overflow-y-auto lg:pr-1">
              {visibleGroups.map((group) => {
                const isSelected = group.id === selectedGroupId;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setTab('overview');
                    }}
                    className={`min-w-[240px] rounded-2xl border p-3 text-left transition lg:min-w-0 lg:w-full ${
                      isSelected
                        ? 'border-violet-300 bg-violet-50 shadow-sm ring-2 ring-violet-100'
                        : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{group.name}</span>
                      <ChevronRight size={16} className={isSelected ? 'text-violet-600' : 'text-slate-300'} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <GroupStatusPill status={group.status} />
                      <span className="text-[11px] font-semibold text-slate-500">
                        {group.memberCount}/{group.maxStudents}
                      </span>
                    </div>
                    {group.nextLesson && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Clock3 size={13} />
                        <span className="truncate">{formatDate(getLessonStart(group.nextLesson), { withTime: true, withYear: false })}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0 space-y-4">
            {!selectedGroup ? (
              <EmptyState title="Выберите группу" text="Откройте группу слева, чтобы увидеть её рабочее пространство." />
            ) : (
              <>
                <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black text-slate-900 sm:text-2xl">{selectedGroup.name}</h2>
                        <GroupStatusPill status={selectedGroup.status} />
                        {detailLoading && <Loader2 size={16} className="animate-spin text-violet-600" />}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><Users size={15} /> {selectedGroup.memberCount} из {selectedGroup.maxStudents}</span>
                        {selectedGroup.plannedStartDate && (
                          <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} /> Старт {formatDate(selectedGroup.plannedStartDate)}</span>
                        )}
                      </div>
                    </div>
                    {isTeacher && (
                      <div className="flex flex-wrap gap-2">
                        {[LEARNING_GROUP_STATUS_FORMING, LEARNING_GROUP_STATUS_READY].includes(selectedGroup.status) && (
                          <button
                            type="button"
                            onClick={() => void runAction(
                              'start-group',
                              () => api.startLearningGroup(selectedGroup.id),
                              'Мини-группа начала занятия.'
                            )}
                            disabled={selectedGroup.memberCount < 2 || busyKey === 'start-group'}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title={selectedGroup.memberCount < 2 ? 'Для старта нужны минимум два ученика' : undefined}
                          >
                            <BusyButtonContent busy={busyKey === 'start-group'} busyLabel="Запускаем..." icon={Play}>Начать обучение</BusyButtonContent>
                          </button>
                        )}
                        {selectedGroup.status === LEARNING_GROUP_STATUS_ACTIVE && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm('Завершить обучение этой мини-группы?')) return;
                              void runAction(
                                'complete-group',
                                () => api.completeLearningGroup(selectedGroup.id),
                                'Мини-группа завершена.'
                              );
                            }}
                            disabled={busyKey === 'complete-group'}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            <BusyButtonContent busy={busyKey === 'complete-group'} busyLabel="Завершаем..." icon={CheckCircle2}>Завершить группу</BusyButtonContent>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {activeLearningLesson?.groupId === selectedGroup.id && (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><Video size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold">Открыто групповое занятие</div>
                        <div className="truncate text-xs text-emerald-700">{activeLearningLesson.topic || 'Без темы'}</div>
                      </div>
                    </div>
                  )}
                </section>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
                  <div className="flex min-w-max gap-1">
                    {TAB_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const isActive = tab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTab(item.id)}
                          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                            isActive ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                          }`}
                        >
                          <Icon size={16} /> {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {tab === 'overview' && (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    {isTeacher && (
                      <SectionCard title="Настройки группы" subtitle="Название и вместимость можно менять до завершения обучения.">
                        <form onSubmit={handleUpdateGroup} className="space-y-3">
                          <Field label="Название">
                            <input
                              value={editForm.name}
                              onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                              className={inputClassName}
                              disabled={selectedGroup.status === LEARNING_GROUP_STATUS_COMPLETED}
                              required
                            />
                          </Field>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Дата старта">
                              <input
                                type="date"
                                value={editForm.plannedStartDate}
                                onChange={(event) => setEditForm((current) => ({ ...current, plannedStartDate: event.target.value }))}
                                className={inputClassName}
                                disabled={selectedGroup.status === LEARNING_GROUP_STATUS_COMPLETED}
                              />
                            </Field>
                            <Field label="Вместимость">
                              <select
                                value={editForm.maxStudents}
                                onChange={(event) => setEditForm((current) => ({ ...current, maxStudents: Number(event.target.value) }))}
                                className={inputClassName}
                                disabled={selectedGroup.status === LEARNING_GROUP_STATUS_COMPLETED}
                              >
                                {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} учеников</option>)}
                              </select>
                            </Field>
                          </div>
                          <button
                            type="submit"
                            disabled={busyKey === 'update-group' || selectedGroup.status === LEARNING_GROUP_STATUS_COMPLETED}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <BusyButtonContent busy={busyKey === 'update-group'} busyLabel="Сохраняем..." icon={Save}>Сохранить</BusyButtonContent>
                          </button>
                        </form>
                      </SectionCard>
                    )}

                    <SectionCard
                      title="Участники"
                      subtitle={`${selectedGroup.memberCount} из ${selectedGroup.maxStudents} мест занято`}
                      className={!isTeacher ? 'xl:col-span-2' : ''}
                    >
                      <div className="space-y-2">
                        {selectedGroup.members.length === 0 ? (
                          <EmptyState icon={UserPlus} title="Состав пока пуст" text={isTeacher ? 'Добавьте первого ученика ниже.' : 'Преподаватель скоро добавит участников.'} />
                        ) : selectedGroup.members.map((member) => (
                          <div key={member.studentId} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                            {member.avatarDataUrl ? (
                              <img src={member.avatarDataUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
                            ) : (
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-sm font-black text-white">
                                {member.name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-bold text-slate-900">{member.name}</div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {member.addedAfterStart ? 'Добавлен(а) после старта' : 'Участник группы'}
                              </div>
                            </div>
                            {isTeacher && selectedGroup.status !== LEARNING_GROUP_STATUS_COMPLETED && (
                              <button
                                type="button"
                                onClick={() => void handleRemoveMember(member)}
                                disabled={busyKey === `remove-member:${member.studentId}`}
                                className="grid h-9 w-9 place-items-center rounded-xl border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                                aria-label={`Удалить ${member.name}`}
                              >
                                {busyKey === `remove-member:${member.studentId}` ? <Loader2 size={16} className="animate-spin" /> : <UserMinus size={16} />}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {isTeacher && selectedGroup.status !== LEARNING_GROUP_STATUS_COMPLETED && selectedGroup.memberCount < selectedGroup.maxStudents && (
                        <form onSubmit={handleAddMember} className="mt-4 space-y-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
                          <Field label="Добавить ученика">
                            <select
                              value={addStudentId}
                              onChange={(event) => setAddStudentId(event.target.value)}
                              className={inputClassName}
                              disabled={studentsLoading || availableStudents.length === 0}
                              required
                            >
                              <option value="">{studentsLoading ? 'Загружаем учеников...' : 'Выберите ученика'}</option>
                              {availableStudents.map((student) => (
                                <option key={getStudentId(student)} value={getStudentId(student)}>{getStudentName(student)}</option>
                              ))}
                            </select>
                          </Field>
                          {selectedGroup.status === LEARNING_GROUP_STATUS_ACTIVE && (
                            <Field label="Причина добавления после старта" hint="обязательно">
                              <textarea
                                value={lateAddReason}
                                onChange={(event) => setLateAddReason(event.target.value)}
                                className={`${inputClassName} min-h-20 resize-y`}
                                placeholder="Почему ученик присоединяется позже"
                                required
                              />
                            </Field>
                          )}
                          <button
                            type="submit"
                            disabled={!addStudentId || busyKey.startsWith('add-member:')}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <BusyButtonContent busy={busyKey.startsWith('add-member:')} busyLabel="Добавляем..." icon={UserPlus}>Добавить</BusyButtonContent>
                          </button>
                          {!studentsLoading && availableStudents.length === 0 && (
                            <p className="text-xs text-slate-500">Нет доступных учеников для добавления.</p>
                          )}
                        </form>
                      )}
                    </SectionCard>

                    {!isTeacher && (
                      <SectionCard title="Мой прогресс" subtitle="Краткая сводка по занятиям группы" className="xl:col-span-2">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-violet-500">Занятия</div>
                            <div className="mt-2 text-2xl font-black text-violet-900">
                              {Number.isFinite(completedLessons) ? completedLessons : lessons.filter((lesson) => lesson.status === 'completed').length}
                              <span className="text-sm font-semibold text-violet-500"> / {Number.isFinite(totalLessons) ? totalLessons : lessons.length}</span>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Посещаемость</div>
                            <div className="mt-2 text-2xl font-black text-emerald-900">{Number.isFinite(attendancePercent) ? `${Math.round(attendancePercent)}%` : '—'}</div>
                          </div>
                          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-sky-600">Домашние работы</div>
                            <div className="mt-2 text-2xl font-black text-sky-900">
                              {Number.isFinite(completedAssignments) ? completedAssignments : '—'}
                              <span className="text-sm font-semibold text-sky-500"> / {Number.isFinite(totalAssignments) ? totalAssignments : assignments.length}</span>
                            </div>
                          </div>
                        </div>
                      </SectionCard>
                    )}
                  </div>
                )}

                {tab === 'schedule' && (
                  <SectionCard
                    title="Регулярное расписание"
                    subtitle="Дни и время еженедельных встреч мини-группы."
                    action={isTeacher && selectedGroup.status !== LEARNING_GROUP_STATUS_COMPLETED ? (
                      <button
                        type="button"
                        onClick={() => setScheduleDraft((current) => [...current, {
                          id: `draft-${Date.now()}-${current.length}`,
                          weekdayKey: 'monday',
                          time: '17:00',
                          durationMinutes: 60,
                          subject: 'Занятие',
                          note: '',
                        }])}
                        className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100"
                      >
                        <Plus size={16} /> Добавить слот
                      </button>
                    ) : null}
                  >
                    {scheduleDraft.length === 0 ? (
                      <EmptyState icon={CalendarDays} title="Расписание пока не задано" text={isTeacher ? 'Добавьте еженедельный слот занятия.' : 'Преподаватель ещё настраивает расписание.'} />
                    ) : (
                      <div className="space-y-3">
                        {scheduleDraft.map((entry, index) => (
                          <div key={entry.id || index} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-3 md:grid-cols-[180px_120px_120px_minmax(0,1fr)_auto] md:items-end">
                            <Field label="День">
                              <select
                                value={entry.weekdayKey || 'monday'}
                                onChange={(event) => setScheduleDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, weekdayKey: event.target.value, date: null } : item))}
                                className={inputClassName}
                                disabled={!isTeacher || selectedGroup.status === LEARNING_GROUP_STATUS_COMPLETED}
                              >
                                {LEARNING_GROUP_WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                              </select>
                            </Field>
                            <Field label="Начало">
                              <input
                                type="time"
                                value={entry.time || ''}
                                onChange={(event) => setScheduleDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, time: event.target.value } : item))}
                                className={inputClassName}
                                disabled={!isTeacher || selectedGroup.status === LEARNING_GROUP_STATUS_COMPLETED}
                              />
                            </Field>
                            <Field label="Длительность">
                              <select
                                value={entry.durationMinutes || 60}
                                onChange={(event) => setScheduleDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, durationMinutes: Number(event.target.value) } : item))}
                                className={inputClassName}
                                disabled={!isTeacher || selectedGroup.status === LEARNING_GROUP_STATUS_COMPLETED}
                              >
                                {[45, 60, 75, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}
                              </select>
                            </Field>
                            <Field label="Тема слота">
                              <input
                                value={entry.subject || entry.topic || ''}
                                onChange={(event) => setScheduleDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, subject: event.target.value } : item))}
                                className={inputClassName}
                                disabled={!isTeacher || selectedGroup.status === LEARNING_GROUP_STATUS_COMPLETED}
                                placeholder="Занятие"
                              />
                            </Field>
                            {isTeacher && selectedGroup.status !== LEARNING_GROUP_STATUS_COMPLETED && (
                              <button
                                type="button"
                                onClick={() => setScheduleDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                                className="grid h-[42px] w-[42px] place-items-center rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                aria-label="Удалить слот"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {isTeacher && selectedGroup.status !== LEARNING_GROUP_STATUS_COMPLETED && (
                      <button
                        type="button"
                        onClick={() => void handleSaveSchedule()}
                        disabled={busyKey === 'save-schedule'}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        <BusyButtonContent busy={busyKey === 'save-schedule'} busyLabel="Сохраняем..." icon={Save}>Сохранить расписание</BusyButtonContent>
                      </button>
                    )}
                  </SectionCard>
                )}

                {tab === 'lessons' && (
                  <div className="space-y-4">
                    {isTeacher && selectedGroup.status === LEARNING_GROUP_STATUS_ACTIVE && (
                      <SectionCard title="Запланировать занятие" subtitle="Участники фиксируются на момент создания, а встреча проходит в Яндекс Телемосте.">
                        <form onSubmit={handleCreateLesson} className="grid gap-3 lg:grid-cols-[190px_130px_minmax(0,1fr)_auto] lg:items-end">
                          <Field label="Дата и время">
                            <input
                              type="datetime-local"
                              value={lessonForm.startAt}
                              onChange={(event) => setLessonForm((current) => ({ ...current, startAt: event.target.value }))}
                              className={inputClassName}
                              required
                            />
                          </Field>
                          <Field label="Длительность">
                            <select
                              value={lessonForm.durationMinutes}
                              onChange={(event) => setLessonForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))}
                              className={inputClassName}
                            >
                              {[45, 60, 75, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}
                            </select>
                          </Field>
                          <Field label="Тема">
                            <input
                              value={lessonForm.topic}
                              onChange={(event) => setLessonForm((current) => ({ ...current, topic: event.target.value }))}
                              className={inputClassName}
                              placeholder="Разбор циклов и списков"
                            />
                          </Field>
                          <button
                            type="submit"
                            disabled={busyKey === 'create-lesson'}
                            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <BusyButtonContent busy={busyKey === 'create-lesson'} busyLabel="Добавляем..." icon={Plus}>Добавить</BusyButtonContent>
                          </button>
                          <div className="lg:col-span-4">
                            <Field label="Ссылка на Телемост" hint="обязательно">
                              <input
                                value={lessonForm.telemostUrl}
                                onChange={(event) => setLessonForm((current) => ({ ...current, telemostUrl: event.target.value }))}
                                className={inputClassName}
                                placeholder="https://telemost.yandex.ru/j/..."
                                inputMode="url"
                                autoComplete="url"
                                required
                              />
                            </Field>
                          </div>
                        </form>
                      </SectionCard>
                    )}

                    {lessons.length === 0 ? (
                      <EmptyState icon={Video} title="Занятий пока нет" text={isTeacher ? 'После старта группы запланируйте первое занятие.' : 'Первое занятие скоро появится здесь.'} />
                    ) : (
                      <div className="space-y-3">
                        {lessons.map((lesson) => {
                          const lessonId = getLessonId(lesson);
                          const statusMeta = getStatusMeta(LESSON_STATUS_META, lesson.status, 'scheduled');
                          const isRoomOpenable = !['cancelled', 'completed'].includes(lesson.status);
                          const isWorkspaceOpenable = lesson.status !== 'cancelled';
                          const isWorkspaceReadOnly = lesson.status === 'completed';
                          const isEditing = editingLessonId === lessonId;
                          const telemostUrl = getLessonTelemostUrl(lesson);
                          const isCurrentContext = activeLearningLesson?.lessonId === lessonId;
                          return (
                            <article key={lessonId} className={`rounded-3xl border bg-white p-4 shadow-sm sm:p-5 ${isCurrentContext ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-base font-black text-slate-900 sm:text-lg">{lesson.topic || 'Занятие без темы'}</h3>
                                    <StatusPill meta={statusMeta} />
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                                    <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} /> {formatDate(getLessonStart(lesson), { withTime: true })}</span>
                                    <span className="inline-flex items-center gap-1.5"><Clock3 size={15} /> {formatDuration(lesson.durationMinutes)}</span>
                                    <span className="inline-flex items-center gap-1.5"><Users size={15} /> {getLessonParticipants(lesson, selectedGroup).length}</span>
                                  </div>
                                  {lesson.note && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{lesson.note}</p>}
                                </div>
                                {isTeacher && (
                                  <div className="flex flex-wrap gap-2">
                                    {!isEditing && (
                                      <button
                                        type="button"
                                        onClick={() => handleBeginEditLesson(lesson)}
                                        disabled={Boolean(busyKey)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                                      >
                                        <Pencil size={14} /> Изменить
                                      </button>
                                    )}
                                    {lesson.status === 'scheduled' && (
                                      <button
                                        type="button"
                                        onClick={() => void handleUpdateLessonStatus(lesson, 'active')}
                                        disabled={busyKey.startsWith(`lesson-status:${lessonId}`)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                      >
                                        <Play size={14} /> Начать
                                      </button>
                                    )}
                                    {lesson.status === 'active' && (
                                      <button
                                        type="button"
                                        onClick={() => void handleUpdateLessonStatus(lesson, 'completed')}
                                        disabled={busyKey.startsWith(`lesson-status:${lessonId}`)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        <Check size={14} /> Завершить
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {isTeacher && isEditing && (
                                <form onSubmit={(event) => void handleSaveLesson(event, lesson)} className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[190px_130px_minmax(0,1fr)]">
                                    <Field label="Дата и время">
                                      <input
                                        type="datetime-local"
                                        value={lessonEditForm.startAt}
                                        onChange={(event) => setLessonEditForm((current) => ({ ...current, startAt: event.target.value }))}
                                        className={inputClassName}
                                        required
                                      />
                                    </Field>
                                    <Field label="Длительность">
                                      <select
                                        value={lessonEditForm.durationMinutes}
                                        onChange={(event) => setLessonEditForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))}
                                        className={inputClassName}
                                      >
                                        {[45, 60, 75, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}
                                      </select>
                                    </Field>
                                    <Field label="Тема">
                                      <input
                                        value={lessonEditForm.topic}
                                        onChange={(event) => setLessonEditForm((current) => ({ ...current, topic: event.target.value }))}
                                        className={inputClassName}
                                        placeholder="Разбор циклов и списков"
                                      />
                                    </Field>
                                  </div>
                                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                    <Field label="Ссылка на Телемост" hint="обязательно">
                                      <input
                                        value={lessonEditForm.telemostUrl}
                                        onChange={(event) => setLessonEditForm((current) => ({ ...current, telemostUrl: event.target.value }))}
                                        className={inputClassName}
                                        placeholder="https://telemost.yandex.ru/j/..."
                                        inputMode="url"
                                        autoComplete="url"
                                        required
                                      />
                                    </Field>
                                    <Field label="Заметка">
                                      <input
                                        value={lessonEditForm.note}
                                        onChange={(event) => setLessonEditForm((current) => ({ ...current, note: event.target.value }))}
                                        className={inputClassName}
                                        placeholder="Что подготовить к занятию"
                                      />
                                    </Field>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      type="submit"
                                      disabled={busyKey === `update-lesson:${lessonId}`}
                                      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                                    >
                                      <BusyButtonContent busy={busyKey === `update-lesson:${lessonId}`} busyLabel="Сохраняем..." icon={Save}>Сохранить</BusyButtonContent>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingLessonId('')}
                                      disabled={busyKey === `update-lesson:${lessonId}`}
                                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      <X size={16} /> Отмена
                                    </button>
                                  </div>
                                </form>
                              )}

                              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                {telemostUrl && isRoomOpenable ? (
                                  <a
                                    href={telemostUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700"
                                  >
                                    <ExternalLink size={16} /> Открыть Телемост
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    disabled
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-3 py-2.5 text-sm font-bold text-slate-500"
                                  >
                                    <Video size={16} /> {isRoomOpenable ? 'Ссылка не настроена' : 'Встреча закрыта'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenLesson(lesson, 'board')}
                                  disabled={!isWorkspaceOpenable}
                                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  <PanelTop size={16} /> {isWorkspaceReadOnly ? 'Смотреть доску' : 'Доска'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenLesson(lesson, 'collab')}
                                  disabled={!isWorkspaceOpenable}
                                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  <Code2 size={16} /> {isWorkspaceReadOnly ? 'Смотреть код' : 'Совместный код'}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'materials' && (
                  <div className="space-y-4">
                    {isTeacher && selectedGroup.status !== LEARNING_GROUP_STATUS_COMPLETED && (
                      <SectionCard title="Добавить материал" subtitle="Опубликуйте текст со ссылкой или загрузите файл до 64 МБ.">
                        <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                          <button
                            type="button"
                            onClick={() => setMaterialMode('content')}
                            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${materialMode === 'content' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            <Link2 size={14} /> Текст или ссылка
                          </button>
                          <button
                            type="button"
                            onClick={() => setMaterialMode('file')}
                            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${materialMode === 'file' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            <Upload size={14} /> Файл
                          </button>
                        </div>
                        <form onSubmit={handleCreateMaterial} className="space-y-3">
                          {materialMode === 'content' ? (
                            <>
                              <div className="grid gap-3 md:grid-cols-2">
                                <Field label="Название">
                                  <input
                                    value={materialForm.title}
                                    onChange={(event) => setMaterialForm((current) => ({ ...current, title: event.target.value }))}
                                    className={inputClassName}
                                    placeholder="Конспект по спискам"
                                  />
                                </Field>
                                <Field label="Ссылка">
                                  <input
                                    type="url"
                                    value={materialForm.url}
                                    onChange={(event) => setMaterialForm((current) => ({ ...current, url: event.target.value }))}
                                    className={inputClassName}
                                    placeholder="https://..."
                                  />
                                </Field>
                              </div>
                              <Field label="Текст материала">
                                <textarea
                                  value={materialForm.content}
                                  onChange={(event) => setMaterialForm((current) => ({ ...current, content: event.target.value }))}
                                  className={`${inputClassName} min-h-28 resize-y`}
                                  placeholder="Короткий конспект, инструкции или полезные ссылки"
                                />
                              </Field>
                            </>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                              <Field label="Название">
                                <input
                                  value={materialForm.title}
                                  onChange={(event) => setMaterialForm((current) => ({ ...current, title: event.target.value }))}
                                  className={inputClassName}
                                  placeholder="Название для учеников"
                                />
                              </Field>
                              <Field label="Файл" hint="до 64 МБ">
                                <input
                                  ref={materialFileInputRef}
                                  type="file"
                                  onChange={handleMaterialFileChange}
                                  className="block w-full cursor-pointer rounded-xl border border-slate-200 bg-white text-sm text-slate-600 file:mr-3 file:border-0 file:border-r file:border-slate-200 file:bg-violet-50 file:px-3 file:py-2.5 file:text-sm file:font-bold file:text-violet-700 hover:file:bg-violet-100"
                                  required
                                />
                              </Field>
                              {materialFile && (
                                <div className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-violet-600 shadow-sm"><FileText size={17} /></span>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-bold text-slate-900">{materialFile.name}</div>
                                    <div className="text-xs text-slate-500">{formatFileSize(materialFile.size)}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMaterialFile(null);
                                      if (materialFileInputRef.current) materialFileInputRef.current.value = '';
                                    }}
                                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-rose-600"
                                    aria-label="Убрать файл"
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Доступ">
                              <select
                                value={materialForm.visibility}
                                onChange={(event) => setMaterialForm((current) => ({
                                  ...current,
                                  visibility: event.target.value,
                                  lessonId: event.target.value === 'lesson' ? current.lessonId : '',
                                }))}
                                className={inputClassName}
                              >
                                <option value="group">Вся группа</option>
                                <option value="lesson">Конкретное занятие</option>
                              </select>
                            </Field>
                            {materialForm.visibility === 'lesson' && (
                              <Field label="Занятие">
                                <select
                                  value={materialForm.lessonId}
                                  onChange={(event) => setMaterialForm((current) => ({ ...current, lessonId: event.target.value }))}
                                  className={inputClassName}
                                  required
                                >
                                  <option value="">Выберите занятие</option>
                                  {lessons.map((lesson) => <option key={getLessonId(lesson)} value={getLessonId(lesson)}>{lesson.topic} · {formatDate(getLessonStart(lesson), { withTime: true, withYear: false })}</option>)}
                                </select>
                              </Field>
                            )}
                          </div>
                          <button
                            type="submit"
                            disabled={
                              busyKey === 'create-material'
                              || busyKey === 'upload-material'
                              || (materialMode === 'file'
                                ? !materialFile
                                : (!cleanString(materialForm.content) && !cleanString(materialForm.url)))
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <BusyButtonContent
                              busy={busyKey === 'create-material' || busyKey === 'upload-material'}
                              busyLabel={materialMode === 'file' ? 'Загружаем...' : 'Добавляем...'}
                              icon={materialMode === 'file' ? Upload : Plus}
                            >
                              {materialMode === 'file' ? 'Загрузить файл' : 'Добавить материал'}
                            </BusyButtonContent>
                          </button>
                        </form>
                      </SectionCard>
                    )}

                    {materials.length === 0 ? (
                      <EmptyState icon={BookOpen} title="Материалов пока нет" text="Полезные ссылки и конспекты появятся здесь." />
                    ) : (
                      <div className="grid gap-3 xl:grid-cols-2">
                        {materials.map((material) => {
                          const materialId = getMaterialId(material);
                          const linkedLesson = lessons.find((lesson) => getLessonId(lesson) === cleanString(material.lessonId));
                          return (
                            <article key={materialId} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                              <div className="flex items-start gap-3">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-600"><FileText size={19} /></span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-black text-slate-900">{material.title}</h3>
                                    {isTeacher && typeof api.deleteLearningGroupMaterial === 'function' && (
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteMaterial(material)}
                                        disabled={busyKey === `delete-material:${materialId}`}
                                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                        aria-label="Удалить материал"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    )}
                                  </div>
                                  <div className="mt-1 text-xs font-semibold text-slate-400">
                                    {linkedLesson ? `К занятию: ${linkedLesson.topic}` : 'Для всей группы'}
                                    {material.sizeBytes ? ` · ${formatFileSize(material.sizeBytes)}` : ''}
                                  </div>
                                </div>
                              </div>
                              {material.content && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{material.content}</p>}
                              {getMaterialHref(material) && (
                                <a
                                  href={getMaterialHref(material)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100"
                                >
                                  {material.downloadUrl ? <Download size={15} /> : <Link2 size={15} />}
                                  <span className="truncate">{material.downloadUrl ? 'Скачать файл' : 'Открыть ссылку'}</span>
                                  {!material.downloadUrl && <ExternalLink size={13} />}
                                </a>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'assignments' && (
                  <div className="space-y-4">
                    {isTeacher && selectedGroup.status !== LEARNING_GROUP_STATUS_COMPLETED && (
                      <SectionCard title="Новое домашнее задание" subtitle="Задание назначается каждому текущему участнику отдельно.">
                        <form onSubmit={handleCreateAssignment} className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Название">
                              <input
                                value={assignmentForm.title}
                                onChange={(event) => setAssignmentForm((current) => ({ ...current, title: event.target.value }))}
                                className={inputClassName}
                                placeholder="Домашняя работа №1"
                              />
                            </Field>
                            <Field label="Срок сдачи">
                              <input
                                type="datetime-local"
                                value={assignmentForm.dueAt}
                                onChange={(event) => setAssignmentForm((current) => ({ ...current, dueAt: event.target.value }))}
                                className={inputClassName}
                              />
                            </Field>
                          </div>
                          <Field label="Задание">
                            <textarea
                              value={assignmentForm.content}
                              onChange={(event) => setAssignmentForm((current) => ({ ...current, content: event.target.value }))}
                              className={`${inputClassName} min-h-32 resize-y`}
                              placeholder="Условие, требования к решению и подсказки"
                              required={!assignmentForm.title}
                            />
                          </Field>
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Связать с занятием">
                              <select
                                value={assignmentForm.lessonId}
                                onChange={(event) => setAssignmentForm((current) => ({ ...current, lessonId: event.target.value }))}
                                className={inputClassName}
                              >
                                <option value="">Без привязки</option>
                                {lessons.map((lesson) => <option key={getLessonId(lesson)} value={getLessonId(lesson)}>{lesson.topic}</option>)}
                              </select>
                            </Field>
                            <Field label="Публикация">
                              <select
                                value={assignmentForm.status}
                                onChange={(event) => setAssignmentForm((current) => ({ ...current, status: event.target.value }))}
                                className={inputClassName}
                              >
                                <option value="assigned">Назначить сейчас</option>
                                <option value="draft">Сохранить черновик</option>
                              </select>
                            </Field>
                          </div>
                          <button
                            type="submit"
                            disabled={busyKey === 'create-assignment' || (!cleanString(assignmentForm.title) && !cleanString(assignmentForm.content))}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <BusyButtonContent busy={busyKey === 'create-assignment'} busyLabel="Сохраняем..." icon={Send}>
                              {assignmentForm.status === 'draft' ? 'Сохранить черновик' : 'Назначить группе'}
                            </BusyButtonContent>
                          </button>
                        </form>
                      </SectionCard>
                    )}

                    {assignments.length === 0 ? (
                      <EmptyState icon={ClipboardList} title="Домашних заданий пока нет" text={isTeacher ? 'Создайте первое задание для участников группы.' : 'Когда преподаватель назначит работу, она появится здесь.'} />
                    ) : assignments.map((assignment) => {
                      const assignmentId = getAssignmentId(assignment);
                      const isExpanded = expandedAssignmentId === assignmentId;
                      const submissionState = submissionsByAssignment[assignmentId] || {};
                      const assignmentMeta = getStatusMeta(ASSIGNMENT_STATUS_META, assignment.status, 'assigned');
                      const studentSubmission = submissionState.submission || null;
                      const assignmentSubmissions = Array.isArray(submissionState.submissions)
                        ? submissionState.submissions
                        : [];
                      const currentMemberIds = new Set(selectedGroup.members.map((member) => member.studentId));
                      const reviewMembers = [
                        ...selectedGroup.members,
                        ...assignmentSubmissions
                          .filter((submission) => !currentMemberIds.has(submission.studentId))
                          .map((submission) => ({
                            studentId: submission.studentId,
                            name: cleanString(submission?.student?.name) || 'Ученик',
                          })),
                      ];
                      return (
                        <article key={assignmentId} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                          <button
                            type="button"
                            onClick={() => toggleAssignment(assignment)}
                            className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-slate-50 sm:p-5"
                          >
                            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-600"><ClipboardCheck size={19} /></span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-black text-slate-900">{assignment.title}</h3>
                                <StatusPill meta={assignmentMeta} />
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                {assignment.dueAt && <span>Сдать до {formatDate(assignment.dueAt, { withTime: true })}</span>}
                                {assignment.lessonId && <span>Связано с занятием</span>}
                              </div>
                            </div>
                            {isExpanded ? <ChevronDown size={18} className="mt-2 text-violet-600" /> : <ChevronRight size={18} className="mt-2 text-slate-400" />}
                          </button>

                          {isExpanded && (
                            <div className="border-t border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                              {assignment.instructions || assignment.content ? (
                                <div className="mb-4 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
                                  {assignment.instructions || assignment.content}
                                </div>
                              ) : null}

                              {isTeacher && (
                                <div className="mb-4 flex flex-wrap gap-2">
                                  {assignment.status === 'draft' && (
                                    <button
                                      type="button"
                                      onClick={() => void handleAssignmentStatus(assignment, 'assigned')}
                                      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700"
                                    ><Send size={14} /> Опубликовать</button>
                                  )}
                                  {assignment.status === 'assigned' && (
                                    <button
                                      type="button"
                                      onClick={() => void handleAssignmentStatus(assignment, 'closed')}
                                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                    ><CheckCircle2 size={14} /> Закрыть приём</button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteAssignment(assignment)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                                  ><Trash2 size={14} /> Удалить</button>
                                </div>
                              )}

                              {submissionState.loading ? (
                                <div className="flex items-center gap-2 py-6 text-sm font-semibold text-slate-500"><Loader2 size={17} className="animate-spin" /> Загружаем решения...</div>
                              ) : submissionState.error ? (
                                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{submissionState.error}</div>
                              ) : isTeacher ? (
                                <div className="space-y-3">
                                  {reviewMembers.map((member) => {
                                    const submission = assignmentSubmissions.find((item) => item.studentId === member.studentId);
                                    const submissionMeta = getStatusMeta(SUBMISSION_STATUS_META, submission?.status || 'missing', 'missing');
                                    const reviewKey = `${assignmentId}:${member.studentId}`;
                                    const reviewDraft = reviewDrafts[reviewKey] || { grade: '', privateComment: '', status: 'reviewed' };
                                    return (
                                      <div key={member.studentId} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="font-bold text-slate-900">{member.name}</div>
                                          <StatusPill meta={submissionMeta} />
                                        </div>
                                        {submission?.content && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{submission.content}</div>}
                                        {submission?.answerRefs?.length > 0 && (
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            {submission.answerRefs.map((answerRef, index) => answerRef.url ? (
                                              <a key={`${answerRef.url}-${index}`} href={answerRef.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700"><Link2 size={13} /> {answerRef.label || 'Вложение'}</a>
                                            ) : null)}
                                          </div>
                                        )}
                                        {submission && submission.status !== 'draft' && (
                                          <div className="mt-3 grid gap-3 md:grid-cols-[130px_170px_minmax(0,1fr)_auto] md:items-end">
                                            <Field label="Оценка">
                                              <input
                                                value={reviewDraft.grade}
                                                onChange={(event) => setReviewDrafts((current) => ({ ...current, [reviewKey]: { ...reviewDraft, grade: event.target.value } }))}
                                                className={inputClassName}
                                                placeholder="Например, 8/10"
                                              />
                                            </Field>
                                            <Field label="Результат">
                                              <select
                                                value={reviewDraft.status || 'reviewed'}
                                                onChange={(event) => setReviewDrafts((current) => ({ ...current, [reviewKey]: { ...reviewDraft, status: event.target.value } }))}
                                                className={inputClassName}
                                              >
                                                <option value="reviewed">Принять работу</option>
                                                <option value="revision_requested">Вернуть на доработку</option>
                                              </select>
                                            </Field>
                                            <Field label="Личный комментарий">
                                              <input
                                                value={reviewDraft.privateComment}
                                                onChange={(event) => setReviewDrafts((current) => ({ ...current, [reviewKey]: { ...reviewDraft, privateComment: event.target.value } }))}
                                                className={inputClassName}
                                                placeholder="Что получилось и что доработать"
                                              />
                                            </Field>
                                            <button
                                              type="button"
                                              onClick={() => void handleReviewSubmission(assignmentId, member.studentId)}
                                              disabled={busyKey === `review-submission:${reviewKey}`}
                                              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                              <BusyButtonContent busy={busyKey === `review-submission:${reviewKey}`} busyLabel="Сохраняем..." icon={Check}>Проверить</BusyButtonContent>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {studentSubmission && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                                      <div>
                                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Моя работа</div>
                                        {studentSubmission.submittedAt && <div className="mt-1 text-xs text-slate-500">Отправлено {formatDate(studentSubmission.submittedAt, { withTime: true })}</div>}
                                      </div>
                                      <StatusPill meta={getStatusMeta(SUBMISSION_STATUS_META, studentSubmission.status, 'missing')} />
                                    </div>
                                  )}
                                  <Field label="Решение">
                                    <textarea
                                      value={submissionDrafts[assignmentId] ?? studentSubmission?.content ?? ''}
                                      onChange={(event) => setSubmissionDrafts((current) => ({ ...current, [assignmentId]: event.target.value }))}
                                      className={`${inputClassName} min-h-36 resize-y`}
                                      placeholder="Напишите решение или вставьте ссылку"
                                      disabled={assignment.status === 'closed'}
                                    />
                                  </Field>
                                  {['reviewed', 'revision_requested'].includes(studentSubmission?.status) && (
                                    <div className={`rounded-2xl border p-4 ${studentSubmission.status === 'reviewed' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                                      <div className={`text-xs font-bold uppercase tracking-wider ${studentSubmission.status === 'reviewed' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {studentSubmission.status === 'reviewed' ? 'Проверка преподавателя' : 'Нужна доработка'}
                                      </div>
                                      {studentSubmission.grade !== '' && <div className={`mt-2 text-lg font-black ${studentSubmission.status === 'reviewed' ? 'text-emerald-900' : 'text-rose-900'}`}>Оценка: {studentSubmission.grade}</div>}
                                      {studentSubmission.privateComment && <p className={`mt-1 whitespace-pre-wrap text-sm ${studentSubmission.status === 'reviewed' ? 'text-emerald-800' : 'text-rose-800'}`}>{studentSubmission.privateComment}</p>}
                                    </div>
                                  )}
                                  {assignment.status !== 'closed' && (
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleSaveSubmission(assignment, 'draft')}
                                        disabled={busyKey.startsWith(`save-submission:${assignmentId}`)}
                                        className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3.5 py-2.5 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                                      ><Save size={15} /> Сохранить черновик</button>
                                      <button
                                        type="button"
                                        onClick={() => void handleSaveSubmission(assignment, 'submitted')}
                                        disabled={!cleanString(submissionDrafts[assignmentId] ?? studentSubmission?.content) || busyKey.startsWith(`save-submission:${assignmentId}`)}
                                        className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                                      ><Send size={15} /> Отправить на проверку</button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}

                {tab === 'attendance' && (
                  <div className="space-y-4">
                    <SectionCard title="Посещаемость" subtitle={isTeacher ? 'Выберите занятие и отметьте каждого участника.' : 'История вашего присутствия на занятиях группы.'}>
                      {lessons.length === 0 ? (
                        <EmptyState icon={UserCheck} title="Нет занятий для отметки" text="Посещаемость появится после первого занятия." />
                      ) : (
                        <>
                          <Field label="Занятие">
                            <select
                              value={attendanceLessonId}
                              onChange={(event) => setAttendanceLessonId(event.target.value)}
                              className={inputClassName}
                            >
                              {lessons.map((lesson) => (
                                <option key={getLessonId(lesson)} value={getLessonId(lesson)}>
                                  {lesson.topic} · {formatDate(getLessonStart(lesson), { withTime: true, withYear: false })}
                                </option>
                              ))}
                            </select>
                          </Field>

                          {attendanceState.loading ? (
                            <div className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 size={17} className="animate-spin" /> Загружаем посещаемость...</div>
                          ) : attendanceState.error ? (
                            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{attendanceState.error}</div>
                          ) : attendanceState.records.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">Записей пока нет.</div>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {attendanceState.records.map((record) => {
                                const draft = attendanceDrafts[record.studentId] || {
                                  status: record.status || 'pending',
                                  presentSeconds: Number(record.presentSeconds ?? record.attendedSeconds) || 0,
                                  comment: record.comment || '',
                                };
                                const statusMeta = getStatusMeta(ATTENDANCE_STATUS_META, draft.status, 'pending');
                                return (
                                  <div key={record.studentId} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="font-bold text-slate-900">{record.studentName || getStudentName(studentById.get(record.studentId))}</div>
                                      {!isTeacher && <StatusPill meta={statusMeta} />}
                                    </div>
                                    {isTeacher ? (
                                      <div className="mt-3 grid gap-3 md:grid-cols-[190px_130px_minmax(0,1fr)]">
                                        <Field label="Статус">
                                          <select
                                            value={draft.status}
                                            onChange={(event) => setAttendanceDrafts((current) => ({ ...current, [record.studentId]: { ...draft, status: event.target.value } }))}
                                            className={inputClassName}
                                          >
                                            {Object.entries(ATTENDANCE_STATUS_META).filter(([key]) => key !== 'unknown').map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                                          </select>
                                        </Field>
                                        <Field label="Минут на уроке">
                                          <input
                                            type="number"
                                            min="0"
                                            value={Math.round((Number(draft.presentSeconds) || 0) / 60)}
                                            onChange={(event) => setAttendanceDrafts((current) => ({ ...current, [record.studentId]: { ...draft, presentSeconds: Math.max(0, Number(event.target.value) || 0) * 60 } }))}
                                            className={inputClassName}
                                          />
                                        </Field>
                                        <Field label="Комментарий">
                                          <input
                                            value={draft.comment}
                                            onChange={(event) => setAttendanceDrafts((current) => ({ ...current, [record.studentId]: { ...draft, comment: event.target.value } }))}
                                            className={inputClassName}
                                            placeholder="Необязательно"
                                          />
                                        </Field>
                                      </div>
                                    ) : (
                                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                                        <span>На занятии: {formatDuration(Math.round((Number(draft.presentSeconds) || 0) / 60))}</span>
                                        {draft.comment && <span>{draft.comment}</span>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {isTeacher && attendanceState.records.length > 0 && (
                            <button
                              type="button"
                              onClick={() => void handleSaveAttendance()}
                              disabled={busyKey === `save-attendance:${attendanceLessonId}`}
                              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                            >
                              <BusyButtonContent busy={busyKey === `save-attendance:${attendanceLessonId}`} busyLabel="Сохраняем..." icon={Save}>Сохранить отметки</BusyButtonContent>
                            </button>
                          )}
                        </>
                      )}
                    </SectionCard>

                    <SectionCard title={isTeacher ? 'Прогресс группы' : 'Мой прогресс'} subtitle="Сводка рассчитывается по занятиям, посещаемости и домашним работам.">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                          <BarChart3 size={19} className="text-violet-600" />
                          <div className="mt-3 text-xs font-bold uppercase tracking-wider text-violet-500">Завершено занятий</div>
                          <div className="mt-1 text-2xl font-black text-violet-900">{Number.isFinite(completedLessons) ? completedLessons : lessons.filter((lesson) => lesson.status === 'completed').length}<span className="text-sm text-violet-500"> / {Number.isFinite(totalLessons) ? totalLessons : lessons.length}</span></div>
                        </div>
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                          <UserCheck size={19} className="text-emerald-600" />
                          <div className="mt-3 text-xs font-bold uppercase tracking-wider text-emerald-600">Посещаемость</div>
                          <div className="mt-1 text-2xl font-black text-emerald-900">{Number.isFinite(attendancePercent) ? `${Math.round(attendancePercent)}%` : '—'}</div>
                        </div>
                        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                          <ClipboardCheck size={19} className="text-sky-600" />
                          <div className="mt-3 text-xs font-bold uppercase tracking-wider text-sky-600">Домашние работы</div>
                          <div className="mt-1 text-2xl font-black text-sky-900">{Number.isFinite(completedAssignments) ? completedAssignments : '—'}<span className="text-sm text-sky-500"> / {Number.isFinite(totalAssignments) ? totalAssignments : assignments.length}</span></div>
                        </div>
                      </div>
                      {isTeacher && progressMembers.length > 0 && (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                          <div className="grid grid-cols-[minmax(0,1fr)_100px_110px] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400 sm:grid-cols-[minmax(0,1fr)_140px_150px]">
                            <span>Ученик</span>
                            <span>Посещаемость</span>
                            <span>Домашние</span>
                          </div>
                          {progressMembers.map((memberProgress) => {
                            const memberAttendance = asObject(memberProgress.attendance);
                            const memberAssignments = asObject(memberProgress.assignments);
                            const attendanceTotal = Number(memberAttendance.total) || 0;
                            const attendanceVisited = (Number(memberAttendance.present) || 0) + (Number(memberAttendance.partial) || 0);
                            const memberAttendancePercent = attendanceTotal > 0
                              ? Math.round((attendanceVisited / attendanceTotal) * 100)
                              : null;
                            const member = selectedGroup.members.find((entry) => entry.studentId === memberProgress.studentId);
                            const name = cleanString(memberProgress?.student?.name) || member?.name || 'Ученик';
                            return (
                              <div key={memberProgress.studentId} className="grid grid-cols-[minmax(0,1fr)_100px_110px] gap-2 border-t border-slate-200 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_140px_150px]">
                                <span className="truncate font-bold text-slate-900">{name}</span>
                                <span className="font-semibold text-slate-600">{memberAttendancePercent === null ? '—' : `${memberAttendancePercent}%`}</span>
                                <span className="font-semibold text-slate-600">{Number(memberAssignments.submitted) || 0} / {Number(memberAssignments.total) || 0}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </SectionCard>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
};

export default LearningGroupsSection;
