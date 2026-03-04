import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Menu,
  Plus,
  RefreshCcw,
  Search,
  Settings,
} from 'lucide-react';
import { api } from '../services/api';

const SCHEDULE_WEEKDAYS = [
  { key: 'monday', label: 'Понедельник', shortLabel: 'Пн', order: 1 },
  { key: 'tuesday', label: 'Вторник', shortLabel: 'Вт', order: 2 },
  { key: 'wednesday', label: 'Среда', shortLabel: 'Ср', order: 3 },
  { key: 'thursday', label: 'Четверг', shortLabel: 'Чт', order: 4 },
  { key: 'friday', label: 'Пятница', shortLabel: 'Пт', order: 5 },
  { key: 'saturday', label: 'Суббота', shortLabel: 'Сб', order: 6 },
  { key: 'sunday', label: 'Воскресенье', shortLabel: 'Вс', order: 7 },
];

const MINI_MONTH_WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HOLIDAY_DEFINITIONS = [
  { month: 3, day: 8, title: 'Международный женский день' },
];
const EVENT_COLORS = ['#7c3aed', '#8b5cf6', '#2563eb', '#0891b2', '#db2777', '#0d9488'];

const CALENDAR_START_HOUR = 7;
const CALENDAR_END_HOUR = 22;
const MIN_CALENDAR_HOUR_HEIGHT = 24;
const MAX_CALENDAR_HOUR_HEIGHT = 56;
const CALENDAR_VIEWPORT_RESERVED_PX = 360;
const DEFAULT_EVENT_DURATION_MINUTES = 60;
const QUICK_CREATE_TIME_STEP_MINUTES = 30;
const DEFAULT_ONE_TIME_LESSON_SUBJECT = 'Пробное занятие';
const TRIAL_WITHOUT_STUDENT_VALUE = '__trial_without_student__';
const CALENDAR_UI_PREFS_STORAGE_KEY = 'teacher_calendar_ui_prefs_v2';
const QUICK_DURATION_PRESETS = [30, 45, 60, 90];
const QUICK_TIME_PRESETS = ['09:00', '12:00', '15:00', '17:00', '19:00'];
const LESSON_FILTER_ALL = 'all';
const LESSON_FILTER_TRIAL = 'trial';
const LESSON_FILTER_STUDENT = 'student';

const SCHEDULE_WEEKDAY_BY_KEY = SCHEDULE_WEEKDAYS.reduce((acc, weekday) => {
  acc[weekday.key] = weekday;
  return acc;
}, {});

const SCHEDULE_WEEKDAY_KEY_BY_LABEL = SCHEDULE_WEEKDAYS.reduce((acc, weekday) => {
  acc[weekday.label.toLowerCase()] = weekday.key;
  return acc;
}, {});

const cloneAsDateOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const addDays = (date, days) => {
  const next = cloneAsDateOnly(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getWeekStart = (date = new Date()) => {
  const normalized = cloneAsDateOnly(date);
  const day = normalized.getDay();
  const diff = (day + 6) % 7;
  normalized.setDate(normalized.getDate() - diff);
  return normalized;
};

const toDayKey = (date) => {
  const normalized = cloneAsDateOnly(date);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const day = String(normalized.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDayKeyFromIsoDate = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return toDayKey(date);
};

const capitalize = (value) => {
  if (!value) return '';
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const formatMonthYear = (date) => capitalize(date.toLocaleDateString('ru-RU', {
  month: 'long',
  year: 'numeric',
}));

const formatDayMonth = (date) => date.toLocaleDateString('ru-RU', {
  day: 'numeric',
  month: 'short',
});

const formatHourLabel = (hour, use24HourFormat = true) => {
  if (use24HourFormat) {
    return `${String(hour).padStart(2, '0')}:00`;
  }
  const amPm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${amPm}`;
};

const parseScheduleTimeToMinutes = (value) => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
  return (hours * 60) + minutes;
};

const parseDayKeyToDate = (dayKey) => {
  const normalized = String(dayKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatMinutesAsTime = (minutes) => {
  const normalized = Number(minutes);
  if (!Number.isFinite(normalized)) return '--:--';
  const total = Math.max(0, Math.floor(normalized));
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const formatMinutesAsDisplayTime = (minutes, use24HourFormat = true) => {
  const normalized = Number(minutes);
  if (!Number.isFinite(normalized)) return '--:--';
  const total = Math.max(0, Math.floor(normalized));
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  if (use24HourFormat) return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const amPm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(mins).padStart(2, '0')} ${amPm}`;
};

const isTrialEntry = (entry) => !String(entry?.studentId || '').trim();

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const roundMinutesToStep = (minutes, step = QUICK_CREATE_TIME_STEP_MINUTES) => {
  const numericMinutes = Number(minutes);
  if (!Number.isFinite(numericMinutes)) return NaN;
  const safeStep = Math.max(1, Number(step) || 1);
  return Math.round(numericMinutes / safeStep) * safeStep;
};

const getTimezoneLabel = () => {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return minutes === '00' ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${minutes}`;
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
  const durationRaw = Number(entry?.durationMinutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : DEFAULT_EVENT_DURATION_MINUTES;
  return {
    ...entry,
    weekdayKey: weekdayMeta?.key || '',
    day: weekdayMeta?.label || String(entry?.day || '').trim(),
    weekdayOrder: Number.isFinite(Number(entry?.weekdayOrder))
      ? Number(entry.weekdayOrder)
      : (weekdayMeta?.order || 99),
    time: String(entry?.time || '').trim(),
    studentId: String(entry?.studentId || '').trim(),
    studentName: String(entry?.studentName || '').trim(),
    durationMinutes,
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
      const studentDiff = String(left?.studentName || '').localeCompare(String(right?.studentName || ''), 'ru');
      if (studentDiff !== 0) return studentDiff;
      return String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''), 'ru');
    })
);

const buildMiniMonthDays = (monthCursor) => {
  const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const gridStart = getWeekStart(monthStart);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      dayKey: toDayKey(date),
      inCurrentMonth: date.getMonth() === monthCursor.getMonth(),
    };
  });
};

const getEventColor = (seed) => {
  const source = String(seed || 'event');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];
};

const assignOverlapLanes = (events) => {
  if (!Array.isArray(events) || events.length === 0) return [];
  const sorted = [...events].sort((left, right) => {
    if (left.startMinutes !== right.startMinutes) return left.startMinutes - right.startMinutes;
    return left.endMinutes - right.endMinutes;
  });

  const groups = [];
  let currentGroup = [];
  let currentGroupEnd = -1;

  sorted.forEach((event) => {
    if (currentGroup.length === 0 || event.startMinutes < currentGroupEnd) {
      currentGroup.push(event);
      currentGroupEnd = Math.max(currentGroupEnd, event.endMinutes);
      return;
    }
    groups.push(currentGroup);
    currentGroup = [event];
    currentGroupEnd = event.endMinutes;
  });
  if (currentGroup.length > 0) groups.push(currentGroup);

  const result = [];
  groups.forEach((group) => {
    const laneEndTimes = [];
    const placed = group.map((event) => {
      let lane = 0;
      while (laneEndTimes[lane] > event.startMinutes) lane += 1;
      laneEndTimes[lane] = event.endMinutes;
      return { ...event, lane };
    });
    const laneCount = Math.max(1, ...placed.map((event) => event.lane + 1));
    placed.forEach((event) => {
      result.push({ ...event, laneCount });
    });
  });

  return result;
};

const TeacherCalendarSection = ({
  teacherId,
  students,
  getStudentLabel,
  pushSupported = false,
  pushPermission = 'default',
  pushEnabled = false,
  pushSyncing = false,
  pushBusy = false,
  pushReady = false,
  pushError = '',
  onTogglePush = null,
}) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [focusDate, setFocusDate] = useState(() => cloneAsDateOnly(new Date()));
  const [miniMonthCursor, setMiniMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [hiddenStudentMap, setHiddenStudentMap] = useState({});
  const [teacherReminderEnabled, setTeacherReminderEnabled] = useState(false);
  const [teacherReminderLoading, setTeacherReminderLoading] = useState(false);
  const [teacherReminderSaving, setTeacherReminderSaving] = useState(false);
  const [teacherReminderError, setTeacherReminderError] = useState('');
  const [viewportHeight, setViewportHeight] = useState(() => (
    typeof window !== 'undefined' ? window.innerHeight : 900
  ));
  const [quickCreateDraft, setQuickCreateDraft] = useState(null);
  const [quickCreateSaving, setQuickCreateSaving] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState('');
  const [eventDetails, setEventDetails] = useState(null);
  const [eventDeleteBusy, setEventDeleteBusy] = useState(false);
  const [eventDeleteError, setEventDeleteError] = useState('');
  const [eventEditDraft, setEventEditDraft] = useState(null);
  const [eventEditSaving, setEventEditSaving] = useState(false);
  const [eventEditError, setEventEditError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lessonTypeFilter, setLessonTypeFilter] = useState(LESSON_FILTER_ALL);
  const [showWeekends, setShowWeekends] = useState(true);
  const [use24HourFormat, setUse24HourFormat] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [quickCreateFindingSlot, setQuickCreateFindingSlot] = useState(false);
  const [eventQuickActionBusy, setEventQuickActionBusy] = useState(false);
  const [eventQuickActionError, setEventQuickActionError] = useState('');

  const weekStartDate = useMemo(() => getWeekStart(focusDate), [focusDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)),
    [weekStartDate]
  );

  const dayStartMinutes = CALENDAR_START_HOUR * 60;
  const dayEndMinutes = CALENDAR_END_HOUR * 60;
  const hoursCount = CALENDAR_END_HOUR - CALENDAR_START_HOUR;
  const hourHeight = useMemo(() => {
    const safeViewportHeight = Number(viewportHeight) > 0 ? Number(viewportHeight) : 900;
    const available = safeViewportHeight - CALENDAR_VIEWPORT_RESERVED_PX;
    const raw = Math.floor(available / Math.max(1, hoursCount));
    const minHourHeight = compactMode ? 18 : MIN_CALENDAR_HOUR_HEIGHT;
    const maxHourHeight = compactMode ? 38 : MAX_CALENDAR_HOUR_HEIGHT;
    return Math.max(minHourHeight, Math.min(maxHourHeight, raw));
  }, [compactMode, hoursCount, viewportHeight]);
  const calendarHeight = hoursCount * hourHeight;
  const timezoneLabel = getTimezoneLabel();
  const todayKey = toDayKey(new Date());

  const hourTicks = useMemo(
    () => Array.from(
      { length: (CALENDAR_END_HOUR - CALENDAR_START_HOUR) + 1 },
      (_, index) => CALENDAR_START_HOUR + index
    ),
    []
  );

  useEffect(() => {
    setMiniMonthCursor(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1));
  }, [focusDate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(CALENDAR_UI_PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (typeof parsed.showWeekends === 'boolean') setShowWeekends(parsed.showWeekends);
      if (typeof parsed.use24HourFormat === 'boolean') setUse24HourFormat(parsed.use24HourFormat);
      if (typeof parsed.compactMode === 'boolean') setCompactMode(parsed.compactMode);
      if (typeof parsed.sidebarCollapsed === 'boolean') setSidebarCollapsed(parsed.sidebarCollapsed);
      if (typeof parsed.showConflictsOnly === 'boolean') setShowConflictsOnly(parsed.showConflictsOnly);
      if (
        parsed.lessonTypeFilter === LESSON_FILTER_ALL
        || parsed.lessonTypeFilter === LESSON_FILTER_TRIAL
        || parsed.lessonTypeFilter === LESSON_FILTER_STUDENT
      ) {
        setLessonTypeFilter(parsed.lessonTypeFilter);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      showWeekends,
      use24HourFormat,
      compactMode,
      sidebarCollapsed,
      showConflictsOnly,
      lessonTypeFilter,
    };
    try {
      window.localStorage.setItem(CALENDAR_UI_PREFS_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }, [
    compactMode,
    lessonTypeFilter,
    showConflictsOnly,
    showWeekends,
    sidebarCollapsed,
    use24HourFormat,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      setViewportHeight(window.innerHeight || 900);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const studentNameById = useMemo(() => {
    const list = Array.isArray(students) ? students : [];
    return list.reduce((acc, student) => {
      const key = String(student?.id || '').trim();
      if (!key) return acc;
      const fallbackName = String(student?.name || '').trim();
      const resolvedName = typeof getStudentLabel === 'function'
        ? String(getStudentLabel(student) || '').trim()
        : fallbackName;
      acc[key] = resolvedName || fallbackName || 'Ученик';
      return acc;
    }, {});
  }, [getStudentLabel, students]);

  const studentOptions = useMemo(() => {
    const list = Array.isArray(students) ? students : [];
    return list
      .map((student) => {
        const id = String(student?.id || '').trim();
        if (!id) return null;
        const fallbackName = String(student?.name || '').trim();
        const label = typeof getStudentLabel === 'function'
          ? String(getStudentLabel(student) || '').trim()
          : fallbackName;
        return { id, label: label || fallbackName || 'Ученик' };
      })
      .filter(Boolean)
      .sort((left, right) => left.label.localeCompare(right.label, 'ru'));
  }, [getStudentLabel, students]);

  const firstStudentOptionId = studentOptions[0]?.id || '';

  const loadTeacherCalendar = useCallback(async ({ silent = false } = {}) => {
    if (!teacherId) {
      setEntries([]);
      setError('');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await api.getTeacherSchedule(teacherId);
      setEntries(sortScheduleEntries(Array.isArray(data) ? data : []));
      setError('');
    } catch (err) {
      setEntries([]);
      setError(err?.message || 'Не удалось загрузить общий календарь.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teacherId]);

  useEffect(() => {
    loadTeacherCalendar();
  }, [loadTeacherCalendar]);

  const loadTeacherReminderSetting = useCallback(async () => {
    if (!teacherId) {
      setTeacherReminderEnabled(false);
      setTeacherReminderError('');
      setTeacherReminderLoading(false);
      return;
    }
    setTeacherReminderLoading(true);
    try {
      const data = await api.getPushTeacherCalendarReminderSetting(teacherId);
      setTeacherReminderEnabled(Boolean(data?.enabled));
      setTeacherReminderError('');
    } catch (err) {
      setTeacherReminderEnabled(false);
      setTeacherReminderError(err?.message || err);
    } finally {
      setTeacherReminderLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    loadTeacherReminderSetting();
  }, [loadTeacherReminderSetting]);

  const handleToggleTeacherReminder = async () => {
    if (!teacherId || teacherReminderSaving) return;
    setTeacherReminderSaving(true);
    setTeacherReminderError('');
    try {
      let effectivePushEnabled = pushEnabled;
      if (!pushEnabled && typeof onTogglePush === 'function') {
        await onTogglePush();
        const status = await api.getPushSubscriptionStatus().catch(() => null);
        effectivePushEnabled = Boolean(status?.subscribed);
      }
      if (!effectivePushEnabled) {
        return;
      }
      const nextEnabled = pushEnabled ? !teacherReminderEnabled : true;
      const data = await api.updatePushTeacherCalendarReminderSetting(nextEnabled, teacherId);
      setTeacherReminderEnabled(Boolean(data?.enabled));
    } catch (err) {
      setTeacherReminderError(err?.message || err);
    } finally {
      setTeacherReminderSaving(false);
    }
  };

  const teacherReminderStatusText = useMemo(() => {
    if (teacherReminderLoading) return 'Проверяем настройки напоминаний...';
    if (!pushSupported) return 'Push не поддерживается в этом браузере.';
    if (pushPermission === 'denied') return 'Уведомления заблокированы в настройках браузера.';
    if (!pushEnabled && teacherReminderEnabled) {
      return 'Напоминания включены, но push выключены. Включите push, чтобы получать уведомления.';
    }
    if (!pushEnabled) return 'Сначала включите push, затем включите напоминания для календаря.';
    if (teacherReminderEnabled) return 'Напоминания включены: учителю придет уведомление за 30 минут до урока.';
    return 'Включите напоминания, чтобы получать уведомление за 30 минут до урока.';
  }, [
    pushEnabled,
    pushPermission,
    pushSupported,
    teacherReminderEnabled,
    teacherReminderLoading,
  ]);

  const studentCalendars = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      const id = String(entry?.studentId || '').trim();
      if (!id) return;
      if (!map.has(id)) {
        const label = studentNameById[id] || entry.studentName || 'Ученик';
        map.set(id, { id, label, color: getEventColor(id) });
      }
    });
    return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label, 'ru'));
  }, [entries, studentNameById]);

  useEffect(() => {
    setHiddenStudentMap((prev) => {
      const next = {};
      studentCalendars.forEach((item) => {
        next[item.id] = Boolean(prev[item.id]);
      });
      return next;
    });
  }, [studentCalendars]);

  const allStudentsHidden = studentCalendars.length > 0
    && studentCalendars.every((item) => hiddenStudentMap[item.id]);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => !hiddenStudentMap[entry.studentId]),
    [entries, hiddenStudentMap]
  );

  const normalizedSearchQuery = useMemo(
    () => String(searchQuery || '').trim().toLowerCase(),
    [searchQuery]
  );

  const filteredEntries = useMemo(() => {
    const byType = visibleEntries.filter((entry) => {
      if (lessonTypeFilter === LESSON_FILTER_TRIAL) return isTrialEntry(entry);
      if (lessonTypeFilter === LESSON_FILTER_STUDENT) return !isTrialEntry(entry);
      return true;
    });
    if (!normalizedSearchQuery) return byType;
    return byType.filter((entry) => {
      const studentName = studentNameById[entry.studentId] || entry.studentName || '';
      const subject = String(entry?.subject || '').trim();
      const day = String(entry?.day || '').trim();
      const date = String(entry?.date || '').trim();
      const time = String(entry?.time || '').trim();
      const haystack = `${studentName} ${subject} ${day} ${date} ${time}`.toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    });
  }, [lessonTypeFilter, normalizedSearchQuery, studentNameById, visibleEntries]);

  const visibleDayIndexes = useMemo(
    () => (showWeekends ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]),
    [showWeekends]
  );

  const displayWeekDays = useMemo(
    () => visibleDayIndexes.map((index) => weekDays[index]).filter(Boolean),
    [visibleDayIndexes, weekDays]
  );

  const weekDayKeyToIndex = useMemo(() => {
    const result = {};
    weekDays.forEach((date, index) => {
      result[toDayKey(date)] = index;
    });
    return result;
  }, [weekDays]);

  const weekDayKeySet = useMemo(
    () => new Set(displayWeekDays.map((date) => toDayKey(date))),
    [displayWeekDays]
  );

  const weekTitle = useMemo(() => formatMonthYear(addDays(weekStartDate, 3)), [weekStartDate]);
  const weekRangeLabel = useMemo(() => {
    const firstDate = displayWeekDays[0] || weekDays[0];
    const lastDate = displayWeekDays[displayWeekDays.length - 1] || weekDays[6];
    return `${formatDayMonth(firstDate)} - ${formatDayMonth(lastDate)}`;
  }, [displayWeekDays, weekDays]);

  const miniMonthLabel = useMemo(() => formatMonthYear(miniMonthCursor), [miniMonthCursor]);
  const miniMonthDays = useMemo(() => buildMiniMonthDays(miniMonthCursor), [miniMonthCursor]);

  const holidaysByDayKey = useMemo(() => {
    const map = {};
    weekDays.forEach((date) => {
      const key = toDayKey(date);
      const matches = HOLIDAY_DEFINITIONS.filter((item) => (
        item.month === date.getMonth() + 1 && item.day === date.getDate()
      ));
      if (matches.length > 0) {
        map[key] = matches;
      }
    });
    return map;
  }, [weekDays]);

  const eventsByDayIndex = useMemo(() => {
    const buckets = Array.from({ length: 7 }, () => []);

    filteredEntries.forEach((entry) => {
      const startMinutesRaw = parseScheduleTimeToMinutes(entry.time);
      if (!Number.isFinite(startMinutesRaw)) return;

      let dayIndex = null;
      const dateKey = toDayKeyFromIsoDate(entry?.date);
      if (dateKey) {
        if (Object.prototype.hasOwnProperty.call(weekDayKeyToIndex, dateKey)) {
          dayIndex = weekDayKeyToIndex[dateKey];
        } else {
          return;
        }
      } else {
        const weekdayOrder = Number(entry?.weekdayOrder);
        if (Number.isFinite(weekdayOrder) && weekdayOrder >= 1 && weekdayOrder <= 7) {
          dayIndex = weekdayOrder - 1;
        }
      }
      if (!Number.isFinite(dayIndex) || dayIndex < 0 || dayIndex > 6) return;

      const clampedStart = Math.max(dayStartMinutes, Math.min(dayEndMinutes - 15, startMinutesRaw));
      const endMinutesRaw = startMinutesRaw + Number(entry.durationMinutes || DEFAULT_EVENT_DURATION_MINUTES);
      const clampedEnd = Math.max(
        clampedStart + 20,
        Math.min(dayEndMinutes, endMinutesRaw)
      );

      buckets[dayIndex].push({
        ...entry,
        startMinutes: clampedStart,
        endMinutes: clampedEnd,
      });
    });

    return buckets.map((list) => assignOverlapLanes(list));
  }, [dayEndMinutes, dayStartMinutes, filteredEntries, weekDayKeyToIndex]);

  const displayEventsByDayIndex = useMemo(
    () => eventsByDayIndex.map((list) => (
      showConflictsOnly ? list.filter((event) => Number(event.laneCount || 1) > 1) : list
    )),
    [eventsByDayIndex, showConflictsOnly]
  );

  const conflictStats = useMemo(() => {
    let events = 0;
    const days = new Set();
    visibleDayIndexes.forEach((dayIndex) => {
      const list = eventsByDayIndex[dayIndex] || [];
      list.forEach((event) => {
        if (Number(event.laneCount || 1) > 1) {
          events += 1;
          days.add(dayIndex);
        }
      });
    });
    return { events, days: days.size };
  }, [eventsByDayIndex, visibleDayIndexes]);

  const visibleLessonsCount = useMemo(
    () => visibleDayIndexes.reduce((sum, dayIndex) => sum + (displayEventsByDayIndex[dayIndex]?.length || 0), 0),
    [displayEventsByDayIndex, visibleDayIndexes]
  );

  const weekEventsFlat = useMemo(() => {
    const result = [];
    visibleDayIndexes.forEach((dayIndex) => {
      const dayEvents = eventsByDayIndex[dayIndex] || [];
      const date = weekDays[dayIndex];
      if (!date) return;
      const dayKey = toDayKey(date);
      dayEvents.forEach((event) => {
        result.push({ ...event, dayKey });
      });
    });
    return result;
  }, [eventsByDayIndex, visibleDayIndexes, weekDays]);

  const trialEventsThisWeek = useMemo(
    () => weekEventsFlat.filter((event) => isTrialEntry(event)),
    [weekEventsFlat]
  );

  const studentEventsThisWeek = useMemo(
    () => weekEventsFlat.filter((event) => !isTrialEntry(event)),
    [weekEventsFlat]
  );

  const upcomingTrialEvents = useMemo(() => {
    const nowTime = Date.now();
    const candidates = trialEventsThisWeek
      .map((event) => {
        const startLabel = formatMinutesAsTime(event.startMinutes);
        const startDate = new Date(`${event.dayKey}T${startLabel}:00`);
        if (Number.isNaN(startDate.getTime())) return null;
        return { ...event, startDate };
      })
      .filter(Boolean)
      .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
    const upcoming = candidates.filter((item) => item.startDate.getTime() >= nowTime);
    return (upcoming.length > 0 ? upcoming : candidates).slice(0, 6);
  }, [trialEventsThisWeek]);

  const nextLessonInfo = useMemo(() => {
    const nowTime = Date.now();
    const candidates = [];
    visibleDayIndexes.forEach((dayIndex) => {
      const date = weekDays[dayIndex];
      if (!date) return;
      const dayKey = toDayKey(date);
      const list = eventsByDayIndex[dayIndex] || [];
      list.forEach((event) => {
        const startLabel = formatMinutesAsTime(event.startMinutes);
        const startDate = new Date(`${dayKey}T${startLabel}:00`);
        if (Number.isNaN(startDate.getTime())) return;
        candidates.push({ event, dayKey, startDate });
      });
    });
    candidates.sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
    return candidates.find((item) => item.startDate.getTime() >= nowTime) || candidates[0] || null;
  }, [eventsByDayIndex, visibleDayIndexes, weekDays]);

  const studentCount = studentCalendars.length;

  const quickCreateDateLabel = useMemo(() => {
    if (!quickCreateDraft?.dateKey) return '';
    const date = new Date(`${quickCreateDraft.dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return quickCreateDraft.dateKey;
    return capitalize(date.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).replace(' г.', ''));
  }, [quickCreateDraft]);

  const quickCreateDateInputValue = useMemo(
    () => String(quickCreateDraft?.dateKey || '').trim(),
    [quickCreateDraft]
  );

  const quickCreateIsTrialWithoutStudent = useMemo(
    () => String(quickCreateDraft?.studentId || '').trim() === TRIAL_WITHOUT_STUDENT_VALUE,
    [quickCreateDraft]
  );

  const eventDetailsDateLabel = useMemo(() => {
    const dateKey = String(eventDetails?.dayKey || eventDetails?.date || '').trim();
    if (!dateKey) return '';
    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;
    return capitalize(date.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).replace(' г.', ''));
  }, [eventDetails]);

  const eventDetailsTimeLabel = useMemo(() => {
    if (!eventDetails) return '--:--';
    const startMinutes = Number(eventDetails.startMinutes);
    const endMinutes = Number(eventDetails.endMinutes);
    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes)) {
      const startLabel = formatMinutesAsDisplayTime(startMinutes, use24HourFormat);
      const endLabel = formatMinutesAsDisplayTime(endMinutes, use24HourFormat);
      return `${startLabel} - ${endLabel}`;
    }
    const startRaw = String(eventDetails.time || '').trim();
    if (!startRaw) return '--:--';
    const startParsed = parseScheduleTimeToMinutes(startRaw);
    if (!Number.isFinite(startParsed)) return startRaw;
    const duration = Number.isFinite(Number(eventDetails.durationMinutes))
      ? Number(eventDetails.durationMinutes)
      : DEFAULT_EVENT_DURATION_MINUTES;
    const startLabel = formatMinutesAsDisplayTime(startParsed, use24HourFormat);
    const endLabel = formatMinutesAsDisplayTime(startParsed + duration, use24HourFormat);
    return `${startLabel} - ${endLabel}`;
  }, [eventDetails, use24HourFormat]);

  const focusDateInputValue = useMemo(() => toDayKey(focusDate), [focusDate]);

  const nextLessonLabel = useMemo(() => {
    if (!nextLessonInfo) return 'Нет занятий по текущим фильтрам';
    const lessonDateLabel = formatDayMonth(new Date(`${nextLessonInfo.dayKey}T00:00:00`));
    const start = formatMinutesAsDisplayTime(nextLessonInfo.event.startMinutes, use24HourFormat);
    const end = formatMinutesAsDisplayTime(nextLessonInfo.event.endMinutes, use24HourFormat);
    const lessonName = String(
      nextLessonInfo.event.studentName
      || nextLessonInfo.event.subject
      || DEFAULT_ONE_TIME_LESSON_SUBJECT
    ).trim();
    return `${lessonDateLabel}, ${start}-${end} • ${lessonName}`;
  }, [nextLessonInfo, use24HourFormat]);

  const resolveEventDateKey = useCallback((eventInfo) => {
    const explicitDate = String(eventInfo?.date || '').trim();
    if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) return explicitDate;
    const fromDayKey = String(eventInfo?.dayKey || '').trim();
    if (fromDayKey && /^\d{4}-\d{2}-\d{2}$/.test(fromDayKey)) return fromDayKey;
    const weekdayOrder = Number(eventInfo?.weekdayOrder);
    if (Number.isFinite(weekdayOrder) && weekdayOrder >= 1 && weekdayOrder <= 7) {
      return toDayKey(addDays(weekStartDate, weekdayOrder - 1));
    }
    return '';
  }, [weekStartDate]);

  const buildEventUpdatePayload = useCallback((eventInfo, overrides = {}) => {
    const fallbackTitle = String(
      eventInfo?.subject
      || eventInfo?.subjectLabel
      || eventInfo?.studentName
      || DEFAULT_ONE_TIME_LESSON_SUBJECT
    ).trim() || DEFAULT_ONE_TIME_LESSON_SUBJECT;
    const fallbackTime = String(eventInfo?.time || '').trim()
      || formatMinutesAsTime(Number(eventInfo?.startMinutes));
    const fallbackDuration = Number.isFinite(Number(eventInfo?.durationMinutes))
      ? Math.round(Number(eventInfo.durationMinutes))
      : DEFAULT_EVENT_DURATION_MINUTES;
    const payload = {
      subject: String(overrides.subject ?? fallbackTitle).trim() || DEFAULT_ONE_TIME_LESSON_SUBJECT,
      time: String(overrides.time ?? fallbackTime).trim(),
      durationMinutes: Number.isFinite(Number(overrides.durationMinutes))
        ? Math.round(Number(overrides.durationMinutes))
        : fallbackDuration,
      note: typeof eventInfo?.note === 'string' ? eventInfo.note : '',
    };
    if (overrides.date) {
      payload.date = String(overrides.date).trim();
    } else if (overrides.weekdayKey) {
      payload.weekdayKey = String(overrides.weekdayKey).trim();
    } else {
      const dateRaw = String(eventInfo?.date || '').trim();
      if (dateRaw) payload.date = dateRaw;
      else {
        const weekdayRaw = String(eventInfo?.weekdayKey || '').trim();
        if (weekdayRaw) payload.weekdayKey = weekdayRaw;
      }
    }
    return payload;
  }, []);

  const findFirstFreeStartMinutesForDate = useCallback(({
    dateKey,
    durationMinutes,
    preferredStartMinutes = dayStartMinutes,
    ignoreEventId = '',
  }) => {
    const date = parseDayKeyToDate(dateKey);
    if (!date) return NaN;
    const safeDuration = clampNumber(
      Math.round(Number(durationMinutes) || DEFAULT_EVENT_DURATION_MINUTES),
      15,
      360
    );
    const lastPossibleStart = dayEndMinutes - safeDuration;
    if (lastPossibleStart < dayStartMinutes) return NaN;
    const weekday = date.getDay() === 0 ? 7 : date.getDay();
    const blockedIntervals = [];
    const ignoredId = String(ignoreEventId || '').trim();

    entries.forEach((entry) => {
      const entryId = String(entry?.id || '').trim();
      if (ignoredId && entryId && entryId === ignoredId) return;
      const entryTime = parseScheduleTimeToMinutes(entry?.time);
      if (!Number.isFinite(entryTime)) return;
      const duration = Number.isFinite(Number(entry?.durationMinutes))
        ? Math.round(Number(entry.durationMinutes))
        : DEFAULT_EVENT_DURATION_MINUTES;
      const entryDate = String(entry?.date || '').trim();
      const entryWeekday = Number(entry?.weekdayOrder);
      const isMatchingDate = entryDate && toDayKeyFromIsoDate(entryDate) === dateKey;
      const isRecurringMatch = !entryDate
        && Number.isFinite(entryWeekday)
        && entryWeekday >= 1
        && entryWeekday <= 7
        && entryWeekday === weekday;
      if (!isMatchingDate && !isRecurringMatch) return;
      blockedIntervals.push({
        start: entryTime,
        end: entryTime + Math.max(15, duration),
      });
    });

    const steppedPreferred = clampNumber(
      roundMinutesToStep(preferredStartMinutes, QUICK_CREATE_TIME_STEP_MINUTES),
      dayStartMinutes,
      lastPossibleStart
    );
    const starts = [];
    for (let cursor = steppedPreferred; cursor <= lastPossibleStart; cursor += QUICK_CREATE_TIME_STEP_MINUTES) {
      starts.push(cursor);
    }
    for (let cursor = dayStartMinutes; cursor < steppedPreferred; cursor += QUICK_CREATE_TIME_STEP_MINUTES) {
      starts.push(cursor);
    }
    const found = starts.find((startMinutes) => {
      const endMinutes = startMinutes + safeDuration;
      return !blockedIntervals.some((interval) => (
        startMinutes < interval.end && interval.start < endMinutes
      ));
    });
    return Number.isFinite(found) ? found : NaN;
  }, [dayEndMinutes, dayStartMinutes, entries]);

  const findNextFreeSlot = useCallback(({
    startDateKey,
    durationMinutes,
    preferredStartMinutes,
    maxDaysForward = 30,
    ignoreEventId = '',
  }) => {
    const startDate = parseDayKeyToDate(startDateKey);
    if (!startDate) return null;
    for (let dayOffset = 0; dayOffset <= maxDaysForward; dayOffset += 1) {
      const date = addDays(startDate, dayOffset);
      const dateKey = toDayKey(date);
      const startMinutes = findFirstFreeStartMinutesForDate({
        dateKey,
        durationMinutes,
        preferredStartMinutes: dayOffset === 0 ? preferredStartMinutes : dayStartMinutes,
        ignoreEventId,
      });
      if (Number.isFinite(startMinutes)) {
        return { dateKey, startMinutes };
      }
    }
    return null;
  }, [dayStartMinutes, findFirstFreeStartMinutesForDate]);

  const updateEventOnServer = useCallback(async (eventInfo, payload) => {
    const eventId = String(eventInfo?.id || '').trim();
    if (!eventId) throw new Error('Не удалось определить занятие для изменения.');
    const studentId = String(eventInfo?.studentId || '').trim();
    if (studentId) {
      await api.updateScheduleEntry(studentId, eventId, payload);
      return;
    }
    await api.updateTeacherScheduleEntry(eventId, payload, teacherId);
  }, [teacherId]);

  const closeQuickCreate = useCallback(() => {
    if (quickCreateSaving || quickCreateFindingSlot) return;
    setQuickCreateDraft(null);
    setQuickCreateError('');
  }, [quickCreateFindingSlot, quickCreateSaving]);

  const closeEventDetails = useCallback(() => {
    if (eventDeleteBusy || eventEditSaving || eventQuickActionBusy) return;
    setEventDetails(null);
    setEventEditDraft(null);
    setEventDeleteError('');
    setEventEditError('');
    setEventQuickActionError('');
  }, [eventDeleteBusy, eventEditSaving, eventQuickActionBusy]);

  const openQuickCreate = useCallback((dayIndex, clickEvent) => {
    const dayDate = weekDays[dayIndex];
    if (!dayDate) return;
    const rect = clickEvent?.currentTarget?.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) return;
    const offsetY = clampNumber((clickEvent.clientY || 0) - rect.top, 0, rect.height);
    const rawMinutes = dayStartMinutes + ((offsetY / rect.height) * (dayEndMinutes - dayStartMinutes));
    const snappedMinutes = roundMinutesToStep(rawMinutes, QUICK_CREATE_TIME_STEP_MINUTES);
    const clampedMinutes = clampNumber(
      snappedMinutes,
      dayStartMinutes,
      dayEndMinutes - QUICK_CREATE_TIME_STEP_MINUTES
    );

    setQuickCreateDraft({
      dateKey: toDayKey(dayDate),
      time: formatMinutesAsTime(clampedMinutes),
      studentId: TRIAL_WITHOUT_STUDENT_VALUE,
      title: DEFAULT_ONE_TIME_LESSON_SUBJECT,
      durationMinutes: DEFAULT_EVENT_DURATION_MINUTES,
    });
    setQuickCreateError('');
  }, [dayEndMinutes, dayStartMinutes, weekDays]);

  const openQuickCreateForFocusDate = useCallback(() => {
    const clampedMinutes = clampNumber(12 * 60, dayStartMinutes, dayEndMinutes - QUICK_CREATE_TIME_STEP_MINUTES);
    setQuickCreateDraft({
      dateKey: toDayKey(focusDate),
      time: formatMinutesAsTime(clampedMinutes),
      studentId: TRIAL_WITHOUT_STUDENT_VALUE,
      title: DEFAULT_ONE_TIME_LESSON_SUBJECT,
      durationMinutes: DEFAULT_EVENT_DURATION_MINUTES,
    });
    setQuickCreateError('');
  }, [dayEndMinutes, dayStartMinutes, focusDate]);

  const handleQuickCreateFindNearestFreeSlot = useCallback(() => {
    if (!quickCreateDraft || quickCreateSaving || quickCreateFindingSlot) return;
    const dateKey = String(quickCreateDraft.dateKey || '').trim();
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      setQuickCreateError('Укажите корректную дату.');
      return;
    }
    const duration = clampNumber(
      Math.round(Number(quickCreateDraft.durationMinutes) || DEFAULT_EVENT_DURATION_MINUTES),
      15,
      360
    );
    const preferredStart = parseScheduleTimeToMinutes(quickCreateDraft.time);
    const safePreferredStart = Number.isFinite(preferredStart) ? preferredStart : dayStartMinutes;
    setQuickCreateFindingSlot(true);
    try {
      const slot = findNextFreeSlot({
        startDateKey: dateKey,
        durationMinutes: duration,
        preferredStartMinutes: safePreferredStart,
      });
      if (!slot) {
        setQuickCreateError('Не нашли свободный слот в ближайшие 30 дней.');
        return;
      }
      setQuickCreateDraft((prev) => (prev ? {
        ...prev,
        dateKey: slot.dateKey,
        time: formatMinutesAsTime(slot.startMinutes),
        durationMinutes: duration,
      } : prev));
      setQuickCreateError('');
    } finally {
      setQuickCreateFindingSlot(false);
    }
  }, [
    dayStartMinutes,
    findNextFreeSlot,
    quickCreateDraft,
    quickCreateFindingSlot,
    quickCreateSaving,
  ]);

  const handleQuickCreateSave = useCallback(async (event) => {
    event.preventDefault();
    if (!quickCreateDraft || quickCreateSaving) return;

    const studentId = String(quickCreateDraft.studentId || '').trim();
    const isTrialWithoutStudent = studentId === TRIAL_WITHOUT_STUDENT_VALUE;
    if (!studentId) {
      setQuickCreateError('Выберите ученика или пробное занятие без ученика.');
      return;
    }

    const dateKey = String(quickCreateDraft.dateKey || '').trim();
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      setQuickCreateError('Некорректная дата занятия.');
      return;
    }

    const time = String(quickCreateDraft.time || '').trim();
    const startMinutes = parseScheduleTimeToMinutes(time);
    if (!Number.isFinite(startMinutes)) {
      setQuickCreateError('Укажите корректное время занятия.');
      return;
    }
    if (startMinutes < dayStartMinutes || startMinutes >= dayEndMinutes) {
      setQuickCreateError(`Время должно быть в диапазоне ${formatMinutesAsTime(dayStartMinutes)}-${formatMinutesAsTime(dayEndMinutes)}.`);
      return;
    }
    const durationRaw = Number(quickCreateDraft.durationMinutes);
    const durationMinutes = Number.isFinite(durationRaw) ? Math.round(durationRaw) : NaN;
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
      setQuickCreateError('Укажите длительность от 15 до 360 минут.');
      return;
    }

    setQuickCreateSaving(true);
    setQuickCreateError('');
    try {
      const subject = String(quickCreateDraft.title || '').trim() || DEFAULT_ONE_TIME_LESSON_SUBJECT;
      if (isTrialWithoutStudent) {
        await api.addTeacherScheduleEntry({
          date: dateKey,
          time,
          subject,
          studentName: subject,
          durationMinutes,
          note: '',
        }, teacherId);
      } else {
        await api.addScheduleEntry(studentId, {
          date: dateKey,
          time,
          subject,
          durationMinutes,
          note: '',
        });
        setHiddenStudentMap((prev) => ({ ...prev, [studentId]: false }));
      }
      setQuickCreateDraft(null);
      await loadTeacherCalendar({ silent: true });
    } catch (err) {
      setQuickCreateError(err?.message || 'Не удалось добавить занятие.');
    } finally {
      setQuickCreateSaving(false);
    }
  }, [dayEndMinutes, dayStartMinutes, loadTeacherCalendar, quickCreateDraft, quickCreateSaving, teacherId]);

  const openEventDetailsModal = useCallback((event, dayKey) => {
    const hasStudent = Boolean(String(event?.studentId || '').trim());
    const studentName = studentNameById[event?.studentId] || event?.studentName || 'Ученик';
    const subject = String(event?.subject || '').trim();
    const subjectLabel = subject && subject.toLowerCase() !== 'занятие' ? subject : '';
    const primaryLabel = hasStudent
      ? studentName
      : (subjectLabel || studentName || DEFAULT_ONE_TIME_LESSON_SUBJECT);
    const startMinutes = Number(event?.startMinutes);
    const endMinutes = Number(event?.endMinutes);
    const fallbackStart = parseScheduleTimeToMinutes(event?.time);
    const safeStartMinutes = Number.isFinite(startMinutes) ? startMinutes : fallbackStart;
    const durationMinutes = Number.isFinite(Number(event?.durationMinutes))
      ? Math.round(Number(event.durationMinutes))
      : DEFAULT_EVENT_DURATION_MINUTES;
    const safeEndMinutes = Number.isFinite(endMinutes) ? endMinutes : (safeStartMinutes + durationMinutes);
    const startLabel = formatMinutesAsDisplayTime(safeStartMinutes, use24HourFormat);
    const endLabel = formatMinutesAsDisplayTime(safeEndMinutes, use24HourFormat);
    setQuickCreateDraft(null);
    setQuickCreateError('');
    setEventEditDraft(null);
    setEventEditError('');
    setEventDeleteError('');
    setEventQuickActionError('');
    setEventDetails({
      ...event,
      dayKey,
      studentName: primaryLabel,
      subjectLabel,
      subject,
      startMinutes: safeStartMinutes,
      endMinutes: safeEndMinutes,
      startLabel,
      endLabel,
    });
  }, [studentNameById, use24HourFormat]);

  const handleQuickShiftEvent = useCallback(async ({ dayShift = 0, minuteShift = 0 } = {}) => {
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy) return;
    const baseDateKey = resolveEventDateKey(eventDetails);
    const baseDate = parseDayKeyToDate(baseDateKey);
    if (!baseDate) {
      setEventQuickActionError('Не удалось определить дату занятия для переноса.');
      return;
    }
    const baseTime = String(eventDetails.time || '').trim() || formatMinutesAsTime(eventDetails.startMinutes);
    const startMinutes = parseScheduleTimeToMinutes(baseTime);
    if (!Number.isFinite(startMinutes)) {
      setEventQuickActionError('Не удалось определить время занятия.');
      return;
    }
    const shiftedMinutes = startMinutes + Number(minuteShift || 0);
    if (shiftedMinutes < dayStartMinutes || shiftedMinutes >= dayEndMinutes) {
      setEventQuickActionError(`Время должно быть в диапазоне ${formatMinutesAsTime(dayStartMinutes)}-${formatMinutesAsTime(dayEndMinutes)}.`);
      return;
    }

    const payloadOverrides = { time: formatMinutesAsTime(shiftedMinutes) };
    const dayShiftValue = Number(dayShift || 0);
    if (dayShiftValue !== 0) {
      const hasExplicitDate = Boolean(String(eventDetails.date || '').trim() || String(eventDetails.dayKey || '').trim());
      if (hasExplicitDate) {
        payloadOverrides.date = toDayKey(addDays(baseDate, dayShiftValue));
      } else {
        const currentOrder = Number(eventDetails.weekdayOrder);
        if (!Number.isFinite(currentOrder) || currentOrder < 1 || currentOrder > 7) {
          setEventQuickActionError('Для этого слота перенос дня недоступен.');
          return;
        }
        const shiftedOrder = ((currentOrder - 1 + dayShiftValue) % 7 + 7) % 7 + 1;
        payloadOverrides.weekdayKey = SCHEDULE_WEEKDAYS.find((item) => item.order === shiftedOrder)?.key || '';
      }
    }
    const payload = buildEventUpdatePayload(eventDetails, payloadOverrides);
    setEventQuickActionBusy(true);
    setEventQuickActionError('');
    try {
      await updateEventOnServer(eventDetails, payload);
      setEventDetails(null);
      await loadTeacherCalendar({ silent: true });
    } catch (err) {
      setEventQuickActionError(err?.message || 'Не удалось перенести занятие.');
    } finally {
      setEventQuickActionBusy(false);
    }
  }, [
    buildEventUpdatePayload,
    dayEndMinutes,
    dayStartMinutes,
    eventDeleteBusy,
    eventDetails,
    eventEditSaving,
    eventQuickActionBusy,
    loadTeacherCalendar,
    resolveEventDateKey,
    updateEventOnServer,
  ]);

  const handleMoveEventToNearestFreeSlot = useCallback(async () => {
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy) return;
    const baseDateKey = resolveEventDateKey(eventDetails);
    if (!baseDateKey) {
      setEventQuickActionError('Не удалось определить дату занятия.');
      return;
    }
    const baseTime = String(eventDetails.time || '').trim() || formatMinutesAsTime(eventDetails.startMinutes);
    const startMinutes = parseScheduleTimeToMinutes(baseTime);
    if (!Number.isFinite(startMinutes)) {
      setEventQuickActionError('Не удалось определить время занятия.');
      return;
    }
    const duration = Number.isFinite(Number(eventDetails.durationMinutes))
      ? Math.round(Number(eventDetails.durationMinutes))
      : DEFAULT_EVENT_DURATION_MINUTES;
    const slot = findNextFreeSlot({
      startDateKey: baseDateKey,
      durationMinutes: duration,
      preferredStartMinutes: startMinutes + QUICK_CREATE_TIME_STEP_MINUTES,
      ignoreEventId: String(eventDetails.id || '').trim(),
    });
    if (!slot) {
      setEventQuickActionError('Не нашли свободный слот в ближайшие 30 дней.');
      return;
    }
    const payload = buildEventUpdatePayload(eventDetails, {
      date: slot.dateKey,
      time: formatMinutesAsTime(slot.startMinutes),
      durationMinutes: duration,
    });
    setEventQuickActionBusy(true);
    setEventQuickActionError('');
    try {
      await updateEventOnServer(eventDetails, payload);
      setEventDetails(null);
      await loadTeacherCalendar({ silent: true });
    } catch (err) {
      setEventQuickActionError(err?.message || 'Не удалось перенести на свободный слот.');
    } finally {
      setEventQuickActionBusy(false);
    }
  }, [
    buildEventUpdatePayload,
    eventDeleteBusy,
    eventDetails,
    eventEditSaving,
    eventQuickActionBusy,
    findNextFreeSlot,
    loadTeacherCalendar,
    resolveEventDateKey,
    updateEventOnServer,
  ]);

  const handleDuplicateEventNextWeek = useCallback(async () => {
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy) return;
    const baseDateKey = resolveEventDateKey(eventDetails);
    const baseDate = parseDayKeyToDate(baseDateKey);
    if (!baseDate) {
      setEventQuickActionError('Не удалось определить дату занятия для дублирования.');
      return;
    }
    const targetDateKey = toDayKey(addDays(baseDate, 7));
    const time = String(eventDetails.time || '').trim() || formatMinutesAsTime(eventDetails.startMinutes);
    const duration = Number.isFinite(Number(eventDetails.durationMinutes))
      ? Math.round(Number(eventDetails.durationMinutes))
      : DEFAULT_EVENT_DURATION_MINUTES;
    const subject = String(
      eventDetails.subject
      || eventDetails.subjectLabel
      || eventDetails.studentName
      || DEFAULT_ONE_TIME_LESSON_SUBJECT
    ).trim() || DEFAULT_ONE_TIME_LESSON_SUBJECT;
    setEventQuickActionBusy(true);
    setEventQuickActionError('');
    try {
      const studentId = String(eventDetails.studentId || '').trim();
      if (studentId) {
        await api.addScheduleEntry(studentId, {
          date: targetDateKey,
          time,
          subject,
          durationMinutes: duration,
          note: typeof eventDetails.note === 'string' ? eventDetails.note : '',
        });
      } else {
        await api.addTeacherScheduleEntry({
          date: targetDateKey,
          time,
          subject,
          studentName: subject,
          durationMinutes: duration,
          note: typeof eventDetails.note === 'string' ? eventDetails.note : '',
        }, teacherId);
      }
      await loadTeacherCalendar({ silent: true });
    } catch (err) {
      setEventQuickActionError(err?.message || 'Не удалось создать копию занятия.');
    } finally {
      setEventQuickActionBusy(false);
    }
  }, [
    eventDeleteBusy,
    eventDetails,
    eventEditSaving,
    eventQuickActionBusy,
    loadTeacherCalendar,
    resolveEventDateKey,
    teacherId,
  ]);

  const startEventEdit = useCallback(() => {
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy) return;
    const currentTitle = String(
      eventDetails.subject
      || eventDetails.subjectLabel
      || eventDetails.studentName
      || DEFAULT_ONE_TIME_LESSON_SUBJECT
    ).trim();
    setEventEditDraft({
      title: currentTitle || DEFAULT_ONE_TIME_LESSON_SUBJECT,
      time: String(eventDetails.time || '').trim() || '09:00',
      durationMinutes: Number.isFinite(Number(eventDetails.durationMinutes))
        ? Math.round(Number(eventDetails.durationMinutes))
        : DEFAULT_EVENT_DURATION_MINUTES,
    });
    setEventDeleteError('');
    setEventEditError('');
    setEventQuickActionError('');
  }, [eventDeleteBusy, eventDetails, eventEditSaving, eventQuickActionBusy]);

  const cancelEventEdit = useCallback(() => {
    if (eventEditSaving) return;
    setEventEditDraft(null);
    setEventEditError('');
  }, [eventEditSaving]);

  const handleSaveEventEdit = useCallback(async () => {
    if (!eventDetails || !eventEditDraft || eventEditSaving || eventDeleteBusy || eventQuickActionBusy) return;
    const eventId = String(eventDetails.id || '').trim();
    if (!eventId) {
      setEventEditError('Не удалось определить занятие для редактирования.');
      return;
    }

    const title = String(eventEditDraft.title || '').trim() || DEFAULT_ONE_TIME_LESSON_SUBJECT;
    const time = String(eventEditDraft.time || '').trim();
    const startMinutes = parseScheduleTimeToMinutes(time);
    if (!Number.isFinite(startMinutes)) {
      setEventEditError('Укажите корректное время занятия.');
      return;
    }
    if (startMinutes < dayStartMinutes || startMinutes >= dayEndMinutes) {
      setEventEditError(`Время должно быть в диапазоне ${formatMinutesAsTime(dayStartMinutes)}-${formatMinutesAsTime(dayEndMinutes)}.`);
      return;
    }

    const durationRaw = Number(eventEditDraft.durationMinutes);
    const durationMinutes = Number.isFinite(durationRaw) ? Math.round(durationRaw) : NaN;
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
      setEventEditError('Укажите длительность от 15 до 360 минут.');
      return;
    }

    const payload = buildEventUpdatePayload(eventDetails, {
      time,
      subject: title,
      durationMinutes,
    });
    setEventEditSaving(true);
    setEventEditError('');
    setEventQuickActionError('');
    try {
      await updateEventOnServer(eventDetails, payload);
      setEventDetails(null);
      setEventEditDraft(null);
      await loadTeacherCalendar({ silent: true });
    } catch (err) {
      setEventEditError(err?.message || 'Не удалось сохранить изменения.');
    } finally {
      setEventEditSaving(false);
    }
  }, [
    buildEventUpdatePayload,
    dayEndMinutes,
    dayStartMinutes,
    eventDeleteBusy,
    eventDetails,
    eventEditDraft,
    eventEditSaving,
    eventQuickActionBusy,
    loadTeacherCalendar,
    updateEventOnServer,
  ]);

  const handleDeleteEvent = useCallback(async () => {
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy) return;
    const studentId = String(eventDetails.studentId || '').trim();
    const eventId = String(eventDetails.id || '').trim();
    if (!eventId) {
      setEventDeleteError('Не удалось определить занятие для удаления.');
      return;
    }
    const confirmMessage = studentId
      ? 'Удалить это занятие из расписания ученика?'
      : 'Удалить это пробное занятие из календаря учителя?';
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setEventDeleteBusy(true);
    setEventDeleteError('');
    setEventQuickActionError('');
    try {
      if (studentId) {
        await api.deleteScheduleEntry(studentId, eventId);
      } else {
        await api.deleteTeacherScheduleEntry(eventId, teacherId);
      }
      setEventDetails(null);
      await loadTeacherCalendar({ silent: true });
    } catch (err) {
      setEventDeleteError(err?.message || 'Не удалось удалить занятие.');
    } finally {
      setEventDeleteBusy(false);
    }
  }, [eventDeleteBusy, eventDetails, eventEditSaving, eventQuickActionBusy, loadTeacherCalendar, teacherId]);

  useEffect(() => {
    if (!quickCreateDraft) return undefined;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (quickCreateSaving || quickCreateFindingSlot) return;
      setQuickCreateDraft(null);
      setQuickCreateError('');
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [quickCreateDraft, quickCreateFindingSlot, quickCreateSaving]);

  useEffect(() => {
    if (!eventDetails) return undefined;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (eventDeleteBusy || eventEditSaving || eventQuickActionBusy) return;
      if (eventEditDraft) {
        setEventEditDraft(null);
        setEventEditError('');
        return;
      }
      setEventDetails(null);
      setEventDeleteError('');
      setEventEditError('');
      setEventQuickActionError('');
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [eventDeleteBusy, eventDetails, eventEditDraft, eventEditSaving, eventQuickActionBusy]);

  return (
    <section className="relative h-[calc(var(--app-vh,1vh)*100-11rem)] overflow-hidden rounded-[28px] border border-purple-200/80 bg-gradient-to-br from-white via-violet-50/60 to-fuchsia-50/45 shadow-[0_18px_38px_rgba(99,102,241,0.16)] md:h-[calc(var(--app-vh,1vh)*100-9.5rem)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_6%_0%,rgba(59,130,246,0.16),transparent_38%),radial-gradient(circle_at_96%_2%,rgba(217,70,239,0.15),transparent_44%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0))]" />
      <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden rounded-[28px]">
        <div className="flex h-16 items-center justify-between border-b border-purple-200/70 bg-white/75 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="grid h-9 w-9 place-items-center rounded-full border border-purple-200/75 bg-white/85 text-purple-600 shadow-sm hover:bg-purple-50"
              aria-label={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
              title={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_10px_20px_rgba(124,58,237,0.32)]">
                <CalendarDays size={16} />
              </span>
              <span className="font-display text-2xl font-semibold leading-none text-slate-900">Календарь</span>
            </div>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm">
              <Search size={13} />
              {normalizedSearchQuery ? `Найдено слотов: ${visibleLessonsCount}` : `Слотов: ${visibleLessonsCount}`}
            </span>
            <span className="rounded-full border border-purple-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm">
              {showWeekends ? '7 дней' : '5 дней'}
            </span>
            <span className="rounded-full border border-purple-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm">
              {use24HourFormat ? '24ч формат' : '12ч формат'}
            </span>
            <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${
              conflictStats.events > 0
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
            >
              Конфликты: {conflictStats.events}
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm">
              Пробные: {trialEventsThisWeek.length}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm">
              С учениками: {studentEventsThisWeek.length}
            </span>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 grid"
          style={{ gridTemplateColumns: `${sidebarCollapsed ? 76 : 240}px minmax(0, 1fr)` }}
        >
          <aside className={`${sidebarCollapsed ? 'w-[76px]' : 'w-60'} overflow-hidden border-r border-purple-200/65 bg-gradient-to-b from-white/80 via-violet-50/45 to-fuchsia-50/35 p-3 backdrop-blur-md`}>
            <button
              type="button"
              onClick={openQuickCreateForFocusDate}
              className={`inline-flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-2 rounded-2xl border border-violet-500/70 bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(124,58,237,0.24)] hover:from-violet-700 hover:to-purple-700`}
              title="Создать занятие в выбранный день"
            >
              <Plus size={16} />
              {!sidebarCollapsed && 'Создать'}
            </button>

            {!sidebarCollapsed && (
              <>
                <div className="surface-panel mt-3 rounded-2xl border border-purple-200/70 bg-white/88 p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md border border-purple-200/70 bg-white/90 text-purple-600 hover:bg-purple-50"
                      onClick={() => setMiniMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                      aria-label="Предыдущий месяц"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <div className="text-sm font-semibold text-slate-800">{miniMonthLabel}</div>
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md border border-purple-200/70 bg-white/90 text-purple-600 hover:bg-purple-50"
                      onClick={() => setMiniMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                      aria-label="Следующий месяц"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {MINI_MONTH_WEEKDAY_LABELS.map((label) => (
                      <div key={`mini-weekday-${label}`}>{label}</div>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {miniMonthDays.map((day) => {
                      const isToday = day.dayKey === todayKey;
                      const isInWeek = weekDayKeySet.has(day.dayKey);
                      return (
                        <button
                          key={`mini-day-${day.dayKey}`}
                          type="button"
                          onClick={() => setFocusDate(cloneAsDateOnly(day.date))}
                          className={`h-7 rounded-md text-[11px] font-semibold ${
                            isInWeek
                              ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white'
                              : day.inCurrentMonth
                                ? 'text-slate-700 hover:bg-purple-50'
                                : 'text-slate-400 hover:bg-purple-50'
                          } ${isToday && !isInWeek ? 'ring-1 ring-violet-400' : ''}`}
                        >
                          {day.date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="surface-panel mt-3 rounded-2xl border border-purple-200/70 bg-white/88 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Календари учеников</div>
                    <span className="rounded-full border border-purple-200/70 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                      {studentCount}
                    </span>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={!allStudentsHidden}
                      onChange={() => {
                        if (allStudentsHidden) {
                          setHiddenStudentMap({});
                          return;
                        }
                        const next = {};
                        studentCalendars.forEach((item) => {
                          next[item.id] = true;
                        });
                        setHiddenStudentMap(next);
                      }}
                    />
                    Все ученики
                  </label>
                  <div className="mt-2 max-h-40 space-y-1 overflow-hidden pr-1">
                    {studentCalendars.map((student) => (
                      <label key={`calendar-student-${student.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={!hiddenStudentMap[student.id]}
                          onChange={() => {
                            setHiddenStudentMap((prev) => ({ ...prev, [student.id]: !prev[student.id] }));
                          }}
                        />
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: student.color }} />
                        <span className="truncate">{student.label}</span>
                      </label>
                    ))}
                    {studentCalendars.length === 0 && (
                      <div className="text-xs text-slate-500">Учеников с расписанием пока нет.</div>
                    )}
                  </div>
                </div>

                <div className="surface-panel mt-3 rounded-2xl border border-purple-200/70 bg-white/88 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Пробные на неделе</div>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      {upcomingTrialEvents.length}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {upcomingTrialEvents.map((event) => (
                      <button
                        key={`trial-shortcut-${event.id || `${event.dayKey}-${event.time}`}`}
                        type="button"
                        onClick={() => {
                          const date = parseDayKeyToDate(event.dayKey);
                          if (date) setFocusDate(cloneAsDateOnly(date));
                          openEventDetailsModal(event, event.dayKey);
                        }}
                        className="w-full rounded-lg border border-purple-100 bg-white/90 px-2 py-1.5 text-left hover:border-purple-200 hover:bg-purple-50/70"
                      >
                        <div className="truncate text-[11px] font-semibold text-slate-800">
                          {String(event.subject || event.studentName || DEFAULT_ONE_TIME_LESSON_SUBJECT).trim()}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {formatDayMonth(new Date(`${event.dayKey}T00:00:00`))}, {formatMinutesAsDisplayTime(event.startMinutes, use24HourFormat)}
                        </div>
                      </button>
                    ))}
                    {upcomingTrialEvents.length === 0 && (
                      <div className="text-xs text-slate-500">Пробных слотов на этой неделе нет.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white/72 backdrop-blur-[2px]">
            <div className="border-b border-purple-200/70 bg-white/75 px-4 py-3 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFocusDate(cloneAsDateOnly(new Date()))}
                    className="rounded-full border border-purple-200/85 bg-white/95 px-4 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-purple-300 hover:bg-purple-50"
                  >
                    Сегодня
                  </button>
                  <button
                    type="button"
                    onClick={() => setFocusDate((prev) => addDays(prev, -7))}
                    className="grid h-8 w-8 place-items-center rounded-full border border-purple-200/75 bg-white/90 text-purple-600 shadow-sm hover:bg-purple-50"
                    aria-label="Предыдущая неделя"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFocusDate((prev) => addDays(prev, 7))}
                    className="grid h-8 w-8 place-items-center rounded-full border border-purple-200/75 bg-white/90 text-purple-600 shadow-sm hover:bg-purple-50"
                    aria-label="Следующая неделя"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <div className="ml-1 font-display text-[30px] leading-none text-slate-800">{weekTitle}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="rounded-full border border-purple-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
                    {weekRangeLabel}
                  </span>
                  <span className="rounded-full border border-purple-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
                    {timezoneLabel}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleTeacherReminder}
                    disabled={teacherReminderLoading || teacherReminderSaving || pushSyncing || pushBusy || !pushReady}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      !pushEnabled
                        ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                        : (teacherReminderEnabled
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100')
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {(pushEnabled && teacherReminderEnabled) ? <BellOff size={13} /> : <Bell size={13} />}
                    {teacherReminderSaving
                      ? 'Сохраняем...'
                      : (!pushEnabled
                          ? 'Включить push'
                          : (teacherReminderEnabled ? 'Отключить напоминания' : 'Включить напоминания'))}
                  </button>
                  <button
                    type="button"
                    onClick={() => loadTeacherCalendar({ silent: true })}
                    disabled={loading || refreshing}
                    className="inline-flex items-center gap-1.5 rounded-full border border-purple-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCcw size={13} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Обновляем...' : 'Обновить'}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="relative min-w-[220px] flex-1 md:max-w-sm">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Поиск по ученику, предмету, времени..."
                    className="w-full rounded-full border border-purple-200/85 bg-white/95 py-1.5 pl-9 pr-3 text-xs text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                  />
                </label>
                <input
                  type="date"
                  value={focusDateInputValue}
                  onChange={(event) => {
                    const nextValue = String(event.target.value || '').trim();
                    if (!nextValue) return;
                    const nextDate = new Date(`${nextValue}T00:00:00`);
                    if (Number.isNaN(nextDate.getTime())) return;
                    setFocusDate(cloneAsDateOnly(nextDate));
                  }}
                  className="rounded-full border border-purple-200/85 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                />
                <div className="inline-flex items-center overflow-hidden rounded-full border border-purple-200/85 bg-white/95 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setLessonTypeFilter(LESSON_FILTER_ALL)}
                    className={`px-3 py-1.5 ${lessonTypeFilter === LESSON_FILTER_ALL ? 'bg-purple-100 text-purple-700' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    Все
                  </button>
                  <button
                    type="button"
                    onClick={() => setLessonTypeFilter(LESSON_FILTER_TRIAL)}
                    className={`border-l border-purple-100 px-3 py-1.5 ${lessonTypeFilter === LESSON_FILTER_TRIAL ? 'bg-sky-100 text-sky-700' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    Пробные
                  </button>
                  <button
                    type="button"
                    onClick={() => setLessonTypeFilter(LESSON_FILTER_STUDENT)}
                    className={`border-l border-purple-100 px-3 py-1.5 ${lessonTypeFilter === LESSON_FILTER_STUDENT ? 'bg-emerald-100 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    С учениками
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWeekends((prev) => !prev)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    showWeekends
                      ? 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {showWeekends ? 'С выходными' : 'Без выходных'}
                </button>
                <button
                  type="button"
                  onClick={() => setUse24HourFormat((prev) => !prev)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    use24HourFormat
                      ? 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {use24HourFormat ? '24ч' : '12ч'}
                </button>
                <button
                  type="button"
                  onClick={() => setCompactMode((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    compactMode
                      ? 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Settings size={12} />
                  {compactMode ? 'Компактный вид' : 'Обычный вид'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConflictsOnly((prev) => !prev)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    showConflictsOnly
                      ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {showConflictsOnly ? 'Только конфликты' : 'Все занятия'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full border border-purple-200/80 bg-white/90 px-2.5 py-1 font-semibold text-purple-700">
                  Отфильтровано слотов: {visibleLessonsCount}
                </span>
                <span className={`rounded-full border px-2.5 py-1 font-semibold ${
                  conflictStats.events > 0
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
                >
                  Конфликтов: {conflictStats.events} в {conflictStats.days} дн.
                </span>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                  Следующее: {nextLessonLabel}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {teacherReminderStatusText}
              </div>
              {(teacherReminderError || pushError) && (
                <div className="mt-1 text-xs text-rose-600">
                  {teacherReminderError || pushError}
                </div>
              )}
              {error && (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                  {error}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="h-full">
                <div
                  className="grid border-b border-purple-200/75 bg-gradient-to-r from-violet-50/70 via-white/95 to-fuchsia-50/60"
                  style={{ gridTemplateColumns: `72px repeat(${visibleDayIndexes.length}, minmax(0, 1fr))` }}
                >
                  <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {timezoneLabel}
                  </div>
                  {visibleDayIndexes.map((dayIndex) => {
                    const date = weekDays[dayIndex];
                    if (!date) return null;
                    const dayKey = toDayKey(date);
                    const isToday = dayKey === todayKey;
                    const isFocused = dayKey === toDayKey(focusDate);
                    return (
                      <div key={`calendar-day-header-${dayKey}`} className="border-l border-slate-200 px-2 py-2 text-center">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {SCHEDULE_WEEKDAYS[dayIndex]?.shortLabel || ''}
                        </div>
                        <div
                          className={`mt-1 inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[30px] leading-none ${
                            isFocused || isToday ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-[0_8px_18px_rgba(124,58,237,0.25)]' : 'text-slate-800'
                          }`}
                        >
                          {date.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className="grid border-b border-purple-200/70 bg-white/85"
                  style={{ gridTemplateColumns: `72px repeat(${visibleDayIndexes.length}, minmax(0, 1fr))` }}
                >
                  <div className="px-2 py-2 text-[11px] font-semibold text-slate-500">Весь день</div>
                  {visibleDayIndexes.map((dayIndex) => {
                    const date = weekDays[dayIndex];
                    if (!date) return null;
                    const dayKey = toDayKey(date);
                    const holidays = holidaysByDayKey[dayKey] || [];
                    return (
                      <div key={`allday-${dayKey}`} className="flex min-h-[34px] items-center gap-1 border-l border-slate-200 px-1.5 py-1">
                        {holidays.map((holiday) => (
                          <span
                            key={`holiday-${dayKey}-${holiday.title}`}
                            className="truncate rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                            title={holiday.title}
                          >
                            {holiday.title}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {loading && entries.length === 0 ? (
                  <div className="flex h-full min-h-[180px] items-center justify-center gap-2 text-sm font-medium text-slate-600">
                    <RefreshCcw size={15} className="animate-spin" />
                    Загружаем календарь...
                  </div>
                ) : (
                  <>
                    {visibleLessonsCount === 0 && (
                      <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
                        {normalizedSearchQuery
                          ? 'По текущему поиску и фильтрам ничего не найдено.'
                          : 'Кликните по свободному месту в сетке, чтобы добавить разовое занятие.'}
                      </div>
                    )}
                    <div
                      className="grid"
                      style={{ gridTemplateColumns: `72px repeat(${visibleDayIndexes.length}, minmax(0, 1fr))` }}
                    >
                      <div className="relative border-r border-purple-200/70 bg-white/85" style={{ height: `${calendarHeight}px` }}>
                        {hourTicks.map((hour, index) => (
                          <div
                            key={`time-label-${hour}`}
                            className="absolute left-0 right-0 -translate-y-1/2 px-2 text-right text-[11px] text-slate-500"
                            style={{ top: `${index * hourHeight}px` }}
                          >
                            {formatHourLabel(hour, use24HourFormat)}
                          </div>
                        ))}
                      </div>

                      {visibleDayIndexes.map((dayIndex, dayColumnIndex) => {
                        const date = weekDays[dayIndex];
                        if (!date) return null;
                        const dayKey = toDayKey(date);
                        const isToday = dayKey === todayKey;
                        const events = displayEventsByDayIndex[dayIndex] || [];
                        return (
                          <div
                            key={`day-column-${dayKey}`}
                            className={`relative cursor-pointer border-r border-purple-200/70 transition-colors ${dayColumnIndex === visibleDayIndexes.length - 1 ? 'border-r-0' : ''} ${
                              isToday ? 'bg-violet-100/45' : 'bg-white/75 hover:bg-violet-50/55'
                            }`}
                            style={{ height: `${calendarHeight}px` }}
                            onClick={(event) => openQuickCreate(dayIndex, event)}
                            title="Кликните, чтобы добавить разовое занятие"
                          >
                            {hourTicks.map((hour, index) => (
                              <div
                                key={`grid-line-${dayKey}-${hour}`}
                                className="absolute left-0 right-0 border-t border-purple-200/65"
                                style={{ top: `${index * hourHeight}px` }}
                              />
                            ))}

                            {events.map((event, index) => {
                              const top = ((event.startMinutes - dayStartMinutes) / 60) * hourHeight + 1;
                              const height = Math.max(
                                26,
                                ((event.endMinutes - event.startMinutes) / 60) * hourHeight - 2
                              );
                              const hasStudent = Boolean(String(event.studentId || '').trim());
                              const studentName = studentNameById[event.studentId] || event.studentName || 'Ученик';
                              const subject = String(event.subject || '').trim();
                              const subjectLabel = subject && subject.toLowerCase() !== 'занятие'
                                ? subject
                                : '';
                              const primaryLabel = hasStudent
                                ? studentName
                                : (subjectLabel || studentName || DEFAULT_ONE_TIME_LESSON_SUBJECT);
                              const showSubjectInCard = Boolean(hasStudent && subjectLabel && subjectLabel !== primaryLabel);
                              const startLabel = formatMinutesAsDisplayTime(event.startMinutes, use24HourFormat);
                              const endLabel = formatMinutesAsDisplayTime(event.endMinutes, use24HourFormat);
                              const color = getEventColor(event.studentId || studentName || `${dayIndex}-${index}`);
                              const laneWidth = 100 / Math.max(1, event.laneCount || 1);
                              const left = (event.lane || 0) * laneWidth;
                              const hasConflict = Number(event.laneCount || 1) > 1;
                              return (
                                <div
                                  key={event.id || `${dayKey}-${event.time}-${event.studentId}-${index}`}
                                  title={`${primaryLabel}${showSubjectInCard ? ` • ${subjectLabel}` : ''} • ${startLabel}-${endLabel}`}
                                  className={`absolute z-10 overflow-hidden rounded-md border px-2 py-1 text-white shadow-sm ${hasConflict ? 'ring-2 ring-rose-300 ring-offset-1 ring-offset-white' : ''}`}
                                  style={{
                                    top: `${top}px`,
                                    height: `${height}px`,
                                    left: `calc(${left}% + 3px)`,
                                    width: `calc(${laneWidth}% - 6px)`,
                                    backgroundColor: color,
                                    borderColor: color,
                                  }}
                                  onClick={(eventClick) => {
                                    eventClick.stopPropagation();
                                    openEventDetailsModal(event, dayKey);
                                  }}
                                >
                                  <div className="truncate text-[11px] font-bold leading-tight">{primaryLabel}</div>
                                  {showSubjectInCard && (
                                    <div className="truncate text-[10px] font-semibold leading-tight text-white/95">
                                      {subjectLabel}
                                    </div>
                                  )}
                                  <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-white/90">
                                    <Clock3 size={10} />
                                    {`${startLabel}-${endLabel}`}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {quickCreateDraft && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={closeQuickCreate}
        >
          <form
            className="surface-panel modal-card w-full max-w-md rounded-2xl border border-purple-200/80 bg-gradient-to-br from-white via-violet-50/65 to-fuchsia-50/55 p-4 shadow-2xl"
            onSubmit={handleQuickCreateSave}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">Новое разовое занятие</div>
                <div className="text-xs text-slate-500">{quickCreateDateLabel}</div>
              </div>
              <button
                type="button"
                onClick={closeQuickCreate}
                disabled={quickCreateSaving || quickCreateFindingSlot}
                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Закрыть
              </button>
            </div>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Тип занятия
            </label>
            <div className="mt-1 inline-flex w-full items-center overflow-hidden rounded-xl border border-purple-200/80 bg-white/95 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setQuickCreateDraft((prev) => (prev ? {
                  ...prev,
                  studentId: TRIAL_WITHOUT_STUDENT_VALUE,
                } : prev))}
                disabled={quickCreateSaving || quickCreateFindingSlot}
                className={`flex-1 px-3 py-2 ${quickCreateIsTrialWithoutStudent ? 'bg-sky-100 text-sky-700' : 'text-slate-700 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Пробное
              </button>
              <button
                type="button"
                onClick={() => setQuickCreateDraft((prev) => (prev ? {
                  ...prev,
                  studentId: firstStudentOptionId || prev.studentId,
                } : prev))}
                disabled={quickCreateSaving || quickCreateFindingSlot || !firstStudentOptionId}
                className={`flex-1 border-l border-purple-100 px-3 py-2 ${
                  !quickCreateIsTrialWithoutStudent ? 'bg-emerald-100 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                С учеником
              </button>
            </div>

            {!quickCreateIsTrialWithoutStudent && (
              <>
                <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ученик
                </label>
                <select
                  value={quickCreateDraft.studentId}
                  onChange={(event) => setQuickCreateDraft((prev) => (prev ? { ...prev, studentId: event.target.value } : prev))}
                  disabled={quickCreateSaving || quickCreateFindingSlot}
                  className="mt-1 w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {!firstStudentOptionId && (
                    <option value="">Нет учеников</option>
                  )}
                  {studentOptions.map((student) => (
                    <option key={`quick-create-student-${student.id}`} value={student.id}>
                      {student.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Название
            </label>
            <input
              type="text"
              value={quickCreateDraft.title}
              onChange={(event) => setQuickCreateDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
              disabled={quickCreateSaving || quickCreateFindingSlot}
              placeholder={DEFAULT_ONE_TIME_LESSON_SUBJECT}
              className="mt-1 w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
              maxLength={80}
            />

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Дата</span>
                <input
                  type="date"
                  value={quickCreateDateInputValue}
                  onChange={(event) => setQuickCreateDraft((prev) => (prev ? { ...prev, dateKey: event.target.value } : prev))}
                  disabled={quickCreateSaving || quickCreateFindingSlot}
                  className="mt-1 w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Время</span>
                <input
                  type="time"
                  value={quickCreateDraft.time}
                  onChange={(event) => setQuickCreateDraft((prev) => (prev ? { ...prev, time: event.target.value } : prev))}
                  disabled={quickCreateSaving || quickCreateFindingSlot}
                  step={QUICK_CREATE_TIME_STEP_MINUTES * 60}
                  className="mt-1 w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </label>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_TIME_PRESETS.map((timePreset) => (
                <button
                  key={`time-preset-${timePreset}`}
                  type="button"
                  onClick={() => setQuickCreateDraft((prev) => (prev ? { ...prev, time: timePreset } : prev))}
                  disabled={quickCreateSaving || quickCreateFindingSlot}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    quickCreateDraft.time === timePreset
                      ? 'border-purple-200 bg-purple-100 text-purple-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {timePreset}
                </button>
              ))}
            </div>

            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Длительность (мин)
            </label>
            <input
              type="number"
              value={quickCreateDraft.durationMinutes}
              onChange={(event) => setQuickCreateDraft((prev) => (prev ? { ...prev, durationMinutes: event.target.value } : prev))}
              disabled={quickCreateSaving || quickCreateFindingSlot}
              min={15}
              max={360}
              step={5}
              className="mt-1 w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_DURATION_PRESETS.map((durationPreset) => (
                <button
                  key={`duration-preset-${durationPreset}`}
                  type="button"
                  onClick={() => setQuickCreateDraft((prev) => (prev ? { ...prev, durationMinutes: durationPreset } : prev))}
                  disabled={quickCreateSaving || quickCreateFindingSlot}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    Number(quickCreateDraft.durationMinutes) === durationPreset
                      ? 'border-purple-200 bg-purple-100 text-purple-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {durationPreset} мин
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleQuickCreateFindNearestFreeSlot}
              disabled={quickCreateSaving || quickCreateFindingSlot}
              className="mt-3 w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quickCreateFindingSlot ? 'Подбираем свободный слот...' : 'Подобрать ближайший свободный слот'}
            </button>

            {quickCreateError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                {quickCreateError}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeQuickCreate}
                disabled={quickCreateSaving || quickCreateFindingSlot}
                className="rounded-full border border-purple-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={quickCreateSaving || quickCreateFindingSlot}
                className="rounded-full border border-violet-600 bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(124,58,237,0.25)] hover:from-violet-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {quickCreateSaving ? 'Сохраняем...' : 'Добавить'}
              </button>
            </div>
          </form>
        </div>
      )}
      {eventDetails && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={closeEventDetails}
        >
          <div
            className="surface-panel modal-card w-full max-w-md rounded-2xl border border-purple-200/80 bg-gradient-to-br from-white via-violet-50/65 to-fuchsia-50/55 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {eventDetails.subjectLabel || eventDetails.subject || 'Занятие'}
                </div>
                <div className="text-xs text-slate-500">{eventDetailsDateLabel}</div>
              </div>
              <button
                type="button"
                onClick={closeEventDetails}
                disabled={eventDeleteBusy || eventEditSaving || eventQuickActionBusy}
                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Закрыть
              </button>
            </div>

            {eventEditDraft ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Название
                </label>
                <input
                  type="text"
                  value={eventEditDraft.title}
                  onChange={(event) => setEventEditDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                  disabled={eventEditSaving || eventDeleteBusy}
                  maxLength={80}
                  className="w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Время
                </label>
                <input
                  type="time"
                  value={eventEditDraft.time}
                  onChange={(event) => setEventEditDraft((prev) => (prev ? { ...prev, time: event.target.value } : prev))}
                  disabled={eventEditSaving || eventDeleteBusy}
                  step={QUICK_CREATE_TIME_STEP_MINUTES * 60}
                  className="w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Длительность (мин)
                </label>
                <input
                  type="number"
                  value={eventEditDraft.durationMinutes}
                  onChange={(event) => setEventEditDraft((prev) => (prev ? { ...prev, durationMinutes: event.target.value } : prev))}
                  disabled={eventEditSaving || eventDeleteBusy}
                  min={15}
                  max={360}
                  step={5}
                  className="w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-2 text-sm text-slate-700">
                  <div>
                    <span className="text-slate-500">
                      {String(eventDetails.studentId || '').trim() ? 'Ученик: ' : 'Название: '}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {String(eventDetails.studentId || '').trim()
                        ? (eventDetails.studentName || 'Ученик')
                        : (eventDetails.subjectLabel || eventDetails.subject || eventDetails.studentName || 'Занятие')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Время: </span>
                    <span className="font-semibold text-slate-900">
                      {eventDetailsTimeLabel}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Длительность: </span>
                    <span className="font-semibold text-slate-900">
                      {Number.isFinite(Number(eventDetails.durationMinutes))
                        ? `${Math.round(Number(eventDetails.durationMinutes))} мин`
                        : `${DEFAULT_EVENT_DURATION_MINUTES} мин`}
                    </span>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-purple-200/80 bg-white/80 p-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Быстрые действия
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickShiftEvent({ minuteShift: -30 })}
                      disabled={eventQuickActionBusy || eventDeleteBusy || eventEditSaving}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      -30 мин
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickShiftEvent({ minuteShift: 30 })}
                      disabled={eventQuickActionBusy || eventDeleteBusy || eventEditSaving}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      +30 мин
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickShiftEvent({ dayShift: 1 })}
                      disabled={eventQuickActionBusy || eventDeleteBusy || eventEditSaving}
                      className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      +1 день
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickShiftEvent({ dayShift: 7 })}
                      disabled={eventQuickActionBusy || eventDeleteBusy || eventEditSaving}
                      className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      +1 неделя
                    </button>
                    <button
                      type="button"
                      onClick={handleMoveEventToNearestFreeSlot}
                      disabled={eventQuickActionBusy || eventDeleteBusy || eventEditSaving}
                      className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Ближайший свободный
                    </button>
                    <button
                      type="button"
                      onClick={handleDuplicateEventNextWeek}
                      disabled={eventQuickActionBusy || eventDeleteBusy || eventEditSaving}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Копия через 7 дней
                    </button>
                  </div>
                  {eventQuickActionBusy && (
                    <div className="mt-2 text-xs text-slate-500">Применяем быстрые изменения...</div>
                  )}
                </div>
              </>
            )}

            {eventDeleteError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                {eventDeleteError}
              </div>
            )}
            {eventEditError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                {eventEditError}
              </div>
            )}
            {eventQuickActionError && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                {eventQuickActionError}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              {eventEditDraft ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEventEdit}
                    disabled={eventEditSaving || eventDeleteBusy || eventQuickActionBusy}
                    className="rounded-full border border-purple-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Отменить
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEventEdit}
                    disabled={eventEditSaving || eventDeleteBusy || eventQuickActionBusy}
                    className="rounded-full border border-violet-600 bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(124,58,237,0.25)] hover:from-violet-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {eventEditSaving ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={closeEventDetails}
                    disabled={eventDeleteBusy || eventEditSaving || eventQuickActionBusy}
                    className="rounded-full border border-purple-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={startEventEdit}
                    disabled={eventDeleteBusy || eventEditSaving || eventQuickActionBusy}
                    className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteEvent}
                    disabled={eventDeleteBusy || eventEditSaving || eventQuickActionBusy}
                    className="rounded-full border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {eventDeleteBusy ? 'Удаляем...' : 'Удалить'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default TeacherCalendarSection;
