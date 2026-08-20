import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, BellOff, BookOpen, Calendar, CalendarDays, CheckCircle, ChevronRight, Clock3, EyeOff, HardDrive, History, ListChecks, Pencil, RefreshCcw, Save, Target, Trash2, WifiOff } from 'lucide-react';
import { api, authenticatedUploadsFetch, resolveAuthenticatedApiUrl } from '../services/api';
import ScheduleProgressTree from './ScheduleProgressTree';
import StudentSearchSelect from './StudentSearchSelect';
import StudentLessonDetailModal from './StudentLessonDetailModal';
import TeacherHomeworkComposer from './TeacherHomeworkComposer';
import TeacherHomeworkReviewModal from './TeacherHomeworkReviewModal';
import HomeworkDayPlan from './HomeworkDayPlan';
import { Button, Card } from './ui';
import {
  buildHomeworkCarryoverDraft,
  formatHomeworkQuestionRanges,
  resolveHomeworkTaskTargetDescriptors,
} from '../utils/homeworkComposer';
import { normalizeHomeworkComposerDraft } from '../utils/homeworkComposerDraft';
import {
  getHomeworkGoalAssignmentTier,
  isOptionalHomeworkGoal,
  normalizeHomeworkAssignmentTier,
} from '../utils/homeworkAssignmentTier';
import { normalizeHttpUrl, splitTextWithUrls } from '../utils/linkifyText';
import { isNativeAndroidPushEnvironment } from '../utils/push';
import { getStudentUnpaidLessonOccurrences } from '../utils/studentPaymentReminder';
import {
  isOfflineHomeworkStorageSupported,
  loadOfflineHomeworkPackage,
  saveOfflineHomeworkPackage,
} from '../utils/offlineHomework';
import {
  HOMEWORK_DUE_AT_MODE_MANUAL,
  HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
  buildHomeworkDueAtFromSchedule,
  normalizeHomeworkDueAtMode,
  resolveHomeworkDueAtModeForSchedule,
} from '../utils/homeworkDueAt';
import {
  MOCK_EXAM_MODE_CLASSIC as MOCK_ATTEMPT_MODE_CLASSIC,
  MOCK_EXAM_MODE_TIMER as MOCK_ATTEMPT_MODE_TIMER,
  normalizeAssignedMockExamMode as normalizeAssignedMockMode,
} from '../utils/mockExamMode';
import { buildTeacherLessonBriefing } from '../utils/teacherLessonBriefing';
import { buildTeacherHomeworkReviewItems } from '../utils/teacherHomeworkReview';
import {
  estimateHomeworkDuration,
  formatHomeworkDurationMinutes,
} from '../utils/homeworkDurationEstimate';

const AUTO_REFRESH_INTERVAL_MS = 60_000;
const SHOW_SCHEDULE_SKILL_TREE = false;
const DEFAULT_SCHEDULE_SUBJECT = 'Занятие';
const SCHEDULE_LOOKAHEAD_WEEKS = 16;

const formatLessonReplayStorageBytes = (value) => {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 100 * 1024 ? 0 : 1).replace('.', ',')} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1).replace('.', ',')} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',')} ГБ`;
};
const SCHEDULE_WEEKDAYS = [
  { key: 'monday', label: 'Понедельник', order: 1 },
  { key: 'tuesday', label: 'Вторник', order: 2 },
  { key: 'wednesday', label: 'Среда', order: 3 },
  { key: 'thursday', label: 'Четверг', order: 4 },
  { key: 'friday', label: 'Пятница', order: 5 },
  { key: 'saturday', label: 'Суббота', order: 6 },
  { key: 'sunday', label: 'Воскресенье', order: 7 },
];
const SCHEDULE_WEEKDAY_SHORT_LABELS = {
  monday: 'ПН',
  tuesday: 'ВТ',
  wednesday: 'СР',
  thursday: 'ЧТ',
  friday: 'ПТ',
  saturday: 'СБ',
  sunday: 'ВС',
};
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
const SCHEDULE_REQUEST_TYPE_CREATE = 'create';
const SCHEDULE_REQUEST_TYPE_UPDATE = 'update';
const SCHEDULE_REQUEST_TYPE_DELETE = 'delete';
const SCHEDULE_REQUEST_STATUS_PENDING = 'pending';
const SCHEDULE_REQUEST_STATUS_APPROVED = 'approved';
const SCHEDULE_REQUEST_STATUS_REJECTED = 'rejected';
const HOMEWORK_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HOMEWORK_PLAN_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const LESSON_HISTORY_PAGE_SIZE = 12;

const resolveHomeworkDueAt = (entry) => {
  const explicitDueAt = new Date(entry?.dueAt || '');
  if (!Number.isNaN(explicitDueAt.getTime())) return explicitDueAt;
  const issuedAt = new Date(entry?.issuedAt || '');
  if (Number.isNaN(issuedAt.getTime())) return null;
  const days = Number(entry?.daysToComplete);
  const normalizedDays = Number.isFinite(days) && days > 0 ? Math.round(days) : 7;
  return new Date(issuedAt.getTime() + (normalizedDays * HOMEWORK_DAY_MS));
};

const getHomeworkCalendarOffsetMinutes = (value) => {
  const stored = Number(value);
  if (value != null && value !== '' && Number.isFinite(stored)) {
    return Math.max(-14 * 60, Math.min(14 * 60, Math.round(stored)));
  }
  return -new Date().getTimezoneOffset();
};

const buildDefaultHomeworkDueAt = (days = 7, scheduleEntries = [], now = new Date()) => (
  buildHomeworkDueAtFromSchedule(scheduleEntries, {
    now,
    fallbackDays: days,
    calendarOffsetMinutes: getHomeworkCalendarOffsetMinutes(),
  })
);

const buildNextLessonData = (latest, fallback = {}) => ({
  homeWork: latest?.homeWork || '',
  lessonLink: latest?.lessonLink || '',
  boardLink: latest?.boardLink || '',
  dueAt: latest?.dueAt || fallback.dueAt || '',
  dueAtMode: normalizeHomeworkDueAtMode(latest?.dueAtMode ?? fallback.dueAtMode),
  daysToComplete: Number(latest?.daysToComplete) || fallback.daysToComplete || 7,
  issuedAt: latest?.issuedAt || '',
  checklistItems: Array.isArray(latest?.checklistItems) ? latest.checklistItems : [],
  taskNumber: latest?.taskNumber ?? null,
  levelId: latest?.levelId ?? null,
  targetQuestions: Array.isArray(latest?.targetQuestions) ? latest.targetQuestions : [],
  targetQuestionIds: Array.isArray(latest?.targetQuestionIds) ? latest.targetQuestionIds : [],
  goals: Array.isArray(latest?.goals) ? latest.goals : [],
  dayPlan: latest?.dayPlan && typeof latest.dayPlan === 'object' ? latest.dayPlan : null,
  calendarOffsetMinutes: getHomeworkCalendarOffsetMinutes(
    latest?.calendarOffsetMinutes ?? latest?.dayPlan?.calendarOffsetMinutes
  ),
});

const toDateTimeLocalValue = (value) => {
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toHomeworkDueAtIso = (value) => {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const formatHomeworkRelativeAmount = (amount, unit) => {
  const value = Math.max(1, Math.round(Number(amount) || 1));
  const mod10 = value % 10;
  const mod100 = value % 100;
  const forms = unit === 'minute'
    ? ['минуту', 'минуты', 'минут']
    : unit === 'hour'
      ? ['час', 'часа', 'часов']
      : ['день', 'дня', 'дней'];
  if (mod10 === 1 && mod100 !== 11) return `${value} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} ${forms[1]}`;
  return `${value} ${forms[2]}`;
};

const getHomeworkDeadlineMeta = (entry, nowMs = Date.now()) => {
  const dueAt = resolveHomeworkDueAt(entry);
  if (!dueAt) {
    return {
      label: 'Срок не указан',
      relativeLabel: '',
      tone: 'border-slate-200 bg-white/90 text-slate-600',
    };
  }
  const currentYear = new Date(nowMs).getFullYear();
  const dateLabel = dueAt.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(dueAt.getFullYear() === currentYear ? {} : { year: 'numeric' }),
  }).replace(' г.', '');
  const timeLabel = dueAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const remainingMs = dueAt.getTime() - nowMs;
  const absoluteMs = Math.abs(remainingMs);
  let relativeAmount = '';
  if (absoluteMs < 60 * 60 * 1000) {
    relativeAmount = formatHomeworkRelativeAmount(Math.ceil(absoluteMs / (60 * 1000)), 'minute');
  } else if (absoluteMs < HOMEWORK_DAY_MS) {
    relativeAmount = formatHomeworkRelativeAmount(Math.ceil(absoluteMs / (60 * 60 * 1000)), 'hour');
  } else {
    relativeAmount = formatHomeworkRelativeAmount(Math.ceil(absoluteMs / HOMEWORK_DAY_MS), 'day');
  }
  const overdue = remainingMs < 0;
  return {
    label: `До ${dateLabel}, ${timeLabel}`,
    relativeLabel: overdue ? `Просрочено на ${relativeAmount}` : `Осталось ${relativeAmount}`,
    tone: overdue
      ? 'border-red-200 bg-red-50 text-red-700'
      : remainingMs <= HOMEWORK_DAY_MS
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-white/90 text-slate-600',
  };
};

const getHomeworkChecklistItems = (entry) => {
  const storedItems = Array.isArray(entry?.checklistItems)
    ? entry.checklistItems
        .map((item) => ({
          id: typeof item?.id === 'string' ? item.id.trim() : '',
          text: typeof item?.text === 'string' ? item.text.trim() : '',
          completedAt: item?.completedAt || null,
        }))
        .filter((item) => item.text)
    : [];
  if (storedItems.length > 0) return storedItems;
  return String(entry?.homeWork || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ id: '', text, completedAt: null }));
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

const isGoogleCalendarScheduleEntry = (entry) => {
  const source = String(entry?.source || '').trim().toLowerCase();
  return Boolean(entry?.isGoogleCalendarSync) || source === 'google-calendar' || source === 'google-ical';
};

const parseScheduleDayKey = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const getLessonHistoryMonthLabel = (dayKey) => {
  const date = parseScheduleDayKey(dayKey);
  if (!date) return 'Ранее';
  const label = date
    .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    .replace(/\s*г\.$/i, '');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const getLessonHistoryDateLabel = (dayKey) => {
  const date = parseScheduleDayKey(dayKey);
  if (!date) return 'Прошедшее занятие';
  const label = date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const formatScheduleDayKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addScheduleDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const getScheduleWeekStart = (date = new Date()) => {
  const today = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};

const getCurrentScheduleWeekDays = (date = new Date()) => {
  const start = getScheduleWeekStart(date);
  return SCHEDULE_WEEKDAYS.map((weekday, index) => {
    const dayDate = addScheduleDays(start, index);
    return {
      ...weekday,
      dateKey: formatScheduleDayKey(dayDate),
      date: dayDate,
    };
  });
};

const buildCurrentWeekScheduleEntries = (entries = [], weekDays = []) => {
  const weekByDate = new Map(weekDays.map((day) => [day.dateKey, day]));
  const weekByOrder = new Map(weekDays.map((day) => [day.order, day]));
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const normalized = normalizeScheduleEntry(entry);
      if (!normalized) return null;
      const rawDate = String(normalized?.date || '').trim();
      let weekDay = null;
      if (rawDate) {
        weekDay = weekByDate.get(rawDate) || null;
        if (!weekDay) return null;
      } else {
        weekDay = weekByOrder.get(Number(normalized.weekdayOrder)) || null;
        if (!weekDay) return null;
        const excludedDates = Array.isArray(normalized.excludedDates) ? normalized.excludedDates : [];
        if (excludedDates.includes(weekDay.dateKey)) return null;
      }
      return {
        ...normalized,
        currentWeekDate: weekDay.dateKey,
        currentWeekDateObject: weekDay.date,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const dateDiff = String(left.currentWeekDate || '').localeCompare(String(right.currentWeekDate || ''), 'ru');
      if (dateDiff !== 0) return dateDiff;
      const timeDiff = String(left.time || '').localeCompare(String(right.time || ''), 'ru');
      if (timeDiff !== 0) return timeDiff;
      return String(left.createdAt || '').localeCompare(String(right.createdAt || ''), 'ru');
    });
};

const getScheduleTimeRangeLabel = (entry) => {
  const time = String(entry?.time || '').trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return time || 'Время не указано';
  const [hours, minutes] = time.split(':').map(Number);
  const duration = Number(entry?.durationMinutes);
  const durationMinutes = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 60;
  const startTotal = (hours * 60) + minutes;
  const endTotal = startTotal + durationMinutes;
  const endHours = Math.floor((endTotal / 60) % 24);
  const endMinutes = endTotal % 60;
  return `${time}–${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
};

const getScheduleEntryStartDate = (entry) => {
  const date = parseScheduleDayKey(entry?.currentWeekDate || entry?.date);
  const time = String(entry?.time || '').trim();
  if (!date || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  const start = new Date(date);
  start.setHours(hours, minutes, 0, 0);
  return start;
};

const getScheduleEntryEndDate = (entry) => {
  const start = getScheduleEntryStartDate(entry);
  if (!start) return null;
  const duration = Number(entry?.durationMinutes);
  const durationMinutes = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 60;
  return new Date(start.getTime() + durationMinutes * 60 * 1000);
};

const getStudentLessonKey = (entry) => (
  String(entry?.id || `${entry?.currentWeekDate || ''}-${entry?.weekdayKey || ''}-${entry?.time || ''}-${entry?.createdAt || 'slot'}`)
);

const getLessonTopicOccurrenceKey = (studentId, entry) => {
  const normalizedStudentId = String(studentId || '').trim();
  const dayKey = String(entry?.currentWeekDate || entry?.date || '').trim();
  const time = String(entry?.time || '').trim();
  const duration = Number(entry?.durationMinutes);
  const durationMinutes = Number.isFinite(duration) && duration >= 15
    ? Math.min(360, Math.round(duration))
    : 60;
  if (!normalizedStudentId || !dayKey || !time) return '';
  return [normalizedStudentId, dayKey, time, durationMinutes].join('|');
};

const isPaymentOverdueScheduleEntry = (entry) => Boolean(entry?.isPaymentOverdueOccurrence);

const getSchedulePaymentStateForDate = (entry, dateKey) => {
  const normalizedDateKey = String(dateKey || '').trim();
  const payment = entry?.payment && typeof entry.payment === 'object' ? entry.payment : null;
  if (!payment) return null;
  const statesByDate = payment.statesByDate && typeof payment.statesByDate === 'object'
    ? payment.statesByDate
    : {};
  if (normalizedDateKey && statesByDate[normalizedDateKey]) return statesByDate[normalizedDateKey];
  if (normalizedDateKey && String(payment.date || '').trim() === normalizedDateKey) return payment;
  return payment.status ? payment : null;
};

const attachScheduleOccurrencePayment = (entry) => {
  const dateKey = String(entry?.currentWeekDate || entry?.date || '').trim();
  const occurrencePayment = getSchedulePaymentStateForDate(entry, dateKey);
  return occurrencePayment ? { ...entry, occurrencePayment } : entry;
};

const isScheduleEntryOverdueUnpaid = (entry) => {
  if (isPaymentOverdueScheduleEntry(entry)) return true;
  const payment = entry?.occurrencePayment || getSchedulePaymentStateForDate(entry, entry?.currentWeekDate || entry?.date);
  return Boolean(payment?.overdue || (payment?.status === 'unpaid' && payment?.finished));
};

const getStudentScheduleOccurrenceKey = (entry) => [
  String(entry?.currentWeekDate || entry?.date || '').trim(),
  String(entry?.time || '').trim(),
  String(entry?.durationMinutes || 60),
  String(entry?.subject || DEFAULT_SCHEDULE_SUBJECT).trim().toLowerCase(),
].join('|');

const buildOverdueUnpaidScheduleOccurrences = (entries = []) => {
  const occurrences = getStudentUnpaidLessonOccurrences(entries)
    .map(({ sourceEntry, paymentState: state, dateKey }) => {
      const entry = normalizeScheduleEntry(sourceEntry);
      const date = parseScheduleDayKey(dateKey);
      const weekday = getScheduleWeekdayMetaFromDate(dateKey);
      if (!entry || !date || !weekday) return null;
      return {
        ...entry,
        id: `payment-overdue-visible:${getStudentScheduleOccurrenceKey({ ...entry, date: dateKey, currentWeekDate: dateKey })}`,
        date: dateKey,
        currentWeekDate: dateKey,
        currentWeekDateObject: date,
        day: weekday.label,
        weekdayKey: weekday.key,
        weekdayOrder: weekday.order,
        excludedDates: [],
        occurrencePayment: state,
        isPaymentOverdueOccurrence: true,
        isSystemScheduleOccurrence: true,
        payment: {
          ...state,
          statesByDate: { [dateKey]: state },
          hasOverdueUnpaid: true,
        },
      };
    })
    .filter(Boolean);
  return sortStudentVisibleScheduleEntries(occurrences);
};

const sortStudentVisibleScheduleEntries = (entries = []) => (
  (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeScheduleEntry(entry))
    .filter(Boolean)
    .map((entry) => attachScheduleOccurrencePayment(entry))
    .sort((left, right) => {
      const leftDate = String(left?.currentWeekDate || left?.date || '').trim();
      const rightDate = String(right?.currentWeekDate || right?.date || '').trim();
      const dateDiff = leftDate.localeCompare(rightDate, 'ru');
      if (dateDiff !== 0) return dateDiff;
      const timeDiff = String(left?.time || '').localeCompare(String(right?.time || ''), 'ru');
      if (timeDiff !== 0) return timeDiff;
      return String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''), 'ru');
    })
);

const getScheduleEntryTimingState = (entry, now = new Date()) => {
  const start = getScheduleEntryStartDate(entry);
  const end = getScheduleEntryEndDate(entry);
  if (end && end.getTime() < now.getTime()) return 'past';
  if (start && start.getTime() <= now.getTime() && end && end.getTime() >= now.getTime()) return 'active';
  if (start && start.getTime() > now.getTime()) return 'future';
  return 'future';
};

const buildNearestScheduleWeekWindow = (entries = [], fromDate = new Date()) => {
  const now = fromDate instanceof Date && !Number.isNaN(fromDate.getTime()) ? fromDate : new Date();
  const currentWeekDays = getCurrentScheduleWeekDays(now);
  let firstWeekWithAnyLessons = null;

  for (let weekOffset = 0; weekOffset <= SCHEDULE_LOOKAHEAD_WEEKS; weekOffset += 1) {
    const weekDays = getCurrentScheduleWeekDays(addScheduleDays(now, weekOffset * 7));
    const weekSchedule = sortStudentVisibleScheduleEntries(
      buildCurrentWeekScheduleEntries(entries, weekDays)
    );

    if (weekSchedule.length > 0 && !firstWeekWithAnyLessons) {
      firstWeekWithAnyLessons = { weekDays, weekSchedule, weekOffset };
    }

    const hasUpcomingLesson = weekSchedule.some((entry) => (
      getScheduleEntryTimingState(entry, now) !== 'past'
    ));
    if (hasUpcomingLesson) {
      return { weekDays, weekSchedule, weekOffset };
    }
  }

  return firstWeekWithAnyLessons || { weekDays: currentWeekDays, weekSchedule: [], weekOffset: 0 };
};

const getLessonCountLabel = (count) => {
  const value = Number(count) || 0;
  const abs = Math.abs(value);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} занятий`;
  if (last === 1) return `${value} занятие`;
  if (last >= 2 && last <= 4) return `${value} занятия`;
  return `${value} занятий`;
};

const getHomeworkCountLabel = (count) => {
  const value = Number(count) || 0;
  const abs = Math.abs(value);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} заданий`;
  if (last === 1) return `${value} задание`;
  if (last >= 2 && last <= 4) return `${value} задания`;
  return `${value} заданий`;
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

const normalizeScheduleRequest = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || '').trim();
  if (!id) return null;
  const type = String(entry.type || '').trim().toLowerCase();
  const status = String(entry.status || '').trim().toLowerCase();
  return {
    ...entry,
    id,
    type,
    status,
    studentId: String(entry.studentId || '').trim(),
    teacherId: String(entry.teacherId || '').trim(),
    targetEntryId: String(entry.targetEntryId || '').trim(),
    createdAt: String(entry.createdAt || '').trim(),
    resolutionNote: String(entry.resolutionNote || '').trim(),
    previousEntry: entry.previousEntry && typeof entry.previousEntry === 'object' ? entry.previousEntry : null,
    proposedEntry: entry.proposedEntry && typeof entry.proposedEntry === 'object' ? entry.proposedEntry : null,
  };
};

const formatScheduleRequestTypeLabel = (type) => {
  if (type === SCHEDULE_REQUEST_TYPE_CREATE) return 'Добавить слот';
  if (type === SCHEDULE_REQUEST_TYPE_UPDATE) return 'Изменить слот';
  if (type === SCHEDULE_REQUEST_TYPE_DELETE) return 'Удалить слот';
  return 'Изменение';
};

