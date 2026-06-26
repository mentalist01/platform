import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, CalendarDays, Clock3, ExternalLink, PhoneCall, Video, X } from 'lucide-react';

import { api } from '../services/api';
import { normalizeHttpUrl } from '../utils/linkifyText';

const LESSON_JOIN_PROMPT_LEAD_MS = 3 * 60 * 1000;
const LESSON_JOIN_PROMPT_AFTER_START_MS = 12 * 60 * 1000;
const LESSON_JOIN_PROMPT_TICK_MS = 1000;
const LESSON_JOIN_PROMPT_REFRESH_MS = 60 * 1000;
const LESSON_JOIN_PROMPT_DISMISSED_STORAGE_PREFIX = 'student_lesson_join_prompt_dismissed_v1';
const DEFAULT_LESSON_DURATION_MINUTES = 60;

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

const toDayKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDayKey = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
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

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const parseScheduleTimeToMinutes = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
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

const formatMinutesAsTime = (value) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return '00:00';
  const total = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const normalizeDayKey = (value) => {
  const date = parseDayKey(value);
  return date ? toDayKey(date) : '';
};

const normalizeExcludedDayKeys = (value) => (
  new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => normalizeDayKey(item))
      .filter(Boolean)
  )
);

const resolveEntryWeekdayOrder = (entry) => {
  const explicit = Number(entry?.weekdayOrder);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 7) return Math.trunc(explicit);
  const key = String(entry?.weekdayKey || '').trim().toLowerCase();
  if (key && WEEKDAY_ORDER_BY_KEY[key]) return WEEKDAY_ORDER_BY_KEY[key];
  const label = String(entry?.day || '').trim().toLowerCase();
  if (label && WEEKDAY_ORDER_BY_LABEL[label]) return WEEKDAY_ORDER_BY_LABEL[label];
  const dateKey = normalizeDayKey(entry?.date || entry?.dayKey);
  const date = parseDayKey(dateKey);
  if (!date) return 0;
  const weekday = date.getDay();
  return weekday === 0 ? 7 : weekday;
};

const getEntryCandidateDayKeys = (entry, now) => {
  const explicitDate = normalizeDayKey(entry?.date || entry?.dayKey || entry?.currentWeekDate);
  if (explicitDate) return [explicitDate];

  const weekdayOrder = resolveEntryWeekdayOrder(entry);
  if (!weekdayOrder) return [];

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = [];
  for (let offset = -1; offset <= 1; offset += 1) {
    const date = addDays(today, offset);
    const dayOrder = date.getDay() === 0 ? 7 : date.getDay();
    if (dayOrder === weekdayOrder) result.push(toDayKey(date));
  }
  return result;
};

const buildLessonDate = (dayKey, startMinutes) => {
  const day = parseDayKey(dayKey);
  if (!day || !Number.isFinite(startMinutes)) return null;
  const hours = Math.floor(startMinutes / 60);
  const minutes = startMinutes % 60;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
};

const getLessonDurationMinutes = (entry) => {
  const value = Number(entry?.durationMinutes);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LESSON_DURATION_MINUTES;
  return Math.max(15, Math.round(value));
};

const formatDateLabel = (dayKey, now = new Date()) => {
  const date = parseDayKey(dayKey);
  if (!date) return dayKey || '';
  const todayKey = toDayKey(now);
  const tomorrowKey = toDayKey(addDays(now, 1));
  const dateKey = toDayKey(date);
  const relative = dateKey === todayKey ? 'Сегодня' : (dateKey === tomorrowKey ? 'Завтра' : '');
  const calendar = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(' г.', '');
  return [relative, calendar].filter(Boolean).join(', ');
};

const formatCountdown = (msUntilStart) => {
  const ms = Number(msUntilStart);
  if (!Number.isFinite(ms)) return '--:--';
  if (ms <= 0) return 'Сейчас';
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatLeadLabel = (msUntilStart) => {
  const ms = Number(msUntilStart);
  if (!Number.isFinite(ms)) return 'Занятие скоро начнётся';
  if (ms <= 0) return 'Занятие уже начинается';
  return 'До начала занятия';
};

const getLessonOccurrenceKey = (entry, dayKey, startMinutes) => ([
  String(entry?.id || entry?.externalEventId || entry?.createdAt || 'lesson').trim(),
  String(dayKey || '').trim(),
  formatMinutesAsTime(startMinutes),
].join(':'));

const getPromptStorageKey = (studentId) => (
  `${LESSON_JOIN_PROMPT_DISMISSED_STORAGE_PREFIX}:${String(studentId || 'student').trim()}`
);

const loadDismissedKeys = (storageKey) => {
  const result = new Set();
  if (typeof window === 'undefined' || !storageKey) return result;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || '[]');
    if (Array.isArray(parsed)) {
      parsed.forEach((value) => {
        const normalized = String(value || '').trim();
        if (normalized) result.add(normalized);
      });
    }
  } catch {
    // Session storage can be unavailable in strict privacy modes.
  }
  return result;
};

