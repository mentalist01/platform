import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Clock3, FileText, Loader2, PhoneCall, X } from 'lucide-react';

import { api, resolveAuthenticatedUploadsUrl } from '../services/api';

const LESSON_PROMPT_LEAD_MS = 60 * 1000;
const LESSON_PROMPT_AFTER_START_MS = 5 * 60 * 1000;
const LESSON_PROMPT_TICK_MS = 15 * 1000;
const LESSON_PROMPT_SCHEDULE_REFRESH_MS = 60 * 1000;
const LESSON_PROMPT_DISMISSED_STORAGE_PREFIX = 'teacher_lesson_start_prompt_dismissed_v1';
const DEFAULT_EVENT_DURATION_MINUTES = 60;

const WEEKDAY_ORDER_BY_KEY = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const WEEKDAY_ORDER_BY_LABEL = {
  понедельник: 1,
  пн: 1,
  вторник: 2,
  вт: 2,
  среда: 3,
  ср: 3,
  четверг: 4,
  чт: 4,
  пятница: 5,
  пт: 5,
  суббота: 6,
  сб: 6,
  воскресенье: 7,
  вс: 7,
};

const LESSON_GOAL_LEVEL_LABELS = {
  basic: 'обязательный',
  advanced: 'продвинутый',
  expert: 'чтоб наверняка',
};

const toDayKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const cloneAsDateOnly = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const capitalize = (value) => {
  const raw = String(value || '').trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
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

const getEntryStartMinutes = (entry) => {
  const fromTime = parseScheduleTimeToMinutes(entry?.time);
  if (Number.isFinite(fromTime)) return fromTime;
  const fromStart = Number(entry?.startMinutes);
  if (Number.isFinite(fromStart) && fromStart >= 0 && fromStart < 24 * 60) {
    return Math.floor(fromStart);
  }
  return NaN;
};

const formatMinutesAsTime = (minutes) => {
  const normalized = Number(minutes);
  if (!Number.isFinite(normalized)) return '00:00';
  const total = Math.max(0, Math.floor(normalized));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const formatMinutesAsDisplayTime = (minutes) => {
  const normalized = Number(minutes);
  if (!Number.isFinite(normalized)) return '--:--';
  const total = Math.max(0, Math.floor(normalized));
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const normalizeDayKey = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : normalized;
};

const normalizeExcludedDayKeys = (value) => (
  Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => normalizeDayKey(item))
      .filter(Boolean)
  ))
);

const resolveEntryWeekdayOrder = (entry) => {
  const explicit = Number(entry?.weekdayOrder);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 7) return Math.trunc(explicit);
  const key = String(entry?.weekdayKey || '').trim().toLowerCase();
  if (key && WEEKDAY_ORDER_BY_KEY[key]) return WEEKDAY_ORDER_BY_KEY[key];
  const label = String(entry?.day || '').trim().toLowerCase();
  if (label && WEEKDAY_ORDER_BY_LABEL[label]) return WEEKDAY_ORDER_BY_LABEL[label];
  const dateKey = normalizeDayKey(entry?.date);
  if (!dateKey) return 0;
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = date.getDay();
  return weekday === 0 ? 7 : weekday;
};

const getEntryCandidateDayKeys = (entry, now) => {
  const explicitDate = normalizeDayKey(entry?.date || entry?.dayKey);
  if (explicitDate) return [explicitDate];
  const weekdayOrder = resolveEntryWeekdayOrder(entry);
  if (!weekdayOrder) return [];
  const today = cloneAsDateOnly(now);
  const result = [];
  for (let offset = -1; offset <= 1; offset += 1) {
    const date = addDays(today, offset);
    const dayOrder = date.getDay() === 0 ? 7 : date.getDay();
    if (dayOrder === weekdayOrder) result.push(toDayKey(date));
  }
  return result;
};

const formatPromptDateLabel = (dayKey) => {
  const date = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return capitalize(date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).replace(' г.', ''));
};

