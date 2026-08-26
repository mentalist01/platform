import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  BookOpen,
  Brush,
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  ExternalLink,
  FileText,
  Info,
  Link2,
  Menu,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Unlink,
  Users,
  Wallet,
  X,
  ImageDown,
  Share2,
} from 'lucide-react';
import { api, resolveAuthenticatedUploadsUrl } from '../services/api';
import { isNativeAndroidPushEnvironment } from '../utils/push';
import { resolveApiUrl } from '../utils/runtimeUrls';
import { normalizeTelemostUrl } from '../utils/telemost';
import { resolveCalendarEventHomeworkProgress } from '../utils/calendarHomeworkProgress';
import {
  formatAvailabilityShareWeekLabel,
  getAvailabilityShareWeekStart,
  renderCalendarAvailabilityPng,
} from '../utils/calendarAvailabilityShare';

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
const EVENT_COLORS = ['#0ea5e9', '#14b8a6', '#6366f1', '#f59e0b', '#ec4899', '#22c55e', '#8b5cf6', '#f97316'];
const CALENDAR_PAID_EVENT_COLOR = '#10b981';
const CALENDAR_UNPAID_PAST_EVENT_COLOR = '#f43f5e';
const CALENDAR_PARTIAL_PAYMENT_EVENT_COLOR = '#f59e0b';
const CALENDAR_TRIAL_EVENT_COLOR = '#f59e0b';

const CALENDAR_START_HOUR = 0;
const CALENDAR_END_HOUR = 24;
const CALENDAR_DEFAULT_SCROLL_HOUR = 9;
const CALENDAR_DEFAULT_SCROLL_LEAD_MINUTES = 30;
const MIN_CALENDAR_HOUR_HEIGHT = 24;
const MAX_CALENDAR_HOUR_HEIGHT = 56;
const CALENDAR_VIEWPORT_RESERVED_PX = 276;
const DEFAULT_EVENT_DURATION_MINUTES = 60;
const QUICK_CREATE_TIME_STEP_MINUTES = 30;
const DEFAULT_ONE_TIME_LESSON_SUBJECT = 'Пробное занятие';
const TRIAL_WITHOUT_STUDENT_VALUE = '__trial_without_student__';
const CALENDAR_UI_PREFS_STORAGE_KEY = 'teacher_calendar_ui_prefs_v2';
const CALENDAR_BROWSER_ALARM_PREFS_STORAGE_KEY = 'teacher_calendar_browser_alarm_prefs_v1';
const QUICK_DURATION_PRESETS = [30, 45, 60, 90];
const QUICK_TIME_PRESETS = ['09:00', '12:00', '15:00', '17:00', '19:00'];
const LESSON_FILTER_ALL = 'all';
const LESSON_FILTER_TRIAL = 'trial';
const LESSON_FILTER_STUDENT = 'student';
const REPEAT_MODE_ONCE = 'once';
const REPEAT_MODE_WEEKLY = 'weekly';
const BROWSER_ALARM_LEAD_MINUTES = 10;
const BROWSER_ALARM_LEAD_MS = BROWSER_ALARM_LEAD_MINUTES * 60 * 1000;
const BROWSER_ALARM_TRIGGER_WINDOW_MS = 3 * 60 * 1000;
const BROWSER_ALARM_CHECK_INTERVAL_MS = 20 * 1000;
const BROWSER_ALARM_DEFAULT_MELODY_URL = '/sounds/user_join.mp3';
const GOOGLE_CALENDAR_AUTO_REFRESH_INTERVAL_MS = 60 * 1000;
const GOOGLE_CALENDAR_AUTO_REFRESH_LABEL = 'каждую минуту';
const CURRENT_TIME_LINE_TICK_MS = 30 * 1000;
const LESSON_PANEL_LOOKAHEAD_DAYS = 14;
const LESSON_PANEL_MARKS_STORAGE_KEY = 'teacher_calendar_lesson_panel_marks_v1';
const LESSON_PANEL_NOTES_CATEGORY = 'class';
const LESSON_PANEL_LEVEL_LABELS = {
  basic: 'обязательный',
  advanced: 'продвинутый',
  expert: 'чтоб наверняка',
  python: 'Python',
};

const normalizeHexColor = (value, fallback = '#2563eb') => {
  const normalized = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized.slice(1).split('').map((char) => `${char}${char}`).join('')}`.toLowerCase();
  }
  return fallback;
};

const hexToRgb = (value) => {
  const normalized = normalizeHexColor(value).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }) => {
  const channelToHex = (channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0');
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
};

const mixHexColor = (value, mixValue, weight = 0.18) => {
  const source = hexToRgb(value);
  const target = hexToRgb(mixValue);
  return rgbToHex({
    r: source.r + ((target.r - source.r) * weight),
    g: source.g + ((target.g - source.g) * weight),
    b: source.b + ((target.b - source.b) * weight),
  });
};

const hexToRgba = (value, alpha = 0.22) => {
  const { r, g, b } = hexToRgb(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildEventCardBackground = (value) => {
  const base = normalizeHexColor(value);
  return `linear-gradient(135deg, ${mixHexColor(base, '#ffffff', 0.14)} 0%, ${base} 52%, ${mixHexColor(base, '#020617', 0.18)} 100%)`;
};

const buildEventCardHomeworkProgressBackground = (value, progressPercent) => {
  const base = normalizeHexColor(value);
  const pale = mixHexColor(base, '#ffffff', 0.58);
  const progress = Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0)));
  return [
    'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 52%, rgba(2,6,23,0.18) 100%)',
    `linear-gradient(90deg, ${base} 0%, ${base} ${progress}%, ${pale} ${progress}%, ${pale} 100%)`,
  ].join(', ');
};

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

const normalizeScheduleDateKey = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const isoDateMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  return toDayKeyFromIsoDate(isoDateMatch ? isoDateMatch[1] : normalized);
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

const pluralizeRu = (count, one, few, many) => {
  const safeCount = Math.abs(Math.trunc(Number(count) || 0));
  const mod10 = safeCount % 10;
  const mod100 = safeCount % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const formatPaymentReminderLessonCount = (count) => (
  `${count} ${pluralizeRu(count, 'урок', 'урока', 'уроков')}`
);

const formatPaymentReminderStudentCount = (count) => (
  `${count} ${pluralizeRu(count, 'ученик', 'ученика', 'учеников')}`
);

const formatHourLabel = (hour, use24HourFormat = true) => {
  if (use24HourFormat) {
    return `${String(hour).padStart(2, '0')}:00`;
  }
  const normalizedHour = Number(hour) % 24;
  const amPm = normalizedHour >= 12 ? 'PM' : 'AM';
  const hour12 = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
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
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const formatMinutesAsDisplayTime = (minutes, use24HourFormat = true) => {
  const normalized = Number(minutes);
  if (!Number.isFinite(normalized)) return '--:--';
  const total = Math.max(0, Math.floor(normalized));
  const absoluteHours = Math.floor(total / 60);
  const hours = absoluteHours === 24 && total % 60 === 0 ? 24 : absoluteHours % 24;
  const mins = total % 60;
  if (use24HourFormat) return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const normalizedHour = hours % 24;
  const amPm = normalizedHour >= 12 ? 'PM' : 'AM';
  const hour12 = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  return `${hour12}:${String(mins).padStart(2, '0')} ${amPm}`;
};

const isLearningGroupCalendarEntry = (entry) => Boolean(
  entry?.isLearningGroupEvent && String(entry?.groupId || '').trim()
);

const getLearningGroupCalendarParticipants = (entry, studentNameById = {}) => {
  if (!isLearningGroupCalendarEntry(entry)) return [];
  const byId = new Map();
  const addParticipant = (value) => {
    const studentId = String(value?.studentId || value?.id || value || '').trim();
    if (!studentId) return;
    const previous = byId.get(studentId) || {};
    const studentName = String(
      value?.studentName
      || value?.name
      || studentNameById[studentId]
      || previous.studentName
      || 'Ученик'
    ).trim();
    byId.set(studentId, {
      ...previous,
      ...(value && typeof value === 'object' ? value : {}),
      studentId,
      studentName,
    });
  };
  (Array.isArray(entry?.participantIds) ? entry.participantIds : []).forEach(addParticipant);
  (Array.isArray(entry?.participants) ? entry.participants : []).forEach(addParticipant);
  (Array.isArray(entry?.memberPaymentStatuses) ? entry.memberPaymentStatuses : []).forEach(addParticipant);
  return Array.from(byId.values());
};

const isTrialEntry = (entry) => (
  !String(entry?.studentId || '').trim() && !isLearningGroupCalendarEntry(entry)
);
const isExternalCalendarEntry = (entry) => Boolean(
  entry?.isExternalCalendarEvent || String(entry?.source || '').trim() === 'google-ical'
);
const resolveStudentLessonSubjectFallback = (studentName) => {
  const normalized = String(studentName || '').trim();
  return normalized || 'Занятие';
};

const formatCalendarSyncTimestamp = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeFinanceAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100) / 100;
};

const getFinanceMonthFromDayKey = (dayKey) => {
  const normalized = String(dayKey || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized.slice(0, 7)
    : new Date().toISOString().slice(0, 7);
};

const normalizeLessonPanelUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
};

const parseLessonInfoDateMs = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return NaN;
  const russianMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (russianMatch) {
    const [, dayRaw, monthRaw, yearRaw, hourRaw = '0', minuteRaw = '0'] = russianMatch;
    const date = new Date(
      Number(yearRaw),
      Number(monthRaw) - 1,
      Number(dayRaw),
      Number(hourRaw),
      Number(minuteRaw)
    );
    return Number.isNaN(date.getTime()) ? NaN : date.getTime();
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const getLessonInfoFileTimestamp = (file) => {
  const fields = ['createdAt', 'updatedAt', 'savedAt', 'timestamp', 'dateIso', 'date'];
  for (const field of fields) {
    const timestamp = parseLessonInfoDateMs(file?.[field]);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return NaN;
};

const selectRecentLessonNoteFiles = (files) => (
  (Array.isArray(files) ? files : [])
    .map((file, index) => ({ file, index, timestamp: getLessonInfoFileTimestamp(file) }))
    .filter(({ file }) => {
      if (!file || typeof file !== 'object') return false;
      if (file.isLessonShared || file.sharedScope) return false;
      return String(file.category || '').trim() === LESSON_PANEL_NOTES_CATEGORY;
    })
    .sort((left, right) => {
      const leftHasTime = Number.isFinite(left.timestamp);
      const rightHasTime = Number.isFinite(right.timestamp);
      if (leftHasTime && rightHasTime && right.timestamp !== left.timestamp) {
        return right.timestamp - left.timestamp;
      }
      if (leftHasTime && !rightHasTime) return -1;
      if (!leftHasTime && rightHasTime) return 1;
      return left.index - right.index;
    })
    .slice(0, 3)
    .map(({ file }) => file)
);

const formatLessonInfoFileDate = (file) => {
  const direct = String(file?.date || '').trim();
  if (direct) return direct;
  const timestamp = getLessonInfoFileTimestamp(file);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getLessonInfoFileHref = (file) => {
  const raw = String(file?.url || '').trim();
  if (!raw) return '';
  return String(resolveAuthenticatedUploadsUrl(raw) || '');
};

const getLessonInfoFileMeta = (file) => {
  const rawTaskNumber = String(file?.taskNumber ?? '').trim();
  const taskNumber = Number(rawTaskNumber);
  const taskLabel = rawTaskNumber && Number.isFinite(taskNumber)
    ? `Задание ${rawTaskNumber}`
    : '';
  const folderLabel = String(file?.folderPath || file?.folderName || '').trim();
  const dateLabel = formatLessonInfoFileDate(file);
  return [taskLabel, folderLabel, dateLabel].filter(Boolean).join(' • ');
};

const normalizeLessonPanelGoalType = (goal) => {
  const type = String(goal?.type || '').trim().toLowerCase();
  if (type === 'mock' || (!type && String(goal?.mockExamId || '').trim())) return 'mock';
  return 'task';
};

const formatLessonPanelTaskNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number === 19 ? '19-21' : String(number);
};

const formatLessonPanelGoalTargets = (goal) => {
  if (goal?.includeAll) return 'все вопросы';
  const targets = Array.from(new Set(
    (Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.trunc(value))
  )).sort((left, right) => left - right);
  if (targets.length === 0) return '';
  return `вопросы ${targets.join(', ')}`;
};

const formatLessonPanelGoalLabel = (goal) => {
  if (!goal || typeof goal !== 'object') return '';
  if (normalizeLessonPanelGoalType(goal) === 'mock') {
    const title = String(goal.mockTitle || goal.title || '').trim();
    return title ? `Пробник: ${title}` : 'Пробник';
  }
  const taskLabel = formatLessonPanelTaskNumber(goal.taskNumber);
  if (!taskLabel) return '';
  const levelKey = String(goal.levelId || '').trim().toLowerCase();
  const levelLabel = LESSON_PANEL_LEVEL_LABELS[levelKey] || levelKey;
  const targetLabel = formatLessonPanelGoalTargets(goal);
  return [
    `Задание ${taskLabel}`,
    levelLabel,
    targetLabel,
  ].filter(Boolean).join(' • ');
};

const getLessonPanelHomeworkGoalLabels = (homework) => {
  const goals = Array.isArray(homework?.goals) ? homework.goals : [];
  return goals
    .map((goal) => formatLessonPanelGoalLabel(goal))
    .filter(Boolean);
};

const buildLessonPanelMarkKey = (teacherId, lessonInfo, action) => {
  const event = lessonInfo?.event || {};
  const base = [
    String(teacherId || '').trim(),
    String(event.id || event.externalEventId || '').trim(),
    String(lessonInfo?.dayKey || event.date || '').trim(),
    String(event.studentId || '').trim(),
    String(event.time || event.startMinutes || '').trim(),
  ].join(':');
  return `${base}:${String(action || '').trim()}`;
};

const isCalendarLessonFinished = (dayKey, endMinutes, now = new Date()) => {
  const normalizedDayKey = normalizeScheduleDateKey(dayKey);
  const safeNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const todayKey = toDayKey(safeNow);
  const normalizedEndMinutes = Number(endMinutes);
  if (!normalizedDayKey || !Number.isFinite(normalizedEndMinutes)) return false;
  if (normalizedDayKey < todayKey) return true;
  if (normalizedDayKey > todayKey) return false;
  const currentMinuteOfDay = (safeNow.getHours() * 60) + safeNow.getMinutes();
  return normalizedEndMinutes <= currentMinuteOfDay;
};

const isCalendarLessonUpcoming = (dayKey, startMinutes, now = new Date()) => {
  const normalizedDayKey = normalizeScheduleDateKey(dayKey);
  const safeNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const todayKey = toDayKey(safeNow);
  const normalizedStartMinutes = Number(startMinutes);
  if (!normalizedDayKey || !Number.isFinite(normalizedStartMinutes)) return false;
  if (normalizedDayKey > todayKey) return true;
  if (normalizedDayKey < todayKey) return false;
  const currentMinuteOfDay = (safeNow.getHours() * 60) + safeNow.getMinutes();
  return normalizedStartMinutes > currentMinuteOfDay;
};

const getCalendarLessonPaymentState = (teacherId, lessonInfo, marks, now = new Date()) => {
  const paidMarkKey = buildLessonPanelMarkKey(teacherId, lessonInfo, 'paid');
  const trialMarkKey = buildLessonPanelMarkKey(teacherId, lessonInfo, 'trial');
  const paidMarked = Boolean(paidMarkKey && marks?.[paidMarkKey]);
  const event = lessonInfo?.event || {};
  const trialMarked = isTrialEntry(event) || Boolean(trialMarkKey && marks?.[trialMarkKey]);
  const finished = isCalendarLessonFinished(lessonInfo?.dayKey || event.date, event.endMinutes, now);
  return {
    paidMarkKey,
    trialMarkKey,
    paidMarked,
    trialMarked,
    finished,
    shouldRemindPayment: finished && !paidMarked && !trialMarked,
  };
};

const getLearningGroupPaymentState = (
  teacherId,
  lessonInfo,
  marks,
  now = new Date(),
  studentNameById = {}
) => {
  const event = lessonInfo?.event || {};
  const members = getLearningGroupCalendarParticipants(event, studentNameById).map((member) => {
    const memberEvent = { ...event, studentId: member.studentId };
    const memberLessonInfo = { ...lessonInfo, event: memberEvent };
    const paidMarkKey = String(member?.paidMarkKey || '').trim()
      || buildLessonPanelMarkKey(teacherId, memberLessonInfo, 'paid');
    const trialMarkKey = String(member?.trialMarkKey || '').trim()
      || buildLessonPanelMarkKey(teacherId, memberLessonInfo, 'trial');
    const paidMarked = Boolean(paidMarkKey && marks?.[paidMarkKey]);
    const trialMarked = Boolean(trialMarkKey && marks?.[trialMarkKey]);
    const finished = isCalendarLessonFinished(
      lessonInfo?.dayKey || event.date,
      event.endMinutes,
      now
    );
    const status = trialMarked ? 'trial' : (paidMarked ? 'paid' : (finished ? 'unpaid' : 'pending'));
    return {
      ...member,
      paidMarkKey,
      trialMarkKey,
      paidMarked,
      trialMarked,
      finished,
      status,
      shouldRemindPayment: finished && !paidMarked && !trialMarked,
    };
  });
  const paidCount = members.filter((member) => member.status === 'paid').length;
  const trialCount = members.filter((member) => member.status === 'trial').length;
  const unpaidCount = members.filter((member) => member.status === 'unpaid').length;
  const settledCount = paidCount + trialCount;
  return {
    members,
    paidCount,
    trialCount,
    unpaidCount,
    settledCount,
    totalCount: members.length,
    allSettled: members.length > 0 && settledCount === members.length,
    partiallySettled: settledCount > 0 && settledCount < members.length,
  };
};

const normalizeLessonPanelMarks = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  Object.entries(source).forEach(([key, markValue]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const normalizedValue = typeof markValue === 'string' && markValue.trim()
      ? markValue.trim()
      : new Date().toISOString();
    normalized[normalizedKey] = normalizedValue;
  });
  return normalized;
};

const readLessonPanelMarks = (teacherId) => {
  if (typeof window === 'undefined') return {};
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return {};
  try {
    const raw = window.localStorage.getItem(`${LESSON_PANEL_MARKS_STORAGE_KEY}:${normalizedTeacherId}`);
    const data = JSON.parse(raw || '{}');
    return normalizeLessonPanelMarks(data);
  } catch {
    return {};
  }
};

const writeLessonPanelMarks = (teacherId, data) => {
  if (typeof window === 'undefined') return;
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return;
  try {
    window.localStorage.setItem(
      `${LESSON_PANEL_MARKS_STORAGE_KEY}:${normalizedTeacherId}`,
      JSON.stringify(normalizeLessonPanelMarks(data))
    );
  } catch {}
};

const hasMigratedLessonPanelMarks = (teacherId) => {
  if (typeof window === 'undefined') return true;
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return true;
  try {
    return window.localStorage.getItem(`${LESSON_PANEL_MARKS_STORAGE_KEY}:migrated:${normalizedTeacherId}`) === '1';
  } catch {
    return true;
  }
};

const markLessonPanelMarksMigrated = (teacherId) => {
  if (typeof window === 'undefined') return;
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return;
  try {
    window.localStorage.setItem(`${LESSON_PANEL_MARKS_STORAGE_KEY}:migrated:${normalizedTeacherId}`, '1');
  } catch {}
};

const buildTeacherFinanceLessonPayload = (record = {}, profile = {}, overrides = {}) => ({
  month: overrides.month,
  pricingMode: String(record.pricingMode || profile.pricingMode || 'perLesson') === 'monthly' ? 'monthly' : 'perLesson',
  lessonPrice: normalizeFinanceAmount(record.lessonPrice ?? profile.lessonPrice),
  monthlyRate: normalizeFinanceAmount(record.monthlyRate ?? profile.monthlyRate),
  plannedLessons: normalizeFinanceAmount(record.plannedLessons ?? profile.plannedLessons),
  completedLessons: normalizeFinanceAmount(overrides.completedLessons ?? record.completedLessons),
  cancelledLessons: normalizeFinanceAmount(record.cancelledLessons),
  paidAmount: normalizeFinanceAmount(overrides.paidAmount ?? record.paidAmount),
  extraCharge: normalizeFinanceAmount(record.extraCharge),
  discount: normalizeFinanceAmount(record.discount),
  expenses: normalizeFinanceAmount(record.expenses),
  commissionAmount: normalizeFinanceAmount(record.commissionAmount ?? profile.commissionAmount),
  paymentDay: record.paymentDay ?? profile.paymentDay ?? null,
  note: typeof record.note === 'string' ? record.note : '',
});

const buildScheduleSlotAlarmKey = (entry) => {
  const explicitId = String(entry?.id || '').trim();
  if (explicitId) return explicitId;
  const studentId = String(entry?.studentId || '').trim() || 'trial';
  const dateKey = String(entry?.date || '').trim() || String(entry?.weekdayKey || '').trim() || String(entry?.day || '').trim();
  const time = String(entry?.time || '').trim();
  return `${studentId}:${dateKey}:${time}`;
};

const getScheduleOccurrenceCandidatesMsForAlarm = (entry, nowMs = Date.now()) => {
  const timeMinutes = parseScheduleTimeToMinutes(entry?.time);
  if (!Number.isFinite(timeMinutes)) return [];
  const hours = Math.floor(timeMinutes / 60);
  const minutes = timeMinutes % 60;
  const excludedSet = new Set(normalizeExcludedDayKeys(entry?.excludedDates));
  const dateRaw = String(entry?.date || '').trim();
  if (dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    if (excludedSet.has(dateRaw)) return [];
    const exactMs = Date.parse(`${dateRaw}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
    return Number.isFinite(exactMs) ? [exactMs] : [];
  }

  const weekdayMeta = resolveScheduleWeekdayMeta(entry);
  if (!weekdayMeta?.order) return [];
  const now = Number.isFinite(nowMs) ? new Date(nowMs) : new Date();
  const todayOrder = now.getDay() === 0 ? 7 : now.getDay();
  const baseDiffDays = weekdayMeta.order - todayOrder;
  const list = [];
  for (let weekShift = -1; weekShift <= 1; weekShift += 1) {
    const candidate = new Date(now);
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + baseDiffDays + (weekShift * 7));
    const candidateDayKey = toDayKey(candidate);
    if (candidateDayKey && excludedSet.has(candidateDayKey)) continue;
    candidate.setHours(hours, minutes, 0, 0);
    const candidateMs = candidate.getTime();
    if (Number.isFinite(candidateMs)) list.push(candidateMs);
  }
  return list;
};

const findDueBrowserAlarmOccurrence = (entry, nowMs = Date.now()) => {
  const slotId = buildScheduleSlotAlarmKey(entry);
  if (!slotId) return null;
  const candidates = getScheduleOccurrenceCandidatesMsForAlarm(entry, nowMs);
  if (candidates.length === 0) return null;
  let best = null;
  candidates.forEach((startMs) => {
    if (!Number.isFinite(startMs)) return;
    const reminderAtMs = startMs - BROWSER_ALARM_LEAD_MS;
    const delta = nowMs - reminderAtMs;
    if (delta < 0 || delta > BROWSER_ALARM_TRIGGER_WINDOW_MS) return;
    if (nowMs >= startMs) return;
    if (!best || delta < best.delta) {
      best = { startMs, reminderAtMs, delta };
    }
  });
  if (!best) return null;
  return {
    slotId,
    startMs: best.startMs,
    reminderAtMs: best.reminderAtMs,
    occurrenceKey: new Date(best.startMs).toISOString(),
  };
};

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

const normalizeExcludedDayKeys = (value) => {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  value.forEach((item) => {
    const dayKey = String(item || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) unique.add(dayKey);
  });
  return Array.from(unique).sort((left, right) => left.localeCompare(right, 'ru'));
};

const normalizeScheduleEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const weekdayMeta = resolveScheduleWeekdayMeta(entry);
  const durationRaw = Number(entry?.durationMinutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : DEFAULT_EVENT_DURATION_MINUTES;
  const dateRaw = String(entry?.date || '').trim();
  const excludedDates = dateRaw ? [] : normalizeExcludedDayKeys(entry?.excludedDates);
  return {
    ...entry,
    date: dateRaw || '',
    weekdayKey: weekdayMeta?.key || '',
    day: weekdayMeta?.label || String(entry?.day || '').trim(),
    weekdayOrder: Number.isFinite(Number(entry?.weekdayOrder))
      ? Number(entry.weekdayOrder)
      : (weekdayMeta?.order || 99),
    time: String(entry?.time || '').trim(),
    studentId: String(entry?.studentId || '').trim(),
    studentName: String(entry?.studentName || '').trim(),
    durationMinutes,
    excludedDates,
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

const buildCalendarWeekEventsByDayIndex = ({
  entries = [],
  weekDays = [],
  dayStartMinutes = 0,
  dayEndMinutes = 24 * 60,
} = {}) => {
  const buckets = Array.from({ length: 7 }, () => []);
  const dayKeyToIndex = new Map(
    weekDays.map((date, index) => [toDayKey(date), index])
  );

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const startMinutesRaw = parseScheduleTimeToMinutes(entry?.time);
    if (!Number.isFinite(startMinutesRaw)) return;

    const explicitDateKey = normalizeScheduleDateKey(entry?.date);
    let dayIndex = null;
    if (explicitDateKey) {
      dayIndex = dayKeyToIndex.get(explicitDateKey);
      if (!Number.isFinite(dayIndex)) return;
    } else {
      const weekdayOrder = Number(entry?.weekdayOrder) || resolveScheduleWeekdayMeta(entry)?.order;
      if (Number.isFinite(weekdayOrder) && weekdayOrder >= 1 && weekdayOrder <= 7) {
        dayIndex = weekdayOrder - 1;
      }
    }
    if (!Number.isFinite(dayIndex) || dayIndex < 0 || dayIndex > 6) return;

    const dayKey = toDayKey(weekDays[dayIndex]);
    const excludedDates = new Set(normalizeExcludedDayKeys(entry?.excludedDates));
    if (!explicitDateKey && excludedDates.has(dayKey)) return;

    const clampedStart = Math.max(dayStartMinutes, Math.min(dayEndMinutes - 15, startMinutesRaw));
    const durationMinutes = Number.isFinite(Number(entry?.durationMinutes))
      ? Math.max(15, Number(entry.durationMinutes))
      : DEFAULT_EVENT_DURATION_MINUTES;
    const clampedEnd = Math.max(
      clampedStart + 20,
      Math.min(dayEndMinutes, startMinutesRaw + durationMinutes)
    );
    buckets[dayIndex].push({
      ...entry,
      startMinutes: clampedStart,
      endMinutes: clampedEnd,
      dayKey,
      dayIndex,
    });
  });

  return buckets.map((list) => assignOverlapLanes(list));
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
  activeStudentId = '',
  onSelectStudent = null,
  onOpenStudentWorkspace = null,
  onOpenLearningGroupLesson = null,
  onOpenLearningGroupTelemost = null,
}) => {
  const useNativeAndroidPush = isNativeAndroidPushEnvironment();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [calendarSyncSettings, setCalendarSyncSettings] = useState(null);
  const [calendarSyncUrl, setCalendarSyncUrl] = useState('');
  const [calendarSyncLoading, setCalendarSyncLoading] = useState(false);
  const [calendarSyncSaving, setCalendarSyncSaving] = useState(false);
  const [calendarSyncRefreshing, setCalendarSyncRefreshing] = useState(false);
  const [calendarSyncError, setCalendarSyncError] = useState('');
  const [calendarSyncSuccess, setCalendarSyncSuccess] = useState('');
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
  const [teacherTestPushSending, setTeacherTestPushSending] = useState(false);
  const [teacherTestPushError, setTeacherTestPushError] = useState('');
  const [teacherTestPushSuccess, setTeacherTestPushSuccess] = useState('');
  const [browserAlarmEnabled, setBrowserAlarmEnabled] = useState(false);
  const [browserAlarmCustomMelodyUrl, setBrowserAlarmCustomMelodyUrl] = useState('');
  const [browserAlarmUploadedMelodyUrl, setBrowserAlarmUploadedMelodyUrl] = useState('');
  const [browserAlarmUploadedMelodyName, setBrowserAlarmUploadedMelodyName] = useState('');
  const [browserAlarmRinging, setBrowserAlarmRinging] = useState(null);
  const [browserAlarmTesting, setBrowserAlarmTesting] = useState(false);
  const [browserAlarmError, setBrowserAlarmError] = useState('');
  const [browserAlarmSuccess, setBrowserAlarmSuccess] = useState('');
  const [timelineViewportHeight, setTimelineViewportHeight] = useState(0);
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
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false);
  const [availabilityShareMode, setAvailabilityShareMode] = useState(false);
  const [availabilityShareOffsetWeeks, setAvailabilityShareOffsetWeeks] = useState(4);
  const [availabilityShareImage, setAvailabilityShareImage] = useState(null);
  const [availabilityShareBusy, setAvailabilityShareBusy] = useState(false);
  const [availabilityShareError, setAvailabilityShareError] = useState('');
  const [availabilityShareSuccess, setAvailabilityShareSuccess] = useState('');
  const [paymentReminderOpen, setPaymentReminderOpen] = useState(false);
  const [quickCreateFindingSlot, setQuickCreateFindingSlot] = useState(false);
  const [eventQuickActionBusy, setEventQuickActionBusy] = useState(false);
  const [eventQuickActionError, setEventQuickActionError] = useState('');
  const [dragDropBusy, setDragDropBusy] = useState(false);
  const [dragDropError, setDragDropError] = useState('');
  const [draggingEvent, setDraggingEvent] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [dragRecurringChoiceModal, setDragRecurringChoiceModal] = useState(null);
  const [currentTimeLineNow, setCurrentTimeLineNow] = useState(() => new Date());
  const [lessonPanelMarks, setLessonPanelMarks] = useState({});
  const [lessonPanelFinanceBusy, setLessonPanelFinanceBusy] = useState('');
  const [lessonPanelError, setLessonPanelError] = useState('');
  const [lessonPanelSuccess, setLessonPanelSuccess] = useState('');
  const [lessonPanelHomework, setLessonPanelHomework] = useState(null);
  const [lessonPanelHomeworkLoading, setLessonPanelHomeworkLoading] = useState(false);
  const [eventDetailsHomework, setEventDetailsHomework] = useState(null);
  const [eventDetailsHomeworkLoading, setEventDetailsHomeworkLoading] = useState(false);
  const [lessonInfoModalOpen, setLessonInfoModalOpen] = useState(false);
  const [lessonInfoTarget, setLessonInfoTarget] = useState(null);
  const [lessonInfoHomework, setLessonInfoHomework] = useState(null);
  const [lessonInfoHomeworkLoading, setLessonInfoHomeworkLoading] = useState(false);
  const [lessonInfoFiles, setLessonInfoFiles] = useState([]);
  const [lessonInfoLoading, setLessonInfoLoading] = useState(false);
  const [lessonInfoError, setLessonInfoError] = useState('');
  const browserAlarmFileInputRef = useRef(null);
  const browserAlarmAudioRef = useRef(null);
  const browserAlarmFiredRef = useRef(new Map());
  const browserAlarmObjectUrlRef = useRef('');
  const quickCreateClickSuppressedUntilRef = useRef(0);
  const timelineViewportRef = useRef(null);
  const calendarGridRef = useRef(null);
  const timelineDefaultScrollAppliedRef = useRef(false);
  const calendarSyncAutoRefreshBusyRef = useRef(false);
  const availabilityShareReturnFocusDateRef = useRef(null);
  const availabilityShareReturnShowWeekendsRef = useRef(null);
  const availabilityShareImageUrlRef = useRef('');

  const weekStartDate = useMemo(() => getWeekStart(focusDate), [focusDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)),
    [weekStartDate]
  );

  const dayStartMinutes = CALENDAR_START_HOUR * 60;
  const dayEndMinutes = CALENDAR_END_HOUR * 60;
  const hoursCount = CALENDAR_END_HOUR - CALENDAR_START_HOUR;
  const hourHeight = useMemo(() => {
    const safeViewportHeight = Number(timelineViewportHeight) > 0
      ? Number(timelineViewportHeight)
      : (typeof window !== 'undefined' ? (window.innerHeight - CALENDAR_VIEWPORT_RESERVED_PX) : 520);
    const available = Math.max(120, safeViewportHeight);
    const raw = Math.floor(available / Math.max(1, hoursCount));
    const minHourHeight = compactMode ? MIN_CALENDAR_HOUR_HEIGHT : 48;
    const maxHourHeight = compactMode ? 38 : MAX_CALENDAR_HOUR_HEIGHT;
    return Math.max(minHourHeight, Math.min(maxHourHeight, raw));
  }, [compactMode, hoursCount, timelineViewportHeight]);
  const calendarHeight = hoursCount * hourHeight;
  const timezoneLabel = getTimezoneLabel();
  const todayKey = toDayKey(currentTimeLineNow);
  const currentTimeLineMinutes = (currentTimeLineNow.getHours() * 60) + currentTimeLineNow.getMinutes();
  const currentTimeLineTop = currentTimeLineMinutes >= dayStartMinutes && currentTimeLineMinutes <= dayEndMinutes
    ? ((currentTimeLineMinutes - dayStartMinutes) / 60) * hourHeight
    : null;

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
    if (typeof window === 'undefined') return undefined;
    const tick = () => setCurrentTimeLineNow(new Date());
    tick();
    const timerId = window.setInterval(tick, CURRENT_TIME_LINE_TICK_MS);
    return () => window.clearInterval(timerId);
  }, []);

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

  const browserAlarmMelodyUrl = useMemo(() => {
    const uploaded = String(browserAlarmUploadedMelodyUrl || '').trim();
    if (uploaded) return uploaded;
    const custom = String(browserAlarmCustomMelodyUrl || '').trim();
    return custom || BROWSER_ALARM_DEFAULT_MELODY_URL;
  }, [browserAlarmCustomMelodyUrl, browserAlarmUploadedMelodyUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(CALENDAR_BROWSER_ALARM_PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (typeof parsed.enabled === 'boolean') setBrowserAlarmEnabled(parsed.enabled);
      if (typeof parsed.customMelodyUrl === 'string') setBrowserAlarmCustomMelodyUrl(parsed.customMelodyUrl);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      enabled: browserAlarmEnabled,
      customMelodyUrl: String(browserAlarmCustomMelodyUrl || '').trim(),
    };
    try {
      window.localStorage.setItem(CALENDAR_BROWSER_ALARM_PREFS_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }, [browserAlarmCustomMelodyUrl, browserAlarmEnabled]);

  useEffect(() => () => {
    const audio = browserAlarmAudioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch {}
      browserAlarmAudioRef.current = null;
    }
    const objectUrl = browserAlarmObjectUrlRef.current;
    if (objectUrl && typeof window !== 'undefined' && window.URL?.revokeObjectURL) {
      try {
        window.URL.revokeObjectURL(objectUrl);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const element = timelineViewportRef.current;
    if (!element) return undefined;

    let rafId = 0;
    const measure = () => {
      const nextHeight = Math.max(0, Math.floor(element.clientHeight || 0));
      setTimelineViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };
    const scheduleMeasure = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(measure);
    };

    measure();

    let observer = null;
    if (typeof window.ResizeObserver === 'function') {
      observer = new window.ResizeObserver(scheduleMeasure);
      observer.observe(element);
    }
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('orientationchange', scheduleMeasure);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('orientationchange', scheduleMeasure);
      if (observer) observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (timelineDefaultScrollAppliedRef.current || loading) return undefined;
    if (typeof window === 'undefined') return undefined;
    const element = timelineViewportRef.current;
    if (!element) return undefined;

    let firstRafId = 0;
    let secondRafId = 0;

    firstRafId = window.requestAnimationFrame(() => {
      secondRafId = window.requestAnimationFrame(() => {
        const maxScrollTop = Math.max(0, Math.floor((element.scrollHeight || 0) - (element.clientHeight || 0)));
        if (maxScrollTop <= 0) return;
        const gridElement = calendarGridRef.current;
        const gridOffsetTop = gridElement
          ? Math.max(
              0,
              Math.floor(
                gridElement.getBoundingClientRect().top
                - element.getBoundingClientRect().top
                + element.scrollTop
              )
            )
          : 0;
        const defaultHourOffset = Math.max(
          0,
          (
            CALENDAR_DEFAULT_SCROLL_HOUR
            - CALENDAR_START_HOUR
            - (CALENDAR_DEFAULT_SCROLL_LEAD_MINUTES / 60)
          ) * hourHeight
        );
        element.scrollTop = Math.min(maxScrollTop, gridOffsetTop + defaultHourOffset);
        timelineDefaultScrollAppliedRef.current = true;
      });
    });

    return () => {
      if (firstRafId) window.cancelAnimationFrame(firstRafId);
      if (secondRafId) window.cancelAnimationFrame(secondRafId);
    };
  }, [calendarHeight, hourHeight, loading, timelineViewportHeight]);

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

  const loadLessonPanelMarks = useCallback(async ({ silent = false } = {}) => {
    if (!teacherId) {
      setLessonPanelMarks({});
      return {};
    }

    const localMarks = readLessonPanelMarks(teacherId);
    const shouldMigrateLocalMarks = !hasMigratedLessonPanelMarks(teacherId)
      && Object.keys(localMarks).length > 0;

    if (!silent && shouldMigrateLocalMarks) {
      setLessonPanelMarks(localMarks);
    }

    try {
      const response = await api.getTeacherCalendarMarks(teacherId);
      const serverMarks = normalizeLessonPanelMarks(response?.marks);
      const nextMarks = shouldMigrateLocalMarks
        ? normalizeLessonPanelMarks({ ...serverMarks, ...localMarks })
        : serverMarks;

      if (shouldMigrateLocalMarks) {
        const saved = await api.updateTeacherCalendarMarks({ marks: nextMarks }, teacherId);
        const savedMarks = normalizeLessonPanelMarks(saved?.marks);
        setLessonPanelMarks(savedMarks);
        writeLessonPanelMarks(teacherId, savedMarks);
        markLessonPanelMarksMigrated(teacherId);
        return savedMarks;
      }

      setLessonPanelMarks(nextMarks);
      writeLessonPanelMarks(teacherId, nextMarks);
      markLessonPanelMarksMigrated(teacherId);
      return nextMarks;
    } catch {
      setLessonPanelMarks(localMarks);
      return localMarks;
    }
  }, [teacherId]);

  useEffect(() => {
    loadTeacherCalendar();
  }, [loadTeacherCalendar]);

  useEffect(() => {
    loadLessonPanelMarks();
  }, [loadLessonPanelMarks]);

  const loadCalendarSyncSettings = useCallback(async ({ silent = false } = {}) => {
    if (!teacherId) {
      setCalendarSyncSettings(null);
      setCalendarSyncLoading(false);
      setCalendarSyncError('');
      setCalendarSyncUrl('');
      return;
    }
    if (!silent) setCalendarSyncLoading(true);
    try {
      const data = await api.getTeacherCalendarSync(teacherId);
      setCalendarSyncSettings(data || null);
      setCalendarSyncError('');
    } catch (err) {
      setCalendarSyncSettings(null);
      setCalendarSyncError(err?.message || 'Не удалось загрузить настройки Google Calendar.');
    } finally {
      setCalendarSyncLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    loadCalendarSyncSettings();
  }, [loadCalendarSyncSettings]);

  const handleSaveCalendarSync = useCallback(async (event) => {
    event.preventDefault();
    if (!teacherId || calendarSyncSaving) return;
    const nextUrl = String(calendarSyncUrl || '').trim();
    if (!nextUrl) {
      setCalendarSyncError('Вставьте iCal-ссылку.');
      setCalendarSyncSuccess('');
      return;
    }
    setCalendarSyncSaving(true);
    setCalendarSyncError('');
    setCalendarSyncSuccess('');
    try {
      const settings = await api.updateTeacherCalendarSync({ icalUrl: nextUrl, enabled: true }, teacherId);
      setCalendarSyncSettings(settings || null);
      setCalendarSyncUrl('');
      try {
        await api.refreshTeacherCalendarSync(teacherId);
        setCalendarSyncSuccess('Google Calendar подключен.');
      } catch (refreshError) {
        setCalendarSyncError(refreshError?.message || 'Ссылка сохранена, но календарь пока не загрузился.');
      }
      await loadTeacherCalendar({ silent: true });
      await loadCalendarSyncSettings({ silent: true });
    } catch (err) {
      setCalendarSyncError(err?.message || 'Не удалось подключить Google Calendar.');
    } finally {
      setCalendarSyncSaving(false);
    }
  }, [calendarSyncSaving, calendarSyncUrl, loadCalendarSyncSettings, loadTeacherCalendar, teacherId]);

  const handleRefreshCalendarSync = useCallback(async () => {
    if (!teacherId || calendarSyncRefreshing || !calendarSyncSettings?.configured) return;
    setCalendarSyncRefreshing(true);
    setCalendarSyncError('');
    setCalendarSyncSuccess('');
    try {
      const result = await api.refreshTeacherCalendarSync(teacherId);
      setCalendarSyncSettings(result?.settings || null);
      setCalendarSyncSuccess(`Импортировано: ${Number(result?.importedCount) || 0}`);
      await loadTeacherCalendar({ silent: true });
      await loadCalendarSyncSettings({ silent: true });
    } catch (err) {
      setCalendarSyncError(err?.message || 'Не удалось обновить Google Calendar.');
      await loadCalendarSyncSettings({ silent: true });
    } finally {
      setCalendarSyncRefreshing(false);
    }
  }, [
    calendarSyncRefreshing,
    calendarSyncSettings?.configured,
    loadCalendarSyncSettings,
    loadTeacherCalendar,
    teacherId,
  ]);

  useEffect(() => {
    if (!teacherId || !calendarSyncSettings?.configured || typeof window === 'undefined') {
      return undefined;
    }

    let cancelled = false;
    const syncInBackground = async () => {
      if (cancelled || calendarSyncAutoRefreshBusyRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      calendarSyncAutoRefreshBusyRef.current = true;
      try {
        const result = await api.refreshTeacherCalendarSync(teacherId);
        if (cancelled) return;
        if (result?.settings) setCalendarSyncSettings(result.settings);
        setCalendarSyncError('');
        await loadTeacherCalendar({ silent: true });
        await loadCalendarSyncSettings({ silent: true });
      } catch {
        if (!cancelled) {
          await loadCalendarSyncSettings({ silent: true });
        }
      } finally {
        calendarSyncAutoRefreshBusyRef.current = false;
      }
    };

    syncInBackground();
    const timerId = window.setInterval(syncInBackground, GOOGLE_CALENDAR_AUTO_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        syncInBackground();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [
    calendarSyncSettings?.configured,
    loadCalendarSyncSettings,
    loadTeacherCalendar,
    teacherId,
  ]);

  const handleDisableCalendarSync = useCallback(async () => {
    if (!teacherId || calendarSyncSaving || !calendarSyncSettings?.configured) return;
    setCalendarSyncSaving(true);
    setCalendarSyncError('');
    setCalendarSyncSuccess('');
    try {
      const settings = await api.updateTeacherCalendarSync({ icalUrl: '', enabled: false }, teacherId);
      setCalendarSyncSettings(settings || null);
      setCalendarSyncUrl('');
      setCalendarSyncSuccess('Google Calendar отключен.');
      await loadTeacherCalendar({ silent: true });
    } catch (err) {
      setCalendarSyncError(err?.message || 'Не удалось отключить Google Calendar.');
    } finally {
      setCalendarSyncSaving(false);
    }
  }, [calendarSyncSaving, calendarSyncSettings?.configured, loadTeacherCalendar, teacherId]);

  useEffect(() => {
    if (!teacherId || typeof window === 'undefined' || typeof window.EventSource !== 'function') {
      return undefined;
    }
    const source = new window.EventSource(resolveApiUrl('/api/schedule-sync/stream'), { withCredentials: true });
    const handleScheduleSync = (event) => {
      let payload = null;
      try {
        payload = JSON.parse(event?.data || '{}');
      } catch {
        return;
      }
      const payloadTeacherId = String(payload?.teacherId || '').trim();
      if (payloadTeacherId && payloadTeacherId !== String(teacherId || '').trim()) return;
      const action = String(payload?.action || '');
      if (action.includes('calendar-marks')) {
        loadLessonPanelMarks({ silent: true });
        return;
      }
      loadTeacherCalendar({ silent: true });
      if (action.includes('calendar-sync')) {
        loadCalendarSyncSettings({ silent: true });
      }
    };
    source.addEventListener('schedule-sync', handleScheduleSync);
    return () => {
      source.removeEventListener('schedule-sync', handleScheduleSync);
      source.close();
    };
  }, [loadCalendarSyncSettings, loadLessonPanelMarks, loadTeacherCalendar, teacherId]);

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
    setTeacherTestPushError('');
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

  const stopBrowserAlarmAudio = useCallback(() => {
    const audio = browserAlarmAudioRef.current;
    if (!audio) return;
    try {
      audio.pause();
    } catch {}
    try {
      audio.currentTime = 0;
    } catch {}
    audio.onended = null;
    audio.onerror = null;
    browserAlarmAudioRef.current = null;
  }, []);

  const playBrowserAlarmAudio = useCallback(async ({ loop = false } = {}) => {
    if (typeof window === 'undefined') {
      throw new Error('Будильник доступен только в браузере.');
    }
    stopBrowserAlarmAudio();
    const source = String(browserAlarmMelodyUrl || '').trim();
    if (!source) throw new Error('Укажите мелодию для будильника.');
    const audio = new Audio(source);
    audio.preload = 'auto';
    audio.loop = Boolean(loop);
    audio.volume = 1;
    browserAlarmAudioRef.current = audio;
    audio.onended = () => {
      if (browserAlarmAudioRef.current === audio) browserAlarmAudioRef.current = null;
    };
    audio.onerror = () => {
      if (browserAlarmAudioRef.current === audio) browserAlarmAudioRef.current = null;
    };
    try {
      audio.currentTime = 0;
      const playResult = audio.play?.();
      if (playResult && typeof playResult.catch === 'function') {
        await playResult;
      }
    } catch (error) {
      if (browserAlarmAudioRef.current === audio) browserAlarmAudioRef.current = null;
      throw error;
    }
  }, [browserAlarmMelodyUrl, stopBrowserAlarmAudio]);

  const stopBrowserAlarm = useCallback(() => {
    stopBrowserAlarmAudio();
    setBrowserAlarmRinging(null);
    setBrowserAlarmError('');
  }, [stopBrowserAlarmAudio]);

  const handleBrowserAlarmTest = useCallback(async () => {
    if (browserAlarmTesting) return;
    setBrowserAlarmTesting(true);
    setBrowserAlarmError('');
    setBrowserAlarmSuccess('');
    try {
      await playBrowserAlarmAudio({ loop: false });
      setBrowserAlarmSuccess('Тест будильника воспроизведен.');
    } catch (error) {
      setBrowserAlarmError(
        error?.name === 'NotAllowedError'
          ? 'Браузер заблокировал звук. Нажмите на страницу и повторите.'
          : 'Не удалось воспроизвести мелодию. Проверьте ссылку или выберите другой файл.'
      );
    } finally {
      setBrowserAlarmTesting(false);
    }
  }, [browserAlarmTesting, playBrowserAlarmAudio]);

  const clearBrowserAlarmUploadedMelody = useCallback(() => {
    const objectUrl = browserAlarmObjectUrlRef.current;
    if (objectUrl && typeof window !== 'undefined' && window.URL?.revokeObjectURL) {
      try {
        window.URL.revokeObjectURL(objectUrl);
      } catch {}
    }
    browserAlarmObjectUrlRef.current = '';
    setBrowserAlarmUploadedMelodyUrl('');
    setBrowserAlarmUploadedMelodyName('');
  }, []);

  const handleBrowserAlarmFileSelect = useCallback((event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (typeof window === 'undefined' || !window.URL?.createObjectURL) {
      setBrowserAlarmError('Не удалось загрузить мелодию в этом браузере.');
      return;
    }
    clearBrowserAlarmUploadedMelody();
    const nextUrl = window.URL.createObjectURL(file);
    browserAlarmObjectUrlRef.current = nextUrl;
    setBrowserAlarmUploadedMelodyUrl(nextUrl);
    setBrowserAlarmUploadedMelodyName(String(file.name || '').trim() || 'Локальный файл');
    setBrowserAlarmError('');
    setBrowserAlarmSuccess('Локальная мелодия подключена.');
    if (event?.target) event.target.value = '';
  }, [clearBrowserAlarmUploadedMelody]);

  const handleSendTeacherTestPush = async () => {
    if (!teacherId || teacherReminderLoading || teacherReminderSaving || teacherTestPushSending) return;
    setTeacherTestPushSending(true);
    setTeacherTestPushError('');
    setTeacherTestPushSuccess('');
    setTeacherReminderError('');
    try {
      let effectivePushEnabled = pushEnabled;
      if (!pushEnabled && typeof onTogglePush === 'function') {
        await onTogglePush();
        const status = await api.getPushSubscriptionStatus().catch(() => null);
        effectivePushEnabled = Boolean(status?.subscribed);
      }
      if (!effectivePushEnabled) {
        setTeacherTestPushError(
          useNativeAndroidPush
            ? 'Сначала включите push через RuStore в приложении.'
            : 'Сначала включите push в браузере.'
        );
        return;
      }
      const result = await api.sendPushTestNotification();
      const sentCount = Number(result?.sent);
      const countText = Number.isFinite(sentCount) && sentCount > 1 ? ` (${sentCount})` : '';
      setTeacherTestPushSuccess(`Тест push отправлен${countText}.`);
    } catch (err) {
      setTeacherTestPushError(err?.message || 'Не удалось отправить тест push.');
    } finally {
      setTeacherTestPushSending(false);
    }
  };

  const teacherReminderStatusText = useMemo(() => {
    if (teacherReminderLoading) return 'Проверяем настройки напоминаний...';
    if (!pushSupported) {
      return useNativeAndroidPush
        ? (pushError || 'RuStore Push недоступен в этой Android-сборке.')
        : 'Push не поддерживается в этом браузере.';
    }
    if (pushPermission === 'denied') {
      return useNativeAndroidPush
        ? 'Уведомления заблокированы в настройках Android.'
        : 'Уведомления заблокированы в настройках браузера.';
    }
    if (!pushEnabled && teacherReminderEnabled) {
      return 'Напоминания включены, но push выключены. Включите push, чтобы получать уведомления.';
    }
    if (!pushEnabled) {
      return useNativeAndroidPush
        ? 'Сначала включите push через RuStore, затем включите напоминания для календаря.'
        : 'Сначала включите push, затем включите напоминания для календаря.';
    }
    if (teacherReminderEnabled) return 'Напоминания включены: учителю придет уведомление за 10 минут до урока.';
    return 'Включите напоминания, чтобы получать уведомление за 10 минут до урока.';
  }, [
    pushEnabled,
    pushError,
    pushPermission,
    pushSupported,
    teacherReminderEnabled,
    teacherReminderLoading,
    useNativeAndroidPush,
  ]);

  useEffect(() => {
    if (!browserAlarmEnabled) {
      stopBrowserAlarm();
      return undefined;
    }
    if (typeof window === 'undefined') return undefined;

    const tick = () => {
      if (browserAlarmRinging) return;
      const nowMs = Date.now();
      const firedMap = browserAlarmFiredRef.current;
      const staleThreshold = nowMs - (2 * 24 * 60 * 60 * 1000);
      Array.from(firedMap.entries()).forEach(([key, ts]) => {
        if (!Number.isFinite(ts) || ts < staleThreshold) firedMap.delete(key);
      });

      const dueItems = (Array.isArray(entries) ? entries : [])
        .map((entry) => ({ entry, reminder: findDueBrowserAlarmOccurrence(entry, nowMs) }))
        .filter((item) => item.reminder && item.reminder.slotId);
      if (dueItems.length === 0) return;

      dueItems.sort((left, right) => left.reminder.startMs - right.reminder.startMs);
      const nextDue = dueItems.find((item) => {
        const key = `${item.reminder.slotId}::${item.reminder.occurrenceKey}`;
        return !firedMap.has(key);
      });
      if (!nextDue) return;

      const alarmKey = `${nextDue.reminder.slotId}::${nextDue.reminder.occurrenceKey}`;
      firedMap.set(alarmKey, nowMs);

      const entry = nextDue.entry;
      const hasStudent = Boolean(String(entry?.studentId || '').trim());
      const isGroupEvent = isLearningGroupCalendarEntry(entry);
      const studentName = studentNameById[String(entry?.studentId || '').trim()] || entry?.studentName || 'Ученик';
      const subject = String(entry?.subject || '').trim();
      const primaryLabel = isGroupEvent
        ? String(entry?.groupName || subject || 'Мини-группа').trim()
        : (hasStudent
          ? studentName
          : (subject || studentName || DEFAULT_ONE_TIME_LESSON_SUBJECT));
      const startsAtDate = new Date(nextDue.reminder.startMs);
      const startMinutes = (startsAtDate.getHours() * 60) + startsAtDate.getMinutes();
      const startLabel = formatMinutesAsDisplayTime(startMinutes, use24HourFormat);
      const dateLabel = capitalize(startsAtDate.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
      }).replace(' г.', ''));

      setBrowserAlarmRinging({
        title: primaryLabel,
        dateLabel,
        timeLabel: startLabel,
      });
      setBrowserAlarmError('');
      setBrowserAlarmSuccess('');
      playBrowserAlarmAudio({ loop: true }).catch((error) => {
        setBrowserAlarmError(
          error?.name === 'NotAllowedError'
            ? 'Браузер заблокировал звук будильника. Нажмите на страницу и проверьте "Тест будильник".'
            : 'Не удалось воспроизвести мелодию будильника. Проверьте ссылку или файл.'
        );
      });
    };

    tick();
    const timerId = window.setInterval(tick, BROWSER_ALARM_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, [
    browserAlarmEnabled,
    browserAlarmRinging,
    entries,
    playBrowserAlarmAudio,
    stopBrowserAlarm,
    studentNameById,
    use24HourFormat,
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
      const groupName = String(entry?.groupName || '').trim();
      const participantNames = getLearningGroupCalendarParticipants(entry, studentNameById)
        .map((member) => member.studentName)
        .join(' ');
      const day = String(entry?.day || '').trim();
      const date = String(entry?.date || '').trim();
      const time = String(entry?.time || '').trim();
      const haystack = `${studentName} ${groupName} ${participantNames} ${subject} ${day} ${date} ${time}`.toLowerCase();
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

  const availabilityShareEventsByDayIndex = useMemo(
    () => buildCalendarWeekEventsByDayIndex({
      entries,
      weekDays,
      dayStartMinutes,
      dayEndMinutes,
    }),
    [dayEndMinutes, dayStartMinutes, entries, weekDays]
  );

  const availabilityShareEventsFlat = useMemo(
    () => availabilityShareEventsByDayIndex.flatMap((dayEvents, dayIndex) => (
      dayEvents.map((event) => ({ ...event, dayIndex }))
    )),
    [availabilityShareEventsByDayIndex]
  );

  const availabilityShareWeekLabel = useMemo(
    () => formatAvailabilityShareWeekLabel(weekStartDate),
    [weekStartDate]
  );

  const generateAvailabilityShareImage = useCallback(async () => {
    if (!availabilityShareMode) return;
    setAvailabilityShareBusy(true);
    setAvailabilityShareError('');
    setAvailabilityShareSuccess('');
    try {
      const rendered = await renderCalendarAvailabilityPng({
        weekStartDate,
        events: availabilityShareEventsFlat,
        timezoneLabel,
      });
      if (!rendered) throw new Error('Не удалось сформировать изображение календаря.');
      const previousUrl = availabilityShareImageUrlRef.current;
      if (previousUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try {
          URL.revokeObjectURL(previousUrl);
        } catch {}
      }
      availabilityShareImageUrlRef.current = rendered.url || '';
      setAvailabilityShareImage(rendered);
      setAvailabilityShareSuccess('Изображение недели готово к отправке.');
    } catch (err) {
      setAvailabilityShareError(err?.message || 'Не удалось сформировать изображение календаря.');
    } finally {
      setAvailabilityShareBusy(false);
    }
  }, [
    availabilityShareEventsFlat,
    availabilityShareMode,
    timezoneLabel,
    weekStartDate,
  ]);

  const openAvailabilityShareMode = useCallback((offsetWeeks = 4) => {
    if (!availabilityShareMode) {
      availabilityShareReturnFocusDateRef.current = focusDate;
      availabilityShareReturnShowWeekendsRef.current = showWeekends;
    }
    const safeOffset = Number(offsetWeeks) === 5 ? 5 : 4;
    setAvailabilityShareOffsetWeeks(safeOffset);
    setAvailabilityShareMode(true);
    setAvailabilityShareError('');
    setAvailabilityShareSuccess('');
    setAvailabilityShareImage(null);
    setCalendarSettingsOpen(false);
    setEventDetails(null);
    setQuickCreateDraft(null);
    setEventEditDraft(null);
    setDragRecurringChoiceModal(null);
    setPaymentReminderOpen(false);
    setLessonInfoModalOpen(false);
    setShowWeekends(true);
    setFocusDate(getAvailabilityShareWeekStart(new Date(), safeOffset));
  }, [availabilityShareMode, focusDate, showWeekends]);

  const closeAvailabilityShareMode = useCallback(() => {
    setAvailabilityShareMode(false);
    setAvailabilityShareError('');
    setAvailabilityShareSuccess('');
    setAvailabilityShareBusy(false);
    setAvailabilityShareImage(null);
    const previousUrl = availabilityShareImageUrlRef.current;
    if (previousUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(previousUrl);
      } catch {}
    }
    availabilityShareImageUrlRef.current = '';
    if (availabilityShareReturnFocusDateRef.current) {
      setFocusDate(availabilityShareReturnFocusDateRef.current);
      availabilityShareReturnFocusDateRef.current = null;
    }
    if (availabilityShareReturnShowWeekendsRef.current !== null) {
      setShowWeekends(availabilityShareReturnShowWeekendsRef.current);
      availabilityShareReturnShowWeekendsRef.current = null;
    }
  }, []);

  const handleAvailabilityShareOffsetChange = useCallback((offsetWeeks) => {
    const safeOffset = Number(offsetWeeks) === 5 ? 5 : 4;
    setAvailabilityShareOffsetWeeks(safeOffset);
    setAvailabilityShareError('');
    setAvailabilityShareSuccess('');
    setAvailabilityShareImage(null);
    setFocusDate(getAvailabilityShareWeekStart(new Date(), safeOffset));
  }, []);

  const handleDownloadAvailabilityShareImage = useCallback(() => {
    const image = availabilityShareImage;
    if (!image?.blob || typeof document === 'undefined') return;
    const anchor = document.createElement('a');
    anchor.href = image.url || URL.createObjectURL(image.blob);
    anchor.download = `занятость-${toDayKey(weekStartDate)}.png`;
    anchor.click();
    if (!image.url && anchor.href.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
      window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    }
    setAvailabilityShareSuccess('PNG скачан.');
  }, [availabilityShareImage, weekStartDate]);

  const handleNativeAvailabilityShare = useCallback(async () => {
    const image = availabilityShareImage;
    if (!image?.blob) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File === 'function') {
        const file = new File([image.blob], `занятость-${toDayKey(weekStartDate)}.png`, { type: 'image/png' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Моя занятость',
            text: `Свободное и занятое время: ${availabilityShareWeekLabel}`,
          });
          setAvailabilityShareSuccess('Изображение отправлено.');
          return;
        }
      }
      handleDownloadAvailabilityShareImage();
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setAvailabilityShareError(err?.message || 'Не удалось отправить изображение.');
    }
  }, [availabilityShareImage, availabilityShareWeekLabel, handleDownloadAvailabilityShareImage, weekStartDate]);

  useEffect(() => {
    if (typeof window === 'undefined' || !availabilityShareMode || loading) return undefined;
    const timerId = window.setTimeout(() => {
      generateAvailabilityShareImage();
    }, 80);
    return () => window.clearTimeout(timerId);
  }, [availabilityShareMode, generateAvailabilityShareImage, loading, weekStartDate]);

  useEffect(() => () => {
    const previousUrl = availabilityShareImageUrlRef.current;
    if (previousUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(previousUrl);
      } catch {}
    }
  }, []);

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
      if (!dateKey) {
        const recurringDayKey = toDayKey(weekDays[dayIndex]);
        if (entry.excludedDates?.includes(recurringDayKey)) return;
      }

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
  }, [dayEndMinutes, dayStartMinutes, filteredEntries, weekDayKeyToIndex, weekDays]);

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
  const availabilityShareLessonsCount = useMemo(
    () => availabilityShareEventsByDayIndex.reduce((sum, dayEvents) => sum + dayEvents.length, 0),
    [availabilityShareEventsByDayIndex]
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

  const paymentReminderItems = useMemo(() => {
    const now = currentTimeLineNow instanceof Date && !Number.isNaN(currentTimeLineNow.getTime())
      ? currentTimeLineNow
      : new Date();
    const reminderDays = [
      ...visibleDayIndexes.map((dayIndex) => addDays(weekStartDate, dayIndex - 7)),
      ...visibleDayIndexes.map((dayIndex) => weekDays[dayIndex]).filter(Boolean),
    ].map((date) => ({
      date,
      dayKey: toDayKey(date),
      weekdayOrder: date.getDay() === 0 ? 7 : date.getDay(),
    }));
    const reminderDayByKey = new Map(reminderDays.map((day) => [day.dayKey, day]));
    const groups = new Map();

    const pushLesson = (entry, dayInfo, index) => {
      const normalizedDayKey = String(dayInfo?.dayKey || '').trim();
      const dayDate = dayInfo?.date || parseDayKeyToDate(normalizedDayKey);
      if (!normalizedDayKey || !dayDate) return;
      const startMinutesRaw = parseScheduleTimeToMinutes(entry?.time);
      if (!Number.isFinite(startMinutesRaw)) return;
      const duration = Number.isFinite(Number(entry?.durationMinutes))
        ? Math.max(15, Number(entry.durationMinutes))
        : DEFAULT_EVENT_DURATION_MINUTES;
      const startMinutes = Math.max(dayStartMinutes, Math.min(dayEndMinutes - 15, startMinutesRaw));
      const endMinutesRaw = startMinutesRaw + duration;
      const endMinutes = Math.max(
        startMinutes + 20,
        Math.min(dayEndMinutes, endMinutesRaw)
      );
      const event = {
        ...entry,
        date: normalizedDayKey,
        dayKey: normalizedDayKey,
        startMinutes,
        endMinutes,
      };
      const lessonStartMs = dayDate.getTime() + (startMinutes * 60 * 1000);
      const lessonEndMs = dayDate.getTime() + (endMinutes * 60 * 1000);
      if (!Number.isFinite(lessonEndMs)) return;

      const pushStudentReminder = ({ studentId, label, paymentState, groupName = '' }) => {
        if (!paymentState?.shouldRemindPayment) return;
        const groupKey = studentId
          ? `student:${studentId}`
          : `lesson:${String(label || '').toLocaleLowerCase('ru-RU')}`;
        const lesson = {
          key: `${groupKey}:${normalizedDayKey}:${startMinutes}:${event?.id || index}`,
          studentId,
          label,
          groupName,
          dayKey: normalizedDayKey,
          dateLabel: formatDayMonth(dayDate),
          timeLabel: `${formatMinutesAsDisplayTime(startMinutes, use24HourFormat)}-${formatMinutesAsDisplayTime(endMinutes, use24HourFormat)}`,
          endMinutes,
          startMs: lessonStartMs,
          endMs: lessonEndMs,
          isExternal: isExternalCalendarEntry(event),
        };
        const current = groups.get(groupKey) || {
          key: groupKey,
          studentId,
          label,
          count: 0,
          latestAtMs: 0,
          latestDateLabel: '',
          latestTimeLabel: '',
          hasExternal: false,
          lessons: [],
        };
        current.count += 1;
        current.hasExternal = current.hasExternal || lesson.isExternal;
        current.lessons.push(lesson);
        if (lessonEndMs >= current.latestAtMs) {
          current.latestAtMs = lessonEndMs;
          current.latestDateLabel = lesson.dateLabel;
          current.latestTimeLabel = lesson.timeLabel;
        }
        groups.set(groupKey, current);
      };

      if (isLearningGroupCalendarEntry(event)) {
        const groupPayment = getLearningGroupPaymentState(
          teacherId,
          { event, dayKey: normalizedDayKey },
          lessonPanelMarks,
          now,
          studentNameById
        );
        groupPayment.members.forEach((member) => pushStudentReminder({
          studentId: member.studentId,
          label: member.studentName,
          groupName: String(event?.groupName || event?.subject || '').trim(),
          paymentState: member,
        }));
        return;
      }

      const paymentState = getCalendarLessonPaymentState(
        teacherId,
        { event, dayKey: normalizedDayKey },
        lessonPanelMarks,
        now
      );
      const studentId = String(event?.studentId || '').trim();
      const studentName = studentId
        ? (studentNameById[studentId] || event?.studentName || 'Ученик')
        : String(event?.studentName || event?.subject || DEFAULT_ONE_TIME_LESSON_SUBJECT).trim();
      pushStudentReminder({
        studentId,
        label: String(studentName || DEFAULT_ONE_TIME_LESSON_SUBJECT).trim(),
        paymentState,
      });
    };

    filteredEntries.forEach((entry, index) => {
      const excludedDates = new Set(normalizeExcludedDayKeys(entry?.excludedDates));
      const explicitDateKey = normalizeScheduleDateKey(entry?.date);
      if (explicitDateKey) {
        if (excludedDates.has(explicitDateKey)) return;
        const dayInfo = reminderDayByKey.get(explicitDateKey);
        if (dayInfo) pushLesson(entry, dayInfo, index);
        return;
      }

      const weekdayMeta = resolveScheduleWeekdayMeta(entry);
      if (!weekdayMeta?.order) return;
      reminderDays.forEach((dayInfo) => {
        if (dayInfo.weekdayOrder !== weekdayMeta.order || excludedDates.has(dayInfo.dayKey)) return;
        pushLesson(entry, dayInfo, index);
      });
    });

    return Array.from(groups.values())
      .map((item) => {
        const lessons = [...item.lessons]
          .filter((lesson) => isCalendarLessonFinished(lesson.dayKey, lesson.endMinutes, now))
          .sort((left, right) => right.endMs - left.endMs);
        if (lessons.length === 0) return null;
        const latestLesson = lessons[0];
        return {
          ...item,
          count: lessons.length,
          lessons,
          latestAtMs: latestLesson.endMs,
          latestDateLabel: latestLesson.dateLabel,
          latestTimeLabel: latestLesson.timeLabel,
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.latestAtMs - left.latestAtMs);
  }, [
    currentTimeLineNow,
    dayEndMinutes,
    dayStartMinutes,
    filteredEntries,
    lessonPanelMarks,
    studentNameById,
    teacherId,
    use24HourFormat,
    visibleDayIndexes,
    weekDays,
    weekStartDate,
  ]);

  const paymentReminderLessonCount = paymentReminderItems.reduce((sum, item) => sum + item.count, 0);
  const paymentReminderStudentCount = paymentReminderItems.length;
  const paymentReminderLessons = useMemo(
    () => paymentReminderItems
      .flatMap((item) => item.lessons.map((lesson) => ({
        ...lesson,
        studentId: item.studentId,
        label: item.label,
        hasExternal: item.hasExternal,
      })))
      .sort((left, right) => right.endMs - left.endMs),
    [paymentReminderItems]
  );

  const trialEventsThisWeek = useMemo(
    () => weekEventsFlat.filter((event) => isTrialEntry(event)),
    [weekEventsFlat]
  );

  const googleEventsThisWeek = useMemo(
    () => weekEventsFlat.filter((event) => isExternalCalendarEntry(event)),
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

  const upcomingGoogleEvents = useMemo(() => {
    const nowTime = Date.now();
    const candidates = googleEventsThisWeek
      .map((event) => {
        const startLabel = formatMinutesAsTime(event.startMinutes);
        const startDate = new Date(`${event.dayKey}T${startLabel}:00`);
        if (Number.isNaN(startDate.getTime())) return null;
        return { ...event, startDate };
      })
      .filter(Boolean)
      .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
    const upcoming = candidates.filter((item) => item.startDate.getTime() >= nowTime);
    return (upcoming.length > 0 ? upcoming : candidates).slice(0, 5);
  }, [googleEventsThisWeek]);

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

  const lessonPanelInfo = useMemo(() => {
    const now = currentTimeLineNow instanceof Date ? currentTimeLineNow : new Date();
    const nowMs = now.getTime();
    const startDate = cloneAsDateOnly(now);
    const candidates = [];

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const startMinutes = parseScheduleTimeToMinutes(entry?.time);
      if (!Number.isFinite(startMinutes)) return;
      const duration = Number.isFinite(Number(entry?.durationMinutes))
        ? Math.max(15, Number(entry.durationMinutes))
        : DEFAULT_EVENT_DURATION_MINUTES;
      const explicitDate = String(entry?.date || '').trim();
      const excludedDates = new Set(normalizeExcludedDayKeys(entry?.excludedDates));
      const pushCandidate = (dayKey) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || excludedDates.has(dayKey)) return;
        const candidateDate = parseDayKeyToDate(dayKey);
        if (!candidateDate) return;
        const candidateMs = candidateDate.getTime();
        const minMs = addDays(startDate, -1).getTime();
        const maxMs = addDays(startDate, LESSON_PANEL_LOOKAHEAD_DAYS).getTime();
        if (candidateMs < minMs || candidateMs > maxMs) return;
        const startLabel = formatMinutesAsTime(startMinutes);
        const lessonStart = new Date(`${dayKey}T${startLabel}:00`);
        if (Number.isNaN(lessonStart.getTime())) return;
        const lessonEnd = new Date(lessonStart.getTime() + (duration * 60 * 1000));
        const studentId = String(entry?.studentId || '').trim();
        const studentName = studentId
          ? (studentNameById[studentId] || entry?.studentName || 'Ученик')
          : String(entry?.studentName || entry?.subject || DEFAULT_ONE_TIME_LESSON_SUBJECT).trim();
        candidates.push({
          event: {
            ...entry,
            startMinutes,
            endMinutes: startMinutes + duration,
            studentName,
          },
          dayKey,
          startDate: lessonStart,
          endDate: lessonEnd,
        });
      };

      if (explicitDate) {
        pushCandidate(explicitDate);
        return;
      }

      const weekdayMeta = resolveScheduleWeekdayMeta(entry);
      if (!weekdayMeta?.order) return;
      for (let offset = 0; offset <= LESSON_PANEL_LOOKAHEAD_DAYS; offset += 1) {
        const date = addDays(startDate, offset);
        const weekdayOrder = date.getDay() === 0 ? 7 : date.getDay();
        if (weekdayOrder !== weekdayMeta.order) continue;
        pushCandidate(toDayKey(date));
      }
    });

    candidates.sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
    const current = candidates.find((item) => item.startDate.getTime() <= nowMs && item.endDate.getTime() > nowMs);
    if (current) return { ...current, status: 'current' };
    const next = candidates.find((item) => item.startDate.getTime() >= nowMs);
    if (next) return { ...next, status: 'next' };
    const last = [...candidates].reverse().find((item) => item.endDate.getTime() <= nowMs);
    return last ? { ...last, status: 'past' } : null;
  }, [currentTimeLineNow, entries, studentNameById]);

  const lessonPanelStudentId = String(lessonPanelInfo?.event?.studentId || '').trim();
  const lessonPanelIsGroup = isLearningGroupCalendarEntry(lessonPanelInfo?.event);
  const lessonPanelGroupParticipants = useMemo(
    () => getLearningGroupCalendarParticipants(lessonPanelInfo?.event, studentNameById),
    [lessonPanelInfo?.event, studentNameById]
  );
  const lessonPanelHasStudent = Boolean(lessonPanelStudentId);
  const lessonPanelCanOpenGroup = lessonPanelIsGroup
    && Boolean(String(lessonPanelInfo?.event?.lessonId || '').trim())
    && lessonPanelGroupParticipants.length > 0;
  const lessonPanelGroupDurationMinutes = Math.max(
    15,
    Number(lessonPanelInfo?.event?.durationMinutes)
      || (Number(lessonPanelInfo?.event?.endMinutes) - Number(lessonPanelInfo?.event?.startMinutes))
      || DEFAULT_EVENT_DURATION_MINUTES
  );
  const lessonPanelGroupStatus = String(
    lessonPanelInfo?.event?.status || lessonPanelInfo?.event?.lessonStatus || ''
  ).trim().toLowerCase();
  const lessonPanelGroupStartLabel = lessonPanelInfo
    ? formatMinutesAsTime(lessonPanelInfo.event.startMinutes)
    : '';
  const lessonPanelGroupFallbackStartsAt = lessonPanelInfo?.dayKey
    && lessonPanelGroupStartLabel
    && lessonPanelGroupStartLabel !== '--:--'
    ? `${lessonPanelInfo.dayKey}T${lessonPanelGroupStartLabel}:00`
    : '';
  const lessonPanelGroupStartsAt = String(
    lessonPanelInfo?.event?.startsAt
      || lessonPanelInfo?.event?.startAt
      || lessonPanelGroupFallbackStartsAt
      || ''
  ).trim();
  const lessonPanelGroupStartMs = Date.parse(lessonPanelGroupStartsAt);
  const lessonPanelGroupNotStarted = lessonPanelIsGroup
    && Number.isFinite(lessonPanelGroupStartMs)
    && lessonPanelGroupStartMs > currentTimeLineNow.getTime()
    && lessonPanelGroupStatus !== 'active';
  const lessonPanelGroupClosed = lessonPanelIsGroup && (
    lessonPanelInfo?.status === 'past'
    || ['completed', 'cancelled'].includes(lessonPanelGroupStatus)
    || String(lessonPanelInfo?.event?.groupStatus || '').trim().toLowerCase() === 'completed'
  );
  const lessonPanelGroupReadOnly = lessonPanelGroupClosed || lessonPanelGroupNotStarted;
  const lessonPanelGroupCanOpenTelemost = lessonPanelCanOpenGroup
    && !lessonPanelGroupReadOnly;
  const lessonPanelStudentSelected = lessonPanelHasStudent
    && String(activeStudentId || '').trim() === lessonPanelStudentId;
  const lessonPanelStudentName = String(
    (lessonPanelIsGroup ? lessonPanelInfo?.event?.groupName : lessonPanelInfo?.event?.studentName)
    || lessonPanelInfo?.event?.subject
    || DEFAULT_ONE_TIME_LESSON_SUBJECT
  ).trim();
  const lessonPanelSubject = String(lessonPanelInfo?.event?.subject || '').trim();
  const lessonPanelDateLabel = lessonPanelInfo?.dayKey
    ? formatDayMonth(new Date(`${lessonPanelInfo.dayKey}T00:00:00`))
    : '';
  const lessonPanelTimeLabel = lessonPanelInfo
    ? `${formatMinutesAsDisplayTime(lessonPanelInfo.event.startMinutes, use24HourFormat)}-${formatMinutesAsDisplayTime(lessonPanelInfo.event.endMinutes, use24HourFormat)}`
    : '';
  const lessonPanelStatusLabel = lessonPanelInfo?.status === 'current'
    ? 'Идёт сейчас'
    : (lessonPanelInfo?.status === 'past' ? 'Последний урок' : 'Ближайший урок');
  const lessonPanelLink = normalizeLessonPanelUrl(lessonPanelInfo?.event?.telemostUrl)
    || normalizeLessonPanelUrl(lessonPanelInfo?.event?.lessonLink)
    || normalizeLessonPanelUrl(lessonPanelInfo?.event?.boardLink);
  const lessonPanelGroupLink = normalizeTelemostUrl(lessonPanelInfo?.event?.telemostUrl);
  const lessonPanelCompletedMarkKey = lessonPanelInfo
    ? buildLessonPanelMarkKey(teacherId, lessonPanelInfo, 'completed')
    : '';
  const lessonPanelPaidMarkKey = lessonPanelInfo
    ? buildLessonPanelMarkKey(teacherId, lessonPanelInfo, 'paid')
    : '';
  const lessonPanelTrialMarkKey = lessonPanelInfo
    ? buildLessonPanelMarkKey(teacherId, lessonPanelInfo, 'trial')
    : '';
  const lessonPanelCompletedMarked = Boolean(lessonPanelMarks[lessonPanelCompletedMarkKey]);
  const lessonPanelPaidMarked = Boolean(lessonPanelMarks[lessonPanelPaidMarkKey]);
  const lessonPanelTrialMarked = Boolean(lessonPanelMarks[lessonPanelTrialMarkKey]);

  const saveLessonPanelMark = useCallback(async (markKey) => {
    if (!markKey || !teacherId) return;
    const markedAt = new Date().toISOString();
    const previousMarks = normalizeLessonPanelMarks(lessonPanelMarks);
    const optimisticMarks = normalizeLessonPanelMarks({
      ...previousMarks,
      [markKey]: markedAt,
    });
    setLessonPanelMarks(optimisticMarks);
    writeLessonPanelMarks(teacherId, optimisticMarks);
    try {
      const response = await api.updateTeacherCalendarMarks({ set: { [markKey]: markedAt } }, teacherId);
      const nextMarks = normalizeLessonPanelMarks(response?.marks);
      setLessonPanelMarks(nextMarks);
      writeLessonPanelMarks(teacherId, nextMarks);
      markLessonPanelMarksMigrated(teacherId);
    } catch (error) {
      setLessonPanelMarks(previousMarks);
      writeLessonPanelMarks(teacherId, previousMarks);
      throw error;
    }
  }, [lessonPanelMarks, teacherId]);

  const removeLessonPanelMark = useCallback(async (markKey) => {
    if (!markKey || !teacherId) return;
    const previousMarks = normalizeLessonPanelMarks(lessonPanelMarks);
    const optimisticMarks = normalizeLessonPanelMarks(previousMarks);
    delete optimisticMarks[markKey];
    setLessonPanelMarks(optimisticMarks);
    writeLessonPanelMarks(teacherId, optimisticMarks);
    try {
      const response = await api.updateTeacherCalendarMarks({ unset: [markKey] }, teacherId);
      const nextMarks = normalizeLessonPanelMarks(response?.marks);
      setLessonPanelMarks(nextMarks);
      writeLessonPanelMarks(teacherId, nextMarks);
      markLessonPanelMarksMigrated(teacherId);
    } catch (error) {
      setLessonPanelMarks(previousMarks);
      writeLessonPanelMarks(teacherId, previousMarks);
      throw error;
    }
  }, [lessonPanelMarks, teacherId]);

  const openStudentWorkspace = useCallback((viewId, studentId) => {
    const normalizedView = String(viewId || '').trim();
    if (!normalizedView) return;
    const normalizedStudentId = String(studentId || '').trim();
    if (normalizedStudentId && typeof onSelectStudent === 'function') {
      onSelectStudent(normalizedStudentId);
    }
    if (typeof onOpenStudentWorkspace === 'function') {
      onOpenStudentWorkspace(normalizedView, normalizedStudentId);
    }
  }, [onOpenStudentWorkspace, onSelectStudent]);

  const openLessonPanelWorkspace = useCallback((viewId) => {
    openStudentWorkspace(viewId, lessonPanelStudentId);
  }, [lessonPanelStudentId, openStudentWorkspace]);

  const openLessonPanelGroupWorkspace = useCallback((surface = 'call') => {
    const event = lessonPanelInfo?.event || {};
    if (!lessonPanelCanOpenGroup || typeof onOpenLearningGroupLesson !== 'function') return;
    const startLabel = formatMinutesAsTime(event.startMinutes);
    const fallbackStartsAt = lessonPanelInfo?.dayKey && startLabel && startLabel !== '--:--'
      ? `${lessonPanelInfo.dayKey}T${startLabel}:00`
      : '';
    const lessonContext = {
      lessonId: String(event.lessonId || '').trim(),
      groupId: String(event.groupId || '').trim(),
      participantIds: lessonPanelGroupParticipants.map((member) => member.studentId),
      groupName: String(event.groupName || event.subject || 'Мини-группа').trim(),
      topic: String(event.topic || event.subject || 'Групповое занятие').trim(),
      startsAt: String(event.startsAt || event.startAt || fallbackStartsAt).trim(),
      durationMinutes: lessonPanelGroupDurationMinutes,
      telemostUrl: normalizeTelemostUrl(event.telemostUrl),
      status: lessonPanelGroupClosed ? 'completed' : String(event.status || '').trim(),
      groupStatus: String(event.groupStatus || '').trim(),
      readOnly: lessonPanelGroupReadOnly,
      surface,
    };
    if (surface === 'call' && !lessonPanelGroupReadOnly && typeof onOpenLearningGroupTelemost === 'function') {
      onOpenLearningGroupTelemost(lessonContext);
      return;
    }
    onOpenLearningGroupLesson(lessonContext);
  }, [
    lessonPanelCanOpenGroup,
    lessonPanelGroupParticipants,
    lessonPanelGroupDurationMinutes,
    lessonPanelGroupClosed,
    lessonPanelGroupReadOnly,
    lessonPanelInfo,
    onOpenLearningGroupTelemost,
    onOpenLearningGroupLesson,
  ]);

  const openLessonPanelCall = useCallback(() => {
    if (lessonPanelIsGroup) {
      openLessonPanelGroupWorkspace('call');
      return;
    }
    openLessonPanelWorkspace('call-connect');
  }, [lessonPanelIsGroup, openLessonPanelGroupWorkspace, openLessonPanelWorkspace]);

  const handleLessonPanelClick = useCallback((event) => {
    if (!lessonPanelHasStudent && !lessonPanelCanOpenGroup) return;
    const interactiveTarget = event.target?.closest?.('button, a, input, textarea, select, label');
    if (interactiveTarget && event.currentTarget.contains(interactiveTarget)) return;
    openLessonPanelCall();
  }, [lessonPanelCanOpenGroup, lessonPanelHasStudent, openLessonPanelCall]);

  const handleLessonPanelKeyDown = useCallback((event) => {
    if (!lessonPanelHasStudent && !lessonPanelCanOpenGroup) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openLessonPanelCall();
  }, [lessonPanelCanOpenGroup, lessonPanelHasStudent, openLessonPanelCall]);

  const openLessonPanelLink = useCallback(() => {
    if (!lessonPanelLink || typeof window === 'undefined') return;
    window.open(lessonPanelLink, '_blank', 'noopener,noreferrer');
  }, [lessonPanelLink]);

  const openLessonInfoModal = useCallback(() => {
    if (!lessonPanelHasStudent) return;
    setLessonInfoTarget({
      studentId: lessonPanelStudentId,
      studentName: lessonPanelStudentName,
      dateLabel: lessonPanelDateLabel,
      timeLabel: lessonPanelTimeLabel,
    });
    setLessonInfoError('');
    setLessonInfoModalOpen(true);
  }, [lessonPanelDateLabel, lessonPanelHasStudent, lessonPanelStudentId, lessonPanelStudentName, lessonPanelTimeLabel]);

  const closeLessonInfoModal = useCallback(() => {
    setLessonInfoModalOpen(false);
    setLessonInfoError('');
    setLessonInfoTarget(null);
  }, []);

  const toggleCalendarTrialMark = useCallback(async (markKey) => {
    if (!markKey || !teacherId || lessonPanelFinanceBusy) return;
    const undo = Boolean(lessonPanelMarks[markKey]);
    setLessonPanelFinanceBusy(undo ? 'trial-undo' : 'trial');
    setLessonPanelError('');
    setLessonPanelSuccess('');
    try {
      if (undo) {
        await removeLessonPanelMark(markKey);
      } else {
        await saveLessonPanelMark(markKey);
      }
      setLessonPanelSuccess(undo
        ? 'Отметка пробного занятия отменена.'
        : 'Занятие отмечено как пробное. Оплата для него не нужна.');
    } catch (err) {
      setLessonPanelError(err?.message || 'Не удалось обновить отметку пробного занятия.');
    } finally {
      setLessonPanelFinanceBusy('');
    }
  }, [
    lessonPanelFinanceBusy,
    lessonPanelMarks,
    removeLessonPanelMark,
    saveLessonPanelMark,
    teacherId,
  ]);

  const handleLessonPanelFinanceAction = useCallback(async (action) => {
    const normalizedAction = String(action || '').trim();
    if (!teacherId || !lessonPanelInfo || lessonPanelFinanceBusy) return;
    const markKey = normalizedAction === 'paid' ? lessonPanelPaidMarkKey : lessonPanelCompletedMarkKey;
    const undo = Boolean(markKey && lessonPanelMarks[markKey]);

    setLessonPanelFinanceBusy(undo ? `${normalizedAction}-undo` : normalizedAction);
    setLessonPanelError('');
    setLessonPanelSuccess('');
    try {
      if (!lessonPanelStudentId) {
        if (normalizedAction !== 'paid') return;
        if (undo) {
          await removeLessonPanelMark(markKey);
        } else {
          await saveLessonPanelMark(markKey);
        }
        setLessonPanelSuccess(undo
          ? 'Отметка оплаты отменена.'
          : 'Оплата отмечена в календаре. Ученик не сопоставлен, сумму в финансы не добавлял.');
        return;
      }
      const month = getFinanceMonthFromDayKey(lessonPanelInfo.dayKey);
      const snapshot = await api.getTeacherFinance(month, teacherId);
      const financeStudent = (Array.isArray(snapshot?.students) ? snapshot.students : [])
        .find((student) => String(student?.id || '').trim() === lessonPanelStudentId);
      const record = financeStudent?.record || {};
      const profile = financeStudent?.profile || {};
      const currentCompleted = normalizeFinanceAmount(record.completedLessons);
      const currentPaid = normalizeFinanceAmount(record.paidAmount);
      const lessonPrice = normalizeFinanceAmount(record.lessonPrice ?? profile.lessonPrice);
      const overrides = { month };

      if (normalizedAction === 'completed') {
        overrides.completedLessons = undo
          ? Math.max(0, currentCompleted - 1)
          : currentCompleted + 1;
      } else if (normalizedAction === 'paid') {
        if (lessonPrice <= 0) {
          if (undo) {
            await removeLessonPanelMark(markKey);
          } else {
            await saveLessonPanelMark(markKey);
          }
          setLessonPanelSuccess(undo
            ? 'Отметка оплаты отменена.'
            : 'Оплата отмечена в календаре. Стоимость урока в финансах не указана, сумму не добавлял.');
          return;
        }
        overrides.paidAmount = undo
          ? Math.max(0, currentPaid - lessonPrice)
          : currentPaid + lessonPrice;
      } else {
        return;
      }

      await api.updateTeacherFinanceStudent(
        lessonPanelStudentId,
        buildTeacherFinanceLessonPayload(record, profile, overrides),
        teacherId
      );
      if (undo) {
        await removeLessonPanelMark(markKey);
      } else {
        await saveLessonPanelMark(markKey);
      }
      setLessonPanelSuccess(normalizedAction === 'completed'
        ? (undo ? 'Отметка проведения отменена.' : 'Проведение отмечено.')
        : (undo ? `Оплата вычтена: ${lessonPrice.toLocaleString('ru-RU')} ₽.` : `Оплата добавлена: ${lessonPrice.toLocaleString('ru-RU')} ₽.`));
    } catch (err) {
      setLessonPanelError(err?.message || 'Не удалось обновить финансы.');
    } finally {
      setLessonPanelFinanceBusy('');
    }
  }, [
    lessonPanelCompletedMarkKey,
    lessonPanelFinanceBusy,
    lessonPanelInfo,
    lessonPanelMarks,
    lessonPanelPaidMarkKey,
    lessonPanelStudentId,
    removeLessonPanelMark,
    saveLessonPanelMark,
    teacherId,
  ]);

  const eventDetailsStudentId = String(eventDetails?.studentId || '').trim();
  const eventDetailsHasStudent = Boolean(eventDetailsStudentId);
  const eventDetailsIsGroup = isLearningGroupCalendarEntry(eventDetails);
  const eventDetailsGroupParticipants = useMemo(
    () => getLearningGroupCalendarParticipants(eventDetails, studentNameById),
    [eventDetails, studentNameById]
  );
  const eventDetailsStudentSelected = eventDetailsHasStudent
    && String(activeStudentId || '').trim() === eventDetailsStudentId;
  const eventDetailsStudentName = String(
    eventDetails?.studentName
    || eventDetails?.subjectLabel
    || eventDetails?.subject
    || DEFAULT_ONE_TIME_LESSON_SUBJECT
  ).trim();
  const eventDetailsSubject = String(eventDetails?.subject || '').trim();
  const eventDetailsDayKey = String(eventDetails?.dayKey || eventDetails?.date || '').trim();
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
  const eventDetailsTimeRangeLabel = eventDetails
    ? `${formatMinutesAsDisplayTime(eventDetails.startMinutes, use24HourFormat)}-${formatMinutesAsDisplayTime(eventDetails.endMinutes, use24HourFormat)}`
    : '';
  const eventDetailsLink = normalizeLessonPanelUrl(eventDetails?.telemostUrl)
    || normalizeLessonPanelUrl(eventDetails?.lessonLink)
    || normalizeLessonPanelUrl(eventDetails?.boardLink);
  const eventDetailsGroupLink = normalizeTelemostUrl(eventDetails?.telemostUrl);
  const eventDetailsLessonInfo = useMemo(
    () => (eventDetails ? { event: eventDetails, dayKey: eventDetailsDayKey } : null),
    [eventDetails, eventDetailsDayKey]
  );
  const eventDetailsCompletedMarkKey = eventDetailsLessonInfo
    ? buildLessonPanelMarkKey(teacherId, eventDetailsLessonInfo, 'completed')
    : '';
  const eventDetailsPaidMarkKey = eventDetailsLessonInfo
    ? buildLessonPanelMarkKey(teacherId, eventDetailsLessonInfo, 'paid')
    : '';
  const eventDetailsTrialMarkKey = eventDetailsLessonInfo
    ? buildLessonPanelMarkKey(teacherId, eventDetailsLessonInfo, 'trial')
    : '';
  const eventDetailsCompletedMarked = Boolean(lessonPanelMarks[eventDetailsCompletedMarkKey]);
  const eventDetailsPaidMarked = Boolean(lessonPanelMarks[eventDetailsPaidMarkKey]);
  const eventDetailsTrialMarked = Boolean(lessonPanelMarks[eventDetailsTrialMarkKey]);
  const eventDetailsGroupPayment = eventDetailsIsGroup && eventDetailsLessonInfo
    ? getLearningGroupPaymentState(
      teacherId,
      eventDetailsLessonInfo,
      lessonPanelMarks,
      currentTimeLineNow,
      studentNameById
    )
    : null;
  const eventDetailsStatusLabel = useMemo(() => {
    if (!eventDetails) return 'Урок';
    if (isTrialEntry(eventDetails) || eventDetailsTrialMarked) return 'Пробное';
    const start = Number(eventDetails.startMinutes);
    const end = Number(eventDetails.endMinutes);
    if (!eventDetailsDayKey || !Number.isFinite(start) || !Number.isFinite(end)) return 'Урок';
    const startDate = new Date(`${eventDetailsDayKey}T${formatMinutesAsTime(start)}:00`);
    if (Number.isNaN(startDate.getTime())) return 'Урок';
    const nowMs = (currentTimeLineNow instanceof Date ? currentTimeLineNow : new Date()).getTime();
    const endDate = new Date(startDate.getTime() + Math.max(1, end - start) * 60 * 1000);
    if (startDate.getTime() <= nowMs && endDate.getTime() > nowMs) return 'Идёт сейчас';
    if (startDate.getTime() < nowMs) return 'Прошедший урок';
    return 'Урок';
  }, [currentTimeLineNow, eventDetails, eventDetailsDayKey, eventDetailsTrialMarked]);
  const eventDetailsGroupDurationMinutes = Math.max(
    15,
    Number(eventDetails?.durationMinutes)
      || (Number(eventDetails?.endMinutes) - Number(eventDetails?.startMinutes))
      || DEFAULT_EVENT_DURATION_MINUTES
  );
  const eventDetailsGroupStatus = String(
    eventDetails?.status || eventDetails?.lessonStatus || ''
  ).trim().toLowerCase();
  const eventDetailsGroupStartLabel = eventDetails
    ? formatMinutesAsTime(eventDetails.startMinutes)
    : '';
  const eventDetailsGroupFallbackStartsAt = eventDetailsDayKey
    && eventDetailsGroupStartLabel
    && eventDetailsGroupStartLabel !== '--:--'
    ? `${eventDetailsDayKey}T${eventDetailsGroupStartLabel}:00`
    : '';
  const eventDetailsGroupStartsAt = String(
    eventDetails?.startsAt
      || eventDetails?.startAt
      || eventDetailsGroupFallbackStartsAt
      || ''
  ).trim();
  const eventDetailsGroupStartMs = Date.parse(eventDetailsGroupStartsAt);
  const eventDetailsGroupNotStarted = eventDetailsIsGroup
    && Number.isFinite(eventDetailsGroupStartMs)
    && eventDetailsGroupStartMs > currentTimeLineNow.getTime()
    && eventDetailsGroupStatus !== 'active';
  const eventDetailsGroupClosed = eventDetailsIsGroup && (
    eventDetailsStatusLabel === 'Прошедший урок'
    || ['completed', 'cancelled'].includes(eventDetailsGroupStatus)
    || String(eventDetails?.groupStatus || '').trim().toLowerCase() === 'completed'
  );
  const eventDetailsGroupReadOnly = eventDetailsGroupClosed || eventDetailsGroupNotStarted;
  const eventDetailsGroupCanOpenTelemost = eventDetailsIsGroup
    && eventDetailsGroupParticipants.length > 0
    && Boolean(String(eventDetails?.lessonId || '').trim())
    && !eventDetailsGroupReadOnly;
  const eventDetailsHomeworkText = String(eventDetailsHomework?.homeWork || '').trim();
  const eventDetailsHomeworkPreview = eventDetailsHomeworkText
    ? eventDetailsHomeworkText.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    : '';
  const eventDetailsHomeworkGoalCount = Array.isArray(eventDetailsHomework?.goals)
    ? eventDetailsHomework.goals.length
    : 0;
  const eventDetailsHomeworkGoalLabels = useMemo(
    () => getLessonPanelHomeworkGoalLabels(eventDetailsHomework),
    [eventDetailsHomework]
  );
  const eventDetailsHomeworkGoalsPreview = eventDetailsHomeworkGoalLabels.slice(0, 2).join('; ');
  const lessonInfoTargetStudentId = String(lessonInfoTarget?.studentId || '').trim();
  const lessonInfoTargetStudentName = String(lessonInfoTarget?.studentName || lessonPanelStudentName || 'Ученик').trim();
  const lessonInfoTargetDateLabel = String(lessonInfoTarget?.dateLabel || lessonPanelDateLabel || '').trim();
  const lessonInfoTargetTimeLabel = String(lessonInfoTarget?.timeLabel || lessonPanelTimeLabel || '').trim();

  const openEventDetailsWorkspace = useCallback((viewId) => {
    openStudentWorkspace(viewId, eventDetailsStudentId);
  }, [eventDetailsStudentId, openStudentWorkspace]);

  const openEventDetailsGroupWorkspace = useCallback((surface = 'call') => {
    if (!eventDetailsIsGroup || typeof onOpenLearningGroupLesson !== 'function') return;
    const startLabel = formatMinutesAsTime(eventDetails?.startMinutes);
    const fallbackStartsAt = eventDetailsDayKey && startLabel && startLabel !== '--:--'
      ? `${eventDetailsDayKey}T${startLabel}:00`
      : '';
    const lessonContext = {
      lessonId: String(eventDetails?.lessonId || '').trim(),
      groupId: String(eventDetails?.groupId || '').trim(),
      participantIds: eventDetailsGroupParticipants.map((member) => member.studentId),
      groupName: String(eventDetails?.groupName || eventDetails?.subject || 'Мини-группа').trim(),
      topic: String(eventDetails?.topic || eventDetails?.subject || 'Групповое занятие').trim(),
      startsAt: String(eventDetails?.startsAt || eventDetails?.startAt || fallbackStartsAt).trim(),
      durationMinutes: eventDetailsGroupDurationMinutes,
      telemostUrl: normalizeTelemostUrl(eventDetails?.telemostUrl),
      status: eventDetailsGroupClosed ? 'completed' : String(eventDetails?.status || '').trim(),
      groupStatus: String(eventDetails?.groupStatus || '').trim(),
      readOnly: eventDetailsGroupReadOnly,
      surface,
    };
    if (surface === 'call' && !eventDetailsGroupReadOnly && typeof onOpenLearningGroupTelemost === 'function') {
      onOpenLearningGroupTelemost(lessonContext);
      return;
    }
    onOpenLearningGroupLesson(lessonContext);
  }, [
    eventDetails,
    eventDetailsDayKey,
    eventDetailsGroupDurationMinutes,
    eventDetailsGroupClosed,
    eventDetailsGroupParticipants,
    eventDetailsGroupReadOnly,
    eventDetailsIsGroup,
    onOpenLearningGroupTelemost,
    onOpenLearningGroupLesson,
  ]);

  const openEventDetailsLink = useCallback(() => {
    if (!eventDetailsLink || typeof window === 'undefined') return;
    window.open(eventDetailsLink, '_blank', 'noopener,noreferrer');
  }, [eventDetailsLink]);

  const openEventDetailsInfoModal = useCallback(() => {
    if (!eventDetailsHasStudent) return;
    setLessonInfoTarget({
      studentId: eventDetailsStudentId,
      studentName: eventDetailsStudentName,
      dateLabel: eventDetailsDateLabel,
      timeLabel: eventDetailsTimeRangeLabel,
    });
    setLessonInfoError('');
    setLessonInfoModalOpen(true);
  }, [
    eventDetailsDateLabel,
    eventDetailsHasStudent,
    eventDetailsStudentId,
    eventDetailsStudentName,
    eventDetailsTimeRangeLabel,
  ]);

  const handleEventDetailsFinanceAction = useCallback(async (action) => {
    const normalizedAction = String(action || '').trim();
    if (!teacherId || !eventDetailsLessonInfo || lessonPanelFinanceBusy) return;
    const markKey = normalizedAction === 'paid' ? eventDetailsPaidMarkKey : eventDetailsCompletedMarkKey;
    const undo = Boolean(markKey && lessonPanelMarks[markKey]);

    setLessonPanelFinanceBusy(undo ? `${normalizedAction}-undo` : normalizedAction);
    setLessonPanelError('');
    setLessonPanelSuccess('');
    try {
      if (!eventDetailsStudentId) {
        if (normalizedAction !== 'paid') return;
        if (undo) {
          await removeLessonPanelMark(markKey);
        } else {
          await saveLessonPanelMark(markKey);
        }
        setLessonPanelSuccess(undo
          ? 'Отметка оплаты отменена.'
          : 'Оплата отмечена в календаре. Ученик не сопоставлен, сумму в финансы не добавлял.');
        return;
      }
      const month = getFinanceMonthFromDayKey(eventDetailsDayKey);
      const snapshot = await api.getTeacherFinance(month, teacherId);
      const financeStudent = (Array.isArray(snapshot?.students) ? snapshot.students : [])
        .find((student) => String(student?.id || '').trim() === eventDetailsStudentId);
      const record = financeStudent?.record || {};
      const profile = financeStudent?.profile || {};
      const currentCompleted = normalizeFinanceAmount(record.completedLessons);
      const currentPaid = normalizeFinanceAmount(record.paidAmount);
      const lessonPrice = normalizeFinanceAmount(record.lessonPrice ?? profile.lessonPrice);
      const overrides = { month };

      if (normalizedAction === 'completed') {
        overrides.completedLessons = undo
          ? Math.max(0, currentCompleted - 1)
          : currentCompleted + 1;
      } else if (normalizedAction === 'paid') {
        if (lessonPrice <= 0) {
          if (undo) {
            await removeLessonPanelMark(markKey);
          } else {
            await saveLessonPanelMark(markKey);
          }
          setLessonPanelSuccess(undo
            ? 'Отметка оплаты отменена.'
            : 'Оплата отмечена в календаре. Стоимость урока в финансах не указана, сумму не добавлял.');
          return;
        }
        overrides.paidAmount = undo
          ? Math.max(0, currentPaid - lessonPrice)
          : currentPaid + lessonPrice;
      } else {
        return;
      }

      await api.updateTeacherFinanceStudent(
        eventDetailsStudentId,
        buildTeacherFinanceLessonPayload(record, profile, overrides),
        teacherId
      );
      if (undo) {
        await removeLessonPanelMark(markKey);
      } else {
        await saveLessonPanelMark(markKey);
      }
      setLessonPanelSuccess(normalizedAction === 'completed'
        ? (undo ? 'Отметка проведения отменена.' : 'Проведение отмечено.')
        : (undo ? `Оплата вычтена: ${lessonPrice.toLocaleString('ru-RU')} ₽.` : `Оплата добавлена: ${lessonPrice.toLocaleString('ru-RU')} ₽.`));
    } catch (err) {
      setLessonPanelError(err?.message || 'Не удалось обновить финансы.');
    } finally {
      setLessonPanelFinanceBusy('');
    }
  }, [
    eventDetailsCompletedMarkKey,
    eventDetailsDayKey,
    eventDetailsLessonInfo,
    eventDetailsPaidMarkKey,
    eventDetailsStudentId,
    lessonPanelFinanceBusy,
    lessonPanelMarks,
    removeLessonPanelMark,
    saveLessonPanelMark,
    teacherId,
  ]);

  const handleGroupMemberPaymentToggle = useCallback(async (member) => {
    const studentId = String(member?.studentId || '').trim();
    const markKey = String(member?.paidMarkKey || '').trim();
    if (!eventDetailsIsGroup || !studentId || !markKey || !teacherId || lessonPanelFinanceBusy) return;
    const undo = Boolean(lessonPanelMarks[markKey]);
    setLessonPanelFinanceBusy(`group-paid:${studentId}`);
    setLessonPanelError('');
    setLessonPanelSuccess('');
    try {
      const month = getFinanceMonthFromDayKey(eventDetailsDayKey);
      const groupLessonPrice = normalizeFinanceAmount(member?.lessonPrice) || 1000;
      const snapshot = await api.getTeacherFinance(month, teacherId);
      const financeStudent = (Array.isArray(snapshot?.students) ? snapshot.students : [])
        .find((entry) => String(entry?.id || '').trim() === studentId);
      if (financeStudent) {
        const record = financeStudent.record || {};
        const profile = financeStudent.profile || {};
        const currentPaid = normalizeFinanceAmount(record.paidAmount);
        const nextPaid = undo
          ? Math.max(0, currentPaid - groupLessonPrice)
          : currentPaid + groupLessonPrice;
        await api.updateTeacherFinanceStudent(
          studentId,
          buildTeacherFinanceLessonPayload(record, profile, {
            month,
            paidAmount: nextPaid,
          }),
          teacherId
        );
      }
      if (undo) await removeLessonPanelMark(markKey);
      else await saveLessonPanelMark(markKey);
      setLessonPanelSuccess(
        undo
          ? `Оплата ученика «${member.studentName || 'Ученик'}» отменена (${groupLessonPrice.toLocaleString('ru-RU')} ₽).`
          : `Оплата ученика «${member.studentName || 'Ученик'}» отмечена (${groupLessonPrice.toLocaleString('ru-RU')} ₽).`
      );
    } catch (err) {
      setLessonPanelError(err?.message || 'Не удалось обновить оплату ученика.');
    } finally {
      setLessonPanelFinanceBusy('');
    }
  }, [
    eventDetailsIsGroup,
    eventDetailsDayKey,
    lessonPanelFinanceBusy,
    lessonPanelMarks,
    removeLessonPanelMark,
    saveLessonPanelMark,
    teacherId,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLessonPanelError('');
    setLessonPanelSuccess('');
    if (!lessonPanelStudentId) {
      setLessonPanelHomework(null);
      setLessonPanelHomeworkLoading(false);
      return undefined;
    }
    setLessonPanelHomeworkLoading(true);
    api.getStudentNextLesson(lessonPanelStudentId)
      .then((data) => {
        if (cancelled) return;
        const latest = data?.latest && typeof data.latest === 'object'
          ? data.latest
          : (Array.isArray(data?.homeworks) ? data.homeworks[0] : null);
        setLessonPanelHomework(latest || null);
      })
      .catch(() => {
        if (!cancelled) setLessonPanelHomework(null);
      })
      .finally(() => {
        if (!cancelled) setLessonPanelHomeworkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonPanelStudentId]);

  useEffect(() => {
    let cancelled = false;
    if (!eventDetailsStudentId) {
      setEventDetailsHomework(null);
      setEventDetailsHomeworkLoading(false);
      return undefined;
    }
    setEventDetailsHomeworkLoading(true);
    api.getStudentNextLesson(eventDetailsStudentId)
      .then((data) => {
        if (cancelled) return;
        const latest = data?.latest && typeof data.latest === 'object'
          ? data.latest
          : (Array.isArray(data?.homeworks) ? data.homeworks[0] : null);
        setEventDetailsHomework(latest || null);
      })
      .catch(() => {
        if (!cancelled) setEventDetailsHomework(null);
      })
      .finally(() => {
        if (!cancelled) setEventDetailsHomeworkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventDetailsStudentId]);

  useEffect(() => {
    if (!lessonInfoModalOpen) return undefined;
    let cancelled = false;
    if (!lessonInfoTargetStudentId) {
      setLessonInfoFiles([]);
      setLessonInfoLoading(false);
      setLessonInfoError('Ученик для урока не выбран.');
      return undefined;
    }
    setLessonInfoLoading(true);
    setLessonInfoError('');
    api.getFiles(lessonInfoTargetStudentId)
      .then((data) => {
        if (cancelled) return;
        setLessonInfoFiles(selectRecentLessonNoteFiles(data));
      })
      .catch((err) => {
        if (cancelled) return;
        setLessonInfoFiles([]);
        setLessonInfoError(err?.message || 'Не удалось загрузить последние конспекты.');
      })
      .finally(() => {
        if (!cancelled) setLessonInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonInfoModalOpen, lessonInfoTargetStudentId]);

  useEffect(() => {
    if (!lessonInfoModalOpen) return undefined;
    let cancelled = false;
    if (!lessonInfoTargetStudentId) {
      setLessonInfoHomework(null);
      setLessonInfoHomeworkLoading(false);
      return undefined;
    }
    setLessonInfoHomeworkLoading(true);
    api.getStudentNextLesson(lessonInfoTargetStudentId)
      .then((data) => {
        if (cancelled) return;
        const latest = data?.latest && typeof data.latest === 'object'
          ? data.latest
          : (Array.isArray(data?.homeworks) ? data.homeworks[0] : null);
        setLessonInfoHomework(latest || null);
      })
      .catch(() => {
        if (!cancelled) setLessonInfoHomework(null);
      })
      .finally(() => {
        if (!cancelled) setLessonInfoHomeworkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonInfoModalOpen, lessonInfoTargetStudentId]);

  const lessonPanelHomeworkText = String(lessonPanelHomework?.homeWork || '').trim();
  const lessonPanelHomeworkPreview = lessonPanelHomeworkText
    ? lessonPanelHomeworkText.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    : '';
  const lessonPanelHomeworkGoalCount = Array.isArray(lessonPanelHomework?.goals)
    ? lessonPanelHomework.goals.length
    : 0;
  const lessonPanelHomeworkGoalLabels = useMemo(
    () => getLessonPanelHomeworkGoalLabels(lessonPanelHomework),
    [lessonPanelHomework]
  );
  const lessonPanelHomeworkGoalsPreview = lessonPanelHomeworkGoalLabels.slice(0, 2).join('; ');
  const lessonInfoHomeworkText = String(lessonInfoHomework?.homeWork || '').trim();
  const lessonInfoHomeworkGoalCount = Array.isArray(lessonInfoHomework?.goals)
    ? lessonInfoHomework.goals.length
    : 0;
  const lessonInfoHomeworkGoalLabels = useMemo(
    () => getLessonPanelHomeworkGoalLabels(lessonInfoHomework),
    [lessonInfoHomework]
  );

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

  const quickCreateRepeatMode = useMemo(
    () => (String(quickCreateDraft?.repeatMode || REPEAT_MODE_ONCE).trim() === REPEAT_MODE_WEEKLY
      ? REPEAT_MODE_WEEKLY
      : REPEAT_MODE_ONCE),
    [quickCreateDraft]
  );

  const quickCreateWeekdayLabel = useMemo(
    () => getScheduleWeekdayMetaFromDate(quickCreateDateInputValue)?.label || '',
    [quickCreateDateInputValue]
  );

  const quickCreateIsTrialWithoutStudent = useMemo(
    () => String(quickCreateDraft?.studentId || '').trim() === TRIAL_WITHOUT_STUDENT_VALUE,
    [quickCreateDraft]
  );

  const eventDetailsTimeLabel = useMemo(() => {
    if (!eventDetails) return '--:--';
    const startMinutes = Number(eventDetails.startMinutes);
    const endMinutes = Number(eventDetails.endMinutes);
    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes)) {
      const startLabel = formatMinutesAsDisplayTime(startMinutes, use24HourFormat);
      const endLabel = formatMinutesAsDisplayTime(endMinutes, use24HourFormat);
      return `с ${startLabel} до ${endLabel}`;
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
    return `с ${startLabel} до ${endLabel}`;
  }, [eventDetails, use24HourFormat]);

  const eventDetailsIsExternal = isExternalCalendarEntry(eventDetails);

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
    const hasDateOverride = Object.prototype.hasOwnProperty.call(overrides, 'date');
    const hasWeekdayOverride = Object.prototype.hasOwnProperty.call(overrides, 'weekdayKey');
    const hasExcludedDatesOverride = Object.prototype.hasOwnProperty.call(overrides, 'excludedDates');
    if (hasDateOverride || hasWeekdayOverride) {
      if (hasDateOverride) {
        payload.date = String(overrides.date ?? '').trim();
      }
      if (hasWeekdayOverride) {
        payload.weekdayKey = String(overrides.weekdayKey ?? '').trim();
      } else if (hasDateOverride) {
        const inferredFromDate = getScheduleWeekdayMetaFromDate(payload.date)?.key || '';
        if (inferredFromDate) payload.weekdayKey = inferredFromDate;
      }
    } else {
      const dateRaw = String(eventInfo?.date || '').trim();
      if (dateRaw) payload.date = dateRaw;
      else {
        const weekdayRaw = String(eventInfo?.weekdayKey || '').trim();
        if (weekdayRaw) payload.weekdayKey = weekdayRaw;
      }
    }
    if (hasExcludedDatesOverride) {
      payload.excludedDates = normalizeExcludedDayKeys(overrides.excludedDates);
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
      if (isRecurringMatch && entry.excludedDates?.includes(dateKey)) return;
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
    if (eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy) return;
    setEventDetails(null);
    setEventEditDraft(null);
    setEventDeleteError('');
    setEventEditError('');
    setEventQuickActionError('');
  }, [dragDropBusy, eventDeleteBusy, eventEditSaving, eventQuickActionBusy]);

  const resolveColumnStartMinutesByPointer = useCallback((
    pointerEvent,
    durationMinutes = DEFAULT_EVENT_DURATION_MINUTES,
    cursorOffsetMinutes = 0
  ) => {
    const rect = pointerEvent?.currentTarget?.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) return NaN;
    const safeDuration = clampNumber(
      Math.round(Number(durationMinutes) || DEFAULT_EVENT_DURATION_MINUTES),
      15,
      360
    );
    const safeCursorOffsetMinutes = clampNumber(Number(cursorOffsetMinutes) || 0, 0, safeDuration);
    const offsetY = clampNumber((pointerEvent.clientY || 0) - rect.top, 0, rect.height);
    const pointerMinutes = dayStartMinutes + ((offsetY / rect.height) * (dayEndMinutes - dayStartMinutes));
    const rawStartMinutes = pointerMinutes - safeCursorOffsetMinutes;
    const snappedMinutes = roundMinutesToStep(rawStartMinutes, QUICK_CREATE_TIME_STEP_MINUTES);
    return clampNumber(
      snappedMinutes,
      dayStartMinutes,
      Math.max(dayStartMinutes, dayEndMinutes - safeDuration)
    );
  }, [dayEndMinutes, dayStartMinutes]);

  const handleEventDragStart = useCallback((dragEvent, calendarEvent, dayIndex, dayKey) => {
    if (isExternalCalendarEntry(calendarEvent)) {
      dragEvent.preventDefault();
      return;
    }
    if (dragDropBusy || eventDeleteBusy || eventEditSaving || eventQuickActionBusy) {
      dragEvent.preventDefault();
      return;
    }
    const eventId = String(calendarEvent?.id || '').trim();
    if (!eventId) {
      dragEvent.preventDefault();
      return;
    }
    const startMinutes = Number(calendarEvent?.startMinutes);
    if (!Number.isFinite(startMinutes)) {
      dragEvent.preventDefault();
      return;
    }
    const durationMinutes = Number.isFinite(Number(calendarEvent?.durationMinutes))
      ? Math.round(Number(calendarEvent.durationMinutes))
      : DEFAULT_EVENT_DURATION_MINUTES;
    const dragElementRect = dragEvent?.currentTarget?.getBoundingClientRect?.();
    const cursorOffsetMinutes = (
      dragElementRect
      && Number.isFinite(dragElementRect.height)
      && dragElementRect.height > 0
    )
      ? clampNumber(
          (((dragEvent.clientY || 0) - dragElementRect.top) / dragElementRect.height) * durationMinutes,
          0,
          durationMinutes
        )
      : 0;
    setQuickCreateDraft(null);
    setQuickCreateError('');
    setEventDetails(null);
    setEventEditDraft(null);
    setEventEditError('');
    setEventDeleteError('');
    setEventQuickActionError('');
    setDragDropError('');
    setDragRecurringChoiceModal(null);
    setDraggingEvent({
      eventId,
      sourceDayIndex: dayIndex,
      sourceDayKey: dayKey,
      sourceStartMinutes: startMinutes,
      durationMinutes,
      cursorOffsetMinutes,
      entry: calendarEvent,
    });
    setDragPreview({
      dayKey,
      startMinutes,
      endMinutes: startMinutes + durationMinutes,
    });
    if (dragEvent.dataTransfer) {
      dragEvent.dataTransfer.effectAllowed = 'move';
      dragEvent.dataTransfer.dropEffect = 'move';
      dragEvent.dataTransfer.setData('text/plain', eventId);
    }
  }, [dragDropBusy, eventDeleteBusy, eventEditSaving, eventQuickActionBusy]);

  const handleEventDragEnd = useCallback(() => {
    setDraggingEvent(null);
    setDragPreview(null);
    quickCreateClickSuppressedUntilRef.current = Date.now() + 180;
  }, []);

  const handleCalendarColumnDragOver = useCallback((dragEvent, dayIndex) => {
    if (!draggingEvent || dragDropBusy) return;
    const dayDate = weekDays[dayIndex];
    if (!dayDate) return;
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    if (dragEvent.dataTransfer) {
      dragEvent.dataTransfer.dropEffect = 'move';
    }
    const startMinutes = resolveColumnStartMinutesByPointer(
      dragEvent,
      draggingEvent.durationMinutes,
      draggingEvent.cursorOffsetMinutes
    );
    if (!Number.isFinite(startMinutes)) return;
    const dayKey = toDayKey(dayDate);
    setDragPreview({
      dayKey,
      startMinutes,
      endMinutes: startMinutes + draggingEvent.durationMinutes,
    });
  }, [dragDropBusy, draggingEvent, resolveColumnStartMinutesByPointer, weekDays]);

  const executeDragDropMove = useCallback(async ({
    draggedEntry,
    hasExplicitDate = false,
    targetDayKey = '',
    targetWeekdayKey = '',
    targetTime = '',
    durationMinutes = DEFAULT_EVENT_DURATION_MINUTES,
    sourceOccurrenceDayKey = '',
    moveRecurringSeries = true,
  }) => {
    if (!draggedEntry) return;
    setDragDropBusy(true);
    setDragDropError('');
    try {
      if (hasExplicitDate || moveRecurringSeries) {
        const payload = buildEventUpdatePayload(draggedEntry, hasExplicitDate
          ? {
              date: targetDayKey,
              time: targetTime,
              durationMinutes,
            }
          : {
              weekdayKey: targetWeekdayKey,
              time: targetTime,
              durationMinutes,
            });
        await updateEventOnServer(draggedEntry, payload);
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceOccurrenceDayKey)) {
          throw new Error('Не удалось определить дату конкретного занятия для переноса.');
        }
        const subject = String(
          draggedEntry?.subject
          || draggedEntry?.subjectLabel
          || draggedEntry?.studentName
          || DEFAULT_ONE_TIME_LESSON_SUBJECT
        ).trim() || DEFAULT_ONE_TIME_LESSON_SUBJECT;
        const note = typeof draggedEntry?.note === 'string' ? draggedEntry.note : '';
        const oneTimePayload = {
          date: targetDayKey,
          time: targetTime,
          subject,
          durationMinutes,
          note,
        };
        const studentId = String(draggedEntry?.studentId || '').trim();
        if (studentId) {
          await api.addScheduleEntry(studentId, oneTimePayload);
        } else {
          const teacherStudentName = String(draggedEntry?.studentName || subject).trim() || subject;
          await api.addTeacherScheduleEntry({
            ...oneTimePayload,
            studentName: teacherStudentName,
          }, teacherId);
        }
        const nextExcludedDates = normalizeExcludedDayKeys([
          ...(Array.isArray(draggedEntry?.excludedDates) ? draggedEntry.excludedDates : []),
          sourceOccurrenceDayKey,
        ]);
        const recurringPayload = buildEventUpdatePayload(draggedEntry, {
          excludedDates: nextExcludedDates,
        });
        await updateEventOnServer(draggedEntry, recurringPayload);
      }
      await loadTeacherCalendar({ silent: true });
    } catch (err) {
      setDragDropError(err?.message || 'Не удалось перенести занятие перетаскиванием.');
    } finally {
      setDragDropBusy(false);
    }
  }, [buildEventUpdatePayload, loadTeacherCalendar, teacherId, updateEventOnServer]);

  const handleCalendarColumnDrop = useCallback(async (dragEvent, dayIndex) => {
    if (!draggingEvent || dragDropBusy) return;
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    const dayDate = weekDays[dayIndex];
    if (!dayDate) {
      setDraggingEvent(null);
      setDragPreview(null);
      return;
    }
    const targetDayKey = toDayKey(dayDate);
    const targetStartMinutes = resolveColumnStartMinutesByPointer(
      dragEvent,
      draggingEvent.durationMinutes,
      draggingEvent.cursorOffsetMinutes
    );
    if (!Number.isFinite(targetStartMinutes)) {
      setDraggingEvent(null);
      setDragPreview(null);
      return;
    }
    const sourceDayKey = String(draggingEvent.sourceDayKey || '').trim();
    const sourceStartMinutes = Number(draggingEvent.sourceStartMinutes);
    const sameSlot = sourceDayKey === targetDayKey && sourceStartMinutes === targetStartMinutes;
    if (sameSlot) {
      setDraggingEvent(null);
      setDragPreview(null);
      quickCreateClickSuppressedUntilRef.current = Date.now() + 180;
      return;
    }
    const draggedEntry = draggingEvent.entry;
    const targetWeekdayKey = SCHEDULE_WEEKDAYS[dayIndex]?.key || '';
    const hasExplicitDate = Boolean(String(draggedEntry?.date || '').trim());
    const targetTime = formatMinutesAsTime(targetStartMinutes);
    const dropPayload = {
      draggedEntry,
      hasExplicitDate,
      targetDayKey,
      targetWeekdayKey,
      targetTime,
      durationMinutes: draggingEvent.durationMinutes,
      sourceOccurrenceDayKey: String(draggingEvent.sourceDayKey || '').trim(),
    };
    if (!hasExplicitDate) {
      setDragRecurringChoiceModal(dropPayload);
      setDraggingEvent(null);
      setDragPreview(null);
      quickCreateClickSuppressedUntilRef.current = Date.now() + 180;
      return;
    }
    try {
      await executeDragDropMove({
        ...dropPayload,
        moveRecurringSeries: true,
      });
    } finally {
      setDraggingEvent(null);
      setDragPreview(null);
      quickCreateClickSuppressedUntilRef.current = Date.now() + 180;
    }
  }, [
    dragDropBusy,
    draggingEvent,
    executeDragDropMove,
    resolveColumnStartMinutesByPointer,
    weekDays,
  ]);

  const closeDragRecurringChoiceModal = useCallback(() => {
    if (dragDropBusy) return;
    setDragRecurringChoiceModal(null);
  }, [dragDropBusy]);

  const handleDragRecurringChoice = useCallback(async (moveRecurringSeries) => {
    if (dragDropBusy || !dragRecurringChoiceModal) return;
    const payload = dragRecurringChoiceModal;
    setDragRecurringChoiceModal(null);
    await executeDragDropMove({
      ...payload,
      moveRecurringSeries: Boolean(moveRecurringSeries),
    });
    quickCreateClickSuppressedUntilRef.current = Date.now() + 180;
  }, [dragDropBusy, dragRecurringChoiceModal, executeDragDropMove]);

  const openQuickCreate = useCallback((dayIndex, clickEvent) => {
    if (draggingEvent || dragDropBusy) return;
    if (Date.now() < quickCreateClickSuppressedUntilRef.current) return;
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
      repeatMode: REPEAT_MODE_ONCE,
    });
    setQuickCreateError('');
  }, [dayEndMinutes, dayStartMinutes, dragDropBusy, draggingEvent, weekDays]);

  const openQuickCreateForFocusDate = useCallback(() => {
    const clampedMinutes = clampNumber(12 * 60, dayStartMinutes, dayEndMinutes - QUICK_CREATE_TIME_STEP_MINUTES);
    setQuickCreateDraft({
      dateKey: toDayKey(focusDate),
      time: formatMinutesAsTime(clampedMinutes),
      studentId: TRIAL_WITHOUT_STUDENT_VALUE,
      title: DEFAULT_ONE_TIME_LESSON_SUBJECT,
      durationMinutes: DEFAULT_EVENT_DURATION_MINUTES,
      repeatMode: REPEAT_MODE_ONCE,
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
    const repeatMode = String(quickCreateDraft.repeatMode || REPEAT_MODE_ONCE).trim() === REPEAT_MODE_WEEKLY
      ? REPEAT_MODE_WEEKLY
      : REPEAT_MODE_ONCE;
    const weekdayMeta = getScheduleWeekdayMetaFromDate(dateKey);
    if (repeatMode === REPEAT_MODE_WEEKLY && !weekdayMeta?.key) {
      setQuickCreateError('Не удалось определить день недели для повтора.');
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
      const selectedStudentName = studentNameById[studentId] || '';
      const subject = String(quickCreateDraft.title || '').trim() || (
        isTrialWithoutStudent
          ? DEFAULT_ONE_TIME_LESSON_SUBJECT
          : resolveStudentLessonSubjectFallback(selectedStudentName)
      );
      const scheduleTarget = repeatMode === REPEAT_MODE_WEEKLY
        ? { weekdayKey: weekdayMeta.key }
        : { date: dateKey };
      if (isTrialWithoutStudent) {
        await api.addTeacherScheduleEntry({
          ...scheduleTarget,
          time,
          subject,
          studentName: subject,
          durationMinutes,
          note: '',
        }, teacherId);
      } else {
        await api.addScheduleEntry(studentId, {
          ...scheduleTarget,
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
  }, [dayEndMinutes, dayStartMinutes, loadTeacherCalendar, quickCreateDraft, quickCreateSaving, studentNameById, teacherId]);

  const openEventDetailsModal = useCallback((event, dayKey) => {
    const hasStudent = Boolean(String(event?.studentId || '').trim());
    const isGroupEvent = isLearningGroupCalendarEntry(event);
    const studentName = studentNameById[event?.studentId] || event?.studentName || 'Ученик';
    const subject = String(event?.subject || '').trim();
    const subjectLabel = !hasStudent && !isGroupEvent && subject && subject.toLowerCase() !== 'занятие'
      ? subject
      : '';
    const primaryLabel = isGroupEvent
      ? String(event?.groupName || subject || 'Мини-группа').trim()
      : (hasStudent
        ? studentName
        : (subjectLabel || studentName || DEFAULT_ONE_TIME_LESSON_SUBJECT));
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
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy) return;
    if (isExternalCalendarEntry(eventDetails)) return;
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
    dragDropBusy,
    eventDeleteBusy,
    eventDetails,
    eventEditSaving,
    eventQuickActionBusy,
    loadTeacherCalendar,
    resolveEventDateKey,
    updateEventOnServer,
  ]);

  const handleMoveEventToNearestFreeSlot = useCallback(async () => {
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy) return;
    if (isExternalCalendarEntry(eventDetails)) return;
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
    dragDropBusy,
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
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy) return;
    if (isExternalCalendarEntry(eventDetails)) return;
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
    const hasStudent = Boolean(String(eventDetails.studentId || '').trim());
    const fallbackSubject = hasStudent
      ? resolveStudentLessonSubjectFallback(eventDetails.studentName)
      : DEFAULT_ONE_TIME_LESSON_SUBJECT;
    const rawSubject = String(eventDetails.subject || eventDetails.subjectLabel || '').trim();
    const subject = (
      hasStudent && rawSubject.toLowerCase() === DEFAULT_ONE_TIME_LESSON_SUBJECT.toLowerCase()
        ? fallbackSubject
        : (rawSubject || fallbackSubject)
    );
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
    dragDropBusy,
    eventDeleteBusy,
    eventDetails,
    eventEditSaving,
    eventQuickActionBusy,
    loadTeacherCalendar,
    resolveEventDateKey,
    teacherId,
  ]);

  const startEventEdit = useCallback(() => {
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy) return;
    if (isExternalCalendarEntry(eventDetails)) return;
    const hasStudent = Boolean(String(eventDetails.studentId || '').trim());
    const fallbackTitle = hasStudent
      ? resolveStudentLessonSubjectFallback(eventDetails.studentName)
      : DEFAULT_ONE_TIME_LESSON_SUBJECT;
    const rawSubject = String(eventDetails.subject || eventDetails.subjectLabel || '').trim();
    const currentTitle = (
      hasStudent && rawSubject.toLowerCase() === DEFAULT_ONE_TIME_LESSON_SUBJECT.toLowerCase()
        ? fallbackTitle
        : (rawSubject || fallbackTitle)
    );
    const baseDateKey = resolveEventDateKey(eventDetails) || toDayKey(new Date());
    const repeatMode = String(eventDetails.date || '').trim()
      ? REPEAT_MODE_ONCE
      : REPEAT_MODE_WEEKLY;
    setEventEditDraft({
      title: currentTitle,
      time: String(eventDetails.time || '').trim() || '09:00',
      durationMinutes: Number.isFinite(Number(eventDetails.durationMinutes))
        ? Math.round(Number(eventDetails.durationMinutes))
        : DEFAULT_EVENT_DURATION_MINUTES,
      repeatMode,
      dateKey: baseDateKey,
    });
    setEventDeleteError('');
    setEventEditError('');
    setEventQuickActionError('');
  }, [dragDropBusy, eventDeleteBusy, eventDetails, eventEditSaving, eventQuickActionBusy, resolveEventDateKey]);

  const cancelEventEdit = useCallback(() => {
    if (eventEditSaving) return;
    setEventEditDraft(null);
    setEventEditError('');
  }, [eventEditSaving]);

  const handleSaveEventEdit = useCallback(async () => {
    if (!eventDetails || !eventEditDraft || eventEditSaving || eventDeleteBusy || eventQuickActionBusy || dragDropBusy) return;
    if (isExternalCalendarEntry(eventDetails)) return;
    const eventId = String(eventDetails.id || '').trim();
    if (!eventId) {
      setEventEditError('Не удалось определить занятие для редактирования.');
      return;
    }

    const hasStudent = Boolean(String(eventDetails.studentId || '').trim());
    const fallbackTitle = hasStudent
      ? resolveStudentLessonSubjectFallback(eventDetails.studentName)
      : DEFAULT_ONE_TIME_LESSON_SUBJECT;
    const title = String(eventEditDraft.title || '').trim() || fallbackTitle;
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
    const repeatMode = String(eventEditDraft.repeatMode || REPEAT_MODE_ONCE).trim() === REPEAT_MODE_WEEKLY
      ? REPEAT_MODE_WEEKLY
      : REPEAT_MODE_ONCE;
    const dateKey = String(eventEditDraft.dateKey || '').trim();
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      setEventEditError('Укажите корректную дату занятия.');
      return;
    }
    const weekdayMeta = getScheduleWeekdayMetaFromDate(dateKey);
    if (!weekdayMeta?.key) {
      setEventEditError('Не удалось определить день недели для повтора.');
      return;
    }
    const repeatOverrides = repeatMode === REPEAT_MODE_WEEKLY
      ? { date: '', weekdayKey: weekdayMeta.key }
      : { date: dateKey, weekdayKey: weekdayMeta.key };

    const payload = buildEventUpdatePayload(eventDetails, {
      time,
      subject: title,
      durationMinutes,
      ...repeatOverrides,
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
    dragDropBusy,
    eventDeleteBusy,
    eventDetails,
    eventEditDraft,
    eventEditSaving,
    eventQuickActionBusy,
    loadTeacherCalendar,
    updateEventOnServer,
  ]);

  const handleDeleteEvent = useCallback(async () => {
    if (!eventDetails || eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy) return;
    if (isExternalCalendarEntry(eventDetails)) return;
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
  }, [dragDropBusy, eventDeleteBusy, eventDetails, eventEditSaving, eventQuickActionBusy, loadTeacherCalendar, teacherId]);

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
    if (!dragRecurringChoiceModal) return undefined;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (dragDropBusy) return;
      setDragRecurringChoiceModal(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [dragDropBusy, dragRecurringChoiceModal]);

  useEffect(() => {
    if (!eventDetails) return undefined;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy) return;
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
  }, [dragDropBusy, eventDeleteBusy, eventDetails, eventEditDraft, eventEditSaving, eventQuickActionBusy]);

  useEffect(() => {
    if (!lessonInfoModalOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      closeLessonInfoModal();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeLessonInfoModal, lessonInfoModalOpen]);

  return (
    <section className="teacher-calendar-shell relative h-full min-h-0 overflow-hidden rounded-none border-0 bg-slate-50 shadow-none">
      <div className="teacher-calendar-shell__glow pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden rounded-none">
        <div className="teacher-calendar-shell__topbar flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/88 px-5 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200/85 bg-white/90 text-slate-600 shadow-sm hover:bg-slate-50"
              aria-label={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
              title={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
            >
              <Menu size={16} />
            </button>
            <span className="teacher-calendar-shell__brand-mark grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-sky-500 via-indigo-500 to-teal-500 text-white shadow-[0_10px_20px_rgba(14,165,233,0.24)]">
              <CalendarDays size={14} />
            </span>
            <span className="font-display text-xl font-semibold leading-none text-slate-900">Календарь</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (availabilityShareMode ? closeAvailabilityShareMode() : openAvailabilityShareMode(4))}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                availabilityShareMode
                  ? 'border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200'
                  : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
              }`}
              aria-pressed={availabilityShareMode}
            >
              {availabilityShareMode ? <X size={14} /> : <Share2 size={14} />}
              {availabilityShareMode ? 'Выйти из режима' : 'Поделиться занятостью'}
            </button>
            {!availabilityShareMode && (
              <>
                <button
                  type="button"
                  onClick={openQuickCreateForFocusDate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/70 bg-gradient-to-r from-sky-600 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_16px_rgba(14,165,233,0.22)] hover:from-sky-700 hover:to-teal-700"
                >
                  <Plus size={14} />
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => loadTeacherCalendar({ silent: true })}
                  disabled={loading || refreshing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/85 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw size={13} className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? '...' : 'Обновить'}
                </button>
              </>
            )}
          </div>
        </div>

        <div
          className="min-h-0 flex-1 grid"
          style={{ gridTemplateColumns: `${availabilityShareMode ? 0 : (sidebarCollapsed ? 72 : 296)}px minmax(0, 1fr)` }}
        >
          <aside className={`${availabilityShareMode ? 'hidden' : ''} teacher-calendar-shell__sidebar teacher-calendar-shell__sidebar-scroll ${sidebarCollapsed ? 'w-[72px]' : 'w-[296px]'} min-h-0 overflow-y-auto overflow-x-hidden border-r border-slate-200/75 bg-white/72 p-4 backdrop-blur-md`}>
            <button
              type="button"
              onClick={openQuickCreateForFocusDate}
              className={`inline-flex w-full items-center ${sidebarCollapsed ? 'justify-center px-0' : 'justify-center'} gap-2 rounded-lg border border-sky-500/70 bg-gradient-to-r from-sky-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(14,165,233,0.2)] hover:from-sky-700 hover:to-teal-700`}
              title="Создать занятие в выбранный день"
            >
              <Plus size={16} />
              {!sidebarCollapsed && 'Создать'}
            </button>

            {!sidebarCollapsed && (
              <>
                <div className="surface-panel mt-4 rounded-lg border border-slate-200/80 bg-white/88 p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md border border-slate-200/80 bg-white/90 text-slate-600 hover:bg-slate-50"
                      onClick={() => setMiniMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                      aria-label="Предыдущий месяц"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <div className="text-sm font-semibold text-slate-800">{miniMonthLabel}</div>
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md border border-slate-200/80 bg-white/90 text-slate-600 hover:bg-slate-50"
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
                              ? 'bg-gradient-to-r from-sky-600 to-teal-600 text-white'
                              : day.inCurrentMonth
                                ? 'text-slate-700 hover:bg-slate-100'
                                : 'text-slate-400 hover:bg-slate-100'
                          } ${isToday && !isInWeek ? 'ring-1 ring-sky-400' : ''}`}
                        >
                          {day.date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="surface-panel mt-3 rounded-lg border border-slate-200/80 bg-white/88 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Календари учеников</div>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
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
                  <div className="teacher-calendar-shell__sidebar-scroll mt-2 max-h-48 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
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

                <div className="surface-panel mt-3 rounded-lg border border-slate-200/80 bg-white/88 p-3 shadow-sm">
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

                <div className="surface-panel mt-3 rounded-lg border border-slate-200/80 bg-white/88 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Google Calendar</div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      calendarSyncSettings?.configured
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}>
                      {calendarSyncSettings?.configured ? googleEventsThisWeek.length : 'off'}
                    </span>
                  </div>
                  <form onSubmit={handleSaveCalendarSync} className="mt-2 space-y-2">
                    <input
                      type="url"
                      value={calendarSyncUrl}
                      onChange={(event) => {
                        setCalendarSyncUrl(event.target.value);
                        setCalendarSyncError('');
                        setCalendarSyncSuccess('');
                      }}
                      placeholder={calendarSyncSettings?.configured ? 'Новая iCal-ссылка' : 'Secret iCal URL'}
                      disabled={calendarSyncSaving || calendarSyncRefreshing}
                      className="w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="submit"
                        disabled={calendarSyncSaving || calendarSyncRefreshing || !calendarSyncUrl.trim()}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-500/70 bg-violet-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Link2 size={12} />
                        {calendarSyncSettings?.configured ? 'Заменить' : 'Подключить'}
                      </button>
                      <button
                        type="button"
                        onClick={handleRefreshCalendarSync}
                        disabled={calendarSyncRefreshing || calendarSyncSaving || !calendarSyncSettings?.configured}
                        className="grid h-8 w-8 place-items-center rounded-xl border border-purple-200 bg-white text-purple-600 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Обновить Google Calendar"
                        title="Обновить Google Calendar"
                      >
                        <RefreshCcw size={13} className={calendarSyncRefreshing ? 'animate-spin' : ''} />
                      </button>
                      <button
                        type="button"
                        onClick={handleDisableCalendarSync}
                        disabled={calendarSyncSaving || calendarSyncRefreshing || !calendarSyncSettings?.configured}
                        className="grid h-8 w-8 place-items-center rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Отключить Google Calendar"
                        title="Отключить Google Calendar"
                      >
                        <Unlink size={13} />
                      </button>
                    </div>
                  </form>
                  {calendarSyncLoading && (
                    <div className="mt-2 text-[11px] text-slate-500">Загрузка...</div>
                  )}
                  {calendarSyncSettings?.configured && (
                    <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                      <div className="truncate">{calendarSyncSettings.calendarName || calendarSyncSettings.maskedUrl}</div>
                      <div>{`Автообновление: ${GOOGLE_CALENDAR_AUTO_REFRESH_LABEL}`}</div>
                      <div className="rounded-lg border border-violet-100 bg-violet-50 px-2 py-1.5 text-violet-700">
                        Для мини-группы назовите событие точно как группу, например «Группа 1». Название группы должно быть уникальным; событие появится у всех участников.
                      </div>
                      {calendarSyncSettings.lastFetchedAt && (
                        <div>{`Синхр.: ${formatCalendarSyncTimestamp(calendarSyncSettings.lastFetchedAt)}`}</div>
                      )}
                    </div>
                  )}
                  {calendarSyncError && (
                    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-600">
                      {calendarSyncError}
                    </div>
                  )}
                  {!calendarSyncError && calendarSyncSettings?.lastError && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-700">
                      {calendarSyncSettings.lastError}
                    </div>
                  )}
                  {calendarSyncSuccess && (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-700">
                      {calendarSyncSuccess}
                    </div>
                  )}
                  {upcomingGoogleEvents.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {upcomingGoogleEvents.map((event) => (
                        <button
                          key={`google-shortcut-${event.id || `${event.dayKey}-${event.time}`}`}
                          type="button"
                          onClick={() => {
                            const date = parseDayKeyToDate(event.dayKey);
                            if (date) setFocusDate(cloneAsDateOnly(date));
                            openEventDetailsModal(event, event.dayKey);
                          }}
                          className="w-full rounded-lg border border-sky-100 bg-sky-50/80 px-2 py-1.5 text-left hover:border-sky-200 hover:bg-sky-100/70"
                        >
                          <div className="truncate text-[11px] font-semibold text-slate-800">
                            {String(event.groupName || event.studentName || event.subject || 'Google Calendar').trim()}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {formatDayMonth(new Date(`${event.dayKey}T00:00:00`))}, {formatMinutesAsDisplayTime(event.startMinutes, use24HourFormat)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>

          <div
            className="teacher-calendar-shell__main flex min-h-0 min-w-0 flex-1 flex-col bg-white/80 backdrop-blur-[2px]"
            style={availabilityShareMode ? { gridColumn: '1 / -1' } : undefined}
          >
            <div className="teacher-calendar-shell__toolbar border-b border-slate-200/80 bg-white/84 px-5 py-3 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFocusDate(cloneAsDateOnly(new Date()))}
                    className="rounded-lg border border-slate-200/85 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50"
                  >
                    Сегодня
                  </button>
                  <button
                    type="button"
                    onClick={() => setFocusDate((prev) => addDays(prev, -7))}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200/85 bg-white/90 text-slate-600 shadow-sm hover:bg-slate-50"
                    aria-label="Предыдущая неделя"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFocusDate((prev) => addDays(prev, 7))}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200/85 bg-white/90 text-slate-600 shadow-sm hover:bg-slate-50"
                    aria-label="Следующая неделя"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <div className="ml-2 font-display text-[30px] leading-none text-slate-900">{weekTitle}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="teacher-calendar-shell__metric-chip rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                    {weekRangeLabel}
                  </span>
                  <span className="teacher-calendar-shell__metric-chip rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                    {timezoneLabel}
                  </span>
                  <span className="teacher-calendar-shell__metric-chip rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                    Слотов: {availabilityShareMode ? availabilityShareLessonsCount : visibleLessonsCount}
                  </span>
                </div>
              </div>
              <div className={`mt-3 flex flex-wrap items-center gap-2 ${availabilityShareMode ? 'hidden' : ''}`}>
                <label className="relative min-w-[260px] flex-1 md:max-w-md">
                  <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Поиск..."
                    className="w-full rounded-lg border border-slate-200/85 bg-white/95 py-2 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
                  className="rounded-lg border border-slate-200/85 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
                <div className="teacher-calendar-shell__segmented inline-flex items-center overflow-hidden rounded-lg border border-slate-200/85 bg-white/95 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setLessonTypeFilter(LESSON_FILTER_ALL)}
                    className={`px-3 py-2 ${lessonTypeFilter === LESSON_FILTER_ALL ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    Все
                  </button>
                  <button
                    type="button"
                    onClick={() => setLessonTypeFilter(LESSON_FILTER_TRIAL)}
                    className={`border-l border-slate-100 px-3 py-2 ${lessonTypeFilter === LESSON_FILTER_TRIAL ? 'bg-sky-100 text-sky-700' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    Пробные
                  </button>
                  <button
                    type="button"
                    onClick={() => setLessonTypeFilter(LESSON_FILTER_STUDENT)}
                    className={`border-l border-slate-100 px-3 py-2 ${lessonTypeFilter === LESSON_FILTER_STUDENT ? 'bg-emerald-100 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    С учениками
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWeekends((prev) => !prev)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    showWeekends
                      ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {showWeekends ? '7 дней' : '5 дней'}
                </button>
                <button
                  type="button"
                  onClick={() => setUse24HourFormat((prev) => !prev)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    use24HourFormat
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {use24HourFormat ? '24ч' : '12ч'}
                </button>
                <button
                  type="button"
                  onClick={() => setCompactMode((prev) => !prev)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    compactMode
                      ? 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Плотно
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarSettingsOpen((prev) => !prev)}
                  aria-expanded={calendarSettingsOpen}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    calendarSettingsOpen
                      ? 'border-indigo-300 bg-indigo-100 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal size={12} />
                  Настройки
                </button>
              </div>
              {availabilityShareMode && (
                <div className="mt-3 rounded-xl border border-violet-200/80 bg-violet-50/70 p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-violet-800">Режим отправки занятости</div>
                      <div className="mt-1 text-[11px] text-violet-700">
                        Имена скрыты, на карточках показано только «Занятие». Неделя: {availabilityShareWeekLabel}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[4, 5].map((offsetWeeks) => (
                        <button
                          key={`availability-offset-${offsetWeeks}`}
                          type="button"
                          onClick={() => handleAvailabilityShareOffsetChange(offsetWeeks)}
                          className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                            availabilityShareOffsetWeeks === offsetWeeks
                              ? 'border-violet-500 bg-violet-600 text-white'
                              : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-100'
                          }`}
                        >
                          Через {offsetWeeks} {offsetWeeks === 5 ? 'недель' : 'недели'}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={generateAvailabilityShareImage}
                        disabled={availabilityShareBusy}
                        className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ImageDown size={12} />
                        {availabilityShareBusy ? 'Формируем...' : 'Обновить PNG'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadAvailabilityShareImage}
                        disabled={!availabilityShareImage || availabilityShareBusy}
                        className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ImageDown size={12} /> Скачать PNG
                      </button>
                      <button
                        type="button"
                        onClick={handleNativeAvailabilityShare}
                        disabled={!availabilityShareImage || availabilityShareBusy}
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Share2 size={12} /> Отправить
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-violet-700">
                    <span>{availabilityShareBusy ? 'Готовим изображение недели...' : (availabilityShareSuccess || 'Изображение сформируется автоматически.')}</span>
                    {availabilityShareError && <span className="font-semibold text-rose-600">{availabilityShareError}</span>}
                  </div>
                  {availabilityShareImage?.url && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-violet-200 bg-white p-2">
                      <img
                        src={availabilityShareImage.url}
                        alt={`Предпросмотр занятости на неделю ${availabilityShareWeekLabel}`}
                        className="block max-h-[360px] w-full object-contain"
                      />
                    </div>
                  )}
                </div>
              )}
              {!availabilityShareMode && calendarSettingsOpen && (
                <div className="mt-3 rounded-lg border border-slate-200/80 bg-white/86 p-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowConflictsOnly((prev) => !prev)}
                      className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold ${
                        showConflictsOnly
                          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {showConflictsOnly ? 'Показать все' : 'Только конфликты'}
                    </button>
                    <button
                  type="button"
                  onClick={handleToggleTeacherReminder}
                  disabled={teacherReminderLoading || teacherReminderSaving || pushSyncing || pushBusy || !pushReady}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${
                    !pushEnabled
                      ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                      : (teacherReminderEnabled
                          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100')
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {(pushEnabled && teacherReminderEnabled) ? <BellOff size={12} /> : <Bell size={12} />}
                  {teacherReminderSaving
                    ? 'Сохраняем...'
                    : (!pushEnabled
                        ? 'Включить push'
                        : (teacherReminderEnabled ? 'Отключить напоминания' : 'Включить напоминания'))}
                </button>
                <button
                  type="button"
                  onClick={handleSendTeacherTestPush}
                  disabled={teacherReminderLoading || teacherReminderSaving || teacherTestPushSending || pushSyncing || pushBusy || !pushReady}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Bell size={12} />
                  {teacherTestPushSending ? 'Отправляем тест...' : 'Тест push'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBrowserAlarmEnabled((prev) => !prev);
                    setBrowserAlarmError('');
                    setBrowserAlarmSuccess('');
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${
                    browserAlarmEnabled
                      ? 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Bell size={12} />
                  {browserAlarmEnabled ? `Будильник: ${BROWSER_ALARM_LEAD_MINUTES}м` : 'Будильник выкл'}
                </button>
                <button
                  type="button"
                  onClick={handleBrowserAlarmTest}
                  disabled={browserAlarmTesting}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Bell size={12} />
                  {browserAlarmTesting ? 'Проверяем звук...' : 'Тест будильник'}
                </button>
                <button
                  type="button"
                  onClick={() => browserAlarmFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
                >
                  <Plus size={12} />
                  Файл мелодии
                </button>
                <input
                  ref={browserAlarmFileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleBrowserAlarmFileSelect}
                  className="hidden"
                />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="url"
                      value={browserAlarmCustomMelodyUrl}
                      onChange={(event) => setBrowserAlarmCustomMelodyUrl(event.target.value)}
                      placeholder="Ссылка на кастомную мелодию (mp3/ogg/wav)"
                      className="min-w-[240px] flex-1 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                    />
                    {browserAlarmUploadedMelodyName && (
                      <button
                        type="button"
                        onClick={clearBrowserAlarmUploadedMelody}
                        className="rounded-full border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                      >
                        Убрать файл: {browserAlarmUploadedMelodyName}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {(teacherReminderError || teacherTestPushError || (pushError && pushError !== teacherReminderStatusText)) && (
                <div className="mt-1 text-xs text-rose-600">
                  {teacherReminderError || teacherTestPushError || pushError}
                </div>
              )}
              {teacherTestPushSuccess && (
                <div className="mt-1 text-xs text-emerald-700">
                  {teacherTestPushSuccess}
                </div>
              )}
              {(browserAlarmError || browserAlarmSuccess) && (
                <div className={`mt-1 text-xs ${browserAlarmError ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {browserAlarmError || browserAlarmSuccess}
                </div>
              )}
              {browserAlarmRinging && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2">
                  <div className="text-xs font-semibold text-rose-800">
                    Будильник: {browserAlarmRinging.title} • {browserAlarmRinging.dateLabel}, {browserAlarmRinging.timeLabel}
                  </div>
                  <button
                    type="button"
                    onClick={stopBrowserAlarm}
                    className="rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Остановить
                  </button>
                </div>
              )}
              {error && (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                  {error}
                </div>
              )}
              {dragDropError && (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  {dragDropError}
                </div>
              )}
              {dragDropBusy && (
                <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700">
                  Сохраняем перенос занятия...
                </div>
              )}
            </div>

            <div className={`${availabilityShareMode ? 'hidden' : ''} teacher-calendar-shell__lesson-strip border-b border-slate-200/80 bg-white/82 px-5 py-3 backdrop-blur-md`}>
              <div
                className={`teacher-calendar-shell__lesson-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/86 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition ${
                  lessonPanelHasStudent || lessonPanelCanOpenGroup ? 'cursor-pointer hover:border-sky-300/80 hover:bg-sky-50/70 focus:outline-none focus:ring-2 focus:ring-sky-300/60' : ''
                }`}
                onClick={handleLessonPanelClick}
                onKeyDown={handleLessonPanelKeyDown}
                tabIndex={lessonPanelHasStudent || lessonPanelCanOpenGroup ? 0 : undefined}
                aria-label={lessonPanelHasStudent || lessonPanelCanOpenGroup ? `Открыть занятие: ${lessonPanelStudentName}` : undefined}
              >
                <div className="min-w-[260px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                      lessonPanelInfo?.status === 'current'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    }`}>
                      {lessonPanelInfo ? lessonPanelStatusLabel : 'Пульт урока'}
                    </span>
                    {lessonPanelInfo && (
                      <span className="text-xs font-semibold text-slate-500">
                        {lessonPanelDateLabel}, {lessonPanelTimeLabel}
                      </span>
                    )}
                    {lessonPanelInfo && isExternalCalendarEntry(lessonPanelInfo.event) && (
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                        Google
                      </span>
                    )}
                    {lessonPanelStudentSelected && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        выбран
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <div className="truncate text-lg font-black text-slate-900">
                      {lessonPanelInfo ? lessonPanelStudentName : 'Нет ближайшего урока'}
                    </div>
                    {lessonPanelSubject && lessonPanelSubject !== lessonPanelStudentName && (
                      <div className="truncate text-xs font-semibold text-slate-500">{lessonPanelSubject}</div>
                    )}
                  </div>
                  {lessonPanelIsGroup ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-violet-700">
                      <Users size={13} />
                      <span>{`${lessonPanelGroupParticipants.length} ${pluralizeRu(lessonPanelGroupParticipants.length, 'ученик', 'ученика', 'учеников')} • групповое занятие через Телемост`}</span>
                      {lessonPanelGroupNotStarted && <span className="font-semibold text-amber-700">Телемост откроется в начале занятия</span>}
                    </div>
                  ) : lessonPanelHasStudent ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {lessonPanelHomeworkLoading ? (
                        <span>Домашка загружается...</span>
                      ) : lessonPanelHomework ? (
                        <>
                          <span>{lessonPanelHomeworkPreview || 'Домашка без текста'}</span>
                          {lessonPanelHomeworkGoalsPreview ? (
                            <span>{lessonPanelHomeworkGoalsPreview}</span>
                          ) : lessonPanelHomeworkGoalCount > 0 && (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 font-semibold text-purple-700">
                              целей: {lessonPanelHomeworkGoalCount}
                            </span>
                          )}
                        </>
                      ) : (
                        <span>Домашка пока не задана</span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] text-slate-500">
                      {lessonPanelInfo ? 'Ученик не сопоставлен.' : 'В ближайшие 14 дней занятий не найдено.'}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {lessonPanelIsGroup ? (
                    <>
                      {lessonPanelGroupLink && (
                        <button
                          type="button"
                          onClick={() => openLessonPanelGroupWorkspace('call')}
                          disabled={!lessonPanelGroupCanOpenTelemost || typeof onOpenLearningGroupTelemost !== 'function'}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                        >
                          <ExternalLink size={12} /> Телемост
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={openLessonPanelCall}
                        disabled={!lessonPanelGroupCanOpenTelemost}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Clock3 size={12} /> Комната группы
                      </button>
                      <button
                        type="button"
                        onClick={() => openLessonPanelGroupWorkspace('board')}
                        disabled={!lessonPanelCanOpenGroup}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Brush size={12} /> Общая доска
                      </button>
                      <button
                        type="button"
                        onClick={() => openLessonPanelGroupWorkspace('collab')}
                        disabled={!lessonPanelCanOpenGroup}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Code2 size={12} /> Общий код
                      </button>
                    </>
                  ) : (
                    <>
                  <button
                    type="button"
                    onClick={openLessonInfoModal}
                    disabled={!lessonPanelHasStudent}
                    title="Вспомнить прошлый урок"
                    aria-label="Вспомнить прошлый урок"
                  className="inline-grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Info size={14} />
                  </button>
                  {lessonPanelLink && (
                    <button
                      type="button"
                      onClick={openLessonPanelLink}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                    >
                      <ExternalLink size={12} />
                      Ссылка
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openLessonPanelCall}
                    disabled={!lessonPanelHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Clock3 size={12} />
                    Созвон
                  </button>
                  <button
                    type="button"
                    onClick={() => openLessonPanelWorkspace('board')}
                    disabled={!lessonPanelHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Brush size={12} />
                    Доска
                  </button>
                  <button
                    type="button"
                    onClick={() => openLessonPanelWorkspace('collab-save')}
                    disabled={!lessonPanelHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Code2 size={12} />
                    Код в конспект
                  </button>
                  <button
                    type="button"
                    onClick={() => openLessonPanelWorkspace('notes')}
                    disabled={!lessonPanelHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BookOpen size={12} />
                    Конспекты
                  </button>
                  <button
                    type="button"
                    onClick={() => openLessonPanelWorkspace('schedule')}
                    disabled={!lessonPanelHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileText size={12} />
                    Домашка
                  </button>
                  <button
                    type="button"
                    onClick={() => openLessonPanelWorkspace('progress')}
                    disabled={!lessonPanelHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle size={12} />
                    Задания
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLessonPanelFinanceAction('completed')}
                    disabled={!lessonPanelHasStudent || Boolean(lessonPanelFinanceBusy)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      lessonPanelCompletedMarked
                        ? 'border-teal-300 bg-teal-100 text-teal-800 hover:bg-teal-50'
                        : 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                    }`}
                  >
                    <CheckCircle size={12} />
                    {lessonPanelFinanceBusy === 'completed' || lessonPanelFinanceBusy === 'completed-undo'
                      ? '...'
                      : (lessonPanelCompletedMarked ? 'Отменить урок' : '+ урок')}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCalendarTrialMark(lessonPanelTrialMarkKey)}
                    disabled={!lessonPanelInfo || Boolean(lessonPanelFinanceBusy)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      lessonPanelTrialMarked
                        ? 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-50'
                        : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    <Info size={12} />
                    {lessonPanelFinanceBusy === 'trial' || lessonPanelFinanceBusy === 'trial-undo'
                      ? '...'
                      : (lessonPanelTrialMarked ? 'Не пробное' : 'Пробное')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLessonPanelFinanceAction('paid')}
                    disabled={!lessonPanelInfo || Boolean(lessonPanelFinanceBusy)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      lessonPanelPaidMarked
                        ? 'border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-50'
                        : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    <Wallet size={12} />
                    {lessonPanelFinanceBusy === 'paid' || lessonPanelFinanceBusy === 'paid-undo'
                      ? '...'
                      : (lessonPanelPaidMarked ? 'Отменить оплату' : '+ оплата')}
                  </button>
                    </>
                  )}
                </div>
              </div>
              {(lessonPanelError || lessonPanelSuccess) && (
                <div className={`mt-1 text-xs ${lessonPanelError ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {lessonPanelError || lessonPanelSuccess}
                </div>
              )}
            </div>

            <div className="teacher-calendar-shell__grid-wrap min-h-0 flex-1 overflow-hidden">
              <div className="flex h-full min-h-0 flex-col">
                <div
                  className="teacher-calendar-shell__grid-header grid border-b border-slate-200/80 bg-white/88"
                  style={{ gridTemplateColumns: `78px repeat(${visibleDayIndexes.length}, minmax(0, 1fr))` }}
                >
                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {timezoneLabel}
                  </div>
                  {visibleDayIndexes.map((dayIndex) => {
                    const date = weekDays[dayIndex];
                    if (!date) return null;
                    const dayKey = toDayKey(date);
                    const isToday = dayKey === todayKey;
                    const isFocused = dayKey === toDayKey(focusDate);
                    return (
                      <div key={`calendar-day-header-${dayKey}`} className="teacher-calendar-shell__day-header-cell border-l border-slate-200 px-3 py-2 text-center">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {SCHEDULE_WEEKDAYS[dayIndex]?.shortLabel || ''}
                        </div>
                        <div
                          className={`teacher-calendar-shell__day-number mt-1 inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-2xl leading-none ${
                            isFocused || isToday ? 'bg-gradient-to-r from-sky-600 to-teal-600 text-white shadow-[0_8px_18px_rgba(14,165,233,0.22)]' : 'text-slate-800'
                          }`}
                        >
                          {date.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div ref={timelineViewportRef} className="teacher-calendar-shell__timeline-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                  {loading && entries.length === 0 ? (
                    <div className="flex h-full min-h-[180px] items-center justify-center gap-2 text-sm font-medium text-slate-600">
                      <RefreshCcw size={15} className="animate-spin" />
                      Загружаем календарь...
                    </div>
                  ) : (
                    <>
                      {(availabilityShareMode ? availabilityShareLessonsCount : visibleLessonsCount) === 0 && (
                        <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
                          {availabilityShareMode
                            ? 'На этой неделе нет занятых слотов.'
                            : (normalizedSearchQuery
                                ? 'По текущему поиску и фильтрам ничего не найдено.'
                                : 'Кликните по свободному месту в сетке, чтобы добавить разовое занятие.')}
                        </div>
                      )}
                      <div
                        ref={calendarGridRef}
                        className="grid"
                        style={{ gridTemplateColumns: `78px repeat(${visibleDayIndexes.length}, minmax(0, 1fr))` }}
                      >
                        <div className="teacher-calendar-shell__time-col relative border-r border-slate-200/80 bg-white/85" style={{ height: `${calendarHeight}px` }}>
                          {hourTicks.map((hour, index) => (
                            <div
                              key={`time-label-${hour}`}
                              className="absolute left-0 right-0 -translate-y-1/2 px-3 text-right text-[11px] text-slate-500"
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
                          const events = availabilityShareMode
                            ? (availabilityShareEventsByDayIndex[dayIndex] || [])
                            : (displayEventsByDayIndex[dayIndex] || []);
                          return (
                            <div
                              key={`day-column-${dayKey}`}
                              className={`teacher-calendar-shell__day-col relative cursor-pointer border-r border-slate-200/80 transition-colors ${dayColumnIndex === visibleDayIndexes.length - 1 ? 'border-r-0' : ''} ${
                                isToday ? 'teacher-calendar-shell__day-col--today bg-sky-50/70' : 'bg-white/75 hover:bg-slate-50/70'
                              } ${dragPreview?.dayKey === dayKey ? 'teacher-calendar-shell__day-col--drag bg-sky-100/70' : ''}`}
                              style={{ height: `${calendarHeight}px` }}
                              onClick={(event) => {
                                if (!availabilityShareMode) openQuickCreate(dayIndex, event);
                              }}
                              onDragOver={(event) => {
                                if (!availabilityShareMode) handleCalendarColumnDragOver(event, dayIndex);
                              }}
                              onDrop={(event) => {
                                if (!availabilityShareMode) handleCalendarColumnDrop(event, dayIndex);
                              }}
                              aria-label={availabilityShareMode ? 'Занятость преподавателя' : 'Добавить разовое занятие'}
                            >
                              {hourTicks.map((hour, index) => (
                                <div
                                  key={`grid-line-${dayKey}-${hour}`}
                                  className="teacher-calendar-shell__grid-line absolute left-0 right-0 border-t border-slate-200/75"
                                  style={{ top: `${index * hourHeight}px` }}
                                />
                              ))}
                              {isToday && currentTimeLineTop !== null && (
                                <div
                                  className="pointer-events-none absolute left-0 right-0 z-30"
                                  style={{ top: `${currentTimeLineTop}px` }}
                                  aria-hidden="true"
                                >
                                  <div className="absolute left-0 right-0 top-0 border-t-2 border-red-500" />
                                  <div className="absolute -left-[5px] -top-[5px] h-[11px] w-[11px] rounded-full bg-red-500 shadow-[0_0_0_2px_rgba(255,255,255,0.9)]" />
                                </div>
                              )}
                              {dragPreview?.dayKey === dayKey && (
                                <div
                                  className="pointer-events-none absolute left-[4px] right-[4px] z-20 overflow-hidden rounded-md border-2 border-dashed border-sky-500 bg-sky-200/45"
                                  style={{
                                    top: `${((dragPreview.startMinutes - dayStartMinutes) / 60) * hourHeight + 1}px`,
                                    height: `${Math.max(
                                      26,
                                      ((dragPreview.endMinutes - dragPreview.startMinutes) / 60) * hourHeight - 2
                                    )}px`,
                                  }}
                                >
                                  <div className="px-2 py-1 text-[10px] font-semibold text-sky-900">
                                    {`${formatMinutesAsDisplayTime(dragPreview.startMinutes, use24HourFormat)}-${formatMinutesAsDisplayTime(dragPreview.endMinutes, use24HourFormat)}`}
                                  </div>
                                </div>
                              )}

                              {events.map((event, index) => {
                                const top = ((event.startMinutes - dayStartMinutes) / 60) * hourHeight + 1;
                                const height = Math.max(
                                  26,
                                  ((event.endMinutes - event.startMinutes) / 60) * hourHeight - 2
                                );
                                const hasStudent = Boolean(String(event.studentId || '').trim());
                                const isGroupEvent = isLearningGroupCalendarEntry(event);
                                const groupName = String(event.groupName || event.subject || 'Мини-группа').trim();
                                const groupParticipants = getLearningGroupCalendarParticipants(event, studentNameById);
                                const studentName = studentNameById[event.studentId] || event.studentName || 'Ученик';
                                const subject = String(event.subject || '').trim();
                                const subjectLabel = !hasStudent && !isGroupEvent && subject && subject.toLowerCase() !== 'занятие'
                                  ? subject
                                  : '';
                                const primaryLabel = isGroupEvent
                                  ? groupName
                                  : (hasStudent
                                    ? studentName
                                    : (subjectLabel || studentName || DEFAULT_ONE_TIME_LESSON_SUBJECT));
                                const showSubjectInCard = Boolean(subjectLabel && subjectLabel !== primaryLabel);
                                const cardPrimaryLabel = availabilityShareMode ? 'Занятие' : primaryLabel;
                                const cardShowSubject = !availabilityShareMode && showSubjectInCard;
                                const startLabel = formatMinutesAsDisplayTime(event.startMinutes, use24HourFormat);
                                const endLabel = formatMinutesAsDisplayTime(event.endMinutes, use24HourFormat);
                                const externalEvent = isExternalCalendarEntry(event);
                                const defaultColor = externalEvent
                                  ? '#2563eb'
                                  : getEventColor(event.studentId || studentName || `${dayIndex}-${index}`);
                                const paymentState = getCalendarLessonPaymentState(
                                  teacherId,
                                  { event, dayKey },
                                  lessonPanelMarks,
                                  currentTimeLineNow
                                );
                                const groupPaymentState = isGroupEvent
                                  ? getLearningGroupPaymentState(
                                    teacherId,
                                    { event, dayKey },
                                    lessonPanelMarks,
                                    currentTimeLineNow,
                                    studentNameById
                                  )
                                  : null;
                                const eventFinished = paymentState.finished;
                                const paidMarked = paymentState.paidMarked;
                                const trialMarked = paymentState.trialMarked;
                                const color = isGroupEvent
                                  ? (groupPaymentState?.allSettled
                                    ? CALENDAR_PAID_EVENT_COLOR
                                    : (groupPaymentState?.partiallySettled
                                      ? CALENDAR_PARTIAL_PAYMENT_EVENT_COLOR
                                      : (eventFinished ? CALENDAR_UNPAID_PAST_EVENT_COLOR : defaultColor)))
                                  : (trialMarked
                                    ? CALENDAR_TRIAL_EVENT_COLOR
                                    : (paidMarked
                                      ? CALENDAR_PAID_EVENT_COLOR
                                      : (eventFinished ? CALENDAR_UNPAID_PAST_EVENT_COLOR : defaultColor)));
                                const cardColor = availabilityShareMode ? '#2563eb' : color;
                                const paymentStateLabel = isGroupEvent
                                  ? ` • оплачено ${groupPaymentState?.paidCount || 0} из ${groupPaymentState?.totalCount || groupParticipants.length}`
                                  : (trialMarked
                                    ? ' • пробное занятие'
                                    : (paidMarked
                                      ? ' • оплата отмечена'
                                      : (eventFinished ? ' • оплата не отмечена' : '')));
                                const paymentColorApplied = isGroupEvent
                                  ? Boolean(groupPaymentState?.settledCount || eventFinished)
                                  : (trialMarked || paidMarked || eventFinished);
                                const homeworkProgress = !availabilityShareMode && !trialMarked && isCalendarLessonUpcoming(
                                  dayKey,
                                  event.startMinutes,
                                  currentTimeLineNow
                                )
                                  ? resolveCalendarEventHomeworkProgress(event, dayKey, event.startMinutes)
                                  : null;
                                const homeworkProgressPercent = homeworkProgress
                                  ? Math.max(0, Math.min(100, Math.round(Number(homeworkProgress.percent) || 0)))
                                  : null;
                                const homeworkProgressLabel = homeworkProgressPercent == null
                                  ? ''
                                  : ` • домашняя работа выполнена на ${homeworkProgressPercent}%`;
                                const laneWidth = 100 / Math.max(1, event.laneCount || 1);
                                const left = (event.lane || 0) * laneWidth;
                                const hasConflict = Number(event.laneCount || 1) > 1;
                                return (
                                  <div
                                    key={event.id || `${dayKey}-${event.time}-${event.studentId}-${index}`}
                                    aria-label={`${availabilityShareMode ? '' : (externalEvent ? 'Google Calendar • ' : '')}${cardPrimaryLabel}${cardShowSubject ? ` • ${subjectLabel}` : ''} • с ${startLabel} до ${endLabel}${availabilityShareMode ? '' : `${paymentStateLabel}${homeworkProgressLabel}`}`}
                                    title={availabilityShareMode ? undefined : (homeworkProgressPercent == null ? undefined : `Домашняя работа: ${homeworkProgressPercent}%`)}
                                    data-homework-progress={availabilityShareMode ? undefined : (homeworkProgressPercent == null ? undefined : homeworkProgressPercent)}
                                    className={`teacher-calendar-shell__event-card absolute z-10 overflow-hidden rounded-md border px-2 py-1 text-white shadow-[0_8px_18px_rgba(15,23,42,0.16)] ${!availabilityShareMode && externalEvent && !paymentColorApplied ? 'ring-1 ring-sky-200/80 ring-offset-1 ring-offset-white' : ''} ${hasConflict ? 'ring-2 ring-rose-300 ring-offset-1 ring-offset-white' : ''}`}
                                    draggable={!availabilityShareMode && !externalEvent && !dragDropBusy && !eventDeleteBusy && !eventEditSaving && !eventQuickActionBusy}
                                    style={{
                                      top: `${top}px`,
                                      height: `${height}px`,
                                      left: `calc(${left}% + 3px)`,
                                      width: `calc(${laneWidth}% - 6px)`,
                                      '--calendar-event-color': cardColor,
                                      background: availabilityShareMode || homeworkProgressPercent == null
                                        ? buildEventCardBackground(cardColor)
                                        : buildEventCardHomeworkProgressBackground(cardColor, homeworkProgressPercent),
                                      borderColor: mixHexColor(cardColor, '#020617', 0.14),
                                      boxShadow: `0 10px 22px ${hexToRgba(cardColor, 0.22)}, inset 0 1px 0 rgba(255, 255, 255, 0.2)`,
                                      cursor: availabilityShareMode ? 'default' : (dragDropBusy ? 'progress' : (externalEvent ? 'pointer' : 'grab')),
                                      opacity: draggingEvent?.eventId === String(event.id || '').trim() ? 0.65 : 1,
                                    }}
                                    onDragStart={(eventDrag) => handleEventDragStart(eventDrag, event, dayIndex, dayKey)}
                                    onDragEnd={handleEventDragEnd}
                                    onClick={(eventClick) => {
                                      eventClick.stopPropagation();
                                      if (availabilityShareMode || dragDropBusy || Date.now() < quickCreateClickSuppressedUntilRef.current) return;
                                      openEventDetailsModal(event, dayKey);
                                    }}
                                  >
                                    <div className="truncate text-[11px] font-bold leading-tight">{cardPrimaryLabel}</div>
                                    {isGroupEvent && !availabilityShareMode && (
                                      <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold leading-tight text-white/95">
                                        <Users size={10} />
                                        <span>{`${groupParticipants.length} уч. • оплачено ${groupPaymentState?.paidCount || 0}/${groupPaymentState?.totalCount || groupParticipants.length}`}</span>
                                      </div>
                                    )}
                                    {cardShowSubject && (
                                      <div className="truncate text-[10px] font-semibold leading-tight text-white/95">
                                        {subjectLabel}
                                      </div>
                                    )}
                                    <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-white/90">
                                      <Clock3 size={10} />
                                      {`${startLabel}-${endLabel}`}
                                      {externalEvent && !availabilityShareMode && <span className="ml-1 rounded bg-white/20 px-1">Google</span>}
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
      </div>
      <div className={`${availabilityShareMode ? 'hidden' : ''} teacher-calendar-shell__payment-reminder pointer-events-none absolute right-5 top-[18rem] z-30 flex justify-end`}>
        {paymentReminderOpen ? (
          <div className="teacher-calendar-shell__payment-reminder-panel pointer-events-auto w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-rose-200/80 bg-white/95 shadow-[0_22px_60px_rgba(15,23,42,0.22)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-rose-100 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Bell size={15} className={paymentReminderLessonCount > 0 ? 'text-rose-500' : 'text-emerald-500'} />
                  Напомнить об оплате
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  Эта и прошлая неделя
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentReminderOpen(false)}
                className="inline-grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                aria-label="Скрыть напоминалку оплаты"
              >
                <X size={14} />
              </button>
            </div>

            <div className="px-4 py-3">
              {paymentReminderLessonCount > 0 ? (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                      {formatPaymentReminderStudentCount(paymentReminderStudentCount)}
                    </span>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                      {formatPaymentReminderLessonCount(paymentReminderLessonCount)}
                    </span>
                  </div>
                  <div className="teacher-calendar-shell__payment-reminder-list space-y-2 overflow-y-auto pr-1">
                    {paymentReminderLessons.map((lesson) => (
                      <div
                        key={lesson.key}
                        className="teacher-calendar-shell__payment-reminder-row rounded-xl border border-slate-200/80 bg-slate-50/85 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-slate-900">{lesson.label}</div>
                            <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                              {lesson.dateLabel}, {lesson.timeLabel}
                              {lesson.groupName ? ` • ${lesson.groupName}` : ''}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-bold text-rose-700">
                            не оплачено
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            {lesson.hasExternal ? 'Google Calendar' : 'Расписание'}
                          </span>
                          {lesson.studentId ? (
                            <button
                              type="button"
                              onClick={() => openStudentWorkspace('finance', lesson.studentId)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              <Wallet size={12} />
                              Финансы
                            </button>
                          ) : (
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                              без ученика
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">
                  За эту и прошлую неделю всё отмечено.
                </div>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPaymentReminderOpen(true)}
            className={`teacher-calendar-shell__payment-reminder-tab pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur-xl transition hover:-translate-y-0.5 ${
              paymentReminderLessonCount > 0
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : 'border-emerald-300 bg-emerald-50 text-emerald-700'
            }`}
            aria-label="Показать, кому напомнить об оплате"
          >
            <Wallet size={14} />
            <span>Оплаты</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px]">
              {paymentReminderLessonCount}
            </span>
          </button>
        )}
      </div>
      {dragRecurringChoiceModal && (
        <div
          className="teacher-calendar-shell__modal-backdrop absolute inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={closeDragRecurringChoiceModal}
        >
          <div
            className="teacher-calendar-shell__modal surface-panel modal-card w-full max-w-3xl rounded-2xl border border-purple-200/80 bg-gradient-to-br from-white via-violet-50/65 to-fuchsia-50/55 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-lg font-semibold text-slate-900">Перенос повторяющегося занятия</div>
            <div className="mt-2 text-sm text-slate-600">
              Выберите, что именно перенести.
            </div>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => handleDragRecurringChoice(true)}
                disabled={dragDropBusy}
                className="rounded-xl border border-violet-600 bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(124,58,237,0.25)] hover:from-violet-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Перенести все еженедельные повторы
              </button>
              <button
                type="button"
                onClick={() => handleDragRecurringChoice(false)}
                disabled={dragDropBusy}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Перенести только это занятие
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeDragRecurringChoiceModal}
                disabled={dragDropBusy}
                className="rounded-full border border-purple-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      {quickCreateDraft && (
        <div
          className="teacher-calendar-shell__modal-backdrop absolute inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={closeQuickCreate}
        >
          <form
            className="teacher-calendar-shell__modal surface-panel modal-card w-full max-w-md rounded-2xl border border-purple-200/80 bg-gradient-to-br from-white via-violet-50/65 to-fuchsia-50/55 p-4 shadow-2xl"
            onSubmit={handleQuickCreateSave}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">Новое занятие</div>
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
                  title: String(prev.title || '').trim() || DEFAULT_ONE_TIME_LESSON_SUBJECT,
                } : prev))}
                disabled={quickCreateSaving || quickCreateFindingSlot}
                className={`flex-1 px-3 py-2 ${quickCreateIsTrialWithoutStudent ? 'bg-sky-100 text-sky-700' : 'text-slate-700 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Пробное
              </button>
              <button
                type="button"
                onClick={() => setQuickCreateDraft((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    studentId: firstStudentOptionId || prev.studentId,
                    title: '',
                  };
                })}
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
              Повтор
            </label>
            <div className="mt-1 inline-flex w-full items-center overflow-hidden rounded-xl border border-purple-200/80 bg-white/95 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setQuickCreateDraft((prev) => (prev ? { ...prev, repeatMode: REPEAT_MODE_ONCE } : prev))}
                disabled={quickCreateSaving || quickCreateFindingSlot}
                className={`flex-1 px-3 py-2 ${
                  quickCreateRepeatMode === REPEAT_MODE_ONCE
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-slate-700 hover:bg-slate-50'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Единоразово
              </button>
              <button
                type="button"
                onClick={() => setQuickCreateDraft((prev) => (prev ? { ...prev, repeatMode: REPEAT_MODE_WEEKLY } : prev))}
                disabled={quickCreateSaving || quickCreateFindingSlot}
                className={`flex-1 border-l border-purple-100 px-3 py-2 ${
                  quickCreateRepeatMode === REPEAT_MODE_WEEKLY
                    ? 'bg-sky-100 text-sky-700'
                    : 'text-slate-700 hover:bg-slate-50'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Еженедельно
              </button>
            </div>

            {quickCreateIsTrialWithoutStudent ? (
              <>
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
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                Для занятия с учеником название не требуется: в карточке будут имя ученика и время.
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {quickCreateRepeatMode === REPEAT_MODE_WEEKLY ? 'Дата (для дня недели)' : 'Дата'}
                </span>
                <input
                  type="date"
                  value={quickCreateDateInputValue}
                  onChange={(event) => setQuickCreateDraft((prev) => (prev ? { ...prev, dateKey: event.target.value } : prev))}
                  disabled={quickCreateSaving || quickCreateFindingSlot}
                  className="mt-1 w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
                />
                {quickCreateRepeatMode === REPEAT_MODE_WEEKLY && quickCreateWeekdayLabel && (
                  <div className="mt-1 text-[11px] text-slate-500">
                    {`Будет повторяться каждую ${quickCreateWeekdayLabel.toLowerCase()}.`}
                  </div>
                )}
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
      {lessonInfoModalOpen && (
        <div
          className="teacher-calendar-shell__modal-backdrop absolute inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={closeLessonInfoModal}
        >
          <div
            className="teacher-calendar-shell__modal surface-panel modal-card w-full max-w-xl rounded-2xl border border-purple-200/80 bg-gradient-to-br from-white via-violet-50/70 to-sky-50/55 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-purple-500">
                  Перед уроком
                </div>
                <div className="truncate text-lg font-black text-slate-900">
                  {lessonInfoTargetStudentName || 'Ученик'}
                </div>
                {(lessonInfoTargetDateLabel || lessonInfoTargetTimeLabel) && (
                  <div className="text-xs text-slate-500">
                    {[lessonInfoTargetDateLabel, lessonInfoTargetTimeLabel].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeLessonInfoModal}
                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-purple-50"
              >
                Закрыть
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <section className="rounded-xl border border-emerald-200 bg-white/85 p-3">
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Домашка
                </div>
                {lessonInfoHomeworkLoading ? (
                  <div className="mt-2 text-sm text-slate-500">Загружаем домашку...</div>
                ) : lessonInfoHomework ? (
                  <>
                    <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                      {lessonInfoHomeworkText || 'Домашка без текста'}
                    </div>
                    {lessonInfoHomeworkGoalCount > 0 && (
                      <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/80 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-purple-700">
                          Цели
                        </div>
                        {lessonInfoHomeworkGoalLabels.length > 0 ? (
                          <div className="mt-1 space-y-1 text-sm text-slate-800">
                            {lessonInfoHomeworkGoalLabels.map((label, index) => (
                              <div key={`lesson-info-goal-${index}`}>{label}</div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-slate-500">
                            {lessonInfoHomeworkGoalCount} цели
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-2 text-sm text-slate-500">Домашка пока не задана.</div>
                )}
              </section>

              <section className="rounded-xl border border-sky-200 bg-white/85 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-sky-700">
                    Последние конспекты
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">3 последних</span>
                </div>
                {lessonInfoLoading ? (
                  <div className="mt-2 text-sm text-slate-500">Загружаем конспекты...</div>
                ) : lessonInfoError ? (
                  <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                    {lessonInfoError}
                  </div>
                ) : lessonInfoFiles.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {lessonInfoFiles.map((file) => {
                      const href = getLessonInfoFileHref(file);
                      const meta = getLessonInfoFileMeta(file);
                      const content = (
                        <>
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {file?.name || 'Файл из конспекта'}
                          </div>
                          {meta && (
                            <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                              {meta}
                            </div>
                          )}
                        </>
                      );
                      return href ? (
                        <a
                          key={file?.id || file?.url || file?.name}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-sky-200 hover:bg-sky-50/70"
                        >
                          {content}
                        </a>
                      ) : (
                        <div
                          key={file?.id || file?.name}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                        >
                          {content}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-slate-500">Сохранений в конспекты пока нет.</div>
                )}
              </section>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  closeLessonInfoModal();
                  openStudentWorkspace('notes', lessonInfoTargetStudentId);
                }}
                disabled={!lessonInfoTargetStudentId}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BookOpen size={14} />
                Конспекты
              </button>
              <button
                type="button"
                onClick={closeLessonInfoModal}
                className="rounded-full border border-purple-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-purple-50"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
      {eventDetails && (
        <div
          className="teacher-calendar-shell__modal-backdrop absolute inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={closeEventDetails}
        >
          <div
            className="teacher-calendar-shell__modal surface-panel modal-card w-full max-w-md rounded-2xl border border-purple-200/80 bg-gradient-to-br from-white via-violet-50/65 to-fuchsia-50/55 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {eventDetailsIsGroup
                    ? (eventDetails.groupName || eventDetails.studentName || eventDetails.subject || 'Мини-группа')
                    : (String(eventDetails.studentId || '').trim()
                      ? (eventDetails.studentName || 'Ученик')
                      : (eventDetails.subjectLabel || eventDetails.subject || 'Занятие'))}
                </div>
                <div className="text-xs text-slate-500">{eventDetailsDateLabel}</div>
              </div>
              <button
                type="button"
                onClick={closeEventDetails}
                disabled={eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy}
                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Закрыть
              </button>
            </div>

            {eventEditDraft ? (
              <div className="mt-4 space-y-3">
                {String(eventDetails.studentId || '').trim() ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                    Для занятия с учеником название не требуется: используется имя ученика.
                  </div>
                ) : (
                  <>
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
                  </>
                )}
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Повтор
                </label>
                <div className="inline-flex items-center overflow-hidden rounded-xl border border-purple-200/80 bg-white/95 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setEventEditDraft((prev) => (prev ? { ...prev, repeatMode: REPEAT_MODE_ONCE } : prev))}
                    disabled={eventEditSaving || eventDeleteBusy}
                    className={`px-3 py-2 ${
                      String(eventEditDraft.repeatMode || REPEAT_MODE_ONCE).trim() === REPEAT_MODE_WEEKLY
                        ? 'text-slate-700 hover:bg-slate-50'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    Единоразово
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventEditDraft((prev) => (prev ? { ...prev, repeatMode: REPEAT_MODE_WEEKLY } : prev))}
                    disabled={eventEditSaving || eventDeleteBusy}
                    className={`border-l border-purple-100 px-3 py-2 ${
                      String(eventEditDraft.repeatMode || REPEAT_MODE_ONCE).trim() === REPEAT_MODE_WEEKLY
                        ? 'bg-purple-100 text-purple-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Еженедельно
                  </button>
                </div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Дата
                </label>
                <input
                  type="date"
                  value={String(eventEditDraft.dateKey || '').trim()}
                  onChange={(event) => setEventEditDraft((prev) => (prev ? { ...prev, dateKey: event.target.value } : prev))}
                  disabled={eventEditSaving || eventDeleteBusy}
                  className="w-full rounded-xl border border-purple-200/80 bg-white/95 px-3 py-2 text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:opacity-70"
                />
                {String(eventEditDraft.repeatMode || REPEAT_MODE_ONCE).trim() === REPEAT_MODE_WEEKLY && (
                  <div className="text-[11px] text-slate-500">
                    {(() => {
                      const weekdayLabel = getScheduleWeekdayMetaFromDate(eventEditDraft.dateKey)?.label;
                      return weekdayLabel
                        ? `Повтор по дню недели: ${weekdayLabel}.`
                        : 'Выберите дату, чтобы определить день недели.';
                    })()}
                  </div>
                )}
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
              <div className="mt-4 rounded-2xl border border-purple-200/80 bg-gradient-to-r from-white via-violet-50/80 to-sky-50/70 p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                    eventDetailsStatusLabel === 'Идёт сейчас'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-purple-200 bg-purple-50 text-purple-700'
                  }`}>
                    {eventDetailsStatusLabel}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {eventDetailsDateLabel}, {eventDetailsTimeRangeLabel}
                  </span>
                  {eventDetailsIsExternal && (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      Google
                    </span>
                  )}
                  {eventDetailsStudentSelected && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      выбран
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <div className="truncate text-lg font-black text-slate-900">
                    {eventDetailsStudentName || 'Занятие'}
                  </div>
                  {eventDetailsSubject && eventDetailsSubject !== eventDetailsStudentName && (
                    <div className="truncate text-xs font-semibold text-slate-500">{eventDetailsSubject}</div>
                  )}
                </div>
                {eventDetailsIsGroup ? (
                  <div className="mt-2 rounded-xl border border-violet-200 bg-white/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-800">
                        <Users size={14} /> Участники и оплата
                      </span>
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                        {`${eventDetailsGroupPayment?.paidCount || 0}/${eventDetailsGroupPayment?.totalCount || eventDetailsGroupParticipants.length} оплачено`}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {(eventDetailsGroupPayment?.members || eventDetailsGroupParticipants).map((member) => {
                        const busy = lessonPanelFinanceBusy === `group-paid:${member.studentId}`;
                        const status = String(member?.status || 'pending');
                        const paid = status === 'paid';
                        const trial = status === 'trial';
                        const statusLabel = trial
                          ? 'Пробное'
                          : (paid ? 'Оплатил(а)' : (status === 'unpaid' ? 'Не оплатил(а)' : 'Ожидаем оплату'));
                        return (
                          <div key={`group-payment-${member.studentId}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                            <span className="min-w-0 truncate text-xs font-semibold text-slate-800">{member.studentName || 'Ученик'}</span>
                            <button
                              type="button"
                              onClick={() => handleGroupMemberPaymentToggle(member)}
                              disabled={trial || Boolean(lessonPanelFinanceBusy)}
                              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-60 ${
                                paid
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : (status === 'unpaid'
                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-700')
                              }`}
                            >
                              {busy ? '...' : statusLabel}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : eventDetailsHasStudent ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    {eventDetailsHomeworkLoading ? (
                      <span>Домашка загружается...</span>
                    ) : eventDetailsHomework ? (
                      <>
                        <span>{eventDetailsHomeworkPreview || 'Домашка без текста'}</span>
                        {eventDetailsHomeworkGoalsPreview ? (
                          <span>{eventDetailsHomeworkGoalsPreview}</span>
                        ) : eventDetailsHomeworkGoalCount > 0 && (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 font-semibold text-purple-700">
                            целей: {eventDetailsHomeworkGoalCount}
                          </span>
                        )}
                      </>
                    ) : (
                      <span>Домашка пока не задана</span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] text-slate-500">
                    Ученик не сопоставлен.
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {eventDetailsIsGroup ? (
                    <>
                      {eventDetailsGroupLink && (
                        <button
                          type="button"
                          onClick={() => openEventDetailsGroupWorkspace('call')}
                          disabled={!eventDetailsGroupCanOpenTelemost || typeof onOpenLearningGroupTelemost !== 'function'}
                          title={eventDetailsGroupNotStarted ? 'Телемост будет доступен в момент начала занятия' : 'Открыть Телемост'}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                        >
                          <ExternalLink size={12} />
                          Телемост
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEventDetailsGroupWorkspace('call')}
                        disabled={!eventDetailsGroupCanOpenTelemost}
                        title={eventDetailsGroupNotStarted ? 'Комната группы будет доступна в момент начала занятия' : 'Открыть комнату группы'}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Clock3 size={12} />
                        Комната группы
                      </button>
                      <button
                        type="button"
                        onClick={() => openEventDetailsGroupWorkspace('board')}
                        disabled={!eventDetails?.lessonId || eventDetailsGroupParticipants.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Brush size={12} />
                        Общая доска
                      </button>
                      <button
                        type="button"
                        onClick={() => openEventDetailsGroupWorkspace('collab')}
                        disabled={!eventDetails?.lessonId || eventDetailsGroupParticipants.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Code2 size={12} />
                        Общий код
                      </button>
                    </>
                  ) : (
                    <>
                  <button
                    type="button"
                    onClick={openEventDetailsInfoModal}
                    disabled={!eventDetailsHasStudent}
                    title="Вспомнить прошлый урок"
                    aria-label="Вспомнить прошлый урок"
                    className="inline-grid h-8 w-8 place-items-center rounded-xl border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Info size={14} />
                  </button>
                  {eventDetailsLink && (
                    <button
                      type="button"
                      onClick={openEventDetailsLink}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                    >
                      <ExternalLink size={12} />
                      Ссылка
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEventDetailsWorkspace('call')}
                    disabled={!eventDetailsHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Clock3 size={12} />
                    Созвон
                  </button>
                  <button
                    type="button"
                    onClick={() => openEventDetailsWorkspace('board')}
                    disabled={!eventDetailsHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Brush size={12} />
                    Доска
                  </button>
                  <button
                    type="button"
                    onClick={() => openEventDetailsWorkspace('collab-save')}
                    disabled={!eventDetailsHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Code2 size={12} />
                    Код в конспект
                  </button>
                  <button
                    type="button"
                    onClick={() => openEventDetailsWorkspace('notes')}
                    disabled={!eventDetailsHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BookOpen size={12} />
                    Конспекты
                  </button>
                  <button
                    type="button"
                    onClick={() => openEventDetailsWorkspace('schedule')}
                    disabled={!eventDetailsHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileText size={12} />
                    Домашка
                  </button>
                  <button
                    type="button"
                    onClick={() => openEventDetailsWorkspace('progress')}
                    disabled={!eventDetailsHasStudent}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle size={12} />
                    Задания
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEventDetailsFinanceAction('completed')}
                    disabled={!eventDetailsHasStudent || Boolean(lessonPanelFinanceBusy)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      eventDetailsCompletedMarked
                        ? 'border-teal-300 bg-teal-100 text-teal-800 hover:bg-teal-50'
                        : 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                    }`}
                  >
                    <CheckCircle size={12} />
                    {lessonPanelFinanceBusy === 'completed' || lessonPanelFinanceBusy === 'completed-undo'
                      ? '...'
                      : (eventDetailsCompletedMarked ? 'Отменить урок' : '+ урок')}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCalendarTrialMark(eventDetailsTrialMarkKey)}
                    disabled={!eventDetails || Boolean(lessonPanelFinanceBusy)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      eventDetailsTrialMarked
                        ? 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-50'
                        : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    <Info size={12} />
                    {lessonPanelFinanceBusy === 'trial' || lessonPanelFinanceBusy === 'trial-undo'
                      ? '...'
                      : (eventDetailsTrialMarked ? 'Не пробное' : 'Пробное')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEventDetailsFinanceAction('paid')}
                    disabled={!eventDetails || Boolean(lessonPanelFinanceBusy)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      eventDetailsPaidMarked
                        ? 'border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-50'
                        : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    <Wallet size={12} />
                    {lessonPanelFinanceBusy === 'paid' || lessonPanelFinanceBusy === 'paid-undo'
                      ? '...'
                      : (eventDetailsPaidMarked ? 'Отменить оплату' : '+ оплата')}
                  </button>
                    </>
                  )}
                </div>
                {(lessonPanelError || lessonPanelSuccess) && (
                  <div className={`mt-2 text-xs ${lessonPanelError ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {lessonPanelError || lessonPanelSuccess}
                  </div>
                )}
              </div>
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
                    disabled={eventEditSaving || eventDeleteBusy || eventQuickActionBusy || dragDropBusy}
                    className="rounded-full border border-purple-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Отменить
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEventEdit}
                    disabled={eventEditSaving || eventDeleteBusy || eventQuickActionBusy || dragDropBusy}
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
                    disabled={eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy}
                    className="rounded-full border border-purple-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Закрыть
                  </button>
                  {!eventDetailsIsExternal && (
                    <>
                      <button
                        type="button"
                        onClick={startEventEdit}
                        disabled={eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy}
                        className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteEvent}
                        disabled={eventDeleteBusy || eventEditSaving || eventQuickActionBusy || dragDropBusy}
                        className="rounded-full border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {eventDeleteBusy ? 'Удаляем...' : 'Удалить'}
                      </button>
                    </>
                  )}
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


