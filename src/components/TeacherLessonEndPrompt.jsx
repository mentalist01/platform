import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  Save,
  Sparkles,
  X,
} from 'lucide-react';

import { api } from '../services/api';

const END_PROMPT_TICK_MS = 15 * 1000;
const END_PROMPT_SCHEDULE_REFRESH_MS = 60 * 1000;
const END_PROMPT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const END_PROMPT_LOOKAHEAD_DAYS = 35;
const END_PROMPT_STORAGE_PREFIX = 'teacher_lesson_end_prompt_dismissed_v1';
const LESSON_TOPIC_MAX_LENGTH = 320;

const WEEKDAY_BY_KEY = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const WEEKDAY_BY_LABEL = {
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

const padTimePart = (value) => String(value).padStart(2, '0');

const formatDayKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}`;
};

const parseDayKey = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1])
    || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3])
  ) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const normalizeTime = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${padTimePart(hours)}:${padTimePart(minutes)}`;
};

const normalizeDuration = (value) => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 15
    ? Math.min(360, Math.round(duration))
    : 60;
};

const getWeekdayOrder = (entry) => {
  const explicit = Number(entry?.weekdayOrder);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 7) return Math.round(explicit);
  const key = String(entry?.weekdayKey || '').trim().toLowerCase();
  if (WEEKDAY_BY_KEY[key]) return WEEKDAY_BY_KEY[key];
  const label = String(entry?.day || '').trim().toLowerCase();
  if (WEEKDAY_BY_LABEL[label]) return WEEKDAY_BY_LABEL[label];
  const explicitDate = parseDayKey(entry?.date || entry?.dayKey);
  if (!explicitDate) return 0;
  return explicitDate.getDay() === 0 ? 7 : explicitDate.getDay();
};

const getTopicOccurrenceKey = ({ studentId, dayKey, time, durationMinutes }) => (
  [String(studentId || '').trim(), dayKey, normalizeTime(time), normalizeDuration(durationMinutes)].join('|')
);

const getDismissOccurrenceKey = (occurrence) => [
  String(occurrence?.sourceEntryId || '').trim(),
  String(occurrence?.studentId || '').trim(),
  String(occurrence?.dayKey || '').trim(),
  String(occurrence?.time || '').trim(),
].join('|');

const expandTeacherScheduleOccurrences = (entries, now) => {
  const safeNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const rangeStart = addDays(new Date(safeNow.getFullYear(), safeNow.getMonth(), safeNow.getDate()), -1);
  const rangeEnd = addDays(rangeStart, END_PROMPT_LOOKAHEAD_DAYS + 1);
  const occurrences = [];
  const seen = new Set();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const studentId = String(entry?.studentId || '').trim();
    const time = normalizeTime(entry?.time);
    if (!studentId || !time) return;
    const durationMinutes = normalizeDuration(entry?.durationMinutes);
    const explicitDate = parseDayKey(entry?.date || entry?.dayKey);
    const weekdayOrder = getWeekdayOrder(entry);
    if (!explicitDate && !weekdayOrder) return;
    const excludedDates = new Set(
      (Array.isArray(entry?.excludedDates) ? entry.excludedDates : [])
        .map((value) => formatDayKey(parseDayKey(value)))
        .filter(Boolean)
    );

    for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor = addDays(cursor, 1)) {
      const dayKey = formatDayKey(cursor);
      if (explicitDate) {
        if (dayKey !== formatDayKey(explicitDate)) continue;
      } else {
        const cursorWeekday = cursor.getDay() === 0 ? 7 : cursor.getDay();
        if (cursorWeekday !== weekdayOrder) continue;
      }
      if (excludedDates.has(dayKey)) continue;
      const [hours, minutes] = time.split(':').map(Number);
      const start = new Date(cursor);
      start.setHours(hours, minutes, 0, 0);
      const startMs = start.getTime();
      const endMs = startMs + (durationMinutes * 60 * 1000);
      const topicKey = getTopicOccurrenceKey({ studentId, dayKey, time, durationMinutes });
      if (!topicKey || seen.has(topicKey)) continue;
      seen.add(topicKey);
      occurrences.push({
        topicKey,
        promptKey: '',
        sourceEntryId: String(entry?.id || entry?.externalEventId || '').trim(),
        studentId,
        studentName: String(entry?.studentName || entry?.subject || '').trim(),
        dayKey,
        time,
        durationMinutes,
        startMs,
        endMs,
      });
    }
  });

  return occurrences
    .map((entry) => ({ ...entry, promptKey: getDismissOccurrenceKey(entry) }))
    .sort((left, right) => left.startMs - right.startMs);
};

