import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { api } from '../services/api';

const LESSON_HISTORY_LIMIT = 50;
const HISTORICAL_WEEK_LIMIT = 12;
const PLATFORM_TIME_ZONE = 'Europe/Moscow';
const AUTO_SEEN_STORAGE_PREFIX = 'student-weekly-recap:auto-seen:v1';
const WEEKDAY_LABELS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const MONTH_LABELS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
const EMPTY_TASKS = [];

const padDatePart = (value) => String(value).padStart(2, '0');

const platformDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PLATFORM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const toLocalDayKey = (value) => {
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
};

const toPlatformDayKey = (value) => {
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = Object.fromEntries(
      platformDayFormatter.formatToParts(date).map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return toLocalDayKey(date);
  }
};

const parseDayKey = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (
    date.getFullYear() !== Number(match[1])
    || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3])
  ) return null;
  return date;
};

const addLocalDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getWeekWindowForDayKey = (anchorDayKey, todayKey = '') => {
  const anchor = parseDayKey(anchorDayKey) || parseDayKey(toLocalDayKey(new Date()));
  const mondayOffset = (anchor.getDay() + 6) % 7;
  const monday = addLocalDays(anchor, -mondayOffset);
  const sunday = addLocalDays(monday, 6);
  const days = WEEKDAY_LABELS.map((label, index) => {
    const date = addLocalDays(monday, index);
    return {
      key: toLocalDayKey(date),
      label,
      dayNumber: date.getDate(),
      isToday: Boolean(todayKey) && toLocalDayKey(date) === todayKey,
    };
  });
  return {
    startKey: days[0].key,
    endKey: days[days.length - 1].key,
    monday,
    sunday,
    days,
  };
};

const getCurrentWeekWindow = (now = new Date()) => {
  const todayKey = toPlatformDayKey(now);
  return getWeekWindowForDayKey(todayKey, todayKey);
};

const getLastCompletedWeekWindow = (now = new Date()) => {
  const currentWeek = getCurrentWeekWindow(now);
  return getWeekWindowForDayKey(toLocalDayKey(addLocalDays(currentWeek.monday, -7)));
};

const getCompletedWeekWindows = (targetWeek, limit = HISTORICAL_WEEK_LIMIT) => (
  Array.from({ length: Math.max(1, limit) }, (_, index) => (
    getWeekWindowForDayKey(toLocalDayKey(addLocalDays(targetWeek.monday, index * -7)))
  ))
);

const isDayInsideWeek = (dayKey, week) => Boolean(
  dayKey && dayKey >= week.startKey && dayKey <= week.endKey
);