const getReminderStorageKey = (teacherId) => (
  `${LESSON_PROMPT_DISMISSED_STORAGE_PREFIX}:${String(teacherId || '').trim()}`
);

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
      return String(file.category || '').trim() === 'class';
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

const formatLessonGoalTaskNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number === 19 ? '19-21' : String(number);
};

const formatLessonGoalTargets = (goal) => {
  if (goal?.includeAll) return 'все вопросы';
  const targets = Array.from(new Set(
    (Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.trunc(value))
  )).sort((left, right) => left - right);
  return targets.length > 0 ? `вопросы ${targets.join(', ')}` : '';
};

const formatLessonGoalLabel = (goal) => {
  if (!goal || typeof goal !== 'object') return '';
  const type = String(goal.type || '').trim().toLowerCase();
  if (type === 'mock' || (!type && String(goal.mockExamId || '').trim())) {
    const title = String(goal.mockTitle || goal.title || '').trim();
    return title ? `Пробник: ${title}` : 'Пробник';
  }
  const taskLabel = formatLessonGoalTaskNumber(goal.taskNumber);
  if (!taskLabel) return '';
  const levelKey = String(goal.levelId || '').trim().toLowerCase();
  const levelLabel = LESSON_GOAL_LEVEL_LABELS[levelKey] || levelKey;
  const targetLabel = formatLessonGoalTargets(goal);
  return [`Задание ${taskLabel}`, levelLabel, targetLabel].filter(Boolean).join(' • ');
};

const getHomeworkGoalLabels = (homework) => (
  (Array.isArray(homework?.goals) ? homework.goals : [])
    .map((goal) => formatLessonGoalLabel(goal))
    .filter(Boolean)
);

const findDueLessonPrompt = ({ entries, now, studentsById, dismissedKeys }) => {
  const safeNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const nowMs = safeNow.getTime();
  const candidates = [];

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const studentId = String(entry?.studentId || '').trim();
    if (!studentId) return;
    const startMinutes = getEntryStartMinutes(entry);
    if (!Number.isFinite(startMinutes)) return;
    const duration = Number.isFinite(Number(entry?.durationMinutes))
      ? Math.max(15, Math.round(Number(entry.durationMinutes)))
      : DEFAULT_EVENT_DURATION_MINUTES;
    const excludedSet = new Set(normalizeExcludedDayKeys(entry?.excludedDates));

    getEntryCandidateDayKeys(entry, safeNow).forEach((dayKey) => {
      if (!dayKey || excludedSet.has(dayKey)) return;
      const startLabel = formatMinutesAsTime(startMinutes);
      const startDate = new Date(`${dayKey}T${startLabel}:00`);
      if (Number.isNaN(startDate.getTime())) return;
      const startMs = startDate.getTime();
      const msUntilStart = startMs - nowMs;
      if (msUntilStart > LESSON_PROMPT_LEAD_MS || msUntilStart < -LESSON_PROMPT_AFTER_START_MS) return;
      const occurrenceKey = [
        String(entry?.id || entry?.externalEventId || '').trim(),
        studentId,
        dayKey,
        startLabel,
      ].join(':');
      if (dismissedKeys?.has(occurrenceKey)) return;
      const studentLabel = studentsById.get(studentId);
      const studentName = String(studentLabel || entry?.studentName || 'Ученик').trim();
      const subject = String(entry?.subject || '').trim();
      candidates.push({
        occurrenceKey,
        studentId,
        studentName,
        subject,
        dayKey,
        dateLabel: formatPromptDateLabel(dayKey),
        timeLabel: `${formatMinutesAsDisplayTime(startMinutes)}-${formatMinutesAsDisplayTime(startMinutes + duration)}`,
        startMs,
        msUntilStart,
      });
    });
  });

  candidates.sort((left, right) => left.startMs - right.startMs);
  return candidates[0] || null;
};