const findDueEndPrompt = ({ entries, now, dismissedKeys, studentsById }) => {
  const safeNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const nowMs = safeNow.getTime();
  const occurrences = expandTeacherScheduleOccurrences(entries, safeNow);
  const finished = occurrences
    .filter((entry) => (
      entry.endMs <= nowMs
      && nowMs - entry.endMs <= END_PROMPT_LOOKBACK_MS
      && !dismissedKeys?.has(entry.promptKey)
    ))
    .sort((left, right) => right.endMs - left.endMs);

  for (const lesson of finished) {
    const nextLesson = occurrences.find((entry) => (
      entry.studentId === lesson.studentId
      && entry.startMs >= lesson.endMs
      && entry.topicKey !== lesson.topicKey
    ));
    if (!nextLesson) continue;
    const studentName = String(
      studentsById.get(lesson.studentId)
      || lesson.studentName
      || nextLesson.studentName
      || 'Ученик'
    ).trim();
    return {
      ...lesson,
      studentName,
      nextLesson: { ...nextLesson, studentName },
    };
  }
  return null;
};

const formatDateLabel = (dayKey, options = {}) => {
  const date = parseDayKey(dayKey);
  if (!date) return dayKey;
  const label = date.toLocaleDateString('ru-RU', {
    weekday: options.withWeekday ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
  }).replace(' г.', '');
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : dayKey;
};