const pluralize = (value, one, few, many) => {
  const absolute = Math.abs(Math.trunc(Number(value) || 0));
  const mod100 = absolute % 100;
  const mod10 = absolute % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const formatCount = (value, forms) => (
  `${Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString('ru-RU')} ${pluralize(value, ...forms)}`
);

const formatWeekLabel = (week) => {
  const start = week.monday;
  const end = week.sunday;
  const startMonth = MONTH_LABELS_GENITIVE[start.getMonth()];
  const endMonth = MONTH_LABELS_GENITIVE[end.getMonth()];
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${endMonth}`
    : `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
};

const getEventDayKey = (event) => {
  const explicit = String(event?.localDay || '').trim();
  if (parseDayKey(explicit)) return explicit;
  return toPlatformDayKey(event?.solvedAt);
};

const getTaskIdentity = (taskNumber, tasks) => {
  const normalizedNumber = Number(taskNumber);
  const task = (Array.isArray(tasks) ? tasks : []).find((entry) => (
    Number(entry?.number ?? entry?.id) === normalizedNumber
  ));
  const displayNumber = String(task?.displayNumber || task?.number || task?.id || normalizedNumber || '').trim();
  const title = String(task?.title || '').trim();
  return {
    displayNumber,
    title,
    label: title
      ? `Задание ${displayNumber} · ${title}`
      : `Задание ${displayNumber || taskNumber}`,
  };
};

const getTopicLabel = (topic, tasks) => {
  const text = String(topic?.text || '').trim();
  if (text) return text;
  const taskNumbers = Array.from(new Set(
    (Array.isArray(topic?.taskNumbers) ? topic.taskNumbers : [])
      .map(Number)
      .filter(Number.isFinite)
  ));
  if (taskNumbers.length === 1) return getTaskIdentity(taskNumbers[0], tasks).label;
  if (taskNumbers.length > 1) {
    return `Задания ${taskNumbers.map((number) => getTaskIdentity(number, tasks).displayNumber).join(', ')}`;
  }
  return '';
};

const buildWeeklySummary = (studentData, lessonPayload, tasks, week) => {
  const dayMap = new Map(week.days.map((day) => [day.key, {
    ...day,
    solved: 0,
    xp: 0,
    lessons: 0,
    minutes: 0,
  }]));
  const seenEvents = new Set();
  const taskStats = new Map();
  let solvedCount = 0;
  let xp = 0;

  (Array.isArray(studentData?.solvedEvents) ? studentData.solvedEvents : []).forEach((event) => {
    const dayKey = getEventDayKey(event);
    if (!isDayInsideWeek(dayKey, week)) return;
    const eventId = String(event?.id || '').trim();
    const fallbackId = [event?.taskNumber, event?.levelId, event?.questionId, event?.solvedAt].join('|');
    const dedupeKey = eventId || fallbackId;
    if (seenEvents.has(dedupeKey)) return;
    seenEvents.add(dedupeKey);

    const eventXp = Math.max(0, Number(event?.xpGained) || 0);
    const taskNumber = Number(event?.taskNumber);
    solvedCount += 1;
    xp += eventXp;
    const day = dayMap.get(dayKey);
    if (day) {
      day.solved += 1;
      day.xp += eventXp;
    }
    if (Number.isFinite(taskNumber)) {
      const key = String(taskNumber);
      const current = taskStats.get(key) || { taskNumber, solved: 0, xp: 0 };
      current.solved += 1;
      current.xp += eventXp;
      taskStats.set(key, current);
    }
  });

  let correctAttempts = 0;
  let wrongAttempts = 0;
  const solvedByTask = studentData?.solvedByTask && typeof studentData.solvedByTask === 'object'
    ? studentData.solvedByTask
    : {};
  Object.values(solvedByTask).forEach((levels) => {
    if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return;
    Object.values(levels).forEach((level) => {
      const answerHistory = level?.answerHistory && typeof level.answerHistory === 'object'
        ? level.answerHistory
        : {};
      Object.values(answerHistory).forEach((entries) => {
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
          const dayKey = toPlatformDayKey(entry?.submittedAt);
          if (!isDayInsideWeek(dayKey, week)) return;
          if (entry?.correct === true) correctAttempts += 1;
          else wrongAttempts += 1;
        });
      });
    });
  });

  const lessons = (Array.isArray(lessonPayload?.items) ? lessonPayload.items : [])
    .filter((lesson) => isDayInsideWeek(String(lesson?.dayKey || '').trim(), week));
  let lessonMinutes = 0;
  const topicsByLabel = new Map();
  lessons.forEach((lesson) => {
    const duration = Math.max(0, Number(lesson?.durationMinutes) || 0);
    lessonMinutes += duration;
    const day = dayMap.get(String(lesson?.dayKey || '').trim());
    if (day) {
      day.lessons += 1;
      day.minutes += duration;
    }
    const label = getTopicLabel(lesson?.topic, tasks);
    if (label && !topicsByLabel.has(label.toLocaleLowerCase('ru-RU'))) {
      topicsByLabel.set(label.toLocaleLowerCase('ru-RU'), {
        label,
        lesson,
        source: lesson?.topic?.source === 'teacher' ? 'teacher' : 'notes',
      });
    }
  });

  const strongestTask = Array.from(taskStats.values()).sort((left, right) => (
    right.solved - left.solved || right.xp - left.xp || left.taskNumber - right.taskNumber
  ))[0] || null;
  const attempts = correctAttempts + wrongAttempts;
  const days = Array.from(dayMap.values());
  const activeDays = days.filter((day) => day.solved > 0 || day.lessons > 0).length;
  const maxDailyActivity = Math.max(1, ...days.map((day) => day.solved + day.lessons));

  return {
    week,
    days,
    maxDailyActivity,
    solvedCount,
    xp: Math.round(xp),
    activeDays,
    lessons,
    lessonCount: lessons.length,
    lessonMinutes: Math.round(lessonMinutes),
    topics: Array.from(topicsByLabel.values()),
    strongestTask: strongestTask
      ? { ...strongestTask, ...getTaskIdentity(strongestTask.taskNumber, tasks) }
      : null,
    attempts,
    correctAttempts,
    wrongAttempts,
    accuracy: attempts > 0 ? Math.round((correctAttempts / attempts) * 100) : null,
    isEmpty: solvedCount === 0 && attempts === 0 && lessons.length === 0,
  };
};