const getLatestLessonFromPayload = (data) => {
  if (data?.latest && typeof data.latest === 'object') return data.latest;
  if (Array.isArray(data?.homeworks) && data.homeworks[0] && typeof data.homeworks[0] === 'object') {
    return data.homeworks[0];
  }
  return {};
};

const findDueLessonPrompt = ({ entries, nextLesson, now, dismissedKeys }) => {
  const nowMs = now.getTime();
  const fallbackLessonUrl = normalizeHttpUrl(nextLesson?.lessonLink);
  const fallbackBoardUrl = normalizeHttpUrl(nextLesson?.boardLink);
  const candidates = [];

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const startMinutes = getEntryStartMinutes(entry);
    if (!Number.isFinite(startMinutes)) return;

    const durationMinutes = getLessonDurationMinutes(entry);
    const excludedDayKeys = normalizeExcludedDayKeys(entry?.excludedDates);
    const lessonUrl = normalizeHttpUrl(entry?.lessonLink) || fallbackLessonUrl;
    const boardUrl = normalizeHttpUrl(entry?.boardLink) || fallbackBoardUrl;

    getEntryCandidateDayKeys(entry, now).forEach((dayKey) => {
      if (!dayKey || excludedDayKeys.has(dayKey)) return;
      const startDate = buildLessonDate(dayKey, startMinutes);
      if (!startDate) return;
      const startMs = startDate.getTime();
      const msUntilStart = startMs - nowMs;
      const msAfterStart = nowMs - startMs;
      if (msUntilStart > LESSON_JOIN_PROMPT_LEAD_MS || msAfterStart > LESSON_JOIN_PROMPT_AFTER_START_MS) return;

      const occurrenceKey = getLessonOccurrenceKey(entry, dayKey, startMinutes);
      if (dismissedKeys?.has(occurrenceKey)) return;

      const subject = String(entry?.subject || '').trim();
      candidates.push({
        occurrenceKey,
        subject: subject || 'Занятие',
        dateLabel: formatDateLabel(dayKey, now),
        timeLabel: `${formatMinutesAsTime(startMinutes)}-${formatMinutesAsTime(startMinutes + durationMinutes)}`,
        startMs,
        msUntilStart,
        lessonUrl,
        boardUrl,
      });
    });
  });

  candidates.sort((left, right) => left.startMs - right.startMs);
  return candidates[0] || null;
};