const formatTimeRange = (occurrence) => {
  const start = new Date(Number(occurrence?.startMs));
  const end = new Date(Number(occurrence?.endMs));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return occurrence?.time || '';
  const format = (date) => date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${format(start)}–${format(end)}`;
};

const TeacherLessonEndPrompt = ({ teacherId, students = [], getStudentLabel = null }) => {
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [scheduleReady, setScheduleReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [activePrompt, setActivePrompt] = useState(null);
  const [dismissVersion, setDismissVersion] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [currentTopic, setCurrentTopic] = useState(null);
  const [topicDraft, setTopicDraft] = useState('');
  const [topicLoading, setTopicLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dismissedKeysRef = useRef(new Set());
  const closeAfterSaveTimerRef = useRef(null);

  const storageKey = useMemo(
    () => `${END_PROMPT_STORAGE_PREFIX}:${String(teacherId || '').trim()}`,
    [teacherId]
  );

  useEffect(() => {
    const next = new Set();
    if (typeof window !== 'undefined' && storageKey) {
      try {
        const stored = JSON.parse(window.sessionStorage.getItem(storageKey) || '[]');
        if (Array.isArray(stored)) {
          stored.forEach((value) => {
            const key = String(value || '').trim();
            if (key) next.add(key);
          });
        }
      } catch {}
    }
    dismissedKeysRef.current = next;
    setDismissVersion((value) => value + 1);
  }, [storageKey]);

  useEffect(() => () => {
    if (closeAfterSaveTimerRef.current) window.clearTimeout(closeAfterSaveTimerRef.current);
  }, []);

  const rememberDismissed = useCallback((key) => {
    const normalized = String(key || '').trim();
    if (!normalized) return;
    dismissedKeysRef.current.add(normalized);
    setDismissVersion((value) => value + 1);
    if (typeof window === 'undefined' || !storageKey) return;
    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(dismissedKeysRef.current).slice(-120))
      );
    } catch {}
  }, [storageKey]);

  const refreshSchedule = useCallback(async () => {
    if (!teacherId) {
      setScheduleEntries([]);
      setScheduleReady(false);
      return;
    }
    try {
      const data = await api.getTeacherSchedule(teacherId);
      setScheduleEntries(Array.isArray(data) ? data : []);
      setScheduleReady(true);
    } catch {
      setScheduleReady(false);
    }
  }, [teacherId]);

  useEffect(() => {
    refreshSchedule();
    if (typeof window === 'undefined') return undefined;
    const handleForeground = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setNow(new Date());
        refreshSchedule();
      }
    };
    const scheduleTimer = window.setInterval(refreshSchedule, END_PROMPT_SCHEDULE_REFRESH_MS);
    window.addEventListener('focus', handleForeground);
    document.addEventListener('visibilitychange', handleForeground);
    return () => {
      window.clearInterval(scheduleTimer);
      window.removeEventListener('focus', handleForeground);
      document.removeEventListener('visibilitychange', handleForeground);
    };
  }, [refreshSchedule]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const timer = window.setInterval(() => setNow(new Date()), END_PROMPT_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const studentsById = useMemo(() => {
    const result = new Map();
    (Array.isArray(students) ? students : []).forEach((student) => {
      const id = String(student?.id || '').trim();
      if (!id) return;
      const fallback = String(student?.nickname || student?.name || '').trim();
      const label = typeof getStudentLabel === 'function'
        ? String(getStudentLabel(student) || '').trim()
        : fallback;
      result.set(id, label || fallback || 'Ученик');
    });
    return result;
  }, [getStudentLabel, students]);

  const duePrompt = useMemo(() => {
    if (!scheduleReady) return null;
    return findDueEndPrompt({
      entries: scheduleEntries,
      now,
      dismissedKeys: dismissedKeysRef.current,
      studentsById,
    });
  }, [dismissVersion, now, scheduleEntries, scheduleReady, studentsById]);

  useEffect(() => {
    if (!duePrompt) return;
    setActivePrompt((current) => (
      current?.promptKey === duePrompt.promptKey ? { ...current, ...duePrompt } : duePrompt
    ));
  }, [duePrompt]);

  useEffect(() => {
    if (!activePrompt?.studentId || !activePrompt?.nextLesson) return undefined;
    let cancelled = false;
    setTopicLoading(true);
    setError('');
    setSaved(false);
    const from = activePrompt.dayKey < activePrompt.nextLesson.dayKey
      ? activePrompt.dayKey
      : activePrompt.nextLesson.dayKey;
    const to = activePrompt.dayKey > activePrompt.nextLesson.dayKey
      ? activePrompt.dayKey
      : activePrompt.nextLesson.dayKey;
    api.getLessonTopics(activePrompt.studentId, { from, to })
      .then((data) => {
        if (cancelled) return;
        const topics = data?.topics && typeof data.topics === 'object' ? data.topics : {};
        const resolvedCurrentTopic = topics[activePrompt.topicKey] || null;
        const resolvedNextTopic = topics[activePrompt.nextLesson.topicKey] || null;
        setCurrentTopic(resolvedCurrentTopic);
        setTopicDraft(resolvedNextTopic?.source === 'teacher' ? String(resolvedNextTopic.text || '') : '');
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentTopic(null);
        setTopicDraft('');
      })
      .finally(() => {
        if (!cancelled) setTopicLoading(false);
      });
    return () => { cancelled = true; };
  }, [activePrompt?.nextLesson?.topicKey, activePrompt?.promptKey, activePrompt?.studentId, activePrompt?.topicKey]);

  const closePrompt = useCallback(() => {
    if (activePrompt?.promptKey) rememberDismissed(activePrompt.promptKey);
    setActivePrompt(null);
    setCollapsed(false);
    setError('');
    setSaved(false);
  }, [activePrompt?.promptKey, rememberDismissed]);

  const saveTopic = useCallback(async () => {
    const text = String(topicDraft || '').trim();
    if (!text) {
      setError('Напишите тему следующего занятия.');
      return;
    }
    if (!activePrompt?.studentId || !activePrompt?.nextLesson || saving) return;
    setSaving(true);
    setError('');
    try {
      await api.updateLessonTopic(activePrompt.studentId, activePrompt.nextLesson, text);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('student-lesson-topic-updated', {
          detail: {
            studentId: activePrompt.studentId,
            occurrenceKey: activePrompt.nextLesson.topicKey,
          },
        }));
      }
      rememberDismissed(activePrompt.promptKey);
      setSaved(true);
      if (typeof window !== 'undefined') {
        closeAfterSaveTimerRef.current = window.setTimeout(() => {
          setActivePrompt(null);
          setCollapsed(false);
          setSaved(false);
        }, 900);
      }
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить тему. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }, [activePrompt, rememberDismissed, saving, topicDraft]);

  if (!activePrompt) return null;

  const currentTopicText = String(currentTopic?.text || '').trim();
  const currentTopicLabel = currentTopic?.source === 'teacher' ? 'Тема учителя' : 'По конспектам';
  const nextDateLabel = formatDateLabel(activePrompt.nextLesson.dayKey, { withWeekday: true });
  const currentDateLabel = formatDateLabel(activePrompt.dayKey);

  const content = collapsed ? (
    <aside className="teacher-lesson-end-prompt teacher-lesson-end-prompt--collapsed" aria-label="Тема следующего занятия">
      <button
        type="button"
        className="teacher-lesson-end-prompt__collapsed-main"
        onClick={() => setCollapsed(false)}
      >
        <span className="teacher-lesson-end-prompt__collapsed-icon"><Sparkles size={17} /></span>
        <span>
          <small>Занятие завершено</small>
          <strong>Задать следующую тему</strong>
        </span>
        <ChevronUp size={17} />
      </button>
      <button
        type="button"
        className="teacher-lesson-end-prompt__icon-button"
        onClick={closePrompt}
        aria-label="Закрыть подсказку"
      >
        <X size={15} />
      </button>
    </aside>
  ) : (
    <aside className="teacher-lesson-end-prompt" aria-label="Планирование следующего занятия">
      <div className="teacher-lesson-end-prompt__glow" aria-hidden="true" />
      <header className="teacher-lesson-end-prompt__header">
        <div className="teacher-lesson-end-prompt__header-icon"><CheckCircle2 size={20} /></div>
        <div className="teacher-lesson-end-prompt__heading">
          <span>Занятие завершено</span>
          <strong>{activePrompt.studentName}</strong>
          <small><Clock3 size={12} /> {currentDateLabel}, {formatTimeRange(activePrompt)}</small>
        </div>
        <div className="teacher-lesson-end-prompt__header-actions">
          <button
            type="button"
            className="teacher-lesson-end-prompt__icon-button"
            onClick={() => setCollapsed(true)}
            aria-label="Свернуть"
          >
            <ChevronDown size={16} />
          </button>
          <button
            type="button"
            className="teacher-lesson-end-prompt__icon-button"
            onClick={closePrompt}
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="teacher-lesson-end-prompt__body">
        <section className={`teacher-lesson-end-prompt__current-topic${currentTopic ? '' : ' is-empty'}`}>
          <BookOpen size={15} />
          <div>
            <span>{topicLoading ? 'Смотрим конспекты…' : (currentTopic ? currentTopicLabel : 'Итог прошедшего занятия')}</span>
            <strong>{topicLoading ? 'Определяем задание' : (currentTopicText || 'Сохранённых конспектов во время занятия не найдено')}</strong>
          </div>
        </section>

        <div className="teacher-lesson-end-prompt__next-meta">
          <span><CalendarDays size={14} /> Следующее занятие</span>
          <strong>{nextDateLabel}, {formatTimeRange(activePrompt.nextLesson)}</strong>
        </div>

        <label className="teacher-lesson-end-prompt__field">
          <span>Тема следующего занятия</span>
          <textarea
            value={topicDraft}
            onChange={(event) => {
              setTopicDraft(event.target.value.slice(0, LESSON_TOPIC_MAX_LENGTH));
              if (error) setError('');
            }}
            placeholder="Например: Разбор задания 13 — IP-адреса и маски"
            maxLength={LESSON_TOPIC_MAX_LENGTH}
            rows={3}
            disabled={saving || saved}
            autoFocus
          />
          <small>{topicDraft.length}/{LESSON_TOPIC_MAX_LENGTH}</small>
        </label>

        {error && <div className="teacher-lesson-end-prompt__error" role="alert">{error}</div>}
        {saved && (
          <div className="teacher-lesson-end-prompt__saved" role="status">
            <CheckCircle2 size={15} /> Тема сохранена и уже видна в расписании
          </div>
        )}

        <button
          type="button"
          className="teacher-lesson-end-prompt__save"
          onClick={saveTopic}
          disabled={saving || saved || topicLoading || !topicDraft.trim()}
        >
          {saving ? <Loader2 size={17} className="animate-spin" /> : (saved ? <CheckCircle2 size={17} /> : <Save size={17} />)}
          {saving ? 'Сохраняем…' : (saved ? 'Сохранено' : 'Сохранить тему')}
        </button>
      </div>
    </aside>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
};

export default TeacherLessonEndPrompt;