const scoreWeeklySummary = (summary) => Math.max(0, Math.round(
  (Number(summary?.xp) || 0)
  + (Number(summary?.solvedCount) || 0) * 8
  + (Number(summary?.lessonMinutes) || 0) / 3
  + (Number(summary?.activeDays) || 0) * 12
));

const buildWeeklyComparison = (studentData, lessonPayload, tasks, targetWeek) => {
  const summaries = getCompletedWeekWindows(targetWeek).map((week) => (
    buildWeeklySummary(studentData, lessonPayload, tasks, week)
  ));
  const targetSummary = summaries[0];
  if (!targetSummary || targetSummary.isEmpty) return { summary: targetSummary, comparison: null };

  const solvedEventsWereTrimmed = (Array.isArray(studentData?.solvedEvents) ? studentData.solvedEvents.length : 0) >= 200;
  const reliableSummaries = solvedEventsWereTrimmed && summaries.length > 2
    ? summaries.slice(0, -1)
    : summaries;
  const activeSummaries = reliableSummaries.filter((summary) => !summary.isEmpty);
  const targetScore = scoreWeeklySummary(targetSummary);
  const otherActiveWeeks = activeSummaries.filter((summary) => summary.week.startKey !== targetWeek.startKey);
  const rank = 1 + otherActiveWeeks.filter((summary) => scoreWeeklySummary(summary) > targetScore).length;
  const total = otherActiveWeeks.length + 1;
  const betterThan = otherActiveWeeks.filter((summary) => scoreWeeklySummary(summary) < targetScore).length;
  const percentile = otherActiveWeeks.length > 0
    ? Math.round((betterThan / otherActiveWeeks.length) * 100)
    : null;
  const previousWeek = summaries[1] || null;
  const previousScore = previousWeek && !previousWeek.isEmpty ? scoreWeeklySummary(previousWeek) : 0;
  const deltaPercent = previousScore > 0
    ? Math.round(((targetScore - previousScore) / previousScore) * 100)
    : null;

  return {
    summary: targetSummary,
    comparison: {
      rank,
      total,
      percentile,
      deltaPercent,
      score: targetScore,
      previousWeekHadActivity: previousScore > 0,
      isBest: rank === 1 && total > 1,
      historyLimited: solvedEventsWereTrimmed || summaries.length >= HISTORICAL_WEEK_LIMIT,
    },
  };
};

const formatRank = (rank) => `${Math.max(1, Math.trunc(Number(rank) || 1))}-е`;

const CELEBRATION_PARTICLES = Array.from({ length: 16 }, (_, index) => ({
  id: index,
  x: `${8 + ((index * 19) % 84)}%`,
  drift: `${-34 + ((index * 23) % 68)}px`,
  delay: `${80 + ((index * 67) % 380)}ms`,
  duration: `${720 + ((index * 83) % 420)}ms`,
  rotate: `${80 + ((index * 47) % 260)}deg`,
  tone: index % 4,
}));