const StudentLessonJoinPrompt = ({ studentId, onOpenPlatformLesson }) => {
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [nextLesson, setNextLesson] = useState({});
  const [now, setNow] = useState(() => new Date());
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set());

  const storageKey = useMemo(() => getPromptStorageKey(studentId), [studentId]);

  useEffect(() => {
    setDismissedKeys(loadDismissedKeys(storageKey));
  }, [storageKey]);

  const rememberDismissedPrompt = useCallback((occurrenceKey) => {
    const normalized = String(occurrenceKey || '').trim();
    if (!normalized) return;
    setDismissedKeys((current) => {
      if (current.has(normalized)) return current;
      const next = new Set(current);
      next.add(normalized);
      if (typeof window !== 'undefined' && storageKey) {
        try {
          const values = Array.from(next).slice(-80);
          window.sessionStorage.setItem(storageKey, JSON.stringify(values));
        } catch {
          // The in-page prompt still works even if storage is blocked.
        }
      }
      return next;
    });
  }, [storageKey]);

  const refreshPromptData = useCallback(async () => {
    if (!studentId) {
      setScheduleEntries([]);
      setNextLesson({});
      return;
    }

    const [scheduleResult, nextLessonResult] = await Promise.allSettled([
      api.getStudentSchedule(studentId),
      api.getStudentNextLesson(studentId),
    ]);

    if (scheduleResult.status === 'fulfilled') {
      setScheduleEntries(Array.isArray(scheduleResult.value) ? scheduleResult.value : []);
    }
    if (nextLessonResult.status === 'fulfilled') {
      setNextLesson(getLatestLessonFromPayload(nextLessonResult.value));
    }
  }, [studentId]);

  useEffect(() => {
    refreshPromptData();
    if (typeof window === 'undefined') return undefined;

    const refreshAndTick = () => {
      setNow(new Date());
      refreshPromptData();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAndTick();
    };

    const timerId = window.setInterval(refreshPromptData, LESSON_JOIN_PROMPT_REFRESH_MS);
    window.addEventListener('focus', refreshAndTick);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timerId);
      window.removeEventListener('focus', refreshAndTick);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshPromptData]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const timerId = window.setInterval(() => setNow(new Date()), LESSON_JOIN_PROMPT_TICK_MS);
    return () => window.clearInterval(timerId);
  }, []);

  const activePrompt = useMemo(() => (
    findDueLessonPrompt({
      entries: scheduleEntries,
      nextLesson,
      now,
      dismissedKeys,
    })
  ), [dismissedKeys, nextLesson, now, scheduleEntries]);

  const closePrompt = useCallback(() => {
    if (activePrompt?.occurrenceKey) rememberDismissedPrompt(activePrompt.occurrenceKey);
  }, [activePrompt, rememberDismissedPrompt]);

  const markPromptOpened = useCallback(() => {
    if (activePrompt?.occurrenceKey) rememberDismissedPrompt(activePrompt.occurrenceKey);
  }, [activePrompt, rememberDismissedPrompt]);

  const openPlatformLesson = useCallback(() => {
    if (!activePrompt) return;
    markPromptOpened();
    if (typeof onOpenPlatformLesson === 'function') {
      onOpenPlatformLesson(activePrompt);
      return;
    }
    if (activePrompt.boardUrl && typeof window !== 'undefined') {
      window.open(activePrompt.boardUrl, '_blank', 'noopener,noreferrer');
    }
  }, [activePrompt, markPromptOpened, onOpenPlatformLesson]);

  if (!activePrompt) return null;

  const countdownLabel = formatCountdown(activePrompt.msUntilStart);
  const leadLabel = formatLeadLabel(activePrompt.msUntilStart);

  const promptNode = (
    <div className="student-lesson-join-prompt" role="dialog" aria-modal="true" aria-labelledby="student-lesson-join-title">
      <div className="student-lesson-join-prompt__card">
        <button
          type="button"
          onClick={closePrompt}
          className="student-lesson-join-prompt__close"
          aria-label="Закрыть напоминание"
          title="Закрыть"
        >
          <X size={18} />
        </button>

        <div className="student-lesson-join-prompt__top">
          <div className="student-lesson-join-prompt__badge">
            <BellRing size={16} />
            Скоро занятие
          </div>
          <div className="student-lesson-join-prompt__countdown" aria-label={`${leadLabel}: ${countdownLabel}`}>
            <Clock3 size={18} />
            <strong>{countdownLabel}</strong>
            <span>{leadLabel}</span>
          </div>
        </div>

        <div className="student-lesson-join-prompt__body">
          <div className="student-lesson-join-prompt__icon" aria-hidden="true">
            <PhoneCall size={30} />
          </div>
          <div className="student-lesson-join-prompt__copy">
            <h2 id="student-lesson-join-title">Пора подключаться</h2>
            <p>
              {activePrompt.subject}
              {' · '}
              {activePrompt.dateLabel}
              {' · '}
              {activePrompt.timeLabel}
            </p>
          </div>
        </div>

        <div className="student-lesson-join-prompt__actions">
          <button
            type="button"
            onClick={openPlatformLesson}
            className="student-lesson-join-prompt__primary"
          >
            <PhoneCall size={20} />
            Подключиться по платформе
          </button>

          {activePrompt.lessonUrl && (
            <a
              href={activePrompt.lessonUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={markPromptOpened}
              className="student-lesson-join-prompt__secondary student-lesson-join-prompt__secondary--telemost"
            >
              <Video size={17} />
              Подключиться через Телемост
              <ExternalLink size={15} />
            </a>
          )}
        </div>

        <div className="student-lesson-join-prompt__meta">
          <span>
            <CalendarDays size={15} />
            {activePrompt.dateLabel}
          </span>
          <span>
            <Clock3 size={15} />
            {activePrompt.timeLabel}
          </span>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return promptNode;
  return createPortal(promptNode, document.body);
};

export default StudentLessonJoinPrompt;