const formatScheduleRequestStatusLabel = (status) => {
  if (status === SCHEDULE_REQUEST_STATUS_PENDING) return 'Ожидает';
  if (status === SCHEDULE_REQUEST_STATUS_APPROVED) return 'Одобрено';
  if (status === SCHEDULE_REQUEST_STATUS_REJECTED) return 'Отклонено';
  return 'Неизвестно';
};
const ScheduleSection = ({
  role,
  showHeader = true,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  onOpenTask,
  onOpenMockGoal,
  solvedRefreshKey,
  openLessonKey = '',
  onOpenLessonHandled = null,
  homeworkPrefillRequest = null,
  onHomeworkPrefillHandled = null,
  homeworkReviewRequest = null,
  onHomeworkReviewRequestHandled = null,
  progress = {},
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
  pushSupported = false,
  pushPermission = 'default',
  pushEnabled = false,
  pushSyncing = false,
  pushBusy = false,
  pushReady = false,
  pushError = '',
  onTogglePush = null,
  createPythonWorker = null,
  renderLessonReplaySandbox = null,
  onStartLesson = null,
  getAnswerCountForTask = null,
  getExpectedAnswers = null,
  GAME_THEORY_TASK = null,
  withStudentId = (url) => url,
}) => {
  const DEFAULT_HOMEWORK = '';
  const DEFAULT_GOAL = {
    type: GOAL_TYPE_TASK,
    assignmentTier: 'required',
    taskNumber: '',
    levelId: 'basic',
    targetInput: '',
    includeAll: false,
    targetQuestionIds: [],
    targetSelectionDirty: false,
    mockExamId: '',
    mode: MOCK_ATTEMPT_MODE_TIMER,
  };
  const createDefaultGoal = (type = GOAL_TYPE_TASK) => ({
    ...DEFAULT_GOAL,
    type: type === GOAL_TYPE_MOCK ? GOAL_TYPE_MOCK : GOAL_TYPE_TASK,
  });
  const [homeworks, setHomeworks] = useState([]);
  const [nextLesson, setNextLesson] = useState({ homeWork: '', lessonLink: '', boardLink: '', dueAt: '', dueAtMode: HOMEWORK_DUE_AT_MODE_MANUAL, daysToComplete: 7, issuedAt: '', checklistItems: [], taskNumber: null, levelId: null, targetQuestions: [], targetQuestionIds: [], goals: [], dayPlan: null });
  const [form, setForm] = useState({
    homeWork: DEFAULT_HOMEWORK,
    lessonLink: '',
    boardLink: '',
    dueAt: toDateTimeLocalValue(buildDefaultHomeworkDueAt()),
    dueAtMode: HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
    daysToComplete: 7,
    goals: [{ ...DEFAULT_GOAL }],
    dayPlanEnabled: true,
    dayPlanSessionCount: 3,
    dayPlanWeekdays: [...DEFAULT_HOMEWORK_PLAN_WEEKDAYS],
    dayPlanManualLayout: null,
    issuedAt: '',
  });
  const [studentProgress, setStudentProgress] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshingData, setRefreshingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [solvedByKey, setSolvedByKey] = useState({});
  const [studentSolvedByTask, setStudentSolvedByTask] = useState({});
  const [mockExams, setMockExams] = useState([]);
  const [mockExamsLoading, setMockExamsLoading] = useState(false);
  const [mockExamsError, setMockExamsError] = useState('');
  const [mockAttemptsByExam, setMockAttemptsByExam] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [homeworkComposerOpen, setHomeworkComposerOpen] = useState(false);
  const [homeworkComposerPreparing, setHomeworkComposerPreparing] = useState(false);
  const [homeworkComposerError, setHomeworkComposerError] = useState('');
  const [homeworkCarryoverSummary, setHomeworkCarryoverSummary] = useState(null);
  const [homeworkDraft, setHomeworkDraft] = useState(null);
  const [homeworkDraftLoading, setHomeworkDraftLoading] = useState(false);
  const [homeworkDraftSaving, setHomeworkDraftSaving] = useState(false);
  const [homeworkDraftDiscarding, setHomeworkDraftDiscarding] = useState(false);
  const [homeworkDraftError, setHomeworkDraftError] = useState('');
  const [homeworkDraftNotice, setHomeworkDraftNotice] = useState('');
  const [teacherHomeworkReviewOpen, setTeacherHomeworkReviewOpen] = useState(false);
  const homeworkReviewOpenStudentIdRef = React.useRef('');
  const [questionDifficultyIndex, setQuestionDifficultyIndex] = useState({});
  const [mockTaskAnalyticsByExam, setMockTaskAnalyticsByExam] = useState({});
  const [homeworkDurationAnalyticsLoading, setHomeworkDurationAnalyticsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showLessonHistory, setShowLessonHistory] = useState(false);
  const [lessonHistory, setLessonHistory] = useState([]);
  const [lessonHistoryTotal, setLessonHistoryTotal] = useState(0);
  const [lessonReplayStorageTotalBytes, setLessonReplayStorageTotalBytes] = useState(0);
  const [lessonReplayStorageStatus, setLessonReplayStorageStatus] = useState('ready');
  const [lessonHistoryHasMore, setLessonHistoryHasMore] = useState(false);
  const [lessonHistoryNextOffset, setLessonHistoryNextOffset] = useState(null);
  const [lessonHistoryLoading, setLessonHistoryLoading] = useState(false);
  const [lessonHistoryLoadingMore, setLessonHistoryLoadingMore] = useState(false);
  const [lessonHistoryError, setLessonHistoryError] = useState('');
  const [lessonHistoryErrorMode, setLessonHistoryErrorMode] = useState('');
  const [lessonHistoryReloadKey, setLessonHistoryReloadKey] = useState(0);
  const [selectedLessonDetail, setSelectedLessonDetail] = useState(null);
  const [lessonDetailData, setLessonDetailData] = useState(null);
  const [lessonDetailLoading, setLessonDetailLoading] = useState(false);
  const [lessonDetailError, setLessonDetailError] = useState('');
  const [lessonDetailReloadKey, setLessonDetailReloadKey] = useState(0);
  const [scheduleCompactMode, setScheduleCompactMode] = useState(false);
  const [lessonSchedule, setLessonSchedule] = useState([]);
  const [lessonTopicsByOccurrence, setLessonTopicsByOccurrence] = useState({});
  const [lessonTopicsLoading, setLessonTopicsLoading] = useState(false);
  const [lessonTopicsRefreshKey, setLessonTopicsRefreshKey] = useState(0);
  const [scheduleForm, setScheduleForm] = useState({ ...DEFAULT_SCHEDULE_FORM });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleEditingId, setScheduleEditingId] = useState(null);
  const [scheduleDeletingId, setScheduleDeletingId] = useState(null);
  const [scheduleError, setScheduleError] = useState('');
  const [googleScheduleSyncing, setGoogleScheduleSyncing] = useState(false);
  const [googleScheduleSyncMessage, setGoogleScheduleSyncMessage] = useState('');
  const [googleScheduleSyncError, setGoogleScheduleSyncError] = useState('');
  const [scheduleRequests, setScheduleRequests] = useState([]);
  const [scheduleRequestsLoading, setScheduleRequestsLoading] = useState(false);
  const [scheduleRequestsError, setScheduleRequestsError] = useState('');
  const [scheduleRequestNotice, setScheduleRequestNotice] = useState('');
  const [scheduleRequestActionBusyId, setScheduleRequestActionBusyId] = useState('');
  const [lessonReminderEnabled, setLessonReminderEnabled] = useState(false);
  const [lessonReminderLoading, setLessonReminderLoading] = useState(false);
  const [lessonReminderSaving, setLessonReminderSaving] = useState(false);
  const [lessonReminderError, setLessonReminderError] = useState('');
  const [homeworkChecklistBusy, setHomeworkChecklistBusy] = useState({});
  const [homeworkDayPlanBusy, setHomeworkDayPlanBusy] = useState({});
  const [visibleHomeworkDayPlans, setVisibleHomeworkDayPlans] = useState({});
  const [homeworkClock, setHomeworkClock] = useState(() => Date.now());
  const [offlineHomeworkState, setOfflineHomeworkState] = useState({
    status: 'idle',
    savedAt: '',
    assets: null,
  });
  const [homeworkDataSource, setHomeworkDataSource] = useState('none');
  const [testsDataSource, setTestsDataSource] = useState('none');
  const lessonTopicsLoadedKeyRef = React.useRef('');
  const googleScheduleAutoSyncKeyRef = React.useRef('');
  const homeworkComposerRequestRef = React.useRef(0);
  const homeworkDraftRequestRef = React.useRef(0);
  const homeworkPrefillHandledRef = React.useRef('');
  const nextLessonRequestRef = React.useRef(0);
  const refreshDataRequestRef = React.useRef(0);
  const offlineHomeworkSignatureRef = React.useRef('');
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const requestStudentId = role === 'teacher' ? effectiveStudentId : '';
  const mockAttemptStudentId = role === 'student' ? null : effectiveStudentId;
  const useNativeAndroidPush = isNativeAndroidPushEnvironment();
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

  const restoreOfflineHomework = useCallback(async () => {
    if (role !== 'student' || !effectiveStudentId || !isOfflineHomeworkStorageSupported()) {
      return false;
    }
    const offlinePackage = await loadOfflineHomeworkPackage(effectiveStudentId);
    const response = offlinePackage?.homeworkResponse;
    if (!response || typeof response !== 'object') {
      setOfflineHomeworkState({ status: 'missing', savedAt: '', assets: null });
      return false;
    }
    const list = Array.isArray(response.homeworks) ? response.homeworks : [];
    const latest = response.latest && typeof response.latest === 'object'
      ? response.latest
      : (list[0] || {});
    setHomeworks(list);
    setNextLesson(buildNextLessonData(latest));
    setHomeworkDataSource('offline');
    if (offlinePackage.testsDb && typeof offlinePackage.testsDb === 'object') {
      setTestsDb(offlinePackage.testsDb);
      setTestsDataSource('offline');
      setTestsDbError('');
    }
    setOfflineHomeworkState({
      status: 'offline',
      savedAt: String(offlinePackage.savedAt || ''),
      assets: offlinePackage.assets || null,
    });
    setError('');
    return true;
  }, [effectiveStudentId, role]);

  const loadNextLesson = useCallback(async () => {
    const requestId = nextLessonRequestRef.current + 1;
    nextLessonRequestRef.current = requestId;
    if (!effectiveStudentId) {
      setHomeworks([]);
      setNextLesson({ homeWork: '', lessonLink: '', boardLink: '', dueAt: '', dueAtMode: HOMEWORK_DUE_AT_MODE_MANUAL, daysToComplete: 7, issuedAt: '', checklistItems: [], taskNumber: null, levelId: null, targetQuestions: [], targetQuestionIds: [], goals: [], dayPlan: null });
      setForm({
        homeWork: '',
        lessonLink: '',
        boardLink: '',
        dueAt: toDateTimeLocalValue(buildDefaultHomeworkDueAt()),
        dueAtMode: HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
        daysToComplete: 7,
        goals: [{
          type: GOAL_TYPE_TASK,
          taskNumber: '',
          levelId: 'basic',
          targetInput: '',
          includeAll: false,
          targetQuestionIds: [],
          targetSelectionDirty: false,
          mockExamId: '',
          mode: MOCK_ATTEMPT_MODE_TIMER,
        }],
        dayPlanEnabled: true,
        dayPlanSessionCount: 3,
        dayPlanWeekdays: [...DEFAULT_HOMEWORK_PLAN_WEEKDAYS],
        dayPlanManualLayout: null,
        issuedAt: '',
      });
      setEditingId(null);
      setHomeworkDataSource('none');
      return;
    }
    setLoading(true);
    try {
      const data = await api.getStudentNextLesson(requestStudentId);
      if (nextLessonRequestRef.current !== requestId) return;
      const list = Array.isArray(data?.homeworks) ? data.homeworks : [];
      const latest = data?.latest && typeof data.latest === 'object' ? data.latest : {};
      const safeData = buildNextLessonData(latest);
      setHomeworks(list);
      setNextLesson(safeData);
      setHomeworkDataSource('online');
      setError('');
    } catch (err) {
      if (nextLessonRequestRef.current !== requestId) return;
      const restored = await restoreOfflineHomework();
      if (!restored && nextLessonRequestRef.current === requestId) {
        setHomeworkDataSource('none');
        setError(err?.message || err);
      }
    } finally {
      if (nextLessonRequestRef.current === requestId) setLoading(false);
    }
  }, [GOAL_TYPE_TASK, effectiveStudentId, requestStudentId, restoreOfflineHomework]);

  const loadHomeworkDraft = useCallback(async () => {
    const requestId = homeworkDraftRequestRef.current + 1;
    homeworkDraftRequestRef.current = requestId;
    if (role !== 'teacher' || !effectiveStudentId) {
      setHomeworkDraft(null);
      setHomeworkDraftLoading(false);
      setHomeworkDraftError('');
      return;
    }
    setHomeworkDraftLoading(true);
    try {
      const result = await api.getStudentHomeworkDraft(effectiveStudentId);
      if (homeworkDraftRequestRef.current !== requestId) return;
      setHomeworkDraft(normalizeHomeworkComposerDraft(result?.draft));
      setHomeworkDraftError('');
    } catch (err) {
      if (homeworkDraftRequestRef.current !== requestId) return;
      setHomeworkDraft(null);
      setHomeworkDraftError(err?.message || err);
    } finally {
      if (homeworkDraftRequestRef.current === requestId) setHomeworkDraftLoading(false);
    }
  }, [effectiveStudentId, role]);

  const loadStudentProgress = useCallback(async () => {
    if (!effectiveStudentId) {
      setStudentProgress({});
      setStudentSolvedByTask({});
      return;
    }
    if (role === 'student' && progress && typeof progress === 'object' && Object.keys(progress).length > 0) {
      setStudentProgress(progress);
    }
    try {
      const data = await api.getStudentData(requestStudentId);
      setStudentProgress(data?.progress && typeof data.progress === 'object' ? data.progress : {});
      setStudentSolvedByTask(data?.solvedByTask && typeof data.solvedByTask === 'object'
        ? data.solvedByTask
        : {});
    } catch {
      if (!(role === 'student' && progress && typeof progress === 'object')) {
        setStudentProgress({});
      }
      setStudentSolvedByTask({});
    }
  }, [effectiveStudentId, progress, requestStudentId, role]);

  const loadSchedule = useCallback(async () => {
    if (!effectiveStudentId) {
      setLessonSchedule([]);
      setScheduleEditingId(null);
      setScheduleForm({ ...DEFAULT_SCHEDULE_FORM });
      return;
    }
    setScheduleLoading(true);
    try {
      const data = await api.getStudentSchedule(requestStudentId);
      setLessonSchedule(sortScheduleEntries(Array.isArray(data) ? data : []));
      setScheduleError('');
    } catch (err) {
      setLessonSchedule([]);
      setScheduleError(err?.message || err);
    } finally {
      setScheduleLoading(false);
    }
  }, [effectiveStudentId, requestStudentId]);

  const handleSyncScheduleFromGoogle = useCallback(async (options = {}) => {
    const silent = Boolean(options?.silent);
    if (role !== 'teacher' || !effectiveStudentId || googleScheduleSyncing) return;
    setGoogleScheduleSyncing(true);
    if (!silent) {
      setGoogleScheduleSyncMessage('');
      setGoogleScheduleSyncError('');
    }
    try {
      const data = await api.syncStudentScheduleFromGoogle(effectiveStudentId);
      const nextSchedule = Array.isArray(data?.schedule) ? data.schedule : [];
      setLessonSchedule(sortScheduleEntries(nextSchedule));
      await loadNextLesson();
      setScheduleError('');
      if (!silent) {
        const importedCount = Number(data?.importedCount) || 0;
        setGoogleScheduleSyncMessage(
          importedCount > 0
            ? `Из Google Calendar добавлено: ${importedCount}. Неделя: ${formatDate(data?.weekStart)} — ${formatDate(data?.weekEnd)}.`
            : 'На текущей неделе не нашёл событий с названием как у этого ученика.'
        );
      }
    } catch (err) {
      if (!silent) {
        setGoogleScheduleSyncError(err?.message || err);
      }
    } finally {
      setGoogleScheduleSyncing(false);
    }
  }, [effectiveStudentId, googleScheduleSyncing, loadNextLesson, role]);

  const loadScheduleRequests = useCallback(async () => {
    if (!effectiveStudentId || role === 'student') {
      setScheduleRequests([]);
      setScheduleRequestsError('');
      setScheduleRequestsLoading(false);
      return;
    }
    setScheduleRequestsLoading(true);
    try {
      const params = role === 'teacher'
        ? { studentId: effectiveStudentId, status: SCHEDULE_REQUEST_STATUS_PENDING }
        : {};
      const data = await api.getStudentScheduleRequests(params);
      const list = Array.isArray(data)
        ? data.map((entry) => normalizeScheduleRequest(entry)).filter(Boolean)
        : [];
      setScheduleRequests(list);
      setScheduleRequestsError('');
    } catch (err) {
      setScheduleRequests([]);
      setScheduleRequestsError(err?.message || err);
    } finally {
      setScheduleRequestsLoading(false);
    }
  }, [effectiveStudentId, role]);

  useEffect(() => {
    loadNextLesson();
  }, [loadNextLesson]);

  useEffect(() => {
    loadHomeworkDraft();
  }, [loadHomeworkDraft]);

  useEffect(() => {
    setHomeworkClock(Date.now());
    setHomeworkChecklistBusy({});
    homeworkComposerRequestRef.current += 1;
    refreshDataRequestRef.current += 1;
    setRefreshingData(false);
    setHomeworkComposerOpen(false);
    setHomeworkComposerPreparing(false);
    setHomeworkComposerError('');
    setHomeworkCarryoverSummary(null);
    setHomeworkDraftSaving(false);
    setHomeworkDraftDiscarding(false);
    setHomeworkDraftNotice('');
    setStudentSolvedByTask({});
    setLessonReplayStorageTotalBytes(0);
    setLessonReplayStorageStatus('ready');
    offlineHomeworkSignatureRef.current = '';
    setOfflineHomeworkState({ status: 'idle', savedAt: '', assets: null });
    setHomeworkDataSource('none');
    setTestsDataSource('none');
  }, [effectiveStudentId]);

  useEffect(() => {
    const intervalId = setInterval(() => setHomeworkClock(Date.now()), 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    loadScheduleRequests();
  }, [loadScheduleRequests]);

  useEffect(() => {
    if (role !== 'teacher' || !effectiveStudentId) {
      googleScheduleAutoSyncKeyRef.current = '';
      return;
    }
    const syncKey = String(effectiveStudentId);
    if (googleScheduleAutoSyncKeyRef.current === syncKey) return;
    googleScheduleAutoSyncKeyRef.current = syncKey;
    handleSyncScheduleFromGoogle({ silent: true });
  }, [effectiveStudentId, handleSyncScheduleFromGoogle, role]);

  useEffect(() => {
    loadStudentProgress();
  }, [loadStudentProgress, solvedRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    if (role !== 'teacher') {
      setQuestionDifficultyIndex({});
      setMockTaskAnalyticsByExam({});
      setHomeworkDurationAnalyticsLoading(false);
      return () => { cancelled = true; };
    }
    setHomeworkDurationAnalyticsLoading(true);
    Promise.allSettled([
      api.getQuestionDifficulties(),
      api.getMockExamTaskAnalytics(),
    ])
      .then(([questionResult, mockResult]) => {
        if (cancelled) return;
        setQuestionDifficultyIndex(
          questionResult.status === 'fulfilled' && questionResult.value && typeof questionResult.value === 'object'
            ? questionResult.value
            : {}
        );
        setMockTaskAnalyticsByExam(
          mockResult.status === 'fulfilled' && mockResult.value && typeof mockResult.value === 'object'
            ? mockResult.value
            : {}
        );
      })
      .finally(() => {
        if (!cancelled) setHomeworkDurationAnalyticsLoading(false);
      });
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    if (!effectiveStudentId || typeof window === 'undefined' || typeof window.EventSource !== 'function') {
      return undefined;
    }
    const source = new window.EventSource(resolveAuthenticatedApiUrl('/api/schedule-sync/stream'), { withCredentials: true });
    const handleScheduleSync = (event) => {
      let payload = null;
      try {
        payload = JSON.parse(event?.data || '{}');
      } catch {
        return;
      }
      const scope = String(payload?.scope || '').trim().toLowerCase();
      if (role === 'student' && scope === 'teacher-calendar-marks') {
        loadSchedule();
        return;
      }
      const payloadStudentId = String(payload?.studentId || '').trim();
      if (!payloadStudentId || payloadStudentId !== String(effectiveStudentId || '').trim()) return;
      if (scope === 'schedule-request') {
        loadScheduleRequests();
        return;
      }
      loadSchedule();
      loadNextLesson();
      loadScheduleRequests();
    };
    source.addEventListener('schedule-sync', handleScheduleSync);
    return () => {
      source.removeEventListener('schedule-sync', handleScheduleSync);
      source.close();
    };
  }, [effectiveStudentId, loadNextLesson, loadSchedule, loadScheduleRequests, role]);

  useEffect(() => {
    setScheduleEditingId(null);
    setScheduleForm({ ...DEFAULT_SCHEDULE_FORM });
    setScheduleError('');
    setGoogleScheduleSyncMessage('');
    setGoogleScheduleSyncError('');
    setScheduleRequestNotice('');
    setScheduleRequestActionBusyId('');
    if (role === 'student' && progress && typeof progress === 'object' && Object.keys(progress).length > 0) {
      setStudentProgress(progress);
      return;
    }
    setStudentProgress({});
  }, [effectiveStudentId, progress, role]);

  const loadLessonReminderSetting = useCallback(async () => {
    if (role !== 'student' || !effectiveStudentId) {
      setLessonReminderEnabled(false);
      setLessonReminderError('');
      setLessonReminderLoading(false);
      return;
    }
    setLessonReminderLoading(true);
    try {
      const data = await api.getPushLessonReminderSetting(requestStudentId);
      setLessonReminderEnabled(Boolean(data?.enabled));
      setLessonReminderError('');
    } catch (err) {
      setLessonReminderEnabled(false);
      setLessonReminderError(err?.message || err);
    } finally {
      setLessonReminderLoading(false);
    }
  }, [effectiveStudentId, requestStudentId, role]);

  useEffect(() => {
    loadLessonReminderSetting();
  }, [loadLessonReminderSetting]);

  useEffect(() => {
    if (role !== 'student') {
      setLessonReminderEnabled(false);
      setLessonReminderLoading(false);
      setLessonReminderSaving(false);
      setLessonReminderError('');
    }
  }, [role]);

  const handleRefreshData = useCallback(async () => {
    if (!effectiveStudentId || refreshingData) return;
    const requestId = refreshDataRequestRef.current + 1;
    refreshDataRequestRef.current = requestId;
    setRefreshingData(true);
    try {
      const requestParams = role === 'teacher'
        ? { studentId: effectiveStudentId, status: SCHEDULE_REQUEST_STATUS_PENDING }
        : {};
      const [nextLessonResult, scheduleResult, scheduleRequestsResult, studentDataResult] = await Promise.allSettled([
        api.getStudentNextLesson(requestStudentId),
        api.getStudentSchedule(requestStudentId),
        role === 'teacher' ? api.getStudentScheduleRequests(requestParams) : Promise.resolve([]),
        api.getStudentData(requestStudentId),
      ]);
      if (refreshDataRequestRef.current !== requestId) return;
      if (nextLessonResult.status === 'fulfilled') {
        const data = nextLessonResult.value;
        const list = Array.isArray(data?.homeworks) ? data.homeworks : [];
        const latest = data?.latest && typeof data.latest === 'object' ? data.latest : {};
        const safeData = buildNextLessonData(latest);
        setHomeworks(list);
        setNextLesson(safeData);
        setHomeworkDataSource('online');
        setError('');
      } else {
        const restored = role === 'student' ? await restoreOfflineHomework() : false;
        if (!restored) {
          setHomeworkDataSource('none');
          setError(nextLessonResult.reason?.message || nextLessonResult.reason);
        }
      }
      if (scheduleResult.status === 'fulfilled') {
        setLessonSchedule(sortScheduleEntries(Array.isArray(scheduleResult.value) ? scheduleResult.value : []));
        setScheduleError('');
      } else {
        setScheduleError(scheduleResult.reason?.message || scheduleResult.reason);
      }
      if (scheduleRequestsResult.status === 'fulfilled') {
        const list = Array.isArray(scheduleRequestsResult.value)
          ? scheduleRequestsResult.value.map((entry) => normalizeScheduleRequest(entry)).filter(Boolean)
          : [];
        setScheduleRequests(list);
        setScheduleRequestsError('');
      } else {
        setScheduleRequestsError(scheduleRequestsResult.reason?.message || scheduleRequestsResult.reason);
      }
      if (studentDataResult.status === 'fulfilled') {
        const nextProgress = studentDataResult.value?.progress;
        setStudentProgress(nextProgress && typeof nextProgress === 'object' ? nextProgress : {});
        const nextSolvedByTask = studentDataResult.value?.solvedByTask;
        setStudentSolvedByTask(nextSolvedByTask && typeof nextSolvedByTask === 'object'
          ? nextSolvedByTask
          : {});
      }
    } finally {
      if (refreshDataRequestRef.current === requestId) setRefreshingData(false);
    }
  }, [effectiveStudentId, refreshingData, requestStudentId, restoreOfflineHomework, role]);

  useEffect(() => {
    if (!effectiveStudentId) return;
    const poll = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
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
        setTestsDataSource('online');
        setTestsDbError('');
      })
      .catch(async (err) => {
        if (cancelled) return;
        if (role === 'student' && effectiveStudentId) {
          const offlinePackage = await loadOfflineHomeworkPackage(effectiveStudentId);
          if (cancelled) return;
          if (offlinePackage?.testsDb && typeof offlinePackage.testsDb === 'object') {
            setTestsDb(offlinePackage.testsDb);
            setTestsDataSource('offline');
            setTestsDbError('');
            setOfflineHomeworkState({
              status: 'offline',
              savedAt: String(offlinePackage.savedAt || ''),
              assets: offlinePackage.assets || null,
            });
            return;
          }
        }
        setTestsDb({});
        setTestsDataSource('none');
        setTestsDbError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId, role]);

  useEffect(() => {
    if (
      role !== 'student'
      || !effectiveStudentId
      || homeworkDataSource !== 'online'
      || testsDataSource !== 'online'
      || !Array.isArray(homeworks)
      || homeworks.length === 0
      || !testsDb
      || typeof testsDb !== 'object'
      || !isOfflineHomeworkStorageSupported()
    ) {
      return undefined;
    }

    const homeworkResponse = {
      homeworks,
      latest: homeworks[0] || nextLesson || {},
    };
    let signature = '';
    try {
      signature = JSON.stringify([homeworkResponse, testsDb]);
    } catch {
      signature = `${homeworks.length}:${String(homeworks[0]?.id || '')}:${String(homeworks[0]?.updatedAt || '')}`;
    }
    if (offlineHomeworkSignatureRef.current === signature) return undefined;
    offlineHomeworkSignatureRef.current = signature;

    let cancelled = false;
    setOfflineHomeworkState((current) => ({
      ...current,
      status: 'saving',
    }));
    saveOfflineHomeworkPackage({
      studentId: effectiveStudentId,
      homeworkResponse,
      testsDb,
      fetchAsset: authenticatedUploadsFetch,
    })
      .then((record) => {
        if (cancelled) return;
        setOfflineHomeworkState({
          status: record?.assets?.failed > 0 ? 'partial' : 'ready',
          savedAt: String(record?.savedAt || ''),
          assets: record?.assets || null,
        });
      })
      .catch((offlineError) => {
        if (cancelled) return;
        console.warn('[offline] homework save failed:', offlineError?.message || offlineError);
        offlineHomeworkSignatureRef.current = '';
        setOfflineHomeworkState((current) => ({
          ...current,
          status: 'error',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [
    effectiveStudentId,
    homeworkDataSource,
    homeworks,
    nextLesson,
    role,
    testsDataSource,
    testsDb,
  ]);

  useEffect(() => {
    if (role !== 'student' || typeof window === 'undefined') return undefined;
    const handleOnline = () => {
      offlineHomeworkSignatureRef.current = '';
      loadNextLesson();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadNextLesson, role]);

  useEffect(() => {
    if (!effectiveStudentId) {
      setMockExams([]);
      setMockExamsLoading(false);
      setMockExamsError('');
      return;
    }
    let cancelled = false;
    setMockExamsLoading(true);
    api.getMockExams(requestStudentId)
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
  }, [effectiveStudentId, requestStudentId]);

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
    const next = {};
    unique.forEach((item) => {
      const levelEntry = studentSolvedByTask?.[String(item.taskNumber)]?.[String(item.levelId)];
      const list = Array.isArray(levelEntry?.solved) ? levelEntry.solved : [];
      next[item.key] = new Set(list.map((value) => String(value)));
    });
    setSolvedByKey(next);
  }, [effectiveStudentId, homeworks, solvedRefreshKey, studentSolvedByTask]);

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
        <StudentSearchSelect
          students={studentsList}
          value={activeStudentId || ''}
          onChange={(value) => onSelectStudent?.(value || null)}
          disabled={studentsLoading || studentsList.length === 0}
          className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
        />
      </div>
    );
  };

  const getStudentWeekDateLabel = (entry) => {
    const date = parseScheduleDayKey(entry?.currentWeekDate || entry?.date);
    if (!date) return entry?.day || 'День занятия';
    const todayKey = formatScheduleDayKey(new Date());
    const tomorrowKey = formatScheduleDayKey(addScheduleDays(new Date(), 1));
    const dateKey = formatScheduleDayKey(date);
    const relativeLabel = dateKey === todayKey
      ? 'Сегодня'
      : (dateKey === tomorrowKey ? 'Завтра' : (entry?.day || 'День'));
    const dateLabel = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(' г.', '');
    return `${relativeLabel}, ${dateLabel}`;
  };

  const getLessonTaskDisplayText = (taskNumberValue) => {
    const taskNumber = Number(taskNumberValue);
    if (!Number.isFinite(taskNumber)) return '';
    const task = [...(Array.isArray(taskOptions) ? taskOptions : []), ...(Array.isArray(pythonTaskOptions) ? pythonTaskOptions : [])]
      .find((entry) => Number(entry?.number ?? entry?.id) === taskNumber);
    const displayNumber = task
      ? String(getTaskDisplayNumber(task) || formatTaskNumber(taskNumber) || taskNumber)
      : String(formatTaskNumber(taskNumber) || taskNumber);
    const title = String(task?.title || '').trim();
    return `Задание ${displayNumber}${title ? ` · ${title}` : ''}`;
  };

  const getLessonTopicDisplayText = (topic) => {
    if (!topic || typeof topic !== 'object') return '';
    if (topic.source === 'teacher') return String(topic.text || '').trim();
    const taskNumbers = Array.from(new Set(
      (Array.isArray(topic.taskNumbers) ? topic.taskNumbers : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    ));
    if (taskNumbers.length === 1) {
      return getLessonTaskDisplayText(taskNumbers[0]);
    }
    if (taskNumbers.length > 1) {
      const visible = taskNumbers.slice(0, 2).map((taskNumber) => String(formatTaskNumber(taskNumber) || taskNumber));
      const rest = taskNumbers.length - visible.length;
      return `Задания ${visible.join(', ')}${rest > 0 ? ` · ещё ${rest}` : ''}`;
    }
    return String(topic.text || '').trim();
  };

  const openStudentLessonDetail = (entry, topic = null) => {
    const occurrenceKey = String(entry?.key || getLessonTopicOccurrenceKey(effectiveStudentId, entry)).trim();
    if (!occurrenceKey) return;
    const dayKey = String(entry?.dayKey || entry?.currentWeekDate || entry?.date || '').trim();
    setSelectedLessonDetail({
      ...entry,
      key: occurrenceKey,
      dayKey,
      topic: topic || entry?.topic || null,
    });
    setLessonDetailData(null);
    setLessonDetailError('');
  };

  const closeStudentLessonDetail = useCallback(() => {
    setSelectedLessonDetail(null);
    setLessonDetailData(null);
    setLessonDetailLoading(false);
    setLessonDetailError('');
  }, []);

  const retryStudentLessonDetail = useCallback(() => {
    setLessonDetailReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const occurrenceKey = String(openLessonKey || '').trim();
    if (role !== 'student' || !occurrenceKey) return;
    if (String(selectedLessonDetail?.key || '').trim() !== occurrenceKey) {
      setSelectedLessonDetail({ key: occurrenceKey });
      setLessonDetailData(null);
      setLessonDetailError('');
      setShowLessonHistory(true);
    }
    onOpenLessonHandled?.();
  }, [onOpenLessonHandled, openLessonKey, role, selectedLessonDetail?.key]);

  const renderStudentWeekSchedule = () => {
    const now = new Date();
    const todayKey = formatScheduleDayKey(new Date());
    const lessonStates = displayWeekSchedule.map((entry) => {
      const key = getStudentLessonKey(entry);
      const start = getScheduleEntryStartDate(entry);
      const state = getScheduleEntryTimingState(entry, now);
      return {
        key,
        state,
        startTime: start?.getTime?.() || Number.POSITIVE_INFINITY,
      };
    });
    const nextLessonKey = lessonStates
      .filter((item) => item.state !== 'past')
      .sort((left, right) => left.startTime - right.startTime)[0]?.key || '';
    const lessonStateByKey = new Map(lessonStates.map((item) => [item.key, item.state]));
    const lessonsByDate = displayWeekSchedule.reduce((acc, entry) => {
      const key = String(entry?.currentWeekDate || '').trim();
      if (!key) return acc;
      const list = acc.get(key) || [];
      list.push(entry);
      acc.set(key, list);
      return acc;
    }, new Map());

    return (
      <div className="schedule-shell__student-board">
        <div className="schedule-shell__student-week-strip" aria-label={isShowingNearestScheduleWeek ? 'Дни ближайших занятий' : 'Дни текущей недели'}>
          {displayScheduleWeekDays.map((day, index) => {
            const dayLessons = lessonsByDate.get(day.dateKey) || [];
            const lessonsCount = dayLessons.length;
            const lessonTimes = dayLessons
              .map((entry) => String(entry?.time || '').trim())
              .filter(Boolean)
              .sort((left, right) => left.localeCompare(right, 'ru'));
            const lessonTimeLabel = lessonTimes.length > 0
              ? `${lessonTimes[0]}${lessonTimes.length > 1 ? ` +${lessonTimes.length - 1}` : ''}`
              : (lessonsCount > 0 ? 'Занятие' : '');
            const lessonTimesTitle = lessonTimes.length > 0
              ? `Занятия: ${lessonTimes.join(', ')}`
              : (lessonsCount > 0 ? getLessonCountLabel(lessonsCount) : '');
            const isToday = day.dateKey === todayKey;
            const isCalendarPastDay = Boolean(day.dateKey && day.dateKey < todayKey);
            const isCalendarFutureDay = Boolean(day.dateKey && day.dateKey > todayKey);
            const hasNextLesson = dayLessons.some((entry) => getStudentLessonKey(entry) === nextLessonKey);
            const isPastDay = lessonsCount > 0
              ? dayLessons.every((entry) => lessonStateByKey.get(getStudentLessonKey(entry)) === 'past')
              : isCalendarPastDay;
            const hasFutureLesson = lessonsCount > 0
              ? dayLessons.some((entry) => lessonStateByKey.get(getStudentLessonKey(entry)) !== 'past')
              : isCalendarFutureDay;
            return (
              <div
                key={day.dateKey || day.key}
                className={`schedule-shell__student-day-chip${lessonsCount > 0 ? ' schedule-shell__student-day-chip--has-lessons' : ''}${hasFutureLesson ? ' schedule-shell__student-day-chip--future' : ''}${isPastDay ? ' schedule-shell__student-day-chip--past' : ''}${hasNextLesson ? ' schedule-shell__student-day-chip--next' : ''}${isToday ? ' schedule-shell__student-day-chip--today' : ''}`}
                style={{ '--day-index': index }}
                title={lessonTimesTitle || undefined}
              >
                <span>{SCHEDULE_WEEKDAY_SHORT_LABELS[day.key] || day.label.slice(0, 2).toUpperCase()}</span>
                <strong>{day.date?.getDate?.() || ''}</strong>
                {lessonTimeLabel && <small>{lessonTimeLabel}</small>}
                {lessonsCount > 1 && <em>{lessonsCount}</em>}
              </div>
            );
          })}
        </div>

        {scheduleLoading && studentVisibleSchedule.length === 0 ? (
          <div className="schedule-shell__student-board-loading">
            <RefreshCcw size={15} className="animate-spin" />
            Загружаем занятия недели...
          </div>
        ) : studentVisibleSchedule.length === 0 ? (
          <div className="schedule-shell__student-board-empty">
            <Calendar size={18} />
            <div>
              <strong>Ближайших занятий пока нет</strong>
              <span>{role === 'teacher' ? 'Проверьте синхронизацию с Google Calendar.' : 'Если расписание изменилось, преподаватель обновит его сам.'}</span>
            </div>
          </div>
        ) : (
          <div className="schedule-shell__student-lessons">
            {studentVisibleSchedule.map((entry, index) => {
              const lessonKey = getStudentLessonKey(entry);
              const timingState = lessonStateByKey.get(lessonKey) || getScheduleEntryTimingState(entry, now);
              const isNextLesson = lessonKey === nextLessonKey;
              const isOverdueUnpaid = isScheduleEntryOverdueUnpaid(entry);
              const lessonUrl = normalizeHttpUrl(entry?.lessonLink);
              const duration = Number(entry?.durationMinutes);
              const durationLabel = Number.isFinite(duration) && duration > 0 ? `${Math.round(duration)} мин` : '60 мин';
              const lessonDate = parseScheduleDayKey(entry?.currentWeekDate || entry?.date);
              const dayNumber = lessonDate?.getDate?.() || '';
              const topicKey = getLessonTopicOccurrenceKey(effectiveStudentId, entry);
              const lessonTopic = topicKey ? lessonTopicsByOccurrence[topicKey] : null;
              const lessonTopicText = getLessonTopicDisplayText(lessonTopic);
              const canOpenLessonDetail = timingState === 'past';
              const emptyTopicText = timingState === 'past'
                ? 'Конспекты к занятию не найдены'
                : 'Тема пока не задана';
              return (
                <article
                  key={lessonKey}
                  className={`schedule-shell__student-lesson schedule-shell__student-lesson--${timingState}${isNextLesson ? ' schedule-shell__student-lesson--next' : ''}${isOverdueUnpaid ? ' schedule-shell__student-lesson--overdue-unpaid' : ''}${canOpenLessonDetail ? ' schedule-shell__student-lesson--clickable' : ''}`}
                  style={{ '--lesson-index': index }}
                  role={canOpenLessonDetail ? 'button' : undefined}
                  tabIndex={canOpenLessonDetail ? 0 : undefined}
                  aria-label={canOpenLessonDetail ? `Открыть материалы занятия ${getStudentWeekDateLabel(entry)}` : undefined}
                  onClick={canOpenLessonDetail ? () => openStudentLessonDetail(entry, lessonTopic) : undefined}
                  onKeyDown={canOpenLessonDetail ? (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openStudentLessonDetail(entry, lessonTopic);
                  } : undefined}
                >
                  <div className="schedule-shell__student-lesson-date">
                    <span>{SCHEDULE_WEEKDAY_SHORT_LABELS[entry.weekdayKey] || 'ДЕНЬ'}</span>
                    <strong>{dayNumber}</strong>
                  </div>
                  <div className="schedule-shell__student-lesson-main">
                    <div className="schedule-shell__student-lesson-heading">
                      <span>{getStudentWeekDateLabel(entry)}</span>
                      {isOverdueUnpaid && <em>Не оплачено</em>}
                    </div>
                    <div className="schedule-shell__student-lesson-time">
                      <Clock3 size={14} />
                      <strong>{getScheduleTimeRangeLabel(entry)}</strong>
                      <span>{durationLabel}</span>
                    </div>
                    <div
                      className={`schedule-shell__student-lesson-topic${lessonTopic ? ` schedule-shell__student-lesson-topic--${lessonTopic.source}` : ' schedule-shell__student-lesson-topic--empty'}`}
                      title={lessonTopicText || emptyTopicText}
                    >
                      <BookOpen size={13} />
                      <span>{lessonTopic?.source === 'teacher' ? 'Тема учителя' : (lessonTopic ? 'По конспектам' : 'Тема')}</span>
                      <strong>{lessonTopicText || (lessonTopicsLoading ? 'Определяем тему…' : emptyTopicText)}</strong>
                    </div>
                  </div>
                  {canOpenLessonDetail && (
                    <div className="schedule-shell__student-lesson-detail-hint" aria-hidden="true">
                      <span>Материалы</span>
                      <ChevronRight size={13} />
                    </div>
                  )}
                  {lessonUrl && !canOpenLessonDetail && (
                    <a
                      href={lessonUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="schedule-shell__student-lesson-link"
                    >
                      Открыть
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderStudentLessonHistory = () => showLessonHistory ? (
    <section className="student-lesson-history student-lesson-history--open">
      <div
        id="student-lesson-history-panel"
        className="student-lesson-history__panel"
      >
        {role === 'teacher' && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-violet-200/80 bg-violet-50/70 px-3 py-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-2 font-semibold">
              <HardDrive size={15} className="text-violet-600" />
              Все записи ученика
            </span>
            {lessonReplayStorageStatus === 'indexing' ? (
              <strong className="inline-flex items-center gap-1.5 text-sm text-violet-700">
                <RefreshCcw size={13} className="animate-spin" />
                Считаем размер…
              </strong>
            ) : (
              <strong className="text-sm text-violet-700">{formatLessonReplayStorageBytes(lessonReplayStorageTotalBytes)}</strong>
            )}
          </div>
        )}
        {lessonHistoryLoading && lessonHistory.length === 0 ? (
          <div className="student-lesson-history__status" role="status" aria-live="polite">
            <RefreshCcw size={16} className="animate-spin" />
            Собираем прошедшие занятия…
          </div>
        ) : lessonHistory.length === 0 && !lessonHistoryError ? (
          <div className="student-lesson-history__empty">
            <Calendar size={19} />
            <div>
              <strong>История пока пустая</strong>
              <span>Здесь появятся завершённые занятия и темы, которые вы проходили.</span>
            </div>
          </div>
        ) : (
          <div className="student-lesson-history__groups">
            {lessonHistoryGroups.map((group) => (
              <section className="student-lesson-history__month" key={group.key}>
                <h3>{group.label}</h3>
                <ol className="student-lesson-history__list">
                  {group.items.map((entry, index) => {
                    const lessonDate = parseScheduleDayKey(entry?.dayKey);
                    const dayNumber = lessonDate?.getDate?.() || '';
                    const weekdayIndex = lessonDate?.getDay?.();
                    const weekdayLabel = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'][weekdayIndex] || 'ДЕНЬ';
                    const duration = Number(entry?.durationMinutes);
                    const durationLabel = Number.isFinite(duration) && duration > 0 ? `${Math.round(duration)} мин` : '60 мин';
                    const topic = entry?.topic || null;
                    const topicText = getLessonTopicDisplayText(topic);
                    const topicSourceLabel = topic?.source === 'teacher'
                      ? 'Тема учителя'
                      : (topic ? 'По конспектам' : 'Тема');
                    return (
                      <li key={entry?.key || `${entry?.dayKey}-${entry?.time}-${index}`}>
                        <article
                          className="student-lesson-history__item student-lesson-history__item--clickable"
                          style={{ '--history-index': index }}
                          role="button"
                          tabIndex={0}
                          aria-label={`Открыть материалы занятия ${getLessonHistoryDateLabel(entry?.dayKey)}`}
                          onClick={() => openStudentLessonDetail(entry, topic)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            openStudentLessonDetail(entry, topic);
                          }}
                        >
                          <time className="student-lesson-history__date" dateTime={entry?.dayKey || undefined}>
                            <span>{weekdayLabel}</span>
                            <strong>{dayNumber}</strong>
                          </time>
                          <div className="student-lesson-history__main">
                            <div className="student-lesson-history__heading">
                              <strong>{getLessonHistoryDateLabel(entry?.dayKey)}</strong>
                              {entry?.subject && entry.subject !== DEFAULT_SCHEDULE_SUBJECT && <span>{entry.subject}</span>}
                            </div>
                            <div className="student-lesson-history__time">
                              <Clock3 size={14} />
                              <strong>{getScheduleTimeRangeLabel(entry)}</strong>
                              <span>{durationLabel}</span>
                            </div>
                            {role === 'teacher' && Number(entry?.replayStorage?.totalBytes) > 0 && (
                              <div
                                className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-lg border border-violet-200/80 bg-violet-50/70 px-2 py-1 text-[11px] font-bold text-violet-700"
                                title={`Данные: ${formatLessonReplayStorageBytes(entry.replayStorage.dataBytes)} · Снимки: ${formatLessonReplayStorageBytes(entry.replayStorage.snapshotBytes)} · Аудио: ${formatLessonReplayStorageBytes(entry.replayStorage.audioBytes)}`}
                              >
                                <HardDrive size={12} />
                                Запись: {formatLessonReplayStorageBytes(entry.replayStorage.totalBytes)}
                              </div>
                            )}
                            <div
                              className={`schedule-shell__student-lesson-topic${topic ? ` schedule-shell__student-lesson-topic--${topic.source}` : ' schedule-shell__student-lesson-topic--empty'}`}
                              title={topicText || 'Тема не сохранилась'}
                            >
                              <BookOpen size={13} />
                              <span>{topicSourceLabel}</span>
                              <strong>{topicText || 'Тема не сохранилась'}</strong>
                            </div>
                            <div className="student-lesson-history__detail-hint">
                              Открыть материалы <ChevronRight size={13} />
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}

        {lessonHistoryError && (
          <div className="student-lesson-history__error" role="alert">
            <span>{lessonHistoryError}</span>
            <button
              type="button"
              onClick={lessonHistoryErrorMode === 'more'
                ? handleLoadMoreLessonHistory
                : () => setLessonHistoryReloadKey((value) => value + 1)}
            >
              Повторить
            </button>
          </div>
        )}

        {lessonHistoryHasMore && !lessonHistoryError && (
          <button
            type="button"
            className="student-lesson-history__more"
            onClick={handleLoadMoreLessonHistory}
            disabled={lessonHistoryLoadingMore}
          >
            {lessonHistoryLoadingMore ? <RefreshCcw size={15} className="animate-spin" /> : <History size={15} />}
            {lessonHistoryLoadingMore ? 'Загружаем…' : 'Показать более ранние'}
          </button>
        )}
      </div>
    </section>
  ) : null;

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
      if (role === 'student') {
        await api.createStudentScheduleRequest({
          ...(requestStudentId ? { studentId: requestStudentId } : {}),
          type: scheduleEditingId ? SCHEDULE_REQUEST_TYPE_UPDATE : SCHEDULE_REQUEST_TYPE_CREATE,
          entryId: scheduleEditingId || undefined,
          payload,
        });
        resetScheduleForm();
        setScheduleRequestNotice('Запрос отправлен преподавателю и ожидает одобрения.');
        await loadScheduleRequests();
        setScheduleError('');
        return;
      }
      const savedEntry = scheduleEditingId
        ? await api.updateScheduleEntry(effectiveStudentId, scheduleEditingId, payload)
        : await api.addScheduleEntry(effectiveStudentId, payload);
      setLessonSchedule((prev) => sortScheduleEntries([
        ...prev.filter((item) => item?.id !== savedEntry?.id),
        savedEntry,
      ]));
      await loadNextLesson();
      resetScheduleForm();
      setScheduleRequestNotice('');
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
      if (role === 'student') {
        await api.createStudentScheduleRequest({
          ...(requestStudentId ? { studentId: requestStudentId } : {}),
          type: SCHEDULE_REQUEST_TYPE_DELETE,
          entryId: entry.id,
        });
        if (scheduleEditingId === entry.id) {
          resetScheduleForm();
        }
        setScheduleRequestNotice('Запрос на удаление отправлен преподавателю.');
        await loadScheduleRequests();
        setScheduleError('');
        return;
      }
      await api.deleteScheduleEntry(effectiveStudentId, entry.id);
      setLessonSchedule((prev) => prev.filter((item) => item?.id !== entry.id));
      await loadNextLesson();
      if (scheduleEditingId === entry.id) {
        resetScheduleForm();
      }
      setScheduleRequestNotice('');
      setScheduleError('');
    } catch (err) {
      setScheduleError(err?.message || err);
    } finally {
      setScheduleDeletingId(null);
    }
  };

  const handleResolveScheduleRequest = async (requestEntry, action) => {
    if (role !== 'teacher') return;
    const requestId = String(requestEntry?.id || '').trim();
    if (!requestId) return;
    const actionLabel = action === 'approve' ? 'одобрить' : 'отклонить';
    if (!window.confirm(`Подтвердить действие: ${actionLabel} запрос?`)) return;
    setScheduleRequestActionBusyId(requestId);
    try {
      await api.resolveStudentScheduleRequest(requestId, action);
      await Promise.all([loadSchedule(), loadNextLesson(), loadScheduleRequests()]);
      setScheduleRequestNotice(
        action === 'approve'
          ? 'Запрос одобрен, расписание обновлено.'
          : 'Запрос отклонён.'
      );
      setScheduleError('');
      setScheduleRequestsError('');
    } catch (err) {
      setScheduleRequestsError(err?.message || err);
    } finally {
      setScheduleRequestActionBusyId('');
    }
  };

  const handleToggleLessonReminder = async () => {
    if (role !== 'student' || !effectiveStudentId || lessonReminderSaving) return;
    setLessonReminderSaving(true);
    setLessonReminderError('');
    try {
      if (!pushEnabled && typeof onTogglePush === 'function') {
        await onTogglePush();
        return;
      }
      const nextEnabled = !lessonReminderEnabled;
      const data = await api.updatePushLessonReminderSetting(nextEnabled, requestStudentId);
      setLessonReminderEnabled(Boolean(data?.enabled));
    } catch (err) {
      setLessonReminderError(err?.message || err);
    } finally {
      setLessonReminderSaving(false);
    }
  };

  const lessonReminderStatusText = useMemo(() => {
    if (role !== 'student') return '';
    if (lessonReminderLoading) return 'Проверяем настройки напоминаний...';
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
    if (!pushEnabled && lessonReminderEnabled) {
      return 'Напоминания включены, но push выключены. Включите push, чтобы получать уведомления.';
    }
    if (!pushEnabled) {
      return useNativeAndroidPush
        ? 'Сначала включите push в приложении, затем включите напоминания о занятиях.'
        : 'Сначала включите push, затем включите напоминания о занятиях.';
    }
    if (lessonReminderEnabled) return 'Напоминания включены: уведомление придет за 10 минут до занятия.';
    return 'Включите напоминания, чтобы получать уведомление за 10 минут до занятия.';
  }, [
    lessonReminderEnabled,
    lessonReminderLoading,
    pushEnabled,
    pushError,
    pushPermission,
    pushSupported,
    role,
    useNativeAndroidPush,
  ]);

  const parseTargetInput = (input, maxCount) => {
    const safeMax = Number.isFinite(Number(maxCount)) && Number(maxCount) > 0
      ? Math.floor(Number(maxCount))
      : 200;
    const values = new Set();
    String(input || '')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\s*-\s*/g, '-')
      .split(/[\s,;]+/)
      .filter(Boolean)
      .forEach((part) => {
        const rangeMatch = part.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          const first = Math.max(1, Math.trunc(Number(rangeMatch[1])));
          const second = Math.max(1, Math.trunc(Number(rangeMatch[2])));
          const start = Math.min(first, second);
          const end = Math.min(Math.max(first, second), safeMax);
          for (let value = start; value <= end; value += 1) {
            values.add(value);
          }
          return;
        }
        const value = Math.trunc(Number(part));
        if (Number.isFinite(value) && value > 0 && value <= safeMax) {
          values.add(value);
        }
      });
    return [...values].sort((left, right) => left - right);
  };

  const formatTargetInput = (targets) => {
    if (!Array.isArray(targets)) return '';
    const values = Array.from(new Set(
      targets
        .map((val) => Number(val))
        .filter((val) => Number.isFinite(val) && val > 0)
        .map((val) => Math.trunc(val))
    )).sort((left, right) => left - right);
    if (values.length === 0) return '';
    const groups = [];
    let start = values[0];
    let end = values[0];
    for (let index = 1; index <= values.length; index += 1) {
      const value = values[index];
      if (value === end + 1) {
        end = value;
        continue;
      }
      groups.push(start === end ? String(start) : `${start}-${end}`);
      start = value;
      end = value;
    }
    return groups.join(', ');
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
              assignmentTier: getHomeworkGoalAssignmentTier(goal),
              mockExamId,
              mode: normalizeAssignedMockMode(goal?.mode),
              targetTaskKeys: Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : [],
              continuationOfHomeworkId: String(goal?.continuationOfHomeworkId || '').trim(),
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
            assignmentTier: getHomeworkGoalAssignmentTier(goal),
            taskNumber: taskNumberValue,
            levelId: isPythonGoal ? PYTHON_LEVEL_ID : (goal?.levelId || 'basic'),
            targetQuestions: Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [],
            targetQuestionIds: Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [],
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
        assignmentTier: 'required',
        taskNumber: Number.isFinite(normalizeTaskNumber(entry.taskNumber))
          ? String(normalizeTaskNumber(entry.taskNumber))
          : String(entry.taskNumber),
        levelId: isPythonTaskNumber(entryTaskNumber) ? PYTHON_LEVEL_ID : entry.levelId,
        targetQuestions: Array.isArray(entry.targetQuestions) ? entry.targetQuestions : [],
        targetQuestionIds: Array.isArray(entry.targetQuestionIds) ? entry.targetQuestionIds : [],
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
  const editableLessonSchedule = useMemo(
    () => (Array.isArray(lessonSchedule) ? lessonSchedule : []).filter((entry) => !isPaymentOverdueScheduleEntry(entry)),
    [lessonSchedule]
  );
  const overdueUnpaidSchedule = useMemo(
    () => buildOverdueUnpaidScheduleOccurrences(lessonSchedule),
    [lessonSchedule]
  );
  const sortedSchedule = useMemo(() => sortScheduleEntries(editableLessonSchedule), [editableLessonSchedule]);
  const currentScheduleWeekDays = useMemo(() => getCurrentScheduleWeekDays(), [effectiveStudentId]);
  const currentWeekSchedule = useMemo(
    () => sortStudentVisibleScheduleEntries(
      buildCurrentWeekScheduleEntries(editableLessonSchedule, currentScheduleWeekDays)
    ),
    [currentScheduleWeekDays, editableLessonSchedule]
  );
  const nearestScheduleWeekWindow = useMemo(
    () => buildNearestScheduleWeekWindow(editableLessonSchedule),
    [editableLessonSchedule, effectiveStudentId]
  );
  const displayScheduleWeekDays = nearestScheduleWeekWindow.weekDays?.length
    ? nearestScheduleWeekWindow.weekDays
    : currentScheduleWeekDays;
  const displayWeekSchedule = nearestScheduleWeekWindow.weekSchedule?.length
    ? nearestScheduleWeekWindow.weekSchedule
    : currentWeekSchedule;
  const isShowingNearestScheduleWeek = Boolean(nearestScheduleWeekWindow.weekOffset > 0);
  const studentVisibleSchedule = useMemo(
    () => {
      const displayOccurrenceKeys = new Set(displayWeekSchedule.map((entry) => getStudentScheduleOccurrenceKey(entry)));
      const overdueOutsideDisplayedWeek = overdueUnpaidSchedule.filter(
        (entry) => !displayOccurrenceKeys.has(getStudentScheduleOccurrenceKey(entry))
      );
      return sortStudentVisibleScheduleEntries([...overdueOutsideDisplayedWeek, ...displayWeekSchedule]);
    },
    [displayWeekSchedule, overdueUnpaidSchedule]
  );
  const lessonTopicsRange = useMemo(() => {
    const dayKeys = studentVisibleSchedule
      .map((entry) => String(entry?.currentWeekDate || entry?.date || '').trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'ru'));
    return dayKeys.length > 0
      ? { from: dayKeys[0], to: dayKeys[dayKeys.length - 1] }
      : null;
  }, [studentVisibleSchedule]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleLessonTopicUpdated = (event) => {
      const updatedStudentId = String(event?.detail?.studentId || '').trim();
      if (updatedStudentId && updatedStudentId !== String(effectiveStudentId || '').trim()) return;
      setLessonTopicsRefreshKey((value) => value + 1);
    };
    window.addEventListener('student-lesson-topic-updated', handleLessonTopicUpdated);
    return () => window.removeEventListener('student-lesson-topic-updated', handleLessonTopicUpdated);
  }, [effectiveStudentId]);

  useEffect(() => {
    if (!effectiveStudentId || !lessonTopicsRange) {
      setLessonTopicsByOccurrence({});
      setLessonTopicsLoading(false);
      lessonTopicsLoadedKeyRef.current = '';
      return undefined;
    }
    let cancelled = false;
    const loadKey = `${effectiveStudentId}|${lessonTopicsRange.from}|${lessonTopicsRange.to}`;
    if (lessonTopicsLoadedKeyRef.current !== loadKey) setLessonTopicsLoading(true);
    api.getLessonTopics(requestStudentId, lessonTopicsRange)
      .then((data) => {
        if (cancelled) return;
        const topics = data?.topics && typeof data.topics === 'object' && !Array.isArray(data.topics)
          ? data.topics
          : {};
        setLessonTopicsByOccurrence(topics);
        lessonTopicsLoadedKeyRef.current = loadKey;
      })
      .catch(() => {
        if (!cancelled) setLessonTopicsByOccurrence({});
      })
      .finally(() => {
        if (!cancelled) setLessonTopicsLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId, lessonTopicsRange, lessonTopicsRefreshKey, requestStudentId]);

  useEffect(() => {
    setShowLessonHistory(false);
    setLessonHistory([]);
    setLessonHistoryTotal(0);
    setLessonHistoryHasMore(false);
    setLessonHistoryNextOffset(null);
    setLessonHistoryLoading(false);
    setLessonHistoryLoadingMore(false);
    setLessonHistoryError('');
    setLessonHistoryErrorMode('');
    setLessonHistoryReloadKey(0);
    setSelectedLessonDetail(null);
    setLessonDetailData(null);
    setLessonDetailLoading(false);
    setLessonDetailError('');
    setLessonDetailReloadKey(0);
  }, [effectiveStudentId]);

  useEffect(() => {
    const occurrenceKey = String(selectedLessonDetail?.key || '').trim();
    if (!occurrenceKey || !['student', 'teacher'].includes(role) || !effectiveStudentId) {
      setLessonDetailLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLessonDetailLoading(true);
    setLessonDetailError('');
    api.getLessonHistoryDetail(requestStudentId, occurrenceKey)
      .then((data) => {
        if (cancelled) return;
        setLessonDetailData(data && typeof data === 'object' ? data : null);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setLessonDetailData(null);
        setLessonDetailError(loadError?.message || 'Не удалось загрузить материалы занятия');
      })
      .finally(() => {
        if (!cancelled) setLessonDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId, lessonDetailReloadKey, requestStudentId, role, selectedLessonDetail?.key]);

  useEffect(() => {
    if (!['student', 'teacher'].includes(role) || !showLessonHistory || !effectiveStudentId) return undefined;
    let cancelled = false;
    setLessonHistoryLoading(true);
    if (role === 'teacher') setLessonReplayStorageStatus('indexing');
    setLessonHistoryError('');
    setLessonHistoryErrorMode('');
    api.getLessonHistory(requestStudentId, { limit: LESSON_HISTORY_PAGE_SIZE, offset: 0 })
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setLessonHistory(items);
        setLessonHistoryTotal(Number.isFinite(Number(data?.total)) ? Number(data.total) : items.length);
        if (role === 'teacher') {
          const storageStatus = data?.replayStorageStatus === 'indexing' ? 'indexing' : 'ready';
          setLessonReplayStorageStatus(storageStatus);
          if (storageStatus === 'ready') {
            setLessonReplayStorageTotalBytes(Math.max(0, Number(data?.replayStorageTotalBytes) || 0));
          }
        } else {
          setLessonReplayStorageStatus('ready');
          setLessonReplayStorageTotalBytes(0);
        }
        setLessonHistoryHasMore(Boolean(data?.hasMore));
        setLessonHistoryNextOffset(data?.nextOffset !== null && Number.isFinite(Number(data?.nextOffset))
          ? Number(data.nextOffset)
          : null);
        setLessonHistoryErrorMode('');
      })
      .catch((loadError) => {
        if (cancelled) return;
        if (role === 'teacher') setLessonReplayStorageStatus('ready');
        setLessonHistoryError(loadError?.message || 'Не удалось загрузить историю занятий');
        setLessonHistoryErrorMode('initial');
      })
      .finally(() => {
        if (!cancelled) setLessonHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId, lessonHistoryReloadKey, lessonTopicsRefreshKey, requestStudentId, role, showLessonHistory]);

  useEffect(() => {
    if (
      role !== 'teacher'
      || !showLessonHistory
      || !effectiveStudentId
      || lessonReplayStorageStatus !== 'indexing'
    ) return undefined;
    const timer = setTimeout(() => {
      setLessonHistoryReloadKey((value) => value + 1);
    }, 3000);
    return () => clearTimeout(timer);
  }, [effectiveStudentId, lessonHistoryReloadKey, lessonReplayStorageStatus, role, showLessonHistory]);

  const handleLoadMoreLessonHistory = useCallback(async () => {
    if (lessonHistoryLoadingMore || !lessonHistoryHasMore || lessonHistoryNextOffset === null || !Number.isFinite(Number(lessonHistoryNextOffset))) return;
    setLessonHistoryLoadingMore(true);
    setLessonHistoryError('');
    setLessonHistoryErrorMode('');
    try {
      const data = await api.getLessonHistory(requestStudentId, {
        limit: LESSON_HISTORY_PAGE_SIZE,
        offset: Number(lessonHistoryNextOffset),
      });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setLessonHistory((current) => {
        const byKey = new Map(current.map((entry) => [entry?.key, entry]));
        nextItems.forEach((entry) => {
          if (entry?.key) byKey.set(entry.key, entry);
        });
        return Array.from(byKey.values());
      });
      setLessonHistoryTotal(Number.isFinite(Number(data?.total)) ? Number(data.total) : lessonHistoryTotal);
      if (role === 'teacher') {
        const storageStatus = data?.replayStorageStatus === 'indexing' ? 'indexing' : 'ready';
        setLessonReplayStorageStatus(storageStatus);
        if (storageStatus === 'ready') {
          setLessonReplayStorageTotalBytes(Math.max(0, Number(data?.replayStorageTotalBytes) || 0));
        }
      }
      setLessonHistoryHasMore(Boolean(data?.hasMore));
      setLessonHistoryNextOffset(data?.nextOffset !== null && Number.isFinite(Number(data?.nextOffset))
        ? Number(data.nextOffset)
        : null);
      setLessonHistoryErrorMode('');
    } catch (loadError) {
      setLessonHistoryError(loadError?.message || 'Не удалось загрузить более ранние занятия');
      setLessonHistoryErrorMode('more');
    } finally {
      setLessonHistoryLoadingMore(false);
    }
  }, [lessonHistoryHasMore, lessonHistoryLoadingMore, lessonHistoryNextOffset, lessonHistoryTotal, requestStudentId, role]);

  const lessonHistoryGroups = useMemo(() => {
    const groups = new Map();
    (Array.isArray(lessonHistory) ? lessonHistory : []).forEach((entry) => {
      const monthKey = String(entry?.dayKey || '').slice(0, 7) || 'earlier';
      const group = groups.get(monthKey) || {
        key: monthKey,
        label: getLessonHistoryMonthLabel(entry?.dayKey),
        items: [],
      };
      group.items.push(entry);
      groups.set(monthKey, group);
    });
    return Array.from(groups.values());
  }, [lessonHistory]);
  const studentOverdueUnpaidCount = useMemo(
    () => studentVisibleSchedule.filter((entry) => isScheduleEntryOverdueUnpaid(entry)).length,
    [studentVisibleSchedule]
  );
  const studentWeekRangeLabel = useMemo(() => {
    const first = displayScheduleWeekDays[0]?.date;
    const last = displayScheduleWeekDays[displayScheduleWeekDays.length - 1]?.date;
    if (!first || !last) return 'Ближайшие занятия';
    const formatShort = (date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
    return `${formatShort(first)} — ${formatShort(last)}`;
  }, [displayScheduleWeekDays]);
  const sortedScheduleRequests = useMemo(() => {
    const list = Array.isArray(scheduleRequests) ? [...scheduleRequests] : [];
    return list.sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
  }, [scheduleRequests]);
  const effectiveProgressMap = useMemo(() => {
    if (role === 'student' && progress && typeof progress === 'object' && Object.keys(progress).length > 0) {
      return progress;
    }
    return studentProgress;
  }, [progress, role, studentProgress]);
  const pendingScheduleRequests = useMemo(
    () => sortedScheduleRequests.filter((entry) => entry.status === SCHEDULE_REQUEST_STATUS_PENDING),
    [sortedScheduleRequests]
  );
  const topErrorBanners = useMemo(() => ([
    {
      key: 'next-lesson',
      message: error,
      tone: 'rose',
      label: 'Домашка и следующее занятие',
    },
    {
      key: 'tests-db',
      message: testsDbError,
      tone: 'amber',
      label: 'База заданий',
    },
    {
      key: 'homework-draft',
      message: role === 'teacher' ? homeworkDraftError : '',
      tone: 'amber',
      label: 'Черновик домашки',
    },
    {
      key: 'mock-exams',
      message: mockExamsError,
      tone: 'amber',
      label: 'Пробники',
    },
    {
      key: 'schedule',
      message: scheduleError,
      tone: 'rose',
      label: 'График занятий',
    },
    {
      key: 'schedule-requests',
      message: role === 'teacher' ? scheduleRequestsError : '',
      tone: 'amber',
      label: 'Запросы на изменение расписания',
    },
  ].filter((entry) => String(entry.message || '').trim())), [
    error,
    homeworkDraftError,
    mockExamsError,
    role,
    scheduleError,
    scheduleRequestsError,
    testsDbError,
  ]);

  const nextHomeworkEntry = sortedHomeworks[0] || null;
  const previousHomeworkEntries = sortedHomeworks.slice(1);
  const totalHomeworkCount = sortedHomeworks.length;
  const roadmapFocusTaskNumbers = useMemo(() => {
    const next = new Set();
    normalizeEntryGoals(nextHomeworkEntry)
      .filter((goal) => goal.type === GOAL_TYPE_TASK)
      .forEach((goal) => {
        const taskNumber = Number(goal?.taskNumber);
        if (Number.isFinite(taskNumber)) next.add(taskNumber);
      });
    return next;
  }, [nextHomeworkEntry]);

  const buildGoalView = (goal, goalIndex = 0) => {
    const goalType = normalizeGoalType(goal);
    if (goalType === GOAL_TYPE_MOCK) {
      const mockExamId = normalizeMockExamId(goal?.mockExamId);
      if (!mockExamId) return null;
      const mockExam = mockExamById[mockExamId] || null;
      const targetTaskKeys = Array.from(new Set(
        (Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : [])
          .map((taskKey) => String(taskKey || '').trim())
          .filter(Boolean)
      ));
      const mockProgress = getMockGoalProgress(mockExam, mockAttemptsByExam?.[mockExamId], targetTaskKeys);
      const totalCount = Number(mockProgress.totalCount) || 0;
      const solvedCount = Number(mockProgress.solvedCount) || 0;
      const progressPercent = totalCount > 0
        ? Math.max(0, Math.min(100, Math.round((solvedCount / totalCount) * 100)))
        : 0;
      return {
        viewKey: `mock-${mockExamId}-${goalIndex}`,
        sourceGoalIndex: goalIndex,
        type: GOAL_TYPE_MOCK,
        assignmentTier: getHomeworkGoalAssignmentTier(goal),
        mockExamId,
        mode: normalizeAssignedMockMode(goal?.mode),
        targetTaskKeys,
        heading: `Пробник · ${mockExam?.title || 'Пробник недоступен'}`,
        targetStatus: Array.isArray(mockProgress.taskStatus) ? mockProgress.taskStatus : [],
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
    const targetDescriptors = resolveHomeworkTaskTargetDescriptors(goal, questionsList);
    const targetNumbers = targetDescriptors.map((target) => target.questionNumber);
    const targetsKey = taskNumber && levelId ? `${taskNumber}|${levelId}` : null;
    const solvedSet = targetsKey ? solvedByKey?.[targetsKey] : null;
    const targetStatus = targetDescriptors.map((target) => ({
      num: target.questionNumber,
      questionId: target.questionId,
      solved: target.questionId ? solvedSet?.has(String(target.questionId)) : false,
    }));
    const solvedCount = targetStatus.filter((item) => item.solved).length;
    const progressPercent = targetStatus.length > 0
      ? Math.max(0, Math.min(100, Math.round((solvedCount / targetStatus.length) * 100)))
      : 0;
    const heading = isPythonGoal
      ? `Python ${pythonTask?.title || (taskNumber ? `тема ${taskNumber}` : 'тема')}`
      : isOptionalHomeworkGoal(goal)
        ? `Задание ${taskDisplay} · уровень: ${levelLabel}`
        : `Задание ${taskDisplay} · ${levelLabel}`;
    return {
      viewKey: `task-${taskNumber}-${levelId}-${goalIndex}`,
      sourceGoalIndex: goalIndex,
      type: GOAL_TYPE_TASK,
      assignmentTier: getHomeworkGoalAssignmentTier(goal),
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
    const requiredGoals = list.filter((item) => !isOptionalHomeworkGoal(item));
    const optionalGoals = list.filter((item) => isOptionalHomeworkGoal(item));
    const orderedList = [...requiredGoals, ...optionalGoals];
    const totalCount = requiredGoals.reduce(
      (sum, item) => sum + (Number(item?.totalCount) > 0 ? Number(item.totalCount) : 0),
      0
    );
    const solvedCount = requiredGoals.reduce((sum, item) => {
      const itemTotal = Number(item?.totalCount) || 0;
      const itemSolved = Number(item?.solvedCount) || 0;
      if (itemTotal <= 0) return sum;
      return sum + Math.min(itemSolved, itemTotal);
    }, 0);
    const remainingCount = Math.max(totalCount - solvedCount, 0);
    const progressPercent = totalCount > 0
      ? Math.max(0, Math.min(100, Math.round((solvedCount / totalCount) * 100)))
      : 0;
    const pendingGoals = orderedList.filter((item) => {
      const itemTotal = Number(item?.totalCount) || 0;
      const itemSolved = Number(item?.solvedCount) || 0;
      if (itemTotal <= 0) return true;
      return itemSolved < itemTotal;
    });
    const completedGoals = orderedList.filter((item) => {
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
      requiredGoals,
      optionalGoals,
      requiredCompleted: requiredGoals.length === 0 || requiredGoals.every((item) => {
        const itemTotal = Number(item?.totalCount) || 0;
        return itemTotal > 0 && Number(item?.solvedCount) >= itemTotal;
      }),
      optionalCompleted: optionalGoals.length > 0 && optionalGoals.every((item) => {
        const itemTotal = Number(item?.totalCount) || 0;
        return itemTotal > 0 && Number(item?.solvedCount) >= itemTotal;
      }),
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
  const teacherHomeworkReviewItems = role === 'teacher'
    ? buildTeacherHomeworkReviewItems({
        goalViews: nextHomeworkGoalViews,
        testsDb,
        mockExamById,
        mockAttemptsByExam,
        levels: LEVELS,
        formatTaskNumber,
      })
    : [];
  const teacherHomeworkReviewPendingCount = teacherHomeworkReviewItems.filter((item) => !item.solved).length;
  const teacherNextLessonEntry = useMemo(() => {
    if (role !== 'teacher') return null;
    const now = new Date(homeworkClock);
    return studentVisibleSchedule
      .filter((entry) => !isPaymentOverdueScheduleEntry(entry))
      .map((entry) => ({ entry, start: getScheduleEntryStartDate(entry) }))
      .filter(({ entry, start }) => start && getScheduleEntryTimingState(entry, now) !== 'past')
      .sort((left, right) => left.start.getTime() - right.start.getTime())[0]?.entry || null;
  }, [homeworkClock, role, studentVisibleSchedule]);
  const teacherLessonBriefing = role === 'teacher'
    ? buildTeacherLessonBriefing({
        studentLabel: selectedStudent ? getStudentLabel(selectedStudent) : '',
        lessonStart: getScheduleEntryStartDate(teacherNextLessonEntry),
        lessonSubject: teacherNextLessonEntry?.subject,
        homeworkEntry: nextHomeworkEntry,
        homeworkGoalSummary: nextHomeworkSummary,
        homeworkChecklistItems: getHomeworkChecklistItems(nextHomeworkEntry),
        homeworkDueAt: resolveHomeworkDueAt(nextHomeworkEntry),
        focusLabels: nextHomeworkSummary.pendingGoals.map((goal) => goal?.heading),
        now: homeworkClock,
      })
    : null;

  const handleOpenBriefingHomework = () => {
    homeworkReviewOpenStudentIdRef.current = String(effectiveStudentId || '').trim();
    setTeacherHomeworkReviewOpen(true);
  };

  useEffect(() => {
    if (role !== 'teacher' || !homeworkReviewRequest) return;
    const requestedStudentId = String(homeworkReviewRequest?.studentId || '').trim();
    if (!requestedStudentId) {
      onHomeworkReviewRequestHandled?.(homeworkReviewRequest);
      return;
    }
    if (String(effectiveStudentId || '').trim() !== requestedStudentId) {
      onSelectStudent?.(requestedStudentId);
      return;
    }
    homeworkReviewOpenStudentIdRef.current = requestedStudentId;
    setTeacherHomeworkReviewOpen(true);
    onHomeworkReviewRequestHandled?.(homeworkReviewRequest);
  }, [
    effectiveStudentId,
    homeworkReviewRequest,
    onHomeworkReviewRequestHandled,
    onSelectStudent,
    role,
  ]);

  useEffect(() => {
    if (homeworkReviewRequest) return;
    if (!teacherHomeworkReviewOpen) return;
    const openedForStudentId = String(homeworkReviewOpenStudentIdRef.current || '').trim();
    const currentStudentId = String(effectiveStudentId || '').trim();
    if (openedForStudentId && openedForStudentId === currentStudentId) return;
    homeworkReviewOpenStudentIdRef.current = '';
    setTeacherHomeworkReviewOpen(false);
  }, [effectiveStudentId, homeworkReviewRequest, nextHomeworkEntry?.id, teacherHomeworkReviewOpen]);

  useEffect(() => {
    setShowHistory(false);
  }, [effectiveStudentId, totalHomeworkCount]);

  useEffect(() => {
    setVisibleHomeworkDayPlans({});
    setHomeworkDayPlanBusy({});
  }, [effectiveStudentId]);

  const handlePlanHomeworkByDay = async (entry) => {
    if (role !== 'student' || !entry?.id) return;
    const homeworkId = String(entry.id);
    if (homeworkDayPlanBusy[homeworkId]) return;
    setHomeworkDayPlanBusy((prev) => ({ ...prev, [homeworkId]: true }));
    try {
      let plannedEntry = entry;
      if (
        entry?.dayPlan?.planningMode !== 'student-every-day'
        || !entry?.dayPlan?.enabled
        || !Array.isArray(entry?.dayPlan?.dayPlan)
      ) {
        const result = await api.planStudentHomeworkByDay(
          homeworkId,
          getHomeworkCalendarOffsetMinutes()
        );
        if (result?.homework && typeof result.homework === 'object') {
          plannedEntry = result.homework;
          setHomeworks((prev) => prev.map((homework) => (
            String(homework?.id || '') === homeworkId
              ? { ...homework, ...plannedEntry }
              : homework
          )));
          if (String(homeworks?.[0]?.id || '') === homeworkId) {
            setNextLesson(buildNextLessonData(plannedEntry));
          }
        }
      }
      setVisibleHomeworkDayPlans((prev) => ({ ...prev, [homeworkId]: true }));
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setHomeworkDayPlanBusy((prev) => {
        const next = { ...prev };
        delete next[homeworkId];
        return next;
      });
    }
  };

  const handleToggleHomeworkChecklistItem = async (entry, item) => {
    if (role !== 'student' || !entry?.id || !item?.id) return;
    const busyKey = `${entry.id}:${item.id}`;
    if (homeworkChecklistBusy[busyKey]) return;
    const nextCompleted = !item.completedAt;
    setHomeworkChecklistBusy((prev) => ({ ...prev, [busyKey]: true }));
    try {
      const result = await api.updateStudentHomeworkChecklistItem(entry.id, item.id, nextCompleted);
      const updatedEntry = result?.homework && typeof result.homework === 'object'
        ? result.homework
        : null;
      if (updatedEntry) {
        setHomeworks((prev) => prev.map((homework) => (
          String(homework?.id || '') === String(updatedEntry.id || '')
            ? { ...homework, ...updatedEntry }
            : homework
        )));
        if (String(homeworks?.[0]?.id || '') === String(updatedEntry.id || '')) {
          setNextLesson(buildNextLessonData(updatedEntry));
        }
      }
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setHomeworkChecklistBusy((prev) => {
        const next = { ...prev };
        delete next[busyKey];
        return next;
      });
    }
  };

  const renderHomeworkEntryCard = (entry, section = 'next', key) => {
    if (!entry) return null;
    const isNextSection = section === 'next';
    const dateText = formatDate(entry?.issuedAt);
    const deadlineMeta = getHomeworkDeadlineMeta(entry, homeworkClock);
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
    const tracksNextLesson = normalizeHomeworkDueAtMode(entry?.dueAtMode)
      === HOMEWORK_DUE_AT_MODE_NEXT_LESSON;
    const sectionLabel = isNextSection
      ? (tracksNextLesson ? 'К следующему уроку' : 'Срок задан вручную')
      : 'Предыдущая домашка';
    const summaryStatus = goalsSummary.goalCount === 0
      ? { label: 'Цели не заданы', tone: 'border-slate-200 bg-white text-slate-600' }
      : goalsSummary.requiredGoals.length === 0
        ? goalsSummary.optionalCompleted
          ? { label: 'Всё выполнено', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
          : { label: 'Только дополнительно', tone: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700' }
        : goalsSummary.requiredCompleted
          ? goalsSummary.optionalGoals.length > 0 && !goalsSummary.optionalCompleted
            ? { label: 'Основное выполнено', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
            : { label: 'Всё выполнено', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
        : goalsSummary.solvedCount > 0
          ? { label: 'В процессе', tone: 'border-amber-200 bg-amber-50 text-amber-700' }
          : { label: 'Нужно начать', tone: 'border-purple-200 bg-purple-50 text-purple-700' };
    const checklistItems = getHomeworkChecklistItems(entry);
    const visibleChecklistItems = scheduleCompactMode ? checklistItems.slice(0, 4) : checklistItems;
    const hiddenChecklistCount = Math.max(checklistItems.length - visibleChecklistItems.length, 0);
    const completedChecklistCount = checklistItems.filter((item) => Boolean(item.completedAt)).length;
    const lessonUrl = normalizeHttpUrl(entry?.lessonLink);
    const boardUrl = normalizeHttpUrl(entry?.boardLink);
    const durationEstimate = role === 'teacher'
      ? estimateHomeworkDuration({
          goalViews,
          questionDifficultyIndex,
          mockTaskAnalyticsByExam,
        })
      : null;
    const durationEstimateLoading = role === 'teacher' && homeworkDurationAnalyticsLoading;

    const openGoal = (goalView) => {
      if (!goalView) return;
      if (goalView.type === GOAL_TYPE_MOCK) {
        const firstPendingTask = (goalView.targetStatus || []).find((item) => !item?.solved)
          || goalView.targetStatus?.[0]
          || null;
        onOpenMockGoal?.(
          goalView.mockExamId,
          firstPendingTask?.taskKey || firstPendingTask?.taskNumber || null,
          {
            fromHomework: true,
            mode: goalView.mode,
            targetTaskKeys: goalView.targetTaskKeys,
          }
        );
        return;
      }
      onOpenTask?.(goalView.taskNumber, goalView.levelId, goalView.targetNumbers);
    };

    if (isNextSection) {
      const requiredGoalViews = goalViews.filter((goalView) => !isOptionalHomeworkGoal(goalView));
      const optionalGoalViews = goalViews.filter((goalView) => isOptionalHomeworkGoal(goalView));
      const primaryRequiredGoal = requiredGoalViews.find((goalView) => {
        const total = Number(goalView?.totalCount) || 0;
        return total <= 0 || Number(goalView?.solvedCount) < total;
      }) || requiredGoalViews[0] || null;
      const orderedRequiredGoalViews = primaryRequiredGoal
        ? [primaryRequiredGoal, ...requiredGoalViews.filter((goalView) => goalView !== primaryRequiredGoal)]
        : requiredGoalViews;
      const orderedGoalViews = [...orderedRequiredGoalViews, ...optionalGoalViews];
      const homeworkId = String(entry?.id || '');
      const dayPlanAvailable = Boolean(
        entry?.dayPlan?.enabled && Array.isArray(entry?.dayPlan?.dayPlan) && entry.dayPlan.dayPlan.length > 0
      );
      const dayPlanVisible = role === 'student' && Boolean(visibleHomeworkDayPlans[homeworkId]);
      const dayPlanBusy = Boolean(homeworkDayPlanBusy[homeworkId]);

      const renderCurrentGoalBlock = (goalView, goalIndex) => {
        if (!goalView) return null;
        const progressPercent = Math.max(0, Math.min(100, Number(goalView.progressPercent) || 0));
        const remaining = goalView.totalCount > 0
          ? Math.max(goalView.totalCount - goalView.solvedCount, 0)
          : 0;
        const targetItems = Array.isArray(goalView.targetStatus)
          ? goalView.targetStatus
          : [];
        const isCompleted = goalView.totalCount > 0 && remaining === 0;
        const isOptional = isOptionalHomeworkGoal(goalView);
        const showTierHeading = goalIndex === 0
          || isOptionalHomeworkGoal(orderedGoalViews[goalIndex - 1]) !== isOptional;
        const isOpenable = Boolean(
          (goalView.type === GOAL_TYPE_MOCK && onOpenMockGoal)
          || (goalView.type === GOAL_TYPE_TASK && onOpenTask)
        );
        const actionLabel = isCompleted
          ? 'Посмотреть'
          : goalView.solvedCount > 0
            ? (goalView.type === GOAL_TYPE_MOCK ? 'Продолжить пробник' : 'Продолжить цель')
            : isOptional
              ? 'Сделать по желанию'
              : (goalView.type === GOAL_TYPE_MOCK ? 'Начать пробник' : 'Начать цель');
        const statusLabel = isCompleted
          ? 'Готово'
          : goalView.solvedCount > 0
            ? 'В процессе'
            : 'Можно начать';

        return (
          <React.Fragment key={`student-homework-goal-${goalView.viewKey}`}>
            {showTierHeading && (
              <div className={`${goalIndex > 0 ? 'mt-5 border-t border-purple-100 pt-4' : ''} flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] ${isOptional ? 'text-fuchsia-700' : 'text-purple-700'}`}>
                {isOptional ? 'Если останутся силы' : 'Нужно сделать'}
                {isOptional && <span className="normal-case tracking-normal text-slate-400">не влияет на завершение домашки</span>}
              </div>
            )}
          <div
            className={`student-today-homework__goal-segment ${goalIndex > 0 && !showTierHeading ? 'student-today-homework__next-goal mt-5 border-t border-purple-100 pt-5' : showTierHeading && goalIndex > 0 ? 'mt-3' : ''}`}
          >
            <div className="flex items-start gap-3">
              <span className={`student-today-homework__goal-step inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${isCompleted ? 'student-today-homework__goal-step--complete' : ''}`}>
                {isCompleted ? <CheckCircle size={17} /> : goalIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-purple-600">
                        Часть {goalIndex + 1} из {orderedGoalViews.length}
                      </span>
                      {isOptional && (
                        <span className="inline-flex rounded-full bg-fuchsia-100 px-2 py-0.5 text-[9px] font-black text-fuchsia-700">
                          Дополнительно
                        </span>
                      )}
                      <span className={`student-today-homework__goal-state inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-700'
                          : goalView.solvedCount > 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-purple-100 text-purple-700'
                      }`}>
                        {statusLabel}
                      </span>
                      {goalIndex > 0 ? (
                        <span className="student-today-homework__free-order-note text-[10px] font-semibold text-slate-400">можно выполнить первой</span>
                      ) : null}
                    </div>
                    <strong className="mt-1.5 block text-base font-black leading-tight text-slate-900">{goalView.heading}</strong>
                    <div className="mt-1 text-xs text-slate-500">
                      {goalView.totalCount > 0
                        ? isCompleted ? 'Все задания выполнены.' : `Осталось выполнить: ${remaining}`
                        : 'Откройте цель, чтобы начать.'}
                    </div>
                  </div>
                  {goalView.totalCount > 0 ? (
                    <span className="student-today-homework__goal-count rounded-full border border-purple-100 bg-white px-2.5 py-1 text-[10px] font-black text-purple-700 shadow-sm">
                      {`${goalView.solvedCount}/${goalView.totalCount}`}
                    </span>
                  ) : null}
                </div>

                {goalView.totalCount > 0 ? (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-purple-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${isCompleted ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-violet-600 to-fuchsia-500'}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                ) : null}

                <div className="student-today-homework__goal-controls mt-3 flex flex-wrap items-end justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {targetItems.map((item) => {
                      const itemLabel = item.num ?? item.label ?? item.taskKey;
                      return (
                        <span
                          key={`student-goal-${goalView.viewKey}-${itemLabel}`}
                          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg border px-2 text-[10px] font-black ${
                            item.solved
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                              : 'border-purple-200 bg-white text-purple-700'
                          }`}
                        >
                          №{itemLabel}{item.solved ? ' ✓' : ''}
                        </span>
                      );
                    })}
                  </div>

                  {isOpenable ? (
                    <button
                      type="button"
                      onClick={() => openGoal(goalView)}
                      className={`student-today-homework__goal-action inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition hover:-translate-y-0.5 ${
                        isCompleted
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100'
                          : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_10px_22px_rgba(124,58,237,0.2)] hover:from-violet-700 hover:to-fuchsia-700'
                      }`}
                    >
                      {actionLabel}
                      <ArrowRight size={15} />
                    </button>
                  ) : (
                    <div className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-purple-200 bg-white/80 px-3 py-2 text-xs font-bold text-purple-700">
                      Цель доступна в разделе «Практика»
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </React.Fragment>
        );
      };

      return (
        <article key={key} className="student-today-homework-card relative overflow-hidden rounded-[26px] border border-purple-200/85 bg-white/94 p-4 shadow-[0_18px_42px_rgba(99,102,241,0.13)] md:p-5">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-purple-100/70 blur-3xl" />
          <header className="student-today-homework__header relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-[0_10px_22px_rgba(124,58,237,0.24)]">
                <ListChecks size={20} />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-purple-500">{sectionLabel}</div>
                <h4 className="student-today-homework__headline mt-1 text-xl font-black leading-tight text-slate-950 md:text-2xl">
                  Домашняя работа
                </h4>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${deadlineMeta.tone}`}>
                    <Clock3 size={11} />
                    {deadlineMeta.label}
                    {deadlineMeta.relativeLabel ? <span className="opacity-75">· {deadlineMeta.relativeLabel}</span> : null}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${summaryStatus.tone}`}>
                    {summaryStatus.label}
                  </span>
                  {role === 'teacher' && (
                    <span
                      className="student-today-homework__duration-chip inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700"
                      title={durationEstimate?.usedFallback
                        ? 'Оценка по среднему активному времени решения. Для заданий без истории использовано среднее по похожим заданиям. Чек-лист и перерывы не включены.'
                        : 'По среднему активному времени решения этих заданий учениками. Чек-лист и перерывы не включены.'}
                    >
                      <Clock3 size={11} />
                      {durationEstimateLoading
                        ? 'Считаем время…'
                        : durationEstimate
                          ? `Примерно ${formatHomeworkDurationMinutes(durationEstimate.totalMinutes)} всего`
                          : 'Время пока не рассчитано'}
                      {!durationEstimateLoading && durationEstimate?.optionalMinutes > 0
                        ? ` · ${formatHomeworkDurationMinutes(durationEstimate.optionalMinutes)} дополнительно`
                        : ''}
                    </span>
                  )}
                  {dateText ? <span className="text-[10px] font-medium text-slate-400">Выдано {dateText}</span> : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
              <div
                className="student-today-homework__progress grid h-[62px] w-[62px] place-items-center rounded-full p-[5px] shadow-[0_8px_20px_rgba(124,58,237,0.12)]"
                style={{ '--student-homework-progress': `${goalsSummary.progressPercent}%` }}
                role="progressbar"
                aria-label={`Выполнено ${goalsSummary.progressPercent}%`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={goalsSummary.progressPercent}
              >
                <span className="student-today-homework__progress-core grid h-full w-full place-items-center rounded-full bg-white text-sm font-black text-purple-700">
                  {goalsSummary.totalCount > 0 ? `${goalsSummary.progressPercent}%` : '—'}
                </span>
              </div>
              {role === 'teacher' && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => startEditHomework(entry)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-purple-200 hover:text-purple-700"
                  >
                    <Pencil size={13} />
                    Редактировать
                  </button>
                  {entry.id && (
                    <button
                      type="button"
                      onClick={() => handleDeleteHomework(entry)}
                      disabled={deletingId === entry.id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                    >
                      <Trash2 size={13} />
                      {deletingId === entry.id ? 'Удаление...' : 'Удалить'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </header>

          {role === 'student' && (
            <div className="relative mt-3 flex justify-end">
              {dayPlanVisible ? (
                <button
                  type="button"
                  onClick={() => setVisibleHomeworkDayPlans((prev) => ({ ...prev, [homeworkId]: false }))}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                  aria-expanded="true"
                >
                  <EyeOff size={13} />
                  Скрыть план по дням
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handlePlanHomeworkByDay(entry)}
                  disabled={dayPlanBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-purple-200 hover:bg-purple-50/60 hover:text-purple-700 disabled:cursor-wait disabled:opacity-60"
                  aria-expanded="false"
                >
                  <CalendarDays size={13} className={dayPlanBusy ? 'animate-pulse' : ''} />
                  {dayPlanBusy ? 'Планируем…' : 'Распланировать по дням'}
                </button>
              )}
            </div>
          )}

          {dayPlanVisible && dayPlanAvailable && (
            <div className="relative mt-4">
              <HomeworkDayPlan
                entry={entry}
                goalViews={goalViews}
                checklistItems={checklistItems}
                mockExamById={mockExamById}
                role={role}
                onOpenTask={onOpenTask}
                onOpenMockGoal={onOpenMockGoal}
                onToggleChecklistItem={(item) => handleToggleHomeworkChecklistItem(entry, item)}
                isChecklistItemBusy={(item) => Boolean(homeworkChecklistBusy[`${entry?.id || ''}:${item?.id || ''}`])}
              />
            </div>
          )}

          {dayPlanVisible && dayPlanAvailable && (
            <div className="student-today-homework__full-heading relative mt-7 flex items-center gap-2.5 px-1">
              <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-purple-200 bg-purple-50 text-purple-700">
                <ListChecks size={16} />
              </span>
              <div>
                <div className="text-sm font-black text-slate-900">Полная домашка</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-500">
                  Все задания целиком — без разбивки по дням
                </div>
              </div>
            </div>
          )}

          <div className={`relative grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.75fr)] ${dayPlanVisible && dayPlanAvailable ? 'mt-2' : 'mt-4'}`}>
            <section className="student-today-homework__goal-panel rounded-[20px] border border-purple-200/80 bg-gradient-to-br from-purple-50 via-white to-fuchsia-50/60 p-4">
              {orderedGoalViews.length > 0 ? (
                orderedGoalViews.map((goalView, goalIndex) => renderCurrentGoalBlock(goalView, goalIndex))
              ) : (
                <p className="text-sm text-slate-500">Учитель пока не добавил учебные цели.</p>
              )}
            </section>

            <section className="student-today-homework__checklist-panel rounded-[20px] border border-slate-200/90 bg-slate-50/75 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Чек-лист</div>
                  <div className="mt-0.5 text-sm font-bold text-slate-900">Что ещё сделать</div>
                </div>
                {checklistItems.length > 0 ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">
                    {completedChecklistCount}/{checklistItems.length}
                  </span>
                ) : null}
              </div>
              {visibleChecklistItems.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {visibleChecklistItems.map((item, index) => {
                    const isCompleted = Boolean(item.completedAt);
                    const busyKey = `${entry?.id || ''}:${item.id || ''}`;
                    const isBusy = Boolean(homeworkChecklistBusy[busyKey]);
                    const canToggle = role === 'student' && Boolean(entry?.id) && Boolean(item.id);
                    return (
                      <div key={item.id || `${item.text}-${index}`} className={`student-today-homework__check-row flex items-start gap-2.5 rounded-xl border px-2.5 py-2 ${isCompleted ? 'student-today-homework__check-row--complete border-emerald-100 bg-emerald-50/80' : 'border-slate-200/80 bg-white'}`}>
                        <button
                          type="button"
                          onClick={() => handleToggleHomeworkChecklistItem(entry, item)}
                          disabled={!canToggle || isBusy}
                          aria-label={isCompleted ? `Отметить как невыполненное: ${item.text}` : `Отметить как выполненное: ${item.text}`}
                          aria-pressed={isCompleted}
                          title={canToggle ? (isCompleted ? 'Вернуть в работу' : 'Отметить выполненным') : 'Отмечает ученик'}
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-black transition ${
                            isCompleted
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-purple-300 bg-white text-transparent hover:border-purple-500'
                          } ${isBusy ? 'opacity-50' : ''}`}
                        >
                          ✓
                        </button>
                        <span className={`min-w-0 break-words text-xs leading-relaxed ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {renderLinkedText(item.text, `student-next-${entry?.id || key || 'entry'}-${index}`)}
                        </span>
                      </div>
                    );
                  })}
                  {hiddenChecklistCount > 0 ? (
                    <div className="text-[10px] font-semibold text-slate-400">Ещё {hiddenChecklistCount} пунктов</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-xs text-slate-400">
                  Дополнительных пунктов нет.
                </div>
              )}
            </section>
          </div>

          {(lessonUrl || boardUrl) ? (
            <div className="relative mt-3 flex flex-wrap gap-2">
              {lessonUrl ? (
                <a href={lessonUrl} target="_blank" rel="noopener noreferrer" className="student-today-homework__resource-link inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-white">
                  <Calendar size={14} /> Материалы занятия <ChevronRight size={14} />
                </a>
              ) : null}
              {boardUrl ? (
                <a href={boardUrl} target="_blank" rel="noopener noreferrer" className="student-today-homework__resource-link inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-white">
                  <BookOpen size={14} /> Доска урока <ChevronRight size={14} />
                </a>
              ) : null}
            </div>
          ) : null}
        </article>
      );
    }

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
              <span className={`inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${deadlineMeta.tone}`}>
                <Clock3 size={12} />
                <span>{deadlineMeta.label}</span>
                {deadlineMeta.relativeLabel && (
                  <span className="opacity-75">· {deadlineMeta.relativeLabel}</span>
                )}
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className="text-xs font-semibold text-purple-700">{goalView.heading}</div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            goalView.mode === MOCK_ATTEMPT_MODE_TIMER
                              ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-100'
                              : 'bg-violet-50 text-violet-700 ring-1 ring-violet-100'
                          }`}>
                            {goalView.mode === MOCK_ATTEMPT_MODE_TIMER ? <Clock3 size={10} /> : <BookOpen size={10} />}
                            {goalView.mode === MOCK_ATTEMPT_MODE_TIMER ? 'С таймером' : 'Обычный режим'}
                          </span>
                        </div>
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
                          onClick={() => openGoal(goalView)}
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
                      {goalView.targetStatus.map((item) => (
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
            {checklistItems.length > 0 && (
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                {role === 'student' || completedChecklistCount > 0
                  ? `Выполнено ${completedChecklistCount}/${checklistItems.length}`
                  : `Пунктов: ${checklistItems.length}`}
              </span>
            )}
          </div>
          {checklistItems.length > 0 ? (
            <div className="space-y-1.5">
              {visibleChecklistItems.map((item, index) => {
                const isCompleted = Boolean(item.completedAt);
                const busyKey = `${entry?.id || ''}:${item.id || ''}`;
                const isBusy = Boolean(homeworkChecklistBusy[busyKey]);
                const canToggle = role === 'student' && Boolean(entry?.id) && Boolean(item.id);
                return (
                  <div
                    key={item.id || `${item.text}-${index}`}
                    className={`flex items-start gap-2 rounded-lg px-1.5 py-1 text-[13px] leading-relaxed transition md:text-sm ${
                      isCompleted ? 'bg-emerald-50/70 text-slate-500' : 'text-gray-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleHomeworkChecklistItem(entry, item)}
                      disabled={!canToggle || isBusy}
                      aria-label={isCompleted ? `Отметить как невыполненное: ${item.text}` : `Отметить как выполненное: ${item.text}`}
                      aria-pressed={isCompleted}
                      title={canToggle ? (isCompleted ? 'Вернуть в работу' : 'Отметить выполненным') : 'Отмечает ученик'}
                      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition ${
                        isCompleted
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-purple-300 bg-white text-transparent'
                      } ${canToggle ? 'cursor-pointer hover:border-purple-500' : 'cursor-default'} ${isBusy ? 'opacity-50' : ''}`}
                    >
                      <span className="text-[12px] font-black leading-none">✓</span>
                    </button>
                    <span className={`whitespace-pre-wrap break-words ${isCompleted ? 'line-through decoration-slate-300' : ''}`}>
                      {renderLinkedText(item.text, `${section}-${entry?.id || key || 'entry'}-${index}`)}
                    </span>
                  </div>
                );
              })}
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
      dueAt: toDateTimeLocalValue(buildDefaultHomeworkDueAt(
        source?.daysToComplete || 7,
        editableLessonSchedule
      )),
      dueAtMode: HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
      daysToComplete: source?.daysToComplete || 7,
      goals: [{ ...DEFAULT_GOAL }],
      dayPlanEnabled: true,
      dayPlanSessionCount: 3,
      dayPlanWeekdays: [...DEFAULT_HOMEWORK_PLAN_WEEKDAYS],
      dayPlanManualLayout: null,
      issuedAt: '',
    });
    setEditingId(null);
  };

  const resolveTaskGoalFormTargets = (goal) => {
    const taskNumber = normalizeTaskNumber(goal?.taskNumber);
    const isPythonGoal = Number.isFinite(taskNumber) && isPythonTaskNumber(taskNumber);
    const levelId = isPythonGoal ? PYTHON_LEVEL_ID : (goal?.levelId || 'basic');
    const questions = Number.isFinite(taskNumber)
      ? testsDb?.[String(taskNumber)]?.[levelId]
      : [];
    const questionList = Array.isArray(questions) ? questions : [];
    const storedIds = (Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [])
      .map((value) => String(value || '').trim());
    if (questionList.length > 0) {
      const pairs = resolveHomeworkTaskTargetDescriptors(goal, questionList);
      return {
        targetQuestions: pairs.map((item) => item.questionNumber),
        targetQuestionIds: pairs.map((item) => item.questionId),
      };
    }
    const targetQuestions = Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [];
    return {
      targetQuestions,
      targetQuestionIds: storedIds,
    };
  };

  const finishCloseHomeworkComposer = () => {
    homeworkComposerRequestRef.current += 1;
    setHomeworkComposerOpen(false);
    setHomeworkComposerPreparing(false);
    setHomeworkComposerError('');
    setHomeworkCarryoverSummary(null);
    resetFormToDefault();
  };

  const closeHomeworkComposer = async () => {
    if (saving || homeworkDraftSaving || homeworkDraftDiscarding) return;
    if (editingId || !homeworkDraft) {
      finishCloseHomeworkComposer();
      return;
    }
    const targetStudentId = String(effectiveStudentId || '').trim();
    setHomeworkDraftDiscarding(true);
    setHomeworkComposerError('');
    try {
      await api.deleteStudentHomeworkDraft(targetStudentId);
      if (targetStudentId !== String(effectiveStudentId || '').trim()) return;
      setHomeworkDraft(null);
      setHomeworkDraftError('');
      setHomeworkDraftNotice('');
      finishCloseHomeworkComposer();
    } catch (err) {
      if (targetStudentId === String(effectiveStudentId || '').trim()) {
        setHomeworkComposerError(`Не удалось удалить черновик: ${err?.message || err}`);
      }
    } finally {
      if (targetStudentId === String(effectiveStudentId || '').trim()) {
        setHomeworkDraftDiscarding(false);
      }
    }
  };

  const saveHomeworkComposerDraft = async () => {
    if (
      role !== 'teacher'
      || !effectiveStudentId
      || editingId
      || saving
      || homeworkDraftSaving
      || homeworkDraftDiscarding
      || homeworkComposerPreparing
    ) {
      return;
    }
    const targetStudentId = String(effectiveStudentId || '').trim();
    setHomeworkDraftSaving(true);
    setHomeworkComposerError('');
    try {
      const result = await api.saveStudentHomeworkDraft(targetStudentId, {
        form,
        carryoverSummary: homeworkCarryoverSummary,
        baseHomeworkId: String(nextHomeworkEntry?.id || '').trim(),
        baseHomeworkUpdatedAt: String(nextHomeworkEntry?.updatedAt || nextHomeworkEntry?.issuedAt || '').trim(),
      });
      if (targetStudentId !== String(effectiveStudentId || '').trim()) return;
      const savedDraft = normalizeHomeworkComposerDraft(result?.draft);
      if (!savedDraft) throw new Error('Сервер не вернул сохранённый черновик');
      setHomeworkDraft(savedDraft);
      setHomeworkDraftError('');
      setHomeworkDraftNotice('Черновик сохранён. К нему можно вернуться позже.');
      finishCloseHomeworkComposer();
    } catch (err) {
      if (targetStudentId === String(effectiveStudentId || '').trim()) {
        setHomeworkComposerError(`Не удалось сохранить черновик: ${err?.message || err}`);
      }
    } finally {
      if (targetStudentId === String(effectiveStudentId || '').trim()) {
        setHomeworkDraftSaving(false);
      }
    }
  };

  const openNewHomeworkComposer = async (prefill = null) => {
    if (!effectiveStudentId || role !== 'teacher') return;
    const normalizedPrefill = prefill && typeof prefill === 'object' && prefill.source === 'mock-analysis'
      ? {
          mockExamId: normalizeMockExamId(prefill.mockExamId),
          mode: normalizeAssignedMockMode(prefill.mode),
          targetTaskKeys: Array.from(new Set(
            (Array.isArray(prefill.targetTaskKeys) ? prefill.targetTaskKeys : [])
              .map((taskKey) => String(taskKey || '').trim())
              .filter(Boolean)
          )),
        }
      : null;
    const normalizedBasketItems = prefill && typeof prefill === 'object' && prefill.source === 'lesson-basket'
      ? (Array.isArray(prefill.items) ? prefill.items : [])
          .map((item) => {
            const taskNumber = normalizeTaskNumber?.(item?.taskNumber) ?? Number(item?.taskNumber);
            const questionNumber = Math.trunc(Number(item?.questionNumber));
            const questionId = String(item?.questionId || '').trim();
            if (!Number.isFinite(Number(taskNumber)) || (!Number.isFinite(questionNumber) && !questionId)) {
              return null;
            }
            return {
              taskNumber: Number(taskNumber),
              levelId: isPythonTaskNumber?.(taskNumber)
                ? PYTHON_LEVEL_ID
                : (String(item?.levelId || 'basic').trim() || 'basic'),
              questionNumber: Number.isFinite(questionNumber) && questionNumber > 0 ? questionNumber : null,
              questionId,
            };
          })
          .filter(Boolean)
      : [];
    const requestId = homeworkComposerRequestRef.current + 1;
    homeworkComposerRequestRef.current = requestId;
    setEditingId(null);
    setHomeworkCarryoverSummary(null);
    setHomeworkComposerError('');
    setError('');
    setHomeworkComposerOpen(true);
    setHomeworkComposerPreparing(true);
    setForm({
      homeWork: DEFAULT_HOMEWORK,
      lessonLink: nextLesson?.lessonLink || '',
      boardLink: nextLesson?.boardLink || '',
      dueAt: toDateTimeLocalValue(buildDefaultHomeworkDueAt(
        nextLesson?.daysToComplete || 7,
        editableLessonSchedule
      )),
      dueAtMode: HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
      daysToComplete: nextLesson?.daysToComplete || 7,
      goals: [createDefaultGoal()],
      dayPlanEnabled: true,
      dayPlanSessionCount: 3,
      dayPlanWeekdays: [...DEFAULT_HOMEWORK_PLAN_WEEKDAYS],
      dayPlanManualLayout: null,
      issuedAt: '',
    });

    const [homeworkResult, studentDataResult, testsResult, mockExamsResult, draftResult, scheduleResult] = await Promise.allSettled([
      api.getStudentNextLesson(requestStudentId),
      api.getStudentData(requestStudentId),
      api.getTests(),
      api.getMockExams(requestStudentId),
      api.getStudentHomeworkDraft(effectiveStudentId),
      api.getStudentSchedule(requestStudentId),
    ]);
    if (homeworkComposerRequestRef.current !== requestId) return;

    const warnings = [];
    const freshTests = testsResult.status === 'fulfilled' && testsResult.value && typeof testsResult.value === 'object'
      ? testsResult.value
      : (testsDb || {});
    const freshMockExams = mockExamsResult.status === 'fulfilled' && Array.isArray(mockExamsResult.value)
      ? mockExamsResult.value
      : mockExams;
    const freshStudentData = studentDataResult.status === 'fulfilled' && studentDataResult.value && typeof studentDataResult.value === 'object'
      ? studentDataResult.value
      : {};
    const freshSchedule = scheduleResult.status === 'fulfilled'
      ? sortScheduleEntries(Array.isArray(scheduleResult.value) ? scheduleResult.value : [])
      : lessonSchedule;
    const freshEditableSchedule = freshSchedule.filter(
      (entry) => !isPaymentOverdueScheduleEntry(entry)
    );

    if (testsResult.status === 'fulfilled') {
      setTestsDb(freshTests);
      setTestsDbError('');
    } else {
      warnings.push('Не удалось обновить базу заданий; показана последняя загруженная версия.');
    }
    if (mockExamsResult.status === 'fulfilled') {
      setMockExams(freshMockExams);
      setMockExamsError('');
    } else {
      warnings.push('Не удалось обновить список пробников.');
    }
    if (studentDataResult.status === 'rejected') {
      warnings.push('Не удалось точно проверить, что ученик уже выполнил. Проверьте перенесённые номера.');
    }
    if (scheduleResult.status === 'fulfilled') {
      setLessonSchedule(freshSchedule);
      setScheduleError('');
    } else {
      warnings.push('Не удалось обновить расписание; дедлайн рассчитан по последней загруженной версии.');
    }
    const restoredDraft = draftResult.status === 'fulfilled'
      ? normalizeHomeworkComposerDraft(draftResult.value?.draft)
      : normalizeHomeworkComposerDraft(homeworkDraft);
    if (draftResult.status === 'fulfilled') {
      setHomeworkDraft(restoredDraft);
      setHomeworkDraftError('');
    } else {
      warnings.push('Не удалось обновить черновик с сервера; использована последняя загруженная версия.');
    }

    let latestHomework = nextHomeworkEntry;
    let sourceData = nextLesson || {};
    if (homeworkResult.status === 'fulfilled') {
      const response = homeworkResult.value || {};
      const list = Array.isArray(response.homeworks) ? response.homeworks : [];
      const latest = response.latest && typeof response.latest === 'object' ? response.latest : null;
      latestHomework = latest || [...list].sort(
        (left, right) => new Date(right?.issuedAt || 0) - new Date(left?.issuedAt || 0)
      )[0] || null;
      sourceData = buildNextLessonData(latestHomework || {});
      setHomeworks(list);
      setNextLesson(sourceData);
      setError('');
    } else {
      warnings.push('Не удалось обновить последнюю домашку; использована версия с экрана.');
    }

    const carryover = buildHomeworkCarryoverDraft({
      homework: latestHomework,
      studentData: freshStudentData,
      testsDb: freshTests,
      mockExams: freshMockExams,
    });
    const restoredDraftForm = restoredDraft?.form || null;
    let carryoverGoals = restoredDraftForm
      ? restoredDraftForm.goals.map((goal) => ({
          ...createDefaultGoal(goal.type),
          ...goal,
        }))
      : carryover.goals.map((goal) => ({
          ...createDefaultGoal(goal.type),
          ...goal,
        }));
    let carryoverSummary = restoredDraftForm
      ? restoredDraft.carryoverSummary
      : { ...carryover.summary };
    if (normalizedPrefill?.mockExamId && normalizedPrefill.targetTaskKeys.length > 0) {
      const reviewGoal = {
        ...createDefaultGoal(GOAL_TYPE_MOCK),
        type: GOAL_TYPE_MOCK,
        mockExamId: normalizedPrefill.mockExamId,
        mode: normalizedPrefill.mode,
        targetTaskKeys: normalizedPrefill.targetTaskKeys,
        origin: 'new',
        carryover: null,
        continuationOfHomeworkId: '',
      };
      const isSameMockGoal = (goal) => (
        normalizeGoalType(goal) === GOAL_TYPE_MOCK
        && normalizeMockExamId(goal?.mockExamId) === normalizedPrefill.mockExamId
      );
      const matchingMockGoals = carryoverGoals.filter(isSameMockGoal);
      if (matchingMockGoals.length > 0) {
        const originalMatchingQuestionCount = matchingMockGoals.reduce((sum, goal) => {
          const remainingCount = Number(goal?.carryover?.remainingCount);
          return sum + (Number.isFinite(remainingCount) && remainingCount > 0 ? remainingCount : 0);
        }, 0);
        const uniqueCountableCarryoverTaskKeys = Array.from(new Set(
          matchingMockGoals.flatMap((goal) => {
            const remainingCount = Number(goal?.carryover?.remainingCount);
            if (!Number.isFinite(remainingCount) || remainingCount <= 0) return [];
            return Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : [];
          }).map((taskKey) => String(taskKey || '').trim()).filter(Boolean)
        ));
        const mergedTargetTaskKeys = Array.from(new Set([
          ...matchingMockGoals.flatMap((goal) => (
            Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : []
          )),
          ...normalizedPrefill.targetTaskKeys,
        ].map((taskKey) => String(taskKey || '').trim()).filter(Boolean)));
        let reviewGoalInserted = false;
        carryoverGoals = carryoverGoals.flatMap((goal) => {
          if (!isSameMockGoal(goal)) return [goal];
          if (reviewGoalInserted) return [];
          reviewGoalInserted = true;
          return [{
            ...reviewGoal,
            targetTaskKeys: mergedTargetTaskKeys,
          }];
        });
        if (!restoredDraftForm) {
          carryoverSummary = {
            ...carryoverSummary,
            pendingGoalCount: Math.max(
              0,
              (Number(carryoverSummary?.pendingGoalCount) || 0) - matchingMockGoals.length + 1
            ),
            pendingQuestionCount: Math.max(
              0,
              (Number(carryoverSummary?.pendingQuestionCount) || 0)
                - originalMatchingQuestionCount
                + uniqueCountableCarryoverTaskKeys.length
            ),
          };
        }
      } else {
        carryoverGoals = [...carryoverGoals, reviewGoal];
      }
    }
    if (normalizedBasketItems.length > 0) {
      const groupedBasketItems = normalizedBasketItems.reduce((groups, item) => {
        const key = `${item.taskNumber}:${item.levelId}`;
        const bucket = groups.get(key) || [];
        const identity = item.questionId || `number:${item.questionNumber}`;
        if (!bucket.some((candidate) => (
          (candidate.questionId || `number:${candidate.questionNumber}`) === identity
        ))) {
          bucket.push(item);
        }
        groups.set(key, bucket);
        return groups;
      }, new Map());

      groupedBasketItems.forEach((basketItems) => {
        const sample = basketItems[0];
        const matchingGoalIndex = carryoverGoals.findIndex((goal) => (
          normalizeGoalType(goal) === GOAL_TYPE_TASK
          && !isOptionalHomeworkGoal(goal)
          && String(goal?.origin || 'new').trim().toLowerCase() !== 'carryover'
          && !goal?.includeAll
          && Number(normalizeTaskNumber?.(goal?.taskNumber) ?? goal?.taskNumber) === sample.taskNumber
          && String(goal?.levelId || 'basic') === sample.levelId
        ));
        const existingGoal = matchingGoalIndex >= 0 ? carryoverGoals[matchingGoalIndex] : null;
        const availableCount = Array.isArray(freshTests?.[String(sample.taskNumber)]?.[sample.levelId])
          ? freshTests[String(sample.taskNumber)][sample.levelId].length
          : 500;
        const existingNumbers = existingGoal?.includeAll
          ? []
          : Array.from(new Set([
              ...(Array.isArray(existingGoal?.targetQuestions) ? existingGoal.targetQuestions : []),
              ...parseTargetInput(existingGoal?.targetInput || '', Math.max(availableCount, 500)),
            ].map((value) => Math.trunc(Number(value))).filter((value) => value > 0)));
        const nextNumbers = Array.from(new Set([
          ...existingNumbers,
          ...basketItems.map((item) => item.questionNumber).filter((value) => Number.isFinite(value) && value > 0),
        ])).sort((left, right) => left - right);
        const questionList = Array.isArray(freshTests?.[String(sample.taskNumber)]?.[sample.levelId])
          ? freshTests[String(sample.taskNumber)][sample.levelId]
          : [];
        const explicitIdByNumber = new Map();
        (Array.isArray(existingGoal?.targetQuestions) ? existingGoal.targetQuestions : []).forEach((number, index) => {
          const questionId = String(existingGoal?.targetQuestionIds?.[index] || '').trim();
          const normalizedNumber = Math.trunc(Number(number));
          if (normalizedNumber > 0 && questionId) explicitIdByNumber.set(normalizedNumber, questionId);
        });
        basketItems.forEach((item) => {
          if (item.questionNumber && item.questionId) explicitIdByNumber.set(item.questionNumber, item.questionId);
        });
        const alignedQuestionIds = nextNumbers.map((questionNumber) => (
          String(questionList[questionNumber - 1]?.id || '').trim()
          || explicitIdByNumber.get(questionNumber)
          || ''
        ));
        const nextQuestionIds = alignedQuestionIds.every(Boolean) ? alignedQuestionIds : [];
        const mergedGoal = {
          ...createDefaultGoal(GOAL_TYPE_TASK),
          ...(existingGoal || {}),
          type: GOAL_TYPE_TASK,
          taskNumber: sample.taskNumber,
          levelId: sample.levelId,
          includeAll: false,
          targetInput: formatHomeworkQuestionRanges(nextNumbers),
          targetQuestions: nextNumbers,
          targetQuestionIds: nextQuestionIds,
          targetSelectionDirty: nextQuestionIds.length !== nextNumbers.length,
          origin: 'new',
          carryover: null,
          continuationOfHomeworkId: '',
        };
        if (matchingGoalIndex >= 0) {
          carryoverGoals[matchingGoalIndex] = mergedGoal;
          return;
        }
        const emptyGoalIndex = carryoverGoals.findIndex((goal) => (
          normalizeGoalType(goal) === GOAL_TYPE_TASK
          && !String(goal?.taskNumber ?? '').trim()
          && !String(goal?.targetInput || '').trim()
        ));
        if (emptyGoalIndex >= 0) carryoverGoals[emptyGoalIndex] = mergedGoal;
        else carryoverGoals.push(mergedGoal);
      });
    }
    setForm(restoredDraftForm
      ? {
          ...restoredDraftForm,
          goals: carryoverGoals,
        }
      : {
          homeWork: carryover.homeWork,
          lessonLink: sourceData?.lessonLink || '',
          boardLink: sourceData?.boardLink || '',
          dueAt: toDateTimeLocalValue(buildDefaultHomeworkDueAt(
            sourceData?.daysToComplete || 7,
            freshEditableSchedule
          )),
          dueAtMode: HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
          daysToComplete: sourceData?.daysToComplete || 7,
          goals: [...carryoverGoals, createDefaultGoal()],
          dayPlanEnabled: true,
          dayPlanSessionCount: 3,
          dayPlanWeekdays: [...DEFAULT_HOMEWORK_PLAN_WEEKDAYS],
          dayPlanManualLayout: null,
          issuedAt: '',
        });
    setHomeworkCarryoverSummary(carryoverSummary);
    if (restoredDraftForm && normalizedPrefill?.mockExamId) {
      warnings.push('Ошибки пробника добавлены в сохранённый черновик.');
    }
    if (normalizedBasketItems.length > 0) {
      warnings.push(`Из корзины урока добавлено заданий: ${normalizedBasketItems.length}.`);
    }
    setHomeworkComposerError(warnings.join(' '));
    setHomeworkComposerPreparing(false);
    return true;
  };

  useEffect(() => {
    const requestId = String(homeworkPrefillRequest?.id || '').trim();
    const targetStudentId = String(homeworkPrefillRequest?.studentId || '').trim();
    if (
      role !== 'teacher'
      || !requestId
      || !targetStudentId
      || targetStudentId !== String(effectiveStudentId || '')
      || homeworkPrefillHandledRef.current === requestId
    ) {
      return;
    }
    homeworkPrefillHandledRef.current = requestId;
    openNewHomeworkComposer(homeworkPrefillRequest)
      .then((consumed) => onHomeworkPrefillHandled?.({
        consumed: consumed === true,
        request: homeworkPrefillRequest,
      }))
      .catch((prefillError) => onHomeworkPrefillHandled?.({
        consumed: false,
        request: homeworkPrefillRequest,
        error: prefillError,
      }));
  }, [effectiveStudentId, homeworkPrefillRequest, onHomeworkPrefillHandled, role]);

  const startEditHomework = (entry) => {
    if (!entry) return;
    const goals = normalizeEntryGoals(entry);
    const storedDayPlan = entry?.dayPlan && typeof entry.dayPlan === 'object' ? entry.dayPlan : null;
    const tracksNextLesson = normalizeHomeworkDueAtMode(entry?.dueAtMode)
      === HOMEWORK_DUE_AT_MODE_NEXT_LESSON;
    const automaticDueAt = buildDefaultHomeworkDueAt(
      Number(entry.daysToComplete) || 7,
      editableLessonSchedule
    );
    const displayedDueAt = tracksNextLesson && automaticDueAt
      ? automaticDueAt
      : resolveHomeworkDueAt(entry);
    homeworkComposerRequestRef.current += 1;
    setEditingId(entry.id || null);
    setHomeworkCarryoverSummary(null);
    setHomeworkComposerError('');
    setHomeworkComposerPreparing(false);
    setForm({
      homeWork: entry.homeWork || '',
      lessonLink: entry.lessonLink || '',
      boardLink: entry.boardLink || '',
      dueAt: toDateTimeLocalValue(displayedDueAt),
      dueAtMode: normalizeHomeworkDueAtMode(entry.dueAtMode),
      daysToComplete: Number(entry.daysToComplete) || 7,
      issuedAt: entry.issuedAt || '',
      dayPlanEnabled: Boolean(storedDayPlan?.enabled && Array.isArray(storedDayPlan?.dayPlan)),
      dayPlanSessionCount: Math.max(
        2,
        Math.min(7, Number(storedDayPlan?.requestedSessionCount) || storedDayPlan?.dayPlan?.length || 3)
      ),
      dayPlanWeekdays: Array.isArray(storedDayPlan?.selectedWeekdays)
        ? storedDayPlan.selectedWeekdays
        : [...DEFAULT_HOMEWORK_PLAN_WEEKDAYS],
      dayPlanManualLayout: storedDayPlan?.manualLayout || null,
      goals: goals.length
        ? goals.map((goal) => {
            if (goal.type === GOAL_TYPE_MOCK) {
              return {
                ...createDefaultGoal(GOAL_TYPE_MOCK),
                type: GOAL_TYPE_MOCK,
                assignmentTier: getHomeworkGoalAssignmentTier(goal),
                mockExamId: goal.mockExamId,
                mode: normalizeAssignedMockMode(goal.mode),
                targetTaskKeys: Array.isArray(goal.targetTaskKeys) ? goal.targetTaskKeys : [],
                continuationOfHomeworkId: String(goal?.continuationOfHomeworkId || '').trim(),
              };
            }
            const resolvedTargets = resolveTaskGoalFormTargets(goal);
            return {
              ...createDefaultGoal(GOAL_TYPE_TASK),
              type: GOAL_TYPE_TASK,
              assignmentTier: getHomeworkGoalAssignmentTier(goal),
              taskNumber: goal.taskNumber,
              levelId: goal.levelId || 'basic',
              includeAll: goal.includeAll,
              targetInput: goal.includeAll ? '' : formatTargetInput(resolvedTargets.targetQuestions),
              targetQuestionIds: resolvedTargets.targetQuestionIds,
              targetSelectionDirty: false,
            };
          })
        : [createDefaultGoal()]
    });
    setHomeworkComposerOpen(true);
  };

  const updateGoal = (index, patch) => {
    setForm((prev) => {
      const goals = Array.isArray(prev.goals) ? [...prev.goals] : [];
      if (!goals[index]) return prev;
      goals[index] = { ...goals[index], ...patch };
      return { ...prev, goals };
    });
  };

  const addGoalRow = (type = GOAL_TYPE_TASK) => {
    setForm((prev) => ({
      ...prev,
      goals: [...(Array.isArray(prev.goals) ? prev.goals : []), createDefaultGoal(type)]
    }));
  };

  const removeGoalRow = (index) => {
    setForm((prev) => {
      const goals = Array.isArray(prev.goals) ? prev.goals.filter((_, i) => i !== index) : [];
      return { ...prev, goals };
    });
  };

  const handleSave = async () => {
    if (!effectiveStudentId || role !== 'teacher') return;
    const dueAtIso = toHomeworkDueAtIso(form.dueAt);
    if (!dueAtIso) {
      setError('Укажите дату и время сдачи домашки.');
      return;
    }
    setSaving(true);
    try {
      let goalValidationError = '';
      const goalsPayload = (Array.isArray(form.goals) ? form.goals : [])
        .map((goal) => {
          const goalType = normalizeGoalType(goal);
          if (goalType === GOAL_TYPE_MOCK) {
            const mockExamId = normalizeMockExamId(goal?.mockExamId);
            if (!mockExamId) return null;
            const targetTaskKeys = Array.from(new Set(
              (Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
            ));
            const continuationOfHomeworkId = String(goal?.continuationOfHomeworkId || '').trim();
            return {
              type: GOAL_TYPE_MOCK,
              assignmentTier: normalizeHomeworkAssignmentTier(goal?.assignmentTier),
              mockExamId,
              mode: normalizeAssignedMockMode(goal?.mode),
              ...(targetTaskKeys.length > 0 ? { targetTaskKeys } : {}),
              ...(continuationOfHomeworkId ? { continuationOfHomeworkId } : {}),
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
          if (!includeAll && targetQuestions.length === 0) {
            goalValidationError = `Для задания ${formatTaskNumber(normalizedTaskNumber) || normalizedTaskNumber} выберите хотя бы один номер или включите «Все номера».`;
            return null;
          }
          const questions = testsDb?.[String(normalizedTaskNumber)]?.[levelId];
          const questionList = Array.isArray(questions) ? questions : [];
          const storedTargetQuestionIds = (Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [])
            .map((questionId) => String(questionId || '').trim());
          const derivedTargetQuestionIds = (includeAll
            ? questionList
            : targetQuestions.map((questionNumber) => questionList[questionNumber - 1]))
              .map((question) => String(question?.id || '').trim())
              .filter(Boolean);
          const expectedIdCount = includeAll ? questionList.length : targetQuestions.length;
          const hasCompleteDerivedIds = expectedIdCount > 0 && derivedTargetQuestionIds.length === expectedIdCount;
          const hasCompleteStoredIds = expectedIdCount > 0
            && storedTargetQuestionIds.length === expectedIdCount
            && storedTargetQuestionIds.every(Boolean);
          const targetQuestionIds = hasCompleteDerivedIds
            ? derivedTargetQuestionIds
            : (!goal?.targetSelectionDirty && hasCompleteStoredIds ? storedTargetQuestionIds : []);
          return {
            type: GOAL_TYPE_TASK,
            assignmentTier: normalizeHomeworkAssignmentTier(goal?.assignmentTier),
            taskNumber: normalizedTaskNumber,
            levelId,
            includeAll,
            targetQuestions,
            ...(targetQuestionIds.length > 0 ? { targetQuestionIds } : {}),
          };
        })
        .filter(Boolean);
      if (goalValidationError) {
        setError(goalValidationError);
        return;
      }
      const calendarOffsetMinutes = getHomeworkCalendarOffsetMinutes();
      const payload = {
        homeWork: form.homeWork,
        lessonLink: form.lessonLink,
        boardLink: form.boardLink,
        dueAt: dueAtIso,
        dueAtMode: resolveHomeworkDueAtModeForSchedule({
          dueAt: dueAtIso,
          dueAtMode: form.dueAtMode,
          entries: editableLessonSchedule,
          calendarOffsetMinutes,
        }),
        calendarOffsetMinutes,
        daysToComplete: form.daysToComplete,
        goals: goalsPayload,
      };
      const updated = editingId
        ? await api.updateStudentHomework(effectiveStudentId, editingId, payload)
        : await api.updateStudentNextLesson(effectiveStudentId, payload);
      const list = Array.isArray(updated?.homeworks) ? updated.homeworks : [];
      const latest = updated?.latest && typeof updated.latest === 'object' ? updated.latest : {};
      const safeData = buildNextLessonData(latest, form);
      setHomeworks(list);
      setNextLesson(safeData);
      if (!editingId) {
        setHomeworkDraft(null);
        setHomeworkDraftError('');
        setHomeworkDraftNotice('');
      }
      resetFormToDefault(safeData);
      setHomeworkComposerOpen(false);
      setHomeworkComposerError('');
      setHomeworkCarryoverSummary(null);
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
      {showHeader && (
      <div className="schedule-shell__hero relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/75 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="schedule-shell__hero-glow--a pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="schedule-shell__hero-glow--b pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2.5 md:space-y-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Моё расписание</h2>
            </div>
            <div className="schedule-shell__view-switch inline-flex items-center rounded-xl border border-slate-200 bg-white/85 p-1 text-xs font-semibold text-slate-600 shadow-sm">
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
              <div className="schedule-shell__next-step inline-flex max-w-full items-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/80 px-3 py-1.5 text-xs text-slate-600 shadow-sm">
                <span className="shrink-0 font-semibold text-slate-500">Следующий шаг:</span>
                <span className="truncate font-semibold text-purple-700">{nextHomeworkPendingShortLabel || nextHomeworkPendingGoal.heading}</span>
              </div>
            )}
          </div>
          {renderStudentPicker()}
        </div>
      </div>
      )}

      {topErrorBanners.length > 0 && (
        <div className="space-y-2">
          {topErrorBanners.map((entry) => (
            <div
              key={entry.key}
              className={`rounded-xl border px-3 py-2 text-xs font-medium ${
                entry.tone === 'rose'
                  ? 'border-rose-200 bg-rose-50/80 text-rose-600'
                  : 'border-amber-200 bg-amber-50/80 text-amber-700'
              }`}
            >
              <span className="font-semibold">{entry.label}:</span>{' '}
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      )}

      {role === 'teacher' && teacherLessonBriefing && (
        <section className="teacher-lesson-briefing relative overflow-hidden rounded-[26px] border border-violet-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,243,255,0.96)_48%,rgba(239,246,255,0.96))] p-4 shadow-[0_18px_44px_rgba(91,33,182,0.13)] md:p-5">
          <div aria-hidden className="teacher-lesson-briefing__glow--violet pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-300/25 blur-3xl" />
          <div aria-hidden className="teacher-lesson-briefing__glow--sky pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-sky-300/20 blur-3xl" />
          <div className="relative space-y-4">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-500/25">
                  <Target size={20} />
                </span>
                <div className="min-w-0">
                  <div className="teacher-lesson-briefing__eyebrow text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Следующий урок</div>
                  <h3 className="teacher-lesson-briefing__student mt-1 truncate text-lg font-black text-slate-900 md:text-xl">
                    {teacherLessonBriefing.studentLabel}
                  </h3>
                  <p className="teacher-lesson-briefing__subject mt-0.5 text-xs font-medium text-slate-500">
                    {teacherLessonBriefing.lesson.hasLesson
                      ? teacherLessonBriefing.lesson.subject
                      : 'Можно подготовить план и открыть урок вручную'}
                  </p>
                </div>
              </div>
              <div className={`teacher-lesson-briefing__date inline-flex w-fit items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold shadow-sm ${
                teacherLessonBriefing.lesson.hasLesson
                  ? 'border-violet-200 bg-white/90 text-violet-700'
                  : 'border-slate-200 bg-white/75 text-slate-500'
              }`}>
                <Clock3 size={16} />
                <span>{teacherLessonBriefing.lesson.dayLabel}</span>
                {teacherLessonBriefing.lesson.timeLabel && (
                  <strong className="teacher-lesson-briefing__time rounded-lg bg-violet-100 px-2 py-0.5 text-violet-800">
                    {teacherLessonBriefing.lesson.timeLabel}
                  </strong>
                )}
              </div>
            </header>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="teacher-lesson-briefing__readiness rounded-2xl border border-white/90 bg-white/78 p-3.5 shadow-sm backdrop-blur-sm md:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="teacher-lesson-briefing__section-label text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Готовность по ДЗ</div>
                    <div className="teacher-lesson-briefing__status mt-1 text-base font-black text-slate-900">
                      {teacherLessonBriefing.homework.statusLabel}
                    </div>
                  </div>
                  <span
                    data-tone={
                      teacherLessonBriefing.homework.overdue
                        ? 'rose'
                        : teacherLessonBriefing.homework.complete
                          ? 'emerald'
                          : teacherLessonBriefing.homework.hasHomework
                            ? 'amber'
                            : 'slate'
                    }
                    className={`teacher-lesson-briefing__deadline rounded-full border px-2.5 py-1 text-[11px] font-black ${
                    teacherLessonBriefing.homework.overdue
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : teacherLessonBriefing.homework.complete
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : teacherLessonBriefing.homework.hasHomework
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                  >
                    {teacherLessonBriefing.homework.overdue
                      ? 'Просрочено'
                      : teacherLessonBriefing.homework.complete
                        ? 'Готово'
                        : teacherLessonBriefing.homework.dueLabel
                          ? `До ${teacherLessonBriefing.homework.dueLabel}`
                          : 'Без срока'}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="teacher-lesson-briefing__progress-track h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        teacherLessonBriefing.homework.overdue
                          ? 'bg-rose-500'
                          : teacherLessonBriefing.homework.complete
                            ? 'bg-emerald-500'
                            : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                      }`}
                      style={{ width: `${teacherLessonBriefing.homework.percent ?? 0}%` }}
                    />
                  </div>
                  <strong className="teacher-lesson-briefing__progress-value w-10 text-right text-sm text-slate-700">
                    {teacherLessonBriefing.homework.percent === null
                      ? '—'
                      : `${teacherLessonBriefing.homework.percent}%`}
                  </strong>
                </div>
                {teacherLessonBriefing.focusLabels.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {teacherLessonBriefing.focusLabels.map((label) => (
                      <span key={label} className="teacher-lesson-briefing__focus-chip rounded-lg border border-violet-100 bg-violet-50/85 px-2 py-1 text-[11px] font-bold text-violet-700">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="teacher-lesson-briefing__plan rounded-2xl border border-violet-100/90 bg-violet-950/[0.035] p-3.5 md:p-4">
                <div className="teacher-lesson-briefing__plan-title flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-violet-600">
                  <ListChecks size={15} />
                  План занятия
                </div>
                <ol className="mt-2.5 space-y-2">
                  {teacherLessonBriefing.planSteps.map((step, index) => (
                    <li key={`${index}-${step}`} className="teacher-lesson-briefing__plan-step flex items-start gap-2.5 text-sm font-semibold leading-snug text-slate-700">
                      <span className="teacher-lesson-briefing__plan-index inline-grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-[10px] font-black text-violet-700 shadow-sm">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={handleOpenBriefingHomework}
                disabled={!teacherLessonBriefing.homework.hasHomework}
                className="teacher-lesson-briefing__secondary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-bold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <BookOpen size={16} />
                {testsDb === null || mockExamsLoading
                  ? 'Загружаем задания…'
                  : teacherHomeworkReviewItems.length > 0
                    ? 'Посмотреть сделанную домашку'
                    : 'Задания к домашке'}
                {teacherHomeworkReviewPendingCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                    Не сделано: {teacherHomeworkReviewPendingCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onStartLesson?.(effectiveStudentId)}
                disabled={typeof onStartLesson !== 'function'}
                className="teacher-lesson-briefing__primary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
              >
                Начать урок с планом
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
      )}

      {(role === 'teacher' || role === 'student') && (
        <Card className="schedule-shell__lessons-card student-today-schedule-card space-y-3">
          <div className="student-today-schedule-card__header flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="schedule-shell__lessons-icon student-today-schedule-card__icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                <Calendar size={19} />
              </span>
              <div className="min-w-0 space-y-0.5">
                <div className="student-today-schedule-card__eyebrow">Ближайшие занятия</div>
                <div className="text-lg font-bold text-slate-900">
                  Расписание недели
                </div>
                <p className="text-xs text-slate-500">
                  {role === 'teacher'
                    ? `${selectedStudent ? `${getStudentLabel(selectedStudent)} · ` : ''}${studentWeekRangeLabel}${studentOverdueUnpaidCount > 0 ? ` · не оплачено: ${studentOverdueUnpaidCount}` : ''}`
                    : `${studentWeekRangeLabel}${studentOverdueUnpaidCount > 0 ? ` · не оплачено: ${studentOverdueUnpaidCount}` : ''}`}
                </p>
              </div>
            </div>
            <div className="student-today-schedule-card__actions flex flex-wrap items-center gap-2">
              {role === 'teacher' && effectiveStudentId && (
                <button
                  type="button"
                  onClick={() => handleSyncScheduleFromGoogle()}
                  disabled={googleScheduleSyncing}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw size={13} className={googleScheduleSyncing ? 'animate-spin' : ''} />
                  {googleScheduleSyncing ? 'Сверяем...' : 'Взять из Google'}
                </button>
              )}
              {role === 'student' && (
                <button
                  type="button"
                  onClick={handleToggleLessonReminder}
                  disabled={lessonReminderLoading || lessonReminderSaving || pushSyncing || pushBusy || !pushReady}
                  className="schedule-shell__student-reminder-compact"
                  title={lessonReminderError || pushError || lessonReminderStatusText || 'Напоминания о занятиях'}
                  aria-pressed={Boolean(pushEnabled && lessonReminderEnabled)}
                >
                  {(pushEnabled && lessonReminderEnabled) ? <BellOff size={13} /> : <Bell size={13} />}
                  {lessonReminderSaving
                    ? 'Сохраняем...'
                    : 'Напоминания'}
                </button>
              )}
              {['student', 'teacher'].includes(role) && (
                <button
                  type="button"
                  onClick={() => setShowLessonHistory((value) => !value)}
                  className={`schedule-shell__student-history-compact${showLessonHistory ? ' is-active' : ''}`}
                  title="Все прошедшие занятия и их темы"
                  aria-expanded={showLessonHistory}
                  aria-controls="student-lesson-history-panel"
                >
                  <History size={13} />
                  История
                  {lessonHistoryTotal > 0 && (
                    <span aria-label={getLessonCountLabel(lessonHistoryTotal)}>{lessonHistoryTotal}</span>
                  )}
                </button>
              )}
              <span className="schedule-shell__lessons-count rounded-full border border-sky-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                {studentOverdueUnpaidCount > 0
                  ? `Не оплачено: ${studentOverdueUnpaidCount}`
                  : getLessonCountLabel(studentVisibleSchedule.length)}
              </span>
            </div>
          </div>

          <div className="space-y-4">
              {scheduleRequestNotice && (
                <div className="schedule-shell__notice-success rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-emerald-700">
                  {scheduleRequestNotice}
                </div>
              )}
              {googleScheduleSyncMessage && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs font-semibold text-sky-700">
                  {googleScheduleSyncMessage}
                </div>
              )}
              {googleScheduleSyncError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-600">
                  {googleScheduleSyncError}
                </div>
              )}

              {role === 'student' ? (
                <>
                  {renderStudentWeekSchedule()}
                  {renderStudentLessonHistory()}
                </>
              ) : (
                <>
              {renderStudentWeekSchedule()}
              {renderStudentLessonHistory()}
              <details className="rounded-2xl border border-slate-200/80 bg-white/75 p-3">
                <summary className="cursor-pointer select-none text-sm font-bold text-slate-700">
                  Управление расписанием
                </summary>
                <div className="mt-3 space-y-4">
              <div className="schedule-shell__support-grid">
              {role === 'student' && (
                <div className="schedule-shell__reminder-card rounded-2xl border border-sky-200/80 bg-white/90 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">Уведомления о занятиях</div>
                      <div className="mt-1 text-xs text-slate-600">{lessonReminderStatusText}</div>
                      {(lessonReminderError || (pushError && pushError !== lessonReminderStatusText)) && (
                        <div className="mt-1 text-xs text-rose-600">{lessonReminderError || pushError}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleLessonReminder}
                      disabled={lessonReminderLoading || lessonReminderSaving || pushSyncing || pushBusy || !pushReady}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        !pushEnabled
                          ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                          : (lessonReminderEnabled
                              ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100')
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {(pushEnabled && lessonReminderEnabled) ? <BellOff size={14} /> : <Bell size={14} />}
                      {lessonReminderSaving
                        ? 'Сохраняем...'
                        : (!pushEnabled
                            ? 'Включить push'
                            : (lessonReminderEnabled ? 'Отключить напоминания' : 'Включить напоминания'))}
                    </button>
                  </div>
                </div>
              )}

              {role === 'teacher' && effectiveStudentId && (
                <div className="schedule-shell__requests-card rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                      Запросы на изменение расписания
                    </div>
                    <span className="rounded-full border border-amber-300 bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      {`Ожидают: ${pendingScheduleRequests.length}`}
                    </span>
                  </div>
                  {scheduleRequestsLoading ? (
                    <div className="mt-2 text-xs text-slate-600">Загружаем запросы...</div>
                  ) : pendingScheduleRequests.length === 0 ? (
                    <div className="mt-2 text-xs text-slate-600">Новых запросов нет.</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {pendingScheduleRequests.map((requestEntry) => {
                        const before = requestEntry.previousEntry || null;
                        const after = requestEntry.proposedEntry || null;
                        const beforeLabel = [before?.day, before?.time].filter(Boolean).join(', ');
                        const afterLabel = [after?.day, after?.time].filter(Boolean).join(', ');
                        return (
                          <div key={requestEntry.id} className="schedule-shell__request-item rounded-xl border border-amber-200 bg-white/95 p-2.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                                {formatScheduleRequestTypeLabel(requestEntry.type)}
                              </span>
                              <span className="text-slate-500">
                                {requestEntry.createdAt ? formatDate(requestEntry.createdAt) : ''}
                              </span>
                            </div>
                            {requestEntry.type === SCHEDULE_REQUEST_TYPE_CREATE && (
                              <div className="mt-1 text-slate-700">{`Новый слот: ${afterLabel || 'без времени'}`}</div>
                            )}
                            {requestEntry.type === SCHEDULE_REQUEST_TYPE_UPDATE && (
                              <div className="mt-1 text-slate-700">
                                {`Было: ${beforeLabel || '—'} → Стало: ${afterLabel || '—'}`}
                              </div>
                            )}
                            {requestEntry.type === SCHEDULE_REQUEST_TYPE_DELETE && (
                              <div className="mt-1 text-slate-700">{`Удалить слот: ${beforeLabel || '—'}`}</div>
                            )}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleResolveScheduleRequest(requestEntry, 'approve')}
                                disabled={scheduleRequestActionBusyId === requestEntry.id}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                              >
                                {scheduleRequestActionBusyId === requestEntry.id ? 'Обработка...' : 'Одобрить'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResolveScheduleRequest(requestEntry, 'reject')}
                                disabled={scheduleRequestActionBusyId === requestEntry.id}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                              >
                                Отклонить
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {role === 'student' && (
                <div className="schedule-shell__student-requests-card rounded-2xl border border-purple-200/80 bg-white/90 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-purple-700">
                      Запросы на изменение расписания
                    </div>
                    <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                      {`Ожидают: ${pendingScheduleRequests.length}`}
                    </span>
                  </div>
                  {scheduleRequestsLoading ? (
                    <div className="mt-2 text-xs text-slate-600">Проверяем статус запросов...</div>
                  ) : sortedScheduleRequests.length === 0 ? (
                    <div className="mt-2 text-xs text-slate-600">Вы ещё не отправляли запросы.</div>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {sortedScheduleRequests.slice(0, 4).map((requestEntry) => (
                        <div key={requestEntry.id} className="schedule-shell__request-row flex flex-wrap items-center justify-between gap-2 rounded-lg border border-purple-100 bg-white px-2.5 py-1.5 text-xs">
                          <span className="text-slate-700">{formatScheduleRequestTypeLabel(requestEntry.type)}</span>
                          <span className={`font-semibold ${
                            requestEntry.status === SCHEDULE_REQUEST_STATUS_PENDING
                              ? 'text-amber-700'
                              : requestEntry.status === SCHEDULE_REQUEST_STATUS_APPROVED
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                          }`}
                          >
                            {formatScheduleRequestStatusLabel(requestEntry.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>

              {(role === 'student' || scheduleEditingId) && (
              <div className="schedule-shell__composer">
                <div className="schedule-shell__composer-heading">
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      {scheduleEditingId ? 'Изменить занятие' : 'Добавить занятие'}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">Выберите удобный день и точное время начала.</p>
                  </div>
                  {scheduleEditingId && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">Режим редактирования</span>
                  )}
                </div>
                <div className="schedule-shell__composer-grid">
                  <label className="schedule-shell__composer-field">
                    <span>День недели</span>
                    <div>
                      <Calendar size={16} />
                      <select
                        value={scheduleForm.weekdayKey}
                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, weekdayKey: e.target.value }))}
                        className="schedule-shell__field"
                      >
                        {SCHEDULE_WEEKDAYS.map((item) => (
                          <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                      </select>
                    </div>
                  </label>
                  <label className="schedule-shell__composer-field">
                    <span>Время начала</span>
                    <div>
                      <Clock3 size={16} />
                      <input
                        type="time"
                        value={scheduleForm.time}
                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, time: e.target.value }))}
                        className="schedule-shell__field"
                      />
                    </div>
                  </label>
                  <div className="schedule-shell__composer-actions">
                    <Button onClick={handleSaveSchedule} disabled={scheduleSaving || !effectiveStudentId} className="w-full justify-center">
                      <Save size={16} /> {scheduleSaving
                        ? 'Сохранение...'
                        : (role === 'student'
                          ? (scheduleEditingId ? 'Отправить изменение' : 'Запросить добавление')
                          : (scheduleEditingId ? 'Сохранить слот' : 'Добавить слот'))}
                    </Button>
                    {scheduleEditingId && (
                      <button
                        type="button"
                        onClick={resetScheduleForm}
                        className="schedule-shell__cancel-btn rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Отменить
                      </button>
                    )}
                  </div>
                </div>
              </div>
              )}

              {scheduleLoading && sortedSchedule.length === 0 ? (
                <div className="schedule-shell__loading inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
                  <RefreshCcw size={14} className="animate-spin" />
                  Загружаем график...
                </div>
              ) : sortedSchedule.length === 0 ? (
                <div className="schedule-shell__empty flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-500 shadow-sm">
                    <Calendar size={19} />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-700">Расписание пока пустое</div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {role === 'teacher'
                        ? 'Синхронизируйте занятия из Google Calendar или откройте ученика с уже добавленными слотами.'
                        : 'Выберите день и время выше, чтобы добавить первое занятие.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="schedule-shell__slots-grid">
                  {sortedSchedule.map((entry) => {
                    const isGoogleSlot = isGoogleCalendarScheduleEntry(entry);
                    return (
                      <div key={entry.id || `${entry.weekdayKey}-${entry.time}-${entry.createdAt || 'slot'}`} className="schedule-shell__slot-card rounded-2xl border border-sky-100/80 bg-white/90 p-4 shadow-sm shadow-sky-100/40">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="schedule-shell__chip-day inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                                <Calendar size={13} />
                                {entry.day || 'День не указан'}
                              </span>
                              <span className="schedule-shell__chip-time inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                <Clock3 size={13} />
                                {entry.time || 'Время не указано'}
                              </span>
                              {entry.date && (
                                <span className="schedule-shell__chip-date inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                                  {formatDate(entry.date)}
                                </span>
                              )}
                              {isGoogleSlot && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                                  title={entry.googleCalendarTitle ? `Событие: ${entry.googleCalendarTitle}` : 'Слот взят из Google Calendar'}
                                >
                                  Google
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEditSchedule(entry)}
                              disabled={scheduleDeletingId === entry.id || isGoogleSlot}
                              title={isGoogleSlot ? 'Этот слот управляется Google Calendar' : undefined}
                              className="schedule-shell__slot-edit inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                            >
                              <Pencil size={13} />
                              Изменить
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSchedule(entry)}
                              disabled={scheduleDeletingId === entry.id || isGoogleSlot}
                              title={isGoogleSlot ? 'Удалите или перенесите событие в Google Calendar, затем синхронизируйте расписание' : undefined}
                              className="schedule-shell__slot-delete inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                            >
                              <Trash2 size={13} />
                              {scheduleDeletingId === entry.id
                                ? (role === 'student' ? 'Отправка...' : 'Удаление...')
                                : (role === 'student' ? 'Запросить удаление' : 'Удалить')}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
                </div>
              </details>
                </>
              )}
            </div>
        </Card>
      )}

      {SHOW_SCHEDULE_SKILL_TREE && (role === 'teacher' || role === 'student') && (
        <ScheduleProgressTree
          progressMap={effectiveProgressMap}
          focusTaskNumbers={roadmapFocusTaskNumbers}
          onOpenTask={role === 'student' ? onOpenTask : null}
          tasks={taskOptions}
          pythonTasks={pythonTaskOptions}
          showDebugUnlockButton={role === 'teacher'}
        />
      )}

      {role === 'teacher' && (
        <Card className="overflow-hidden border-purple-200/70 bg-gradient-to-br from-white via-purple-50/55 to-fuchsia-50/45 shadow-[0_14px_34px_rgba(124,58,237,0.12)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-purple-600 text-white shadow-lg shadow-purple-500/20">
                <BookOpen size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900">Домашняя работа</h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
                  Незаконченные номера из последней домашки подставятся сами. Условия заданий можно посмотреть прямо при выборе.
                </p>
                {homeworkDraft ? (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-white/85 px-2.5 py-1 text-[10px] font-black text-purple-700">
                    <Save size={11} />
                    Есть сохранённый черновик
                  </div>
                ) : null}
                {homeworkDraftNotice ? (
                  <p className="mt-2 text-xs font-semibold text-emerald-700">{homeworkDraftNotice}</p>
                ) : null}
              </div>
            </div>
            <Button
              onClick={() => openNewHomeworkComposer()}
              disabled={homeworkComposerPreparing || homeworkDraftLoading || !effectiveStudentId}
              className="min-h-12 shrink-0 justify-center px-5 shadow-lg shadow-purple-500/20 sm:min-w-[228px]"
            >
              {homeworkComposerPreparing || homeworkDraftLoading
                ? <RefreshCcw size={17} className="animate-spin" />
                : homeworkDraft
                  ? <Save size={17} />
                  : <ArrowRight size={17} />}
              {homeworkDraftLoading
                ? 'Проверяем черновик…'
                : homeworkComposerPreparing
                ? (homeworkDraft ? 'Открываем черновик…' : 'Открываем конструктор…')
                : (homeworkDraft ? 'Продолжить черновик' : 'Задать новую домашку')}
            </Button>
          </div>
        </Card>
      )}

      <div className={role === 'student' ? 'student-today-homework-section space-y-3 md:space-y-4' : 'space-y-4 md:space-y-5'}>
        {role !== 'student' && (
          <div>
            <h3 className="text-lg font-bold text-gray-800">Домашние задания</h3>
          </div>
        )}

        {loading ? (
          role === 'student' ? (
            <div className="student-today-homework-state">
              <RefreshCcw size={16} className="animate-spin" />
              Загружаем домашнюю работу...
            </div>
          ) : (
            <Card className="border-slate-200 bg-white/85">
              <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
                <RefreshCcw size={14} className="animate-spin" />
                Загрузка...
              </div>
            </Card>
          )
        ) : sortedHomeworks.length === 0 ? (
          role === 'student' ? (
            <article className="student-today-homework-empty">
              <span>{offlineHomeworkState.status === 'missing' ? <WifiOff size={19} /> : <BookOpen size={19} />}</span>
              <div>
                <strong>{offlineHomeworkState.status === 'missing' ? 'Офлайн-копии пока нет' : 'Домашка пока не назначена'}</strong>
                <p>{offlineHomeworkState.status === 'missing'
                  ? 'Откройте платформу один раз с интернетом — условия сохранятся автоматически.'
                  : 'Когда преподаватель добавит задания, они появятся здесь.'}</p>
              </div>
            </article>
          ) : (
            <Card className="border-slate-200 bg-white/85">
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
                Комментариев учителя нет.
              </div>
            </Card>
          )
        ) : (
          <div className="space-y-4 md:space-y-6">
            <div ref={nextHomeworkFlyRef}>
              {renderHomeworkEntryCard(nextHomeworkEntry, 'next')}
            </div>

            {role === 'student' ? (
              previousHomeworkEntries.length > 0 ? (
                <section className="student-today-homework-history">
                  <button
                    type="button"
                    onClick={() => setShowHistory((prev) => !prev)}
                    className="student-today-homework-history__toggle"
                    aria-expanded={showHistory}
                    aria-controls="student-homework-history-list"
                  >
                    <span className="student-today-homework-history__icon"><BookOpen size={16} /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <strong>История домашних работ</strong>
                      <small>{getHomeworkCountLabel(previousHomeworkEntries.length)}</small>
                    </span>
                    <ChevronRight size={17} className={showHistory ? 'rotate-90' : ''} />
                  </button>
                  <div id="student-homework-history-list" className={`${showHistory ? 'student-today-homework-history__list space-y-3 md:space-y-4 block' : 'hidden'}`}>
                    {previousHomeworkEntries.map((entry, idx) =>
                      renderHomeworkEntryCard(entry, 'history', entry.id || `${entry?.issuedAt || 'entry'}-${idx}`)
                    )}
                  </div>
                </section>
              ) : null
            ) : (
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
            )}
          </div>
        )}
      </div>

      {role === 'teacher' && (
        <TeacherHomeworkReviewModal
          open={teacherHomeworkReviewOpen}
          studentId={effectiveStudentId}
          studentLabel={selectedStudent ? getStudentLabel(selectedStudent) : ''}
          items={teacherHomeworkReviewItems}
          getAnswerCountForTask={getAnswerCountForTask}
          getExpectedAnswers={getExpectedAnswers}
          gameTheoryTask={GAME_THEORY_TASK}
          withStudentId={withStudentId}
          sourceLoading={testsDb === null || mockExamsLoading}
          sourceError={[testsDbError, mockExamsError].filter(Boolean).join(' ')}
          questionDifficultyIndex={questionDifficultyIndex}
          mockTaskAnalyticsByExam={mockTaskAnalyticsByExam}
          onClose={() => {
            homeworkReviewOpenStudentIdRef.current = '';
            setTeacherHomeworkReviewOpen(false);
          }}
        />
      )}

      {role === 'teacher' && homeworkComposerOpen && (
        <TeacherHomeworkComposer
          open={homeworkComposerOpen}
          editing={Boolean(editingId)}
          preparing={homeworkComposerPreparing}
          preparationError={[
            homeworkComposerError,
            homeworkComposerOpen ? String(error || '').trim() : '',
          ].filter(Boolean).join(' ')}
          saving={saving}
          draftSaving={homeworkDraftSaving}
          discarding={homeworkDraftDiscarding}
          draftRestoredAt={editingId ? '' : homeworkDraft?.updatedAt}
          studentId={requestStudentId}
          studentLabel={selectedStudent ? getStudentLabel(selectedStudent) : ''}
          form={form}
          carryoverSummary={homeworkCarryoverSummary}
          taskOptions={taskOptions}
          pythonTaskOptions={pythonTaskOptions}
          mockExams={mockExams}
          mockExamsLoading={mockExamsLoading}
          testsDb={testsDb || {}}
          levels={LEVELS}
          pythonLevelId={PYTHON_LEVEL_ID}
          goalTypeTask={GOAL_TYPE_TASK}
          goalTypeMock={GOAL_TYPE_MOCK}
          normalizeGoalType={normalizeGoalType}
          normalizeTaskNumber={normalizeTaskNumber}
          isPythonTaskNumber={isPythonTaskNumber}
          getTaskDisplayNumber={getTaskDisplayNumber}
          formatTaskNumber={formatTaskNumber}
          getPythonTaskInfo={getPythonTaskInfo}
          normalizeMockExamId={normalizeMockExamId}
          parseTargetInput={parseTargetInput}
          onChangeForm={(patch) => setForm((previous) => {
            const nextPatch = { ...(patch || {}) };
            if (
              nextPatch.dueAtMode === HOMEWORK_DUE_AT_MODE_NEXT_LESSON
              && !Object.prototype.hasOwnProperty.call(nextPatch, 'dueAt')
            ) {
              nextPatch.dueAt = toDateTimeLocalValue(buildDefaultHomeworkDueAt(
                previous.daysToComplete || 7,
                editableLessonSchedule
              ));
            }
            return { ...previous, ...nextPatch };
          })}
          onUpdateGoal={updateGoal}
          onAddGoal={addGoalRow}
          onRemoveGoal={removeGoalRow}
          onClose={closeHomeworkComposer}
          onSaveDraft={saveHomeworkComposerDraft}
          onSave={handleSave}
        />
      )}

      <StudentLessonDetailModal
        open={Boolean(selectedLessonDetail)}
        lesson={lessonDetailData?.lesson || selectedLessonDetail}
        materials={Array.isArray(lessonDetailData?.materials) ? lessonDetailData.materials : []}
        replay={lessonDetailData?.replay || null}
        createPythonWorker={createPythonWorker}
        renderLessonReplaySandbox={renderLessonReplaySandbox}
        topicText={getLessonTopicDisplayText(lessonDetailData?.lesson?.topic || selectedLessonDetail?.topic)}
        loading={lessonDetailLoading}
        error={lessonDetailError}
        studentId={effectiveStudentId}
        formatTaskLabel={getLessonTaskDisplayText}
        onClose={closeStudentLessonDetail}
        onRetry={retryStudentLessonDetail}
      />
    </div>
  );
};



export default ScheduleSection;

