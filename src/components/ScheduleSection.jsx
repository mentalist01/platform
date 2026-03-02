import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Calendar, CheckCircle, ChevronRight, Clock3, Pencil, RefreshCcw, Save, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';
import { normalizeHttpUrl, splitTextWithUrls } from '../utils/linkifyText';

const AUTO_REFRESH_INTERVAL_MS = 5000;
const DEFAULT_SCHEDULE_SUBJECT = 'Занятие';
const SCHEDULE_WEEKDAYS = [
  { key: 'monday', label: 'Понедельник', order: 1 },
  { key: 'tuesday', label: 'Вторник', order: 2 },
  { key: 'wednesday', label: 'Среда', order: 3 },
  { key: 'thursday', label: 'Четверг', order: 4 },
  { key: 'friday', label: 'Пятница', order: 5 },
  { key: 'saturday', label: 'Суббота', order: 6 },
  { key: 'sunday', label: 'Воскресенье', order: 7 },
];
const SCHEDULE_WEEKDAY_BY_KEY = SCHEDULE_WEEKDAYS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});
const SCHEDULE_WEEKDAY_KEY_BY_LABEL = SCHEDULE_WEEKDAYS.reduce((acc, item) => {
  acc[item.label.toLowerCase()] = item.key;
  return acc;
}, {});
const DEFAULT_SCHEDULE_FORM = {
  weekdayKey: 'monday',
  time: '',
};

const getScheduleWeekdayMetaFromDate = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = date.getDay();
  const order = weekday === 0 ? 7 : weekday;
  return SCHEDULE_WEEKDAYS.find((item) => item.order === order) || null;
};

const resolveScheduleWeekdayMeta = (entry) => {
  const normalizedKey = String(entry?.weekdayKey || '').trim().toLowerCase();
  if (normalizedKey && SCHEDULE_WEEKDAY_BY_KEY[normalizedKey]) {
    return SCHEDULE_WEEKDAY_BY_KEY[normalizedKey];
  }
  const normalizedLabel = String(entry?.day || '').trim().toLowerCase();
  if (normalizedLabel && SCHEDULE_WEEKDAY_KEY_BY_LABEL[normalizedLabel]) {
    return SCHEDULE_WEEKDAY_BY_KEY[SCHEDULE_WEEKDAY_KEY_BY_LABEL[normalizedLabel]];
  }
  return getScheduleWeekdayMetaFromDate(entry?.date);
};

const normalizeScheduleEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const weekdayMeta = resolveScheduleWeekdayMeta(entry);
  return {
    ...entry,
    weekdayKey: weekdayMeta?.key || '',
    day: weekdayMeta?.label || String(entry?.day || '').trim(),
    weekdayOrder: Number.isFinite(Number(entry?.weekdayOrder))
      ? Number(entry.weekdayOrder)
      : (weekdayMeta?.order || 99),
    time: String(entry?.time || '').trim(),
    subject: String(entry?.subject || '').trim() || DEFAULT_SCHEDULE_SUBJECT,
    note: String(entry?.note || '').trim(),
    createdByRole: String(entry?.createdByRole || '').trim(),
    createdByName: String(entry?.createdByName || '').trim(),
  };
};

const sortScheduleEntries = (entries = []) => (
  entries
    .map((entry) => normalizeScheduleEntry(entry))
    .filter(Boolean)
    .sort((left, right) => {
      const orderDiff = (Number(left?.weekdayOrder) || 99) - (Number(right?.weekdayOrder) || 99);
      if (orderDiff !== 0) return orderDiff;
      const timeDiff = String(left?.time || '').localeCompare(String(right?.time || ''), 'ru');
      if (timeDiff !== 0) return timeDiff;
      return String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''), 'ru');
    })
);