const getPromptLeadLabel = (prompt) => {
  const msUntilStart = Number(prompt?.msUntilStart);
  if (!Number.isFinite(msUntilStart)) return 'Урок скоро начнется';
  if (msUntilStart <= 0) return 'Урок уже начинается';
  const seconds = Math.max(1, Math.ceil(msUntilStart / 1000));
  if (seconds >= 50) return 'Урок через минуту';
  return `Урок через ${seconds} сек.`;
};

const TeacherLessonStartPrompt = ({
  teacherId,
  students = [],
  getStudentLabel = null,
  onOpenStudentWorkspace = null,
}) => {
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [scheduleReady, setScheduleReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [activePrompt, setActivePrompt] = useState(null);
  const [dismissVersion, setDismissVersion] = useState(0);
  const [homework, setHomework] = useState(null);
  const [homeworkLoading, setHomeworkLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const dismissedKeysRef = useRef(new Set());
  const calendarSyncConfiguredRef = useRef(null);

  const storageKey = useMemo(() => getReminderStorageKey(teacherId), [teacherId]);

  useEffect(() => {
    calendarSyncConfiguredRef.current = null;
  }, [teacherId]);

  useEffect(() => {
    const nextSet = new Set();
    if (typeof window !== 'undefined' && storageKey) {
      try {
        const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || '[]');
        if (Array.isArray(parsed)) {
          parsed.forEach((key) => {
            const normalized = String(key || '').trim();
            if (normalized) nextSet.add(normalized);
          });
        }
      } catch {}
    }
    dismissedKeysRef.current = nextSet;
    setDismissVersion((value) => value + 1);
  }, [storageKey]);

  const rememberDismissedPrompt = useCallback((occurrenceKey) => {
    const normalized = String(occurrenceKey || '').trim();
    if (!normalized) return;
    dismissedKeysRef.current.add(normalized);
    setDismissVersion((value) => value + 1);
    if (typeof window === 'undefined' || !storageKey) return;
    try {
      const values = Array.from(dismissedKeysRef.current).slice(-80);
      window.sessionStorage.setItem(storageKey, JSON.stringify(values));
    } catch {}
  }, [storageKey]);

  const refreshSchedule = useCallback(async () => {
    if (!teacherId) {
      setScheduleEntries([]);
      setScheduleReady(false);
      return;
    }
    try {
      if (calendarSyncConfiguredRef.current === null) {
        const settings = await api.getTeacherCalendarSync(teacherId);
        calendarSyncConfiguredRef.current = Boolean(settings?.configured);
      }
      if (calendarSyncConfiguredRef.current) {
        const result = await api.refreshTeacherCalendarSync(teacherId);
        if (result?.settings) {
          calendarSyncConfiguredRef.current = Boolean(result.settings.configured);
        }
      }
    } catch {
      // The prompt still works with the last imported schedule if Google sync is temporarily unavailable.
    }
    try {
      const data = await api.getTeacherSchedule(teacherId);
      setScheduleEntries(Array.isArray(data) ? data : []);
      setScheduleReady(true);
    } catch {
      setScheduleEntries([]);
      setScheduleReady(false);
    }
  }, [teacherId]);

  useEffect(() => {
    refreshSchedule();
    if (typeof window === 'undefined') return undefined;

    const refreshAndTick = () => {
      setNow(new Date());
      refreshSchedule();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAndTick();
    };

    const timerId = window.setInterval(refreshSchedule, LESSON_PROMPT_SCHEDULE_REFRESH_MS);
    window.addEventListener('focus', refreshAndTick);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timerId);
      window.removeEventListener('focus', refreshAndTick);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshSchedule]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const tick = () => setNow(new Date());
    tick();
    const timerId = window.setInterval(tick, LESSON_PROMPT_TICK_MS);
    return () => window.clearInterval(timerId);
  }, []);

  const studentsById = useMemo(() => {
    const map = new Map();
    (Array.isArray(students) ? students : []).forEach((student) => {
      const id = String(student?.id || '').trim();
      if (!id) return;
      const fallback = String(student?.nickname || student?.name || '').trim();
      const label = typeof getStudentLabel === 'function'
        ? String(getStudentLabel(student) || '').trim()
        : fallback;
      map.set(id, label || fallback || 'Ученик');
    });
    return map;
  }, [getStudentLabel, students]);

  const duePrompt = useMemo(() => {
    if (!scheduleReady) return null;
    return findDueLessonPrompt({
      entries: scheduleEntries,
      now,
      studentsById,
      dismissedKeys: dismissedKeysRef.current,
    });
  }, [dismissVersion, now, scheduleEntries, scheduleReady, studentsById]);

  useEffect(() => {
    if (duePrompt) {
      setActivePrompt((current) => (
        current?.occurrenceKey === duePrompt.occurrenceKey
          ? { ...current, ...duePrompt }
          : duePrompt
      ));
      return;
    }
    setActivePrompt((current) => {
      if (!current) return null;
      const nowMs = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : Date.now();
      return nowMs > Number(current.startMs || 0) + LESSON_PROMPT_AFTER_START_MS ? null : current;
    });
  }, [duePrompt, now]);

  useEffect(() => {
    const studentId = String(activePrompt?.studentId || '').trim();
    if (!studentId) {
      setHomework(null);
      setHomeworkLoading(false);
      setFiles([]);
      setFilesLoading(false);
      setFilesError('');
      return undefined;
    }

    let cancelled = false;
    setHomeworkLoading(true);
    setFilesLoading(true);
    setFilesError('');

    api.getStudentNextLesson(studentId)
      .then((data) => {
        if (cancelled) return;
        const latest = data?.latest && typeof data.latest === 'object'
          ? data.latest
          : (Array.isArray(data?.homeworks) ? data.homeworks[0] : null);
        setHomework(latest || null);
      })
      .catch(() => {
        if (!cancelled) setHomework(null);
      })
      .finally(() => {
        if (!cancelled) setHomeworkLoading(false);
      });

    api.getFiles(studentId)
      .then((data) => {
        if (cancelled) return;
        setFiles(selectRecentLessonNoteFiles(data));
      })
      .catch((err) => {
        if (cancelled) return;
        setFiles([]);
        setFilesError(err?.message || 'Не удалось загрузить последние конспекты.');
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePrompt?.occurrenceKey, activePrompt?.studentId]);

  const closePrompt = useCallback(() => {
    if (activePrompt?.occurrenceKey) rememberDismissedPrompt(activePrompt.occurrenceKey);
    setActivePrompt(null);
  }, [activePrompt, rememberDismissedPrompt]);

  const joinCall = useCallback(() => {
    if (!activePrompt?.studentId) return;
    if (activePrompt?.occurrenceKey) rememberDismissedPrompt(activePrompt.occurrenceKey);
    setActivePrompt(null);
    if (typeof onOpenStudentWorkspace === 'function') {
      onOpenStudentWorkspace('call-connect', activePrompt.studentId);
    }
  }, [activePrompt, onOpenStudentWorkspace, rememberDismissedPrompt]);

  const openNotes = useCallback(() => {
    if (!activePrompt?.studentId) return;
    if (typeof onOpenStudentWorkspace === 'function') {
      onOpenStudentWorkspace('notes', activePrompt.studentId);
    }
  }, [activePrompt, onOpenStudentWorkspace]);

  if (!activePrompt) return null;

  const homeworkText = String(homework?.homeWork || '').trim();
  const goalLabels = getHomeworkGoalLabels(homework);
  const goalCount = Array.isArray(homework?.goals) ? homework.goals.length : 0;
  const subtitle = [activePrompt.dateLabel, activePrompt.timeLabel].filter(Boolean).join(', ');
  const subject = String(activePrompt.subject || '').trim();
  const leadLabel = getPromptLeadLabel(activePrompt);

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <div className="max-h-[92vh] min-h-[52vh] w-[min(760px,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-violet-400/70 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.30),transparent_36%),linear-gradient(145deg,#08111f,#11172d_48%,#090d1a)] text-white shadow-[0_28px_90px_rgba(2,6,23,0.55)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-200">
              Перед уроком
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/12 px-3 py-1 text-xs font-black text-emerald-100">
                {leadLabel}
              </span>
              {subtitle && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Clock3 size={13} />
                  {subtitle}
                </span>
              )}
            </div>
            <h2 className="mt-2 truncate text-2xl font-black text-white">
              {activePrompt.studentName}
            </h2>
            {subject && subject !== activePrompt.studentName && (
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-400">{subject}</div>
            )}
          </div>
          <button
            type="button"
            onClick={closePrompt}
            className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Закрыть напоминание"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-y-auto px-5 py-4">
          <button
            type="button"
            onClick={joinCall}
            disabled={!activePrompt.studentId || typeof onOpenStudentWorkspace !== 'function'}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-cyan-200/50 bg-cyan-200 px-5 py-5 text-lg font-black text-slate-950 shadow-[0_18px_42px_rgba(34,211,238,0.24)] transition hover:-translate-y-0.5 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PhoneCall size={24} />
            Присоединиться к созвону
          </button>

          <div className="mt-4 grid gap-3">
            <section className="rounded-2xl border border-emerald-400/45 bg-emerald-950/18 p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-200">
                <FileText size={15} />
                Домашка
              </div>
              {homeworkLoading ? (
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Loader2 size={15} className="animate-spin" />
                  Загружаем домашку...
                </div>
              ) : homework ? (
                <>
                  <div className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                    {homeworkText || 'Домашка без текста'}
                  </div>
                  {goalCount > 0 && (
                    <div className="mt-3 rounded-xl border border-violet-300/25 bg-violet-400/15 px-3 py-2">
                      <div className="text-[11px] font-black uppercase tracking-wide text-violet-200">
                        Цели
                      </div>
                      {goalLabels.length > 0 ? (
                        <div className="mt-1 space-y-1 text-sm text-slate-100">
                          {goalLabels.map((label, index) => (
                            <div key={`lesson-prompt-goal-${index}`}>{label}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 text-sm text-slate-300">{goalCount} цели</div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-3 text-sm font-semibold text-slate-300">Домашка пока не задана.</div>
              )}
            </section>

            <section className="rounded-2xl border border-sky-400/40 bg-sky-950/18 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-sky-200">
                  <BookOpen size={15} />
                  Последние конспекты
                </div>
                <span className="text-[11px] font-semibold text-slate-400">3 последних</span>
              </div>
              {filesLoading ? (
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Loader2 size={15} className="animate-spin" />
                  Загружаем конспекты...
                </div>
              ) : filesError ? (
                <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-100">
                  {filesError}
                </div>
              ) : files.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {files.map((file, index) => {
                    const href = getLessonInfoFileHref(file);
                    const meta = getLessonInfoFileMeta(file);
                    const content = (
                      <>
                        <div className="truncate text-sm font-black text-white">
                          {file?.name || 'Файл из конспекта'}
                        </div>
                        {meta && <div className="mt-1 truncate text-xs font-semibold text-slate-400">{meta}</div>}
                      </>
                    );
                    return href ? (
                      <a
                        key={`${href}-${index}`}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition hover:border-sky-300/50 hover:bg-sky-300/10"
                      >
                        {content}
                      </a>
                    ) : (
                      <div
                        key={`lesson-prompt-file-${index}`}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 text-sm font-semibold text-slate-300">Конспекты пока не найдены.</div>
              )}
            </section>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={openNotes}
              disabled={!activePrompt.studentId || typeof onOpenStudentWorkspace !== 'function'}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/12 px-4 py-2 text-sm font-black text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <BookOpen size={15} />
              Конспекты
            </button>
            <button
              type="button"
              onClick={closePrompt}
              className="rounded-full border border-violet-300/45 bg-violet-300/12 px-4 py-2 text-sm font-black text-violet-100 transition hover:bg-violet-300/20"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherLessonStartPrompt;