const StatCard = ({ icon, label, value, detail, tone = 'violet' }) => {
  const toneClasses = {
    violet: 'bg-violet-500/10 text-violet-600 ring-violet-400/20',
    sky: 'bg-sky-500/10 text-sky-600 ring-sky-400/20',
    emerald: 'bg-emerald-500/10 text-emerald-600 ring-emerald-400/20',
    amber: 'bg-amber-500/10 text-amber-600 ring-amber-400/20',
  };
  return (
    <div className="student-weekly-recap-stat rounded-2xl border border-slate-200/70 bg-[rgb(var(--surface-soft))] p-3.5 shadow-sm">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${toneClasses[tone] || toneClasses.violet}`}>
        {icon}
      </div>
      <div className="mt-3 text-2xl font-extrabold leading-none text-[rgb(var(--ink))]">{value}</div>
      <div className="mt-1 text-xs font-bold text-[rgb(var(--ink))]">{label}</div>
      {detail && <div className="mt-1 text-[11px] text-[rgb(var(--ink-soft))]">{detail}</div>}
    </div>
  );
};

const StudentWeeklyRecap = ({
  studentId,
  tasks = EMPTY_TASKS,
  solvedRefreshKey = 0,
  onOpenLesson = null,
  showTrigger = true,
  autoReveal = false,
}) => {
  const panelId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeTimerRef = useRef(null);
  const lessonOpenTimerRef = useRef(null);
  const autoRevealTimerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const activeSourceRef = useRef('manual');
  const closingRef = useRef(false);
  const autoScheduledKeyRef = useRef('');
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [loadedSummary, setLoadedSummary] = useState(null);
  const [loadError, setLoadError] = useState({ key: '', message: '' });
  const [loadedKey, setLoadedKey] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const week = useMemo(() => getLastCompletedWeekWindow(), [open, retryToken]);
  const normalizedStudentId = String(studentId || '').trim();
  const requestKey = `${normalizedStudentId}|${week.startKey}|${String(solvedRefreshKey)}|${retryToken}`;
  const seenStorageKey = `${AUTO_SEEN_STORAGE_PREFIX}:${normalizedStudentId}:${week.startKey}`;
  const summary = loadedKey === requestKey ? loadedSummary : null;
  const error = !normalizedStudentId
    ? 'Не удалось определить ученика.'
    : (loadError.key === requestKey ? loadError.message : '');
  const loading = open && Boolean(normalizedStudentId) && !summary && !error;
  const shouldLoad = open || autoReveal;

  const openModal = useCallback((options = {}) => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    closingRef.current = false;
    previousFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    activeSourceRef.current = options?.source || 'manual';
    setClosing(false);
    setCelebration(Boolean(options?.celebration));
    setOpen(true);
  }, []);

  const acknowledgeAutoReveal = useCallback(() => {
    if (activeSourceRef.current !== 'auto' || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(seenStorageKey, JSON.stringify({
        weekStart: week.startKey,
        seenAt: new Date().toISOString(),
      }));
    } catch { /* localStorage can be unavailable in private browser modes. */ }
  }, [seenStorageKey, week.startKey]);

  const closeModal = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    acknowledgeAutoReveal();
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      closingRef.current = false;
      setOpen(false);
      setClosing(false);
      setCelebration(false);
    }, 180);
  }, [acknowledgeAutoReveal]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    if (lessonOpenTimerRef.current) window.clearTimeout(lessonOpenTimerRef.current);
    if (autoRevealTimerRef.current) window.clearTimeout(autoRevealTimerRef.current);
  }, []);

  const handleOpenLesson = useCallback((lesson) => {
    if (typeof onOpenLesson !== 'function') return;
    closeModal();
    if (lessonOpenTimerRef.current) window.clearTimeout(lessonOpenTimerRef.current);
    lessonOpenTimerRef.current = window.setTimeout(() => {
      lessonOpenTimerRef.current = null;
      onOpenLesson(lesson);
    }, 200);
  }, [closeModal, onOpenLesson]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const appRoot = document.getElementById('root');
    const previousRootAriaHidden = appRoot?.getAttribute('aria-hidden');
    const previousRootInert = appRoot?.inert;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }
    if (appRoot) {
      appRoot.inert = true;
      appRoot.setAttribute('aria-hidden', 'true');
    }
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector('[data-recap-autofocus]')?.focus();
    });
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      if (appRoot) {
        appRoot.inert = Boolean(previousRootInert);
        if (previousRootAriaHidden === null) appRoot.removeAttribute('aria-hidden');
        else appRoot.setAttribute('aria-hidden', previousRootAriaHidden);
      }
      const focusTarget = previousFocusRef.current?.isConnected
        ? previousFocusRef.current
        : triggerRef.current;
      focusTarget?.focus?.({ preventScroll: true });
    };
  }, [closeModal, open]);

  useEffect(() => {
    if (!shouldLoad || loadedKey === requestKey) return undefined;
    if (!normalizedStudentId) return undefined;

    let cancelled = false;
    Promise.all([
      api.getStudentData(normalizedStudentId),
      api.getLessonHistory(normalizedStudentId, { limit: LESSON_HISTORY_LIMIT, offset: 0 }),
    ])
      .then(([studentData, lessonHistory]) => {
        if (cancelled) return;
        const result = buildWeeklyComparison(studentData, lessonHistory, tasks, week);
        setLoadedSummary(result?.summary ? { ...result.summary, comparison: result.comparison } : null);
        setLoadedKey(requestKey);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setLoadError({
          key: requestKey,
          message: loadError?.message || 'Не удалось собрать итоги недели.',
        });
      });

    return () => { cancelled = true; };
  }, [loadedKey, normalizedStudentId, requestKey, shouldLoad, tasks, week]);

  useEffect(() => {
    if (!autoReveal || !summary || summary.isEmpty || error || open) return undefined;
    if (autoScheduledKeyRef.current === requestKey) return undefined;
    if (typeof document === 'undefined') return undefined;
    try {
      if (localStorage.getItem(seenStorageKey)) return undefined;
    } catch { /* Continue with an in-memory one-time reveal. */ }

    autoScheduledKeyRef.current = requestKey;
    let disposed = false;
    const attemptReveal = () => {
      if (disposed) return;
      const anotherDialogIsOpen = Boolean(document.querySelector('[aria-modal="true"], [role="dialog"]'));
      if (document.visibilityState !== 'visible' || anotherDialogIsOpen) {
        autoRevealTimerRef.current = window.setTimeout(attemptReveal, 1500);
        return;
      }
      autoRevealTimerRef.current = null;
      openModal({ celebration: true, source: 'auto' });
    };
    autoRevealTimerRef.current = window.setTimeout(attemptReveal, 900);
    return () => {
      disposed = true;
      if (autoRevealTimerRef.current) window.clearTimeout(autoRevealTimerRef.current);
      autoRevealTimerRef.current = null;
    };
  }, [autoReveal, error, open, openModal, requestKey, seenStorageKey, summary]);

  const compactSummary = summary
    ? `${formatCount(summary.solvedCount, ['задача', 'задачи', 'задач'])} · ${formatCount(summary.lessonCount, ['занятие', 'занятия', 'занятий'])}`
    : 'Решения, занятия и главный прогресс за неделю';
  const comparison = summary?.comparison || null;
  const rankHeadline = comparison
    ? (comparison.total <= 1
      ? 'Первая неделя в личной статистике'
      : (comparison.isBest
        ? `Лучшая неделя среди ${comparison.total} активных недель`
        : `${formatRank(comparison.rank)} место среди ${comparison.total} активных недель`))
    : '';

  return (
    <>
      {showTrigger && (
        <button
          ref={triggerRef}
          type="button"
          className="student-weekly-recap-trigger"
          onClick={() => openModal()}
          data-recap-state={summary ? (summary.isEmpty ? 'empty' : 'ready') : 'available'}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={panelId}
          title={`Открыть итоги за ${formatWeekLabel(week)}`}
        >
          <span className="student-weekly-recap-trigger__icon" aria-hidden="true">
            <CalendarDays size={17} />
          </span>
          <span className="student-weekly-recap-trigger__copy">
            <strong>Итоги недели</strong>
            <span className="student-weekly-recap-trigger__meta">
              <span className="student-weekly-recap-trigger__status" aria-hidden="true" />
              <small>{summary ? compactSummary : formatWeekLabel(week)}</small>
            </span>
          </span>
          {summary && !summary.isEmpty && (
            <span className="student-weekly-recap-trigger__xp">
              +{summary.xp.toLocaleString('ru-RU')} XP
            </span>
          )}
          <span className="student-weekly-recap-trigger__arrow" aria-hidden="true">
            <ChevronRight size={16} />
          </span>
        </button>
      )}

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className={`student-weekly-recap-modal ${celebration ? 'student-weekly-recap-modal--celebration' : ''} ${closing ? 'is-closing' : ''}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            id={panelId}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className={`student-weekly-recap-dialog surface-panel text-[rgb(var(--ink))] ${celebration ? 'student-weekly-recap-dialog--celebration' : ''}`}
          >
            <span className="student-weekly-recap-dialog__glow student-weekly-recap-dialog__glow--one" aria-hidden="true" />
            <span className="student-weekly-recap-dialog__glow student-weekly-recap-dialog__glow--two" aria-hidden="true" />
            {celebration && (
              <div className="student-weekly-recap-celebration-particles" aria-hidden="true">
                {CELEBRATION_PARTICLES.map((particle) => (
                  <span
                    key={particle.id}
                    className={`student-weekly-recap-celebration-particle is-tone-${particle.tone}`}
                    style={{
                      '--particle-x': particle.x,
                      '--particle-drift': particle.drift,
                      '--particle-delay': particle.delay,
                      '--particle-duration': particle.duration,
                      '--particle-rotate': particle.rotate,
                    }}
                  />
                ))}
              </div>
            )}
            <header className={`student-weekly-recap-dialog__header ${celebration ? 'student-weekly-recap-dialog__header--celebration' : ''}`}>
              <span className="student-weekly-recap-dialog__emblem" aria-hidden="true">
                {celebration ? <Trophy size={23} /> : <Sparkles size={23} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="student-weekly-recap-dialog__eyebrow">{celebration ? 'Неделя завершена' : 'Личный прогресс'}</div>
                <h2 id={titleId} className="student-weekly-recap-dialog__title">
                  {celebration ? 'Ура! Вот твои итоги недели' : 'Итоги недели'}
                </h2>
                <p id={descriptionId} className="student-weekly-recap-dialog__subtitle">
                  {celebration
                    ? `${formatWeekLabel(week)} · время увидеть, сколько всего получилось`
                    : 'Решения, занятия и моменты, которыми уже можно гордиться'}
                </p>
              </div>
              {summary && !summary.isEmpty && (
                <span className="student-weekly-recap-dialog__xp">+{summary.xp.toLocaleString('ru-RU')} XP</span>
              )}
              <button
                type="button"
                data-recap-autofocus
                className="student-weekly-recap-dialog__close"
                onClick={closeModal}
                aria-label="Закрыть итоги недели"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="student-weekly-recap-dialog__scroll">
              <div className="student-weekly-recap-dialog__content">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-violet-600">Завершённая неделя</div>
            <div className="mt-0.5 text-sm font-bold text-[rgb(var(--ink-soft))]">{formatWeekLabel(week)}</div>
          </div>
          {summary && (
            <button
              type="button"
              onClick={() => setRetryToken((value) => value + 1)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-soft))] transition hover:border-violet-300 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <RefreshCcw size={13} aria-hidden="true" />
              Обновить
            </button>
          )}
        </div>

        {loading && !summary ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl bg-violet-500/5" role="status" aria-live="polite">
            <div className="text-center">
              <RefreshCcw className="mx-auto animate-spin text-violet-500" size={24} aria-hidden="true" />
              <div className="mt-3 text-sm font-bold">Собираем ваши достижения…</div>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-300/60 bg-rose-500/10 p-4" role="alert">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 shrink-0 text-rose-500" size={19} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold">Не получилось загрузить итоги</div>
                <div className="mt-1 text-xs text-[rgb(var(--ink-soft))]">{error}</div>
                <button
                  type="button"
                  onClick={() => setRetryToken((value) => value + 1)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  <RefreshCcw size={13} aria-hidden="true" />
                  Попробовать ещё раз
                </button>
              </div>
            </div>
          </div>
        ) : summary?.isEmpty ? (
          <div className="rounded-2xl border border-dashed border-violet-300/70 bg-violet-500/5 px-5 py-8 text-center">
            <Sparkles className="mx-auto text-violet-500" size={28} aria-hidden="true" />
            <div className="mt-3 text-base font-extrabold">Спокойная неделя</div>
            <div className="mx-auto mt-1 max-w-md text-sm text-[rgb(var(--ink-soft))]">
              За эту завершённую неделю пока нет сохранённых решений или занятий.
            </div>
          </div>
        ) : summary ? (
          <div className="student-weekly-recap-summary space-y-4">
            {comparison && (
              <section
                className={`student-weekly-recap-celebration ${celebration ? 'is-celebration' : ''}`}
                role="status"
                aria-live="polite"
              >
                {celebration && (
                  <span className="student-weekly-recap-celebration__ambient" aria-hidden="true">
                    <i className="is-one" />
                    <i className="is-two" />
                    <i className="is-three" />
                  </span>
                )}
                <div className="student-weekly-recap-celebration__halo" aria-hidden="true">
                  <span />
                  <Trophy size={30} />
                </div>
                <div className="student-weekly-recap-celebration__copy">
                  <div className="student-weekly-recap-celebration__eyebrow">Место недели по эффективности</div>
                  <div className="student-weekly-recap-celebration__rank">{rankHeadline}</div>
                  <div className="student-weekly-recap-celebration__badges">
                    {comparison.percentile !== null && (
                      <span className="is-positive">
                        <TrendingUp size={13} aria-hidden="true" />
                        Эффективнее {comparison.percentile}% прошлых недель
                      </span>
                    )}
                    {comparison.deltaPercent !== null ? (
                      <span className={comparison.deltaPercent >= 0 ? 'is-positive' : 'is-negative'}>
                        {comparison.deltaPercent >= 0
                          ? <TrendingUp size={13} aria-hidden="true" />
                          : <TrendingDown size={13} aria-hidden="true" />}
                        {comparison.deltaPercent > 0 ? '+' : ''}{comparison.deltaPercent}% к прошлой неделе
                      </span>
                    ) : (
                      <span>Первая неделя для прямого сравнения</span>
                    )}
                  </div>
                  <div className="student-weekly-recap-celebration__formula">
                    Учитываем решения, XP, регулярность и занятия
                    {comparison.historyLimited ? ' · по доступной истории последних недель' : ''}
                  </div>
                </div>
                {comparison.total > 1 && (
                  <div className="student-weekly-recap-celebration__place" aria-hidden="true">
                    <strong>{comparison.rank}</strong>
                    <span>из {comparison.total}</span>
                  </div>
                )}
              </section>
            )}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <StatCard
                icon={<Zap size={17} aria-hidden="true" />}
                label="Получено XP"
                value={`+${summary.xp.toLocaleString('ru-RU')}`}
                detail="За новые решения"
                tone="violet"
              />
              <StatCard
                icon={<CheckCircle2 size={17} aria-hidden="true" />}
                label="Решено"
                value={summary.solvedCount.toLocaleString('ru-RU')}
                detail={formatCount(summary.activeDays, ['активный день', 'активных дня', 'активных дней'])}
                tone="emerald"
              />
              <StatCard
                icon={<CalendarDays size={17} aria-hidden="true" />}
                label="Занятия"
                value={summary.lessonCount.toLocaleString('ru-RU')}
                detail={formatCount(summary.lessonMinutes, ['минута', 'минуты', 'минут'])}
                tone="sky"
              />
              <StatCard
                icon={<Target size={17} aria-hidden="true" />}
                label="Точность"
                value={summary.accuracy === null ? '—' : `${summary.accuracy}%`}
                detail={summary.attempts > 0
                  ? `${summary.correctAttempts} верно · ${summary.wrongAttempts} ошибок`
                  : 'Попыток пока нет'}
                tone="amber"
              />
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-[rgb(var(--surface-soft))] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 text-sm font-extrabold">
                  <Activity size={17} className="text-violet-500" aria-hidden="true" />
                  Ритм недели
                </div>
                <span className="text-[11px] font-bold text-[rgb(var(--ink-soft))]">задачи + занятия</span>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
                {summary.days.map((day) => {
                  const activity = day.solved + day.lessons;
                  const height = activity > 0
                    ? Math.max(18, Math.round((activity / summary.maxDailyActivity) * 64))
                    : 6;
                  return (
                    <div
                      key={day.key}
                      className={`rounded-xl px-1.5 pb-2 pt-2 text-center ${day.isToday ? 'bg-violet-500/10 ring-1 ring-violet-400/30' : ''}`}
                      aria-label={`${day.label}: ${day.solved} решений, ${day.lessons} занятий`}
                    >
                      <div className="flex h-16 items-end justify-center" aria-hidden="true">
                        <span
                          className={`block w-full max-w-7 rounded-t-lg ${activity > 0 ? 'bg-gradient-to-t from-violet-600 to-fuchsia-400' : 'bg-slate-300/60'}`}
                          style={{ height }}
                        />
                      </div>
                      <div className="mt-1 text-[10px] font-extrabold text-[rgb(var(--ink-soft))]">{day.label}</div>
                      <div className="text-xs font-extrabold">{day.dayNumber}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-violet-300/50 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-4">
                <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600">
                  <Trophy size={15} aria-hidden="true" />
                  Сильнейшая тема
                </div>
                {summary.strongestTask ? (
                  <>
                    <div className="mt-3 text-base font-extrabold">{summary.strongestTask.label}</div>
                    <div className="mt-1 text-xs text-[rgb(var(--ink-soft))]">
                      {formatCount(summary.strongestTask.solved, ['новое решение', 'новых решения', 'новых решений'])}
                      {summary.strongestTask.xp > 0 ? ` · +${Math.round(summary.strongestTask.xp)} XP` : ''}
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-sm text-[rgb(var(--ink-soft))]">Появится после первого решения.</div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-[rgb(var(--surface-soft))] p-4">
                <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-600">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Работа над ответами
                </div>
                {summary.attempts > 0 ? (
                  <>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <span className="text-3xl font-extrabold">{summary.accuracy}%</span>
                      <span className="text-xs font-bold text-[rgb(var(--ink-soft))]">{formatCount(summary.attempts, ['попытка', 'попытки', 'попыток'])}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-300/50" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                        style={{ width: `${summary.accuracy}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-sm text-[rgb(var(--ink-soft))]">История попыток за эту неделю пока пуста.</div>
                )}
              </div>
            </div>

            {summary.topics.length > 0 && (
              <div className="rounded-2xl border border-slate-200/70 bg-[rgb(var(--surface-soft))] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-sm font-extrabold">
                    <BookOpen size={17} className="text-sky-500" aria-hidden="true" />
                    Темы занятий
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[rgb(var(--ink-soft))]">
                    <Clock3 size={12} aria-hidden="true" />
                    {formatCount(summary.lessonMinutes, ['минута', 'минуты', 'минут'])}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {summary.topics.map((topic) => {
                    const content = (
                      <>
                        <span className={`h-1.5 w-1.5 rounded-full ${topic.source === 'teacher' ? 'bg-violet-500' : 'bg-sky-500'}`} aria-hidden="true" />
                        {topic.label}
                      </>
                    );
                    return typeof onOpenLesson === 'function' ? (
                      <button
                        key={topic.label}
                        type="button"
                        onClick={() => handleOpenLesson(topic.lesson)}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200/80 bg-[rgb(var(--surface))] px-3 py-1.5 text-left text-xs font-bold transition hover:border-violet-300 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                      >
                        {content}
                      </button>
                    ) : (
                      <span
                        key={topic.label}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200/80 bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold"
                      >
                        {content}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
              </div>
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  );
};

export default StudentWeeklyRecap;