const getScheduleFormFromEntry = (entry) => {
  const normalized = normalizeScheduleEntry(entry);
  return {
    weekdayKey: normalized?.weekdayKey || DEFAULT_SCHEDULE_FORM.weekdayKey,
    time: normalized?.time || '',
  };
};
const ScheduleSection = ({
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  onOpenTask,
  onOpenMockGoal,
  solvedRefreshKey,
  tasks,
  nextHomeworkFlyRef,
  GOAL_TYPE_TASK,
  GOAL_TYPE_MOCK,
  normalizeGoalType,
  normalizeTaskNumber,
  isPythonTaskNumber,
  getPythonTaskInfo,
  getStudentLabel,
  getMockGoalProgress,
  getTaskDisplayNumber,
  formatTaskNumber,
  normalizeMockExamId,
  isMockExamAccessible,
  MOCK_TASKS,
  PYTHON_TASKS,
  PYTHON_LEVEL_ID,
  LEVELS,
}) => {
  const DEFAULT_HOMEWORK = '';
  const DEFAULT_GOAL = { type: GOAL_TYPE_TASK, taskNumber: '', levelId: 'basic', targetInput: '', includeAll: false, mockExamId: '' };
  const [homeworks, setHomeworks] = useState([]);
  const [nextLesson, setNextLesson] = useState({ homeWork: '', lessonLink: '', boardLink: '', daysToComplete: 7, issuedAt: '', taskNumber: null, levelId: null, targetQuestions: [], goals: [] });
  const [form, setForm] = useState({ homeWork: DEFAULT_HOMEWORK, lessonLink: '', boardLink: '', daysToComplete: 7, goals: [{ ...DEFAULT_GOAL }] });
  const [loading, setLoading] = useState(false);
  const [refreshingData, setRefreshingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [solvedByKey, setSolvedByKey] = useState({});
  const [mockExams, setMockExams] = useState([]);
  const [mockExamsLoading, setMockExamsLoading] = useState(false);
  const [mockExamsError, setMockExamsError] = useState('');
  const [mockAttemptsByExam, setMockAttemptsByExam] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [scheduleCompactMode, setScheduleCompactMode] = useState(true);
  const [lessonSchedule, setLessonSchedule] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({ ...DEFAULT_SCHEDULE_FORM });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleEditingId, setScheduleEditingId] = useState(null);
  const [scheduleDeletingId, setScheduleDeletingId] = useState(null);
  const [scheduleError, setScheduleError] = useState('');
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const mockAttemptStudentId = role === 'student' ? null : effectiveStudentId;
  const selectedStudent = role === 'teacher'
    ? studentsList.find((student) => student.id === effectiveStudentId) || null
    : null;
  const taskOptions = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const pythonTaskOptions = PYTHON_TASKS;
  const mockExamById = useMemo(
    () => (Array.isArray(mockExams)
      ? mockExams.reduce((acc, exam) => {
          if (exam?.id) acc[String(exam.id)] = exam;
          return acc;
        }, {})
      : {}),
    [mockExams]
  );

  const buildNextLessonData = (latest, fallback = {}) => ({
    homeWork: latest?.homeWork || '',
    lessonLink: latest?.lessonLink || '',
    boardLink: latest?.boardLink || '',
    daysToComplete: Number(latest?.daysToComplete) || fallback.daysToComplete || 7,
    issuedAt: latest?.issuedAt || '',
    taskNumber: latest?.taskNumber ?? null,
    levelId: latest?.levelId ?? null,
    targetQuestions: Array.isArray(latest?.targetQuestions) ? latest.targetQuestions : [],
    goals: Array.isArray(latest?.goals) ? latest.goals : [],
  });

  const loadNextLesson = async () => {
    if (!effectiveStudentId) {
      setHomeworks([]);
      setNextLesson({ homeWork: '', lessonLink: '', boardLink: '', daysToComplete: 7, issuedAt: '', taskNumber: null, levelId: null, targetQuestions: [], goals: [] });
      setForm({ homeWork: DEFAULT_HOMEWORK, lessonLink: '', boardLink: '', daysToComplete: 7, goals: [{ ...DEFAULT_GOAL }] });
      setEditingId(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getStudentNextLesson(effectiveStudentId);
      const list = Array.isArray(data?.homeworks) ? data.homeworks : [];
      const latest = data?.latest && typeof data.latest === 'object' ? data.latest : {};
      const safeData = buildNextLessonData(latest);
      setHomeworks(list);
      setNextLesson(safeData);
      setEditingId(null);
      if (role === 'teacher') {
        setForm({
          homeWork: DEFAULT_HOMEWORK,
          lessonLink: safeData.lessonLink || '',
          boardLink: safeData.boardLink || '',
          daysToComplete: safeData.daysToComplete || 7,
          goals: [{ ...DEFAULT_GOAL }]
        });
      }
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  const loadSchedule = useCallback(async () => {
    if (!effectiveStudentId) {
      setLessonSchedule([]);
      setScheduleEditingId(null);
      setScheduleForm({ ...DEFAULT_SCHEDULE_FORM });
      return;
    }
    setScheduleLoading(true);
    try {
      const data = await api.getStudentSchedule(effectiveStudentId);
      setLessonSchedule(sortScheduleEntries(Array.isArray(data) ? data : []));
      setScheduleError('');
    } catch (err) {
      setLessonSchedule([]);
      setScheduleError(err?.message || err);
    } finally {
      setScheduleLoading(false);
    }
  }, [effectiveStudentId]);

  useEffect(() => {
    loadNextLesson();
  }, [effectiveStudentId]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    setScheduleEditingId(null);
    setScheduleForm({ ...DEFAULT_SCHEDULE_FORM });
    setScheduleError('');
  }, [effectiveStudentId]);

  const handleRefreshData = useCallback(async () => {
    if (!effectiveStudentId || refreshingData) return;
    setRefreshingData(true);
    try {
      const [nextLessonResult, scheduleResult] = await Promise.allSettled([
        api.getStudentNextLesson(effectiveStudentId),
        api.getStudentSchedule(effectiveStudentId),
      ]);
      if (nextLessonResult.status === 'fulfilled') {
        const data = nextLessonResult.value;
        const list = Array.isArray(data?.homeworks) ? data.homeworks : [];
        const latest = data?.latest && typeof data.latest === 'object' ? data.latest : {};
        const safeData = buildNextLessonData(latest);
        setHomeworks(list);
        setNextLesson(safeData);
        setError('');
      } else {
        setError(nextLessonResult.reason?.message || nextLessonResult.reason);
      }
      if (scheduleResult.status === 'fulfilled') {
        setLessonSchedule(sortScheduleEntries(Array.isArray(scheduleResult.value) ? scheduleResult.value : []));
        setScheduleError('');
      } else {
        setScheduleError(scheduleResult.reason?.message || scheduleResult.reason);
      }
    } finally {
      setRefreshingData(false);
    }
  }, [effectiveStudentId, refreshingData]);

  useEffect(() => {
    if (!effectiveStudentId) return;
    const poll = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      handleRefreshData();
    };
    const intervalId = setInterval(poll, AUTO_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleRefreshData();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [effectiveStudentId, handleRefreshData]);

  useEffect(() => {
    let cancelled = false;
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestsDb(data && typeof data === 'object' ? data : {});
        setTestsDbError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsDb({});
        setTestsDbError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!effectiveStudentId) {
      setMockExams([]);
      setMockExamsLoading(false);
      setMockExamsError('');
      return;
    }
    let cancelled = false;
    setMockExamsLoading(true);
    api.getMockExams(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setMockExams(Array.isArray(data) ? data : []);
        setMockExamsError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setMockExams([]);
        setMockExamsError(err?.message || err);
      })
      .finally(() => {
        if (!cancelled) setMockExamsLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    if (!effectiveStudentId) {
      setSolvedByKey({});
      return;
    }
    const entries = Array.isArray(homeworks)
      ? homeworks.flatMap((entry) => {
          const goals = normalizeEntryGoals(entry).filter((goal) => goal.type === GOAL_TYPE_TASK);
          return goals.map((goal) => ({
            taskNumber: goal.taskNumber,
            levelId: goal.levelId
          }));
        })
      : [];
    const unique = [];
    const seen = new Set();
    entries.forEach((entry) => {
      const key = `${entry.taskNumber}|${entry.levelId}`;
      if (seen.has(key)) return;
      seen.add(key);
      unique.push({ key, taskNumber: entry.taskNumber, levelId: entry.levelId });
    });
    if (unique.length === 0) {
      setSolvedByKey({});
      return;
    }
    let cancelled = false;
    const loadSolved = async () => {
      try {
        const results = await Promise.all(
          unique.map((item) =>
            api.getSolvedQuestions(effectiveStudentId, item.taskNumber, item.levelId).catch(() => [])
          )
        );
        if (cancelled) return;
        const next = {};
        unique.forEach((item, idx) => {
          const list = Array.isArray(results[idx]) ? results[idx] : [];
          next[item.key] = new Set(list.map((val) => String(val)));
        });
        setSolvedByKey(next);
      } catch {
        if (!cancelled) setSolvedByKey({});
      }
    };
    loadSolved();
    return () => { cancelled = true; };
  }, [effectiveStudentId, homeworks, solvedRefreshKey]);

  useEffect(() => {
    if (!effectiveStudentId) {
      setMockAttemptsByExam({});
      return;
    }
    const uniqueExamIds = Array.from(new Set(
      (Array.isArray(homeworks) ? homeworks : [])
        .flatMap((entry) => normalizeEntryGoals(entry))
        .filter((goal) => goal.type === GOAL_TYPE_MOCK)
        .map((goal) => normalizeMockExamId(goal.mockExamId))
        .filter(Boolean)
        .filter((examId) => {
          const exam = mockExamById?.[examId];
          if (!exam || !effectiveStudentId) return false;
          return isMockExamAccessible(exam, effectiveStudentId);
        })
    ));
    if (uniqueExamIds.length === 0) {
      setMockAttemptsByExam({});
      return;
    }
    let cancelled = false;
    const loadMockAttempts = async () => {
      try {
        const results = await Promise.all(
          uniqueExamIds.map((examId) => api.getMockAttempt(mockAttemptStudentId, examId).catch(() => null))
        );
        if (cancelled) return;
        const next = {};
        uniqueExamIds.forEach((examId, idx) => {
          const attempt = results[idx];
          if (attempt && typeof attempt === 'object') next[examId] = attempt;
        });
        setMockAttemptsByExam(next);
      } catch {
        if (!cancelled) setMockAttemptsByExam({});
      }
    };
    loadMockAttempts();
    return () => { cancelled = true; };
  }, [effectiveStudentId, homeworks, isMockExamAccessible, mockAttemptStudentId, mockExamById, solvedRefreshKey]);

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Ученик:</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const resetScheduleForm = () => {
    setScheduleEditingId(null);
    setScheduleForm({ ...DEFAULT_SCHEDULE_FORM });
  };

  const startEditSchedule = (entry) => {
    if (!entry?.id) return;
    setScheduleEditingId(entry.id);
    setScheduleForm(getScheduleFormFromEntry(entry));
    setScheduleError('');
  };

  const handleSaveSchedule = async () => {
    if (!effectiveStudentId) return;
    if (!scheduleForm.weekdayKey || !scheduleForm.time) {
      setScheduleError('Выберите день и время занятия.');
      return;
    }
    setScheduleSaving(true);
    try {
      const payload = {
        weekdayKey: scheduleForm.weekdayKey,
        time: scheduleForm.time,
        note: '',
        subject: DEFAULT_SCHEDULE_SUBJECT,
      };
      const savedEntry = scheduleEditingId
        ? await api.updateScheduleEntry(effectiveStudentId, scheduleEditingId, payload)
        : await api.addScheduleEntry(effectiveStudentId, payload);
      setLessonSchedule((prev) => sortScheduleEntries([
        ...prev.filter((item) => item?.id !== savedEntry?.id),
        savedEntry,
      ]));
      resetScheduleForm();
      setScheduleError('');
    } catch (err) {
      setScheduleError(err?.message || err);
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleDeleteSchedule = async (entry) => {
    if (!effectiveStudentId || !entry?.id) return;
    if (!window.confirm('Удалить этот слот из расписания?')) return;
    setScheduleDeletingId(entry.id);
    try {
      await api.deleteScheduleEntry(effectiveStudentId, entry.id);
      setLessonSchedule((prev) => prev.filter((item) => item?.id !== entry.id));
      if (scheduleEditingId === entry.id) {
        resetScheduleForm();
      }
      setScheduleError('');
    } catch (err) {
      setScheduleError(err?.message || err);
    } finally {
      setScheduleDeletingId(null);
    }
  };

  const parseTargetInput = (input, maxCount) => {
    const parts = String(input || '').split(/[\s,;]+/).filter(Boolean);
    const numbers = parts
      .map((val) => Number(val))
      .filter((val) => Number.isFinite(val) && val > 0)
      .map((val) => Math.trunc(val));
    const unique = Array.from(new Set(numbers));
    if (Number.isFinite(maxCount) && maxCount > 0) {
      return unique.filter((val) => val <= maxCount);
    }
    return unique;
  };

  const formatTargetInput = (targets) => {
    if (!Array.isArray(targets)) return '';
    const values = Array.from(new Set(
      targets
        .map((val) => Number(val))
        .filter((val) => Number.isFinite(val) && val > 0)
        .map((val) => Math.trunc(val))
    ));
    return values.join(', ');
  };

  const getQuestionsCount = (taskNumber, levelId) => {
    if (!testsDb || !taskNumber) return null;
    const effectiveLevelId = isPythonTaskNumber(taskNumber) ? PYTHON_LEVEL_ID : levelId;
    if (!effectiveLevelId) return null;
    const list = testsDb?.[String(taskNumber)]?.[effectiveLevelId];
    return Array.isArray(list) ? list.length : null;
  };

  const normalizeEntryGoals = (entry) => {
    if (!entry) return [];
    if (Array.isArray(entry.goals) && entry.goals.length > 0) {
      return entry.goals
        .map((goal) => {
          const goalType = normalizeGoalType(goal);
          if (goalType === GOAL_TYPE_MOCK) {
            const mockExamId = normalizeMockExamId(goal?.mockExamId);
            if (!mockExamId) return null;
            return {
              type: GOAL_TYPE_MOCK,
              mockExamId
            };
          }
          const normalizedTaskNumber = normalizeTaskNumber(goal?.taskNumber);
          const taskNumberValue = Number.isFinite(normalizedTaskNumber)
            ? String(normalizedTaskNumber)
            : '';
          const isPythonGoal = Number.isFinite(normalizedTaskNumber)
            ? isPythonTaskNumber(normalizedTaskNumber)
            : false;
          return {
            type: GOAL_TYPE_TASK,
            taskNumber: taskNumberValue,
            levelId: isPythonGoal ? PYTHON_LEVEL_ID : (goal?.levelId || 'basic'),
            targetQuestions: Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [],
            includeAll: Boolean(goal?.includeAll)
          };
        })
        .filter((goal) => (
          goal?.type === GOAL_TYPE_MOCK
            ? Boolean(goal?.mockExamId)
            : Boolean(goal?.taskNumber)
        ));
    }
    if (entry.taskNumber && entry.levelId) {
      const entryTaskNumber = Number(entry.taskNumber);
      return [{
        type: GOAL_TYPE_TASK,
        taskNumber: Number.isFinite(normalizeTaskNumber(entry.taskNumber))
          ? String(normalizeTaskNumber(entry.taskNumber))
          : String(entry.taskNumber),
        levelId: isPythonTaskNumber(entryTaskNumber) ? PYTHON_LEVEL_ID : entry.levelId,
        targetQuestions: Array.isArray(entry.targetQuestions) ? entry.targetQuestions : [],
        includeAll: Boolean(entry.includeAll)
      }];
    }
    return [];
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');
  };

  const formatDaysText = (days) => {
    const value = Number(days) || 0;
    if (value === 7) return 'неделя';
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return `${value} день`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} дня`;
    return `${value} дней`;
  };

  const renderLinkedText = (text, keyPrefix = 'homework') => {
    const parts = splitTextWithUrls(text);
    if (parts.length === 0) return String(text || '');
    return parts.map((part, index) => {
      if (part.type === 'link') {
        return (
          <a
            key={`${keyPrefix}-link-${index}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 break-all hover:text-purple-700"
          >
            {part.value}
          </a>
        );
      }
      return (
        <React.Fragment key={`${keyPrefix}-text-${index}`}>
          {part.value}
        </React.Fragment>
      );
    });
  };

  const sortedHomeworks = useMemo(() => {
    const list = Array.isArray(homeworks) ? [...homeworks] : [];
    return list.sort((a, b) => new Date(b?.issuedAt || 0) - new Date(a?.issuedAt || 0));
  }, [homeworks]);
  const sortedSchedule = useMemo(() => sortScheduleEntries(lessonSchedule), [lessonSchedule]);

  const nextHomeworkEntry = sortedHomeworks[0] || null;
  const previousHomeworkEntries = sortedHomeworks.slice(1);
  const totalHomeworkCount = sortedHomeworks.length;

  const buildGoalView = (goal, goalIndex = 0) => {
    const goalType = normalizeGoalType(goal);
    if (goalType === GOAL_TYPE_MOCK) {
      const mockExamId = normalizeMockExamId(goal?.mockExamId);
      if (!mockExamId) return null;
      const mockExam = mockExamById[mockExamId] || null;
      const mockProgress = getMockGoalProgress(mockExam, mockAttemptsByExam?.[mockExamId]);
      const totalCount = Number(mockProgress.totalCount) || 0;
      const solvedCount = Number(mockProgress.solvedCount) || 0;
      const progressPercent = totalCount > 0
        ? Math.max(0, Math.min(100, Math.round((solvedCount / totalCount) * 100)))
        : 0;
      return {
        viewKey: `mock-${mockExamId}-${goalIndex}`,
        type: GOAL_TYPE_MOCK,
        mockExamId,
        heading: `Пробник · ${mockExam?.title || 'Пробник недоступен'}`,
        totalCount,
        solvedCount,
        progressPercent,
      };
    }
    const taskNumber = Number(goal?.taskNumber);
    if (!Number.isFinite(taskNumber)) return null;
    const isPythonGoal = isPythonTaskNumber(taskNumber);
    const pythonTask = isPythonGoal ? getPythonTaskInfo(taskNumber) : null;
    const taskDisplay = isPythonGoal
      ? (pythonTask?.displayNumber || taskNumber)
      : (formatTaskNumber(taskNumber) || taskNumber);
    const levelId = isPythonGoal ? PYTHON_LEVEL_ID : goal?.levelId;
    const levelLabel = isPythonGoal
      ? 'Python'
      : (LEVELS[levelId?.toUpperCase()]?.label || levelId);
    const questionsList = taskNumber && levelId
      ? (testsDb?.[String(taskNumber)]?.[levelId] || [])
      : [];
    const totalCount = questionsList.length;
    const targetNumbers = goal?.includeAll
      ? (totalCount > 0 ? Array.from({ length: totalCount }, (_, i) => i + 1) : [])
      : Array.from(new Set(
          (Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [])
            .map((val) => Number(val))
            .filter((val) => Number.isFinite(val) && val > 0)
        )).sort((a, b) => a - b);
    const targetsKey = taskNumber && levelId ? `${taskNumber}|${levelId}` : null;
    const solvedSet = targetsKey ? solvedByKey?.[targetsKey] : null;
    const targetStatus = targetNumbers.map((num) => {
      const question = questionsList[num - 1];
      const qId = question?.id;
      const solved = qId ? solvedSet?.has(String(qId)) : false;
      return { num, solved };
    });
    const solvedCount = targetStatus.filter((item) => item.solved).length;
    const progressPercent = targetStatus.length > 0
      ? Math.max(0, Math.min(100, Math.round((solvedCount / targetStatus.length) * 100)))
      : 0;
    const heading = isPythonGoal
      ? `Python ${pythonTask?.title || (taskNumber ? `тема ${taskNumber}` : 'тема')}`
      : `Задание ${taskDisplay} · ${levelLabel}`;
    return {
      viewKey: `task-${taskNumber}-${levelId}-${goalIndex}`,
      type: GOAL_TYPE_TASK,
      heading,
      taskNumber,
      levelId,
      includeAll: Boolean(goal?.includeAll),
      targetNumbers,
      targetStatus,
      totalCount: targetStatus.length,
      solvedCount,
      progressPercent,
    };
  };

  const summarizeGoalViews = (goalViews) => {
    const list = Array.isArray(goalViews) ? goalViews : [];
    const totalCount = list.reduce(
      (sum, item) => sum + (Number(item?.totalCount) > 0 ? Number(item.totalCount) : 0),
      0
    );
    const solvedCount = list.reduce((sum, item) => {
      const itemTotal = Number(item?.totalCount) || 0;
      const itemSolved = Number(item?.solvedCount) || 0;
      if (itemTotal <= 0) return sum;
      return sum + Math.min(itemSolved, itemTotal);
    }, 0);
    const remainingCount = Math.max(totalCount - solvedCount, 0);
    const progressPercent = totalCount > 0
      ? Math.max(0, Math.min(100, Math.round((solvedCount / totalCount) * 100)))
      : 0;
    const pendingGoals = list.filter((item) => {
      const itemTotal = Number(item?.totalCount) || 0;
      const itemSolved = Number(item?.solvedCount) || 0;
      if (itemTotal <= 0) return true;
      return itemSolved < itemTotal;
    });
    const completedGoals = list.filter((item) => {
      const itemTotal = Number(item?.totalCount) || 0;
      const itemSolved = Number(item?.solvedCount) || 0;
      return itemTotal > 0 && itemSolved >= itemTotal;
    });
    return {
      totalCount,
      solvedCount,
      remainingCount,
      progressPercent,
      pendingGoals,
      completedGoals,
      goalCount: list.length,
    };
  };

  const nextHomeworkGoalViews = nextHomeworkEntry
    ? normalizeEntryGoals(nextHomeworkEntry)
      .map((goal, goalIndex) => buildGoalView(goal, goalIndex))
      .filter(Boolean)
    : [];
  const nextHomeworkSummary = summarizeGoalViews(nextHomeworkGoalViews);
  const nextHomeworkPendingGoal = nextHomeworkSummary.pendingGoals[0] || null;
  const nextHomeworkPendingShortLabel = nextHomeworkPendingGoal?.heading
    ? String(nextHomeworkPendingGoal.heading).split('·')[0].trim()
    : '';

  useEffect(() => {
    setShowHistory(false);
  }, [effectiveStudentId, totalHomeworkCount]);

  const renderHomeworkEntryCard = (entry, section = 'next', key) => {
    if (!entry) return null;
    const isNextSection = section === 'next';
    const dateText = formatDate(entry?.issuedAt);
    const daysText = formatDaysText(entry?.daysToComplete || 7);
    const isEditing = editingId && entry?.id === editingId;
    const entryGoals = normalizeEntryGoals(entry);
    const goalViews = entryGoals
      .map((goal, goalIndex) => buildGoalView(goal, goalIndex))
      .filter(Boolean);
    const goalsSummary = summarizeGoalViews(goalViews);
    const firstPendingGoal = goalsSummary.pendingGoals[0] || null;
    const canOpenFirstPending = Boolean(
      firstPendingGoal
      && (
        (firstPendingGoal.type === GOAL_TYPE_MOCK && onOpenMockGoal)
        || (firstPendingGoal.type === GOAL_TYPE_TASK && onOpenTask)
      )
    );
    const compactPendingPreview = goalsSummary.pendingGoals.slice(0, 2);
    const compactCompletedPreview = goalsSummary.completedGoals.slice(0, 2);
    const sectionTone = isNextSection
      ? 'border-purple-300/80 bg-gradient-to-br from-white via-purple-50/85 to-fuchsia-50/65 shadow-[0_12px_30px_rgba(147,51,234,0.12)]'
      : 'border-slate-200/90 bg-white';
    const cardTone = isEditing ? 'border-purple-400 bg-purple-50/70 ring-2 ring-purple-200/70' : sectionTone;
    const sectionLabel = isNextSection ? 'Следующий урок' : 'Предыдущая домашка';
    const summaryStatus = goalsSummary.goalCount === 0
      ? { label: 'Цели не заданы', tone: 'border-slate-200 bg-white text-slate-600' }
      : goalsSummary.totalCount > 0 && goalsSummary.remainingCount === 0
        ? { label: 'Все выполнено', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
        : goalsSummary.solvedCount > 0
          ? { label: 'В процессе', tone: 'border-amber-200 bg-amber-50 text-amber-700' }
          : { label: 'Нужно начать', tone: 'border-purple-200 bg-purple-50 text-purple-700' };
    const checklistLines = String(entry?.homeWork || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const visibleChecklistLines = scheduleCompactMode ? checklistLines.slice(0, 4) : checklistLines;
    const hiddenChecklistCount = Math.max(checklistLines.length - visibleChecklistLines.length, 0);
    const lessonUrl = normalizeHttpUrl(entry?.lessonLink);
    const boardUrl = normalizeHttpUrl(entry?.boardLink);

    const openGoal = (goalView) => {
      if (!goalView) return;
      if (goalView.type === GOAL_TYPE_MOCK) {
        onOpenMockGoal?.(goalView.mockExamId);
        return;
      }
      onOpenTask?.(goalView.taskNumber, goalView.levelId, goalView.targetNumbers);
    };

    return (
      <div key={key} className={`rounded-2xl border p-3.5 md:p-5 space-y-3 md:space-y-4 ${cardTone}`}>
        <div className="flex flex-wrap items-start justify-between gap-2.5 md:gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                isNextSection
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-300/50'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {sectionLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                <Calendar size={13} />
                {dateText || 'сегодня'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                <RefreshCcw size={12} />
                {`Срок: ${daysText}`}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${summaryStatus.tone}`}>
                {summaryStatus.label}
              </span>
            </div>
          </div>
          {role === 'teacher' && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => startEditHomework(entry)}
                className="px-3 py-1 rounded-lg border border-slate-200 bg-white/90 text-xs font-semibold text-slate-600 hover:bg-white"
              >
                Редактировать
              </button>
              {entry.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteHomework(entry)}
                  disabled={deletingId === entry.id}
                  className="px-3 py-1 rounded-lg border border-red-200 bg-red-50/70 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {deletingId === entry.id ? 'Удаление...' : 'Удалить'}
                </button>
              )}
            </div>
          )}
        </div>
        {goalViews.length > 0 ? (
          <div className={`rounded-2xl border p-3 md:p-4 space-y-3 ${
            isNextSection
              ? 'border-purple-200/80 bg-white/90'
              : 'border-slate-200/90 bg-slate-50/70'
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-purple-500">
                  Прогресс по целям
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {goalsSummary.totalCount > 0
                    ? `Выполнено ${goalsSummary.solvedCount} из ${goalsSummary.totalCount}`
                    : `Целей задано: ${goalsSummary.goalCount}`}
                </div>
              </div>
              <div className="rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                {goalsSummary.totalCount > 0 ? `${goalsSummary.progressPercent}%` : 'без тестов'}
              </div>
            </div>
            {goalsSummary.totalCount > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-purple-100/80">
                <div
                  className={`h-full rounded-full ${
                    goalsSummary.remainingCount === 0
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                      : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                  }`}
                  style={{ width: `${goalsSummary.progressPercent}%` }}
                />
              </div>
            )}
            {scheduleCompactMode ? (
              <div className="rounded-xl border border-purple-100 bg-white/85 px-3 py-2.5">
                {compactPendingPreview.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-purple-700">Что сделать сейчас</div>
                    {compactPendingPreview.map((goalView) => (
                      <div key={`compact-pending-${goalView.viewKey}`} className="flex items-start gap-2 text-xs text-slate-700">
                        <ChevronRight size={13} className="mt-[1px] text-purple-500" />
                        <span>{goalView.heading}</span>
                      </div>
                    ))}
                    {goalsSummary.pendingGoals.length > compactPendingPreview.length && (
                      <div className="text-[11px] text-purple-600">
                        {`Ещё ${goalsSummary.pendingGoals.length - compactPendingPreview.length} целей`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs font-medium text-emerald-700">Все цели закрыты. Отличная работа.</div>
                )}
                {compactCompletedPreview.length > 0 && (
                  <div className="mt-2 text-[11px] text-emerald-700">
                    {`Уже выполнено: ${goalsSummary.completedGoals.length} из ${goalsSummary.goalCount} целей`}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Решено</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{goalsSummary.solvedCount}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Осталось</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{goalsSummary.remainingCount}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Закрыто целей</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{goalsSummary.completedGoals.length}/{goalsSummary.goalCount}</div>
                  </div>
                </div>
                {isNextSection && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-purple-100 bg-purple-50/70 px-3 py-2.5">
                      <div className="text-[11px] font-semibold text-purple-700">Что сделать к следующему занятию</div>
                      {goalsSummary.pendingGoals.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {goalsSummary.pendingGoals.slice(0, 3).map((goalView) => (
                            <div key={`pending-${goalView.viewKey}`} className="flex items-start gap-2 text-xs text-purple-800">
                              <ChevronRight size={13} className="mt-[1px] text-purple-500" />
                              <span>{goalView.heading}</span>
                            </div>
                          ))}
                          {goalsSummary.pendingGoals.length > 3 && (
                            <div className="text-[11px] text-purple-600">
                              {`И ещё ${goalsSummary.pendingGoals.length - 3} целей`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-emerald-700">Все цели закрыты. Отличная работа.</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                      <div className="text-[11px] font-semibold text-emerald-700">Уже сделано</div>
                      {goalsSummary.completedGoals.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {goalsSummary.completedGoals.slice(0, 3).map((goalView) => (
                            <div key={`done-${goalView.viewKey}`} className="flex items-start gap-2 text-xs text-emerald-800">
                              <CheckCircle size={13} className="mt-[1px]" />
                              <span>{goalView.heading}</span>
                            </div>
                          ))}
                          {goalsSummary.completedGoals.length > 3 && (
                            <div className="text-[11px] text-emerald-700">
                              {`И ещё ${goalsSummary.completedGoals.length - 3} выполнено`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-slate-500">Пока нет выполненных целей.</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            {isNextSection && canOpenFirstPending && (
              <button
                type="button"
                onClick={() => openGoal(firstPendingGoal)}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-semibold hover:from-violet-700 hover:to-purple-700 shadow-sm shadow-purple-300/50"
              >
                {firstPendingGoal.type === GOAL_TYPE_MOCK ? 'Начать пробник' : 'Начать следующую цель'}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-500">
            Цели не заданы. Ориентируйтесь на комментарий преподавателя ниже.
          </div>
        )}

        {goalViews.length > 0 && !scheduleCompactMode && (
          <div className="space-y-2.5">
            {goalViews.map((goalView) => {
              if (goalView.type === GOAL_TYPE_MOCK) {
                const remainingCount = goalView.totalCount > 0
                  ? Math.max(goalView.totalCount - goalView.solvedCount, 0)
                  : 0;
                return (
                  <div key={goalView.viewKey} className="rounded-xl border border-purple-100/80 bg-white/90 px-3 py-2.5 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-purple-700">{goalView.heading}</div>
                        <div className="text-[11px] text-slate-500">
                          {goalView.totalCount > 0
                            ? `Выполнено ${goalView.solvedCount}/${goalView.totalCount}`
                            : 'В пробнике пока нет заданий.'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700">
                        {goalView.totalCount > 0 ? `${goalView.solvedCount}/${goalView.totalCount}` : '—'}
                      </div>
                    </div>
                    {goalView.totalCount > 0 && (
                      <div className="h-2 overflow-hidden rounded-full bg-purple-100/80">
                        <div
                          className={`h-full rounded-full ${
                            remainingCount === 0
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                              : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                          }`}
                          style={{ width: `${goalView.progressPercent}%` }}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500">
                        {goalView.totalCount > 0
                          ? `Осталось: ${remainingCount}`
                          : 'Добавьте задания в пробник.'}
                      </div>
                      {onOpenMockGoal && (
                        <button
                          type="button"
                          onClick={() => onOpenMockGoal(goalView.mockExamId)}
                          className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700"
                        >
                          Перейти к пробнику
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              const remainingCount = goalView.totalCount > 0
                ? Math.max(goalView.totalCount - goalView.solvedCount, 0)
                : 0;
              const visibleTargetStatus = goalView.targetStatus.slice(0, 12);
              const hiddenTargetCount = Math.max(goalView.targetStatus.length - visibleTargetStatus.length, 0);

              return (
                <div key={goalView.viewKey} className="rounded-xl border border-purple-100/80 bg-white/90 px-3 py-2.5 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-purple-700">{goalView.heading}</div>
                      <div className="text-[11px] text-slate-500">
                        {goalView.targetNumbers.length > 0
                          ? `Выполнено ${goalView.solvedCount}/${goalView.totalCount}`
                          : (goalView.includeAll ? 'Все задания уровня' : 'Цель без выбранных вопросов')}
                      </div>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700">
                      {goalView.totalCount > 0 ? `${goalView.solvedCount}/${goalView.totalCount}` : '—'}
                    </div>
                  </div>
                  {goalView.totalCount > 0 && (
                    <div className="h-2 overflow-hidden rounded-full bg-purple-100/80">
                      <div
                        className={`h-full rounded-full ${
                          remainingCount === 0
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                            : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                        }`}
                        style={{ width: `${goalView.progressPercent}%` }}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-500">
                      {goalView.totalCount > 0
                        ? `Осталось: ${remainingCount}`
                        : 'Откройте задание, чтобы начать.'}
                    </div>
                    {onOpenTask && (
                      <button
                        type="button"
                        onClick={() => onOpenTask(goalView.taskNumber, goalView.levelId, goalView.targetNumbers)}
                        className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700"
                      >
                        Перейти к заданию
                      </button>
                    )}
                  </div>
                  {goalView.targetNumbers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {visibleTargetStatus.map((item) => (
                        <span
                          key={`${goalView.viewKey}-${item.num}`}
                          className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${
                            item.solved
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                              : 'border-purple-200 bg-purple-50 text-purple-700'
                          }`}
                        >
                          №{item.num}{item.solved ? ' ✓' : ''}
                        </span>
                      ))}
                      {hiddenTargetCount > 0 && (
                        <span className="px-2 py-1 rounded-md border border-slate-200 bg-slate-100 text-[11px] font-semibold text-slate-600">
                          +{hiddenTargetCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-purple-100/70 bg-white/90 p-3.5 md:p-4">
          <div className="mb-1.5 md:mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-purple-500">Домашка</p>
            {checklistLines.length > 0 && (
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                {`Пунктов: ${checklistLines.length}`}
              </span>
            )}
          </div>
          {checklistLines.length > 0 ? (
            <div className="space-y-1.5">
              {visibleChecklistLines.map((line, index) => (
                <div key={`${line}-${index}`} className="flex items-start gap-2 text-[13px] md:text-sm text-gray-700 leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                  <span className="whitespace-pre-wrap break-words">
                    {renderLinkedText(line, `${section}-${entry?.id || key || 'entry'}-${index}`)}
                  </span>
                </div>
              ))}
              {hiddenChecklistCount > 0 && (
                <div className="text-[11px] text-slate-500">
                  {`Ещё ${hiddenChecklistCount} пунктов — переключите режим на «Подробно», чтобы увидеть всё.`}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] md:text-sm leading-relaxed text-slate-500">
              Комментариев учителя нет.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
          {lessonUrl ? (
            <a
              href={lessonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/80 px-3.5 py-2.5 md:px-4 md:py-3 text-[13px] md:text-sm font-semibold text-purple-700 hover:border-purple-400 hover:bg-white"
            >
              <span className="inline-flex items-center gap-2">
                <Calendar size={15} />
                Открыть ссылку на занятие
              </span>
              <ChevronRight size={15} className="text-purple-400 transition group-hover:translate-x-0.5 group-hover:text-purple-600" />
            </a>
          ) : (
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">
              <Calendar size={14} />
              Ссылка на занятие не указана
            </div>
          )}
          {boardUrl ? (
            <a
              href={boardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/80 px-3.5 py-2.5 md:px-4 md:py-3 text-[13px] md:text-sm font-semibold text-purple-700 hover:border-purple-400 hover:bg-white"
            >
              <span className="inline-flex items-center gap-2">
                <BookOpen size={15} />
                Открыть онлайн-доску
              </span>
              <ChevronRight size={15} className="text-purple-400 transition group-hover:translate-x-0.5 group-hover:text-purple-600" />
            </a>
          ) : (
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">
              <BookOpen size={14} />
              Ссылка на доску не указана
            </div>
          )}
          {!lessonUrl && !boardUrl && (
            <div className="md:hidden rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500">
              Ссылки к занятию появятся здесь.
            </div>
          )}
        </div>
      </div>
    );
  };

  const resetFormToDefault = (base = null) => {
    const source = base || nextLesson || {};
    setForm({
      homeWork: DEFAULT_HOMEWORK,
      lessonLink: source?.lessonLink || '',
      boardLink: source?.boardLink || '',
      daysToComplete: source?.daysToComplete || 7,
      goals: [{ ...DEFAULT_GOAL }]
    });
    setEditingId(null);
  };

  const startEditHomework = (entry) => {
    if (!entry) return;
    const goals = normalizeEntryGoals(entry);
    setEditingId(entry.id || null);
    setForm({
      homeWork: entry.homeWork || '',
      lessonLink: entry.lessonLink || '',
      boardLink: entry.boardLink || '',
      daysToComplete: Number(entry.daysToComplete) || 7,
      goals: goals.length
        ? goals.map((goal) => {
            if (goal.type === GOAL_TYPE_MOCK) {
              return {
                ...DEFAULT_GOAL,
                type: GOAL_TYPE_MOCK,
                mockExamId: goal.mockExamId
              };
            }
            return {
              ...DEFAULT_GOAL,
              type: GOAL_TYPE_TASK,
              taskNumber: goal.taskNumber,
              levelId: goal.levelId || 'basic',
              includeAll: goal.includeAll,
              targetInput: goal.includeAll ? '' : formatTargetInput(goal.targetQuestions)
            };
          })
        : [{ ...DEFAULT_GOAL }]
    });
  };

  const updateGoal = (index, patch) => {
    setForm((prev) => {
      const goals = Array.isArray(prev.goals) ? [...prev.goals] : [];
      if (!goals[index]) return prev;
      goals[index] = { ...goals[index], ...patch };
      return { ...prev, goals };
    });
  };

  const addGoalRow = () => {
    setForm((prev) => ({
      ...prev,
      goals: [...(Array.isArray(prev.goals) ? prev.goals : []), { ...DEFAULT_GOAL }]
    }));
  };

  const removeGoalRow = (index) => {
    setForm((prev) => {
      const goals = Array.isArray(prev.goals) ? prev.goals.filter((_, i) => i !== index) : [];
      return { ...prev, goals: goals.length ? goals : [{ ...DEFAULT_GOAL }] };
    });
  };

  const handleSave = async () => {
    if (!effectiveStudentId || role !== 'teacher') return;
    setSaving(true);
    try {
      const goalsPayload = (Array.isArray(form.goals) ? form.goals : [])
        .map((goal) => {
          const goalType = normalizeGoalType(goal);
          if (goalType === GOAL_TYPE_MOCK) {
            const mockExamId = normalizeMockExamId(goal?.mockExamId);
            if (!mockExamId) return null;
            return {
              type: GOAL_TYPE_MOCK,
              mockExamId
            };
          }
          const taskNumber = String(goal?.taskNumber || '').trim();
          if (!taskNumber) return null;
          const normalizedTaskNumber = normalizeTaskNumber(taskNumber);
          if (!Number.isFinite(normalizedTaskNumber)) return null;
          const levelId = isPythonTaskNumber(normalizedTaskNumber)
            ? PYTHON_LEVEL_ID
            : (goal?.levelId || 'basic');
          const includeAll = Boolean(goal?.includeAll);
          const availableCount = getQuestionsCount(normalizedTaskNumber, levelId);
          const targetQuestions = includeAll ? [] : parseTargetInput(goal?.targetInput, availableCount);
          return {
            type: GOAL_TYPE_TASK,
            taskNumber: normalizedTaskNumber,
            levelId,
            includeAll,
            targetQuestions
          };
        })
        .filter(Boolean);
      const payload = {
        homeWork: form.homeWork,
        lessonLink: form.lessonLink,
        boardLink: form.boardLink,
        daysToComplete: form.daysToComplete,
        goals: goalsPayload
      };
      const updated = editingId
        ? await api.updateStudentHomework(effectiveStudentId, editingId, payload)
        : await api.updateStudentNextLesson(effectiveStudentId, payload);
      const list = Array.isArray(updated?.homeworks) ? updated.homeworks : [];
      const latest = updated?.latest && typeof updated.latest === 'object' ? updated.latest : {};
      const safeData = buildNextLessonData(latest, form);
      setHomeworks(list);
      setNextLesson(safeData);
      resetFormToDefault(safeData);
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHomework = async (entry) => {
    if (role !== 'teacher' || !effectiveStudentId || !entry?.id) return;
    if (!window.confirm('Удалить домашку?')) return;
    setDeletingId(entry.id);
    try {
      const updated = await api.deleteStudentHomework(effectiveStudentId, entry.id);
      const list = Array.isArray(updated?.homeworks) ? updated.homeworks : [];
      const latest = updated?.latest && typeof updated.latest === 'object' ? updated.latest : {};
      const safeData = buildNextLessonData(latest, form);
      setHomeworks(list);
      setNextLesson(safeData);
      if (editingId === entry.id) resetFormToDefault(safeData);
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setDeletingId(null);
    }
  };

  if (role === 'teacher' && studentsList.length === 0) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Моё расписание</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">
          {studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'}
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Моё расписание</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">Выберите ученика, чтобы открыть его расписание.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn" data-tour="schedule">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/75 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2.5 md:space-y-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Моё расписание</h2>
            </div>
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white/85 p-1 text-xs font-semibold text-slate-600 shadow-sm">
              <button
                type="button"
                onClick={() => setScheduleCompactMode(true)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  scheduleCompactMode
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'hover:bg-slate-100'
                }`}
              >
                Кратко
              </button>
              <button
                type="button"
                onClick={() => setScheduleCompactMode(false)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  scheduleCompactMode
                    ? 'hover:bg-slate-100'
                    : 'bg-purple-600 text-white shadow-sm'
                }`}
              >
                Подробно
              </button>
            </div>
            {nextHomeworkPendingGoal && (
              <div className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/80 px-3 py-1.5 text-xs text-slate-600 shadow-sm">
                <span className="shrink-0 font-semibold text-slate-500">Следующий шаг:</span>
                <span className="truncate font-semibold text-purple-700">{nextHomeworkPendingShortLabel || nextHomeworkPendingGoal.heading}</span>
              </div>
            )}
          </div>
          {renderStudentPicker()}
        </div>
      </div>

      {(error || testsDbError || mockExamsError || scheduleError) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-600">
              {error}
            </div>
          )}
          {testsDbError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-700">
              {testsDbError}
            </div>
          )}
          {mockExamsError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-700">
              {mockExamsError}
            </div>
          )}
          {scheduleError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-600">
              {scheduleError}
            </div>
          )}
        </div>
      )}

      {(role === 'teacher' || role === 'student') && (
        <Card className="space-y-4 border-sky-200/70 bg-gradient-to-br from-white via-sky-50/50 to-indigo-50/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-lg font-bold text-slate-900">
                {role === 'teacher' ? 'График занятий ученика' : 'График занятий'}
              </div>
              <p className="text-xs text-slate-500">
                {role === 'teacher'
                  ? `Задайте дни и время занятий${selectedStudent ? ` для ${getStudentLabel(selectedStudent)}` : ' для выбранного ученика'}.`
                  : 'Здесь можно самому задать дни и время занятий. Преподаватель увидит их у себя в расписании.'}
              </p>
            </div>
            <span className="rounded-full border border-sky-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
              {`Слотов: ${sortedSchedule.length}`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
            <select
              value={scheduleForm.weekdayKey}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, weekdayKey: e.target.value }))}
              className="px-4 py-2 rounded-xl bg-white border border-sky-100 focus:border-sky-500 outline-none"
            >
              {SCHEDULE_WEEKDAYS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            <input
              type="time"
              value={scheduleForm.time}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, time: e.target.value }))}
              className="px-4 py-2 rounded-xl bg-white border border-sky-100 focus:border-sky-500 outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSaveSchedule} disabled={scheduleSaving || !effectiveStudentId} className="md:px-5">
              <Save size={16} /> {scheduleSaving ? 'Сохранение...' : (scheduleEditingId ? 'Сохранить слот' : 'Добавить слот')}
            </Button>
            {scheduleEditingId && (
              <button
                type="button"
                onClick={resetScheduleForm}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Отменить
              </button>
            )}
          </div>

          {scheduleLoading && sortedSchedule.length === 0 ? (
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
              <RefreshCcw size={14} className="animate-spin" />
              Загружаем график...
            </div>
          ) : sortedSchedule.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-500">
              Слоты занятий пока не заданы.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedSchedule.map((entry) => {
                return (
                  <div key={entry.id || `${entry.weekdayKey}-${entry.time}-${entry.createdAt || 'slot'}`} className="rounded-2xl border border-sky-100/80 bg-white/90 p-4 shadow-sm shadow-sky-100/40">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                            <Calendar size={13} />
                            {entry.day || 'День не указан'}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                            <Clock3 size={13} />
                            {entry.time || 'Время не указано'}
                          </span>
                          {entry.date && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                              {formatDate(entry.date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditSchedule(entry)}
                          disabled={scheduleDeletingId === entry.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                        >
                          <Pencil size={13} />
                          Изменить
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSchedule(entry)}
                          disabled={scheduleDeletingId === entry.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                        >
                          <Trash2 size={13} />
                          {scheduleDeletingId === entry.id ? 'Удаление...' : 'Удалить'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {role === 'teacher' && (
        <Card className="space-y-4 border-purple-200/60 bg-gradient-to-br from-white via-white to-purple-50/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-800">
                {editingId ? 'Редактировать домашку' : 'Обновить данные'}
              </h3>
              <p className="text-xs text-slate-500">Заполните домашку, цели и ссылки на ближайшее занятие</p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={() => resetFormToDefault()}
                className="px-3 py-1 rounded-lg border border-gray-200 bg-white/90 text-xs font-semibold text-gray-600 hover:bg-white"
              >
                Отменить
              </button>
            )}
          </div>
          <textarea
            value={form.homeWork}
            onChange={(e) => setForm((prev) => ({ ...prev, homeWork: e.target.value }))}
            placeholder="Домашка на следующий урок"
            className="w-full min-h-[120px] resize-none rounded-xl border border-purple-100 bg-white/90 px-4 py-3 shadow-inner shadow-purple-100/40 focus:border-purple-500 outline-none"
          />
          <div className="space-y-3">
            {(Array.isArray(form.goals) ? form.goals : []).map((goal, index) => {
              const goalType = normalizeGoalType(goal);
              const isMockGoal = goalType === GOAL_TYPE_MOCK;
              const hasTask = !isMockGoal && Boolean(goal?.taskNumber);
              const normalizedGoalTaskNumber = normalizeTaskNumber(goal?.taskNumber);
              const isPythonGoal = isPythonTaskNumber(normalizedGoalTaskNumber);
              const effectiveLevelId = isPythonGoal ? PYTHON_LEVEL_ID : goal.levelId;
              const taskNumberValue = Number.isFinite(normalizedGoalTaskNumber)
                ? normalizedGoalTaskNumber
                : goal?.taskNumber;
              const availableCount = hasTask ? getQuestionsCount(taskNumberValue, effectiveLevelId) : null;
              const selectedMockExam = isMockGoal
                ? mockExamById[normalizeMockExamId(goal?.mockExamId)]
                : null;
              return (
                <div key={`${index}-${goalType}-${goal?.taskNumber || goal?.mockExamId || 'goal'}`} className="rounded-2xl border border-purple-100/70 bg-white/90 p-3.5 space-y-3 shadow-sm shadow-purple-100/40">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select
                      value={goalType}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === GOAL_TYPE_MOCK) {
                          updateGoal(index, { ...DEFAULT_GOAL, type: GOAL_TYPE_MOCK });
                          return;
                        }
                        updateGoal(index, { ...DEFAULT_GOAL, type: GOAL_TYPE_TASK, levelId: goal.levelId || 'basic' });
                      }}
                      className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
                    >
                      <option value={GOAL_TYPE_TASK}>Задание</option>
                      <option value={GOAL_TYPE_MOCK}>Пробник</option>
                    </select>
                    {isMockGoal ? (
                      <>
                        <select
                          value={goal?.mockExamId || ''}
                          onChange={(e) => updateGoal(index, { mockExamId: e.target.value })}
                          className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none md:col-span-2"
                        >
                          <option value="">Выберите пробник</option>
                          {mockExams.map((exam) => (
                            <option key={exam.id} value={exam.id}>{exam.title}</option>
                          ))}
                        </select>
                        <div className="flex items-center justify-end gap-3">
                          {(Array.isArray(form.goals) ? form.goals.length : 0) > 1 && (
                            <button
                              type="button"
                              onClick={() => removeGoalRow(index)}
                              className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <select
                          value={goal.taskNumber || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            const valueNum = value ? Number(value) : null;
                            const nextIsPython = valueNum ? isPythonTaskNumber(valueNum) : false;
                            updateGoal(index, {
                              taskNumber: value,
                              levelId: nextIsPython ? PYTHON_LEVEL_ID : (goal.levelId || 'basic'),
                              includeAll: value ? goal.includeAll : false,
                              targetInput: value ? goal.targetInput : ''
                            });
                          }}
                          className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
                        >
                          <option value="">Выберите задание</option>
                          <optgroup label="ЕГЭ">
                            {taskOptions.map((task) => (
                              <option key={task.id ?? task.number} value={task.number}>
                                Задание {getTaskDisplayNumber(task)}: {task.title}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Python">
                            {pythonTaskOptions.map((task) => (
                              <option key={task.id ?? task.number} value={task.number}>
                                {task.displayNumber} · {task.title}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        <select
                          value={isPythonGoal ? PYTHON_LEVEL_ID : (goal.levelId || 'basic')}
                          onChange={(e) => updateGoal(index, { levelId: e.target.value })}
                          disabled={!hasTask || isPythonGoal}
                          className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none disabled:opacity-60"
                        >
                          {isPythonGoal ? (
                            <option value={PYTHON_LEVEL_ID}>Python</option>
                          ) : (
                            Object.values(LEVELS).map((lvl) => (
                              <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                            ))
                          )}
                        </select>
                        <div className="flex items-center justify-between gap-3">
                          <label className={`flex items-center gap-2 text-xs font-semibold ${hasTask ? 'text-gray-600' : 'text-gray-400'}`}>
                            <input
                              type="checkbox"
                              checked={Boolean(goal.includeAll)}
                              disabled={!hasTask}
                              onChange={(e) => updateGoal(index, { includeAll: e.target.checked, targetInput: e.target.checked ? '' : goal.targetInput })}
                            />
                            Все задания
                          </label>
                          {(Array.isArray(form.goals) ? form.goals.length : 0) > 1 && (
                            <button
                              type="button"
                              onClick={() => removeGoalRow(index)}
                              className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="space-y-2">
                    {isMockGoal ? (
                      <div className="text-xs text-gray-500">
                        {mockExamsLoading
                          ? 'Загружаем пробники...'
                          : (selectedMockExam
                              ? `Выбран пробник: ${selectedMockExam.title}`
                              : (mockExams.length > 0
                                  ? 'Выберите пробник из списка.'
                                  : 'Для этого ученика нет доступных пробников.'))}
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={goal.targetInput || ''}
                          onChange={(e) => updateGoal(index, { targetInput: e.target.value })}
                          placeholder="Номера вопросов (например: 1, 3, 5)"
                          disabled={!hasTask || goal.includeAll}
                          className="w-full px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none disabled:opacity-60"
                        />
                        <div className="text-xs text-gray-400">
                          {goal.includeAll
                            ? 'Выбраны все задания этого уровня.'
                            : (availableCount
                                ? `Всего вопросов в уровне: ${availableCount}`
                                : 'Можно оставить пустым — тогда цель не задаётся.')}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addGoalRow}
              className="px-3 py-2 rounded-xl border border-purple-200 bg-white/90 text-xs font-semibold text-purple-700 hover:bg-purple-50"
            >
              + Добавить цель
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="number"
              min="1"
              value={form.daysToComplete}
              onChange={(e) => setForm((prev) => ({ ...prev, daysToComplete: e.target.value }))}
              placeholder="Дней на выполнение"
              className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
            <input
              type="url"
              value={form.lessonLink}
              onChange={(e) => setForm((prev) => ({ ...prev, lessonLink: e.target.value }))}
              placeholder="Ссылка на следующее занятие"
              className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
            <input
              type="url"
              value={form.boardLink}
              onChange={(e) => setForm((prev) => ({ ...prev, boardLink: e.target.value }))}
              placeholder="Ссылка на онлайн-доску"
              className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="md:self-start md:px-5">
            <Save size={16} /> {saving ? 'Сохранение...' : (editingId ? 'Сохранить изменения' : 'Добавить домашку')}
          </Button>
        </Card>
      )}

      <div className="space-y-4 md:space-y-5">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Домашние задания</h3>
        </div>

        {loading ? (
          <Card className="border-slate-200 bg-white/85">
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
              <RefreshCcw size={14} className="animate-spin" />
              Загрузка...
            </div>
          </Card>
        ) : sortedHomeworks.length === 0 ? (
          <Card className="border-slate-200 bg-white/85">
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
              Комментариев учителя нет.
            </div>
          </Card>
        ) : (
          <div className="space-y-4 md:space-y-6">
            <div ref={nextHomeworkFlyRef}>
              <Card className="space-y-2.5 md:space-y-3 border-purple-200/80 bg-gradient-to-br from-purple-50/70 via-white to-fuchsia-50/45 shadow-[0_14px_30px_rgba(147,51,234,0.14)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-purple-700">
                    <Calendar size={15} />
                    На следующий урок
                  </h4>
                  {nextHomeworkEntry?.issuedAt && (
                    <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-600">
                      {formatDate(nextHomeworkEntry.issuedAt)}
                    </span>
                  )}
                </div>
                {renderHomeworkEntryCard(nextHomeworkEntry, 'next')}
              </Card>
            </div>

            <Card className="space-y-2.5 md:space-y-3 border-slate-200 bg-white/90">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <RefreshCcw size={14} />
                  Предыдущие домашки
                </h4>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">
                  {previousHomeworkEntries.length}
                </span>
              </div>
              {previousHomeworkEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
                  Пока нет предыдущих домашних.
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowHistory((prev) => !prev)}
                    className="w-full md:w-auto rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[12px] md:text-sm font-semibold text-slate-600"
                  >
                    {showHistory
                      ? 'Скрыть предыдущие домашки'
                      : `Показать предыдущие (${previousHomeworkEntries.length})`}
                  </button>
                  <div className={`${showHistory ? 'space-y-3 md:space-y-4 block' : 'hidden'}`}>
                    {previousHomeworkEntries.map((entry, idx) =>
                      renderHomeworkEntryCard(entry, 'history', entry.id || `${entry?.issuedAt || 'entry'}-${idx}`)
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};



export default ScheduleSection;

