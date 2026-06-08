import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  ListChecks,
  PlayCircle,
  Search,
  Target,
  Video,
  X,
} from 'lucide-react';
import { api } from '../services/api';

const COURSE_YEAR = 2026;
const EGE_DATE = `${COURSE_YEAR}-06-18`;
const SESSION_DURATION_MINUTES = 95;
const STORAGE_PREFIX = 'final-review-v1';

const FINAL_REVIEW_DAYS = [
  {
    dateKey: `${COURSE_YEAR}-06-11`,
    label: '11.06',
    weekday: 'чт',
    headline: 'Старт повторения',
    sessions: [
      { id: '2026-06-11-1400', time: '14:00', title: 'Задания №4, 7, 11', tasks: [4, 7, 11] },
      { id: '2026-06-11-1600', time: '16:00', title: 'Задания №16, 6', tasks: [16, 6] },
      { id: '2026-06-11-1800', time: '18:00', title: 'Задание №25', tasks: [25] },
    ],
  },
  {
    dateKey: `${COURSE_YEAR}-06-12`,
    label: '12.06',
    weekday: 'пт',
    headline: 'Кодирование и таблицы',
    sessions: [
      { id: '2026-06-12-1400', time: '14:00', title: 'Задания №3, №5', tasks: [3, 5] },
      { id: '2026-06-12-1600', time: '16:00', title: 'Задание №8', tasks: [8] },
      { id: '2026-06-12-1800', time: '18:00', title: 'Задание №24', tasks: [24] },
    ],
  },
  {
    dateKey: `${COURSE_YEAR}-06-13`,
    label: '13.06',
    weekday: 'сб',
    headline: 'Комбинаторика и файлы',
    sessions: [
      { id: '2026-06-13-1400', time: '14:00', title: 'Задания №9, 18', tasks: [9, 18] },
      { id: '2026-06-13-1600', time: '16:00', title: 'Задания №10, №14', tasks: [10, 14] },
      { id: '2026-06-13-1800', time: '18:00', title: 'Задание №26', tasks: [26] },
    ],
  },
  {
    dateKey: `${COURSE_YEAR}-06-14`,
    label: '14.06',
    weekday: 'вс',
    headline: 'Логика и системы',
    sessions: [
      { id: '2026-06-14-1400', time: '14:00', title: 'Задания №2, 15', tasks: [2, 15] },
      { id: '2026-06-14-1600', time: '16:00', title: 'Задания №13, №1', tasks: [13, 1] },
      { id: '2026-06-14-1800', time: '18:00', title: 'Задание №26', tasks: [26] },
    ],
  },
  {
    dateKey: `${COURSE_YEAR}-06-15`,
    label: '15.06',
    weekday: 'пн',
    headline: 'Перед финальным рывком',
    sessions: [
      { id: '2026-06-15-1400', time: '14:00', title: 'Задание №17', tasks: [17] },
      { id: '2026-06-15-1600', time: '16:00', title: 'Задания №12, 23', tasks: [12, 23] },
      { id: '2026-06-15-1800', time: '18:00', title: 'Задание №27', tasks: [27] },
    ],
  },
  {
    dateKey: `${COURSE_YEAR}-06-16`,
    label: '16.06',
    weekday: 'вт',
    headline: 'Самые тяжелые места',
    sessions: [
      { id: '2026-06-16-1400', time: '14:00', title: 'Задания №22, №19-21', tasks: [22, 19, 20, 21] },
      { id: '2026-06-16-1600', time: '16:00', title: 'Задания №19-21', tasks: [19, 20, 21] },
      { id: '2026-06-16-1800', time: '18:00', title: 'Сложные №24 и №27', tasks: [24, 27] },
    ],
  },
  {
    dateKey: `${COURSE_YEAR}-06-18`,
    label: '18.06',
    weekday: 'чт',
    headline: 'День ЕГЭ',
    sessions: [
      { id: '2026-06-18-0700', time: '07:00', title: 'Разбор Дальнего Востока письменно', tasks: [] },
      { id: '2026-06-18-1700', time: '17:00', title: 'Разбор всех реальных заданий 1 дня', tasks: [] },
    ],
  },
  {
    dateKey: `${COURSE_YEAR}-06-19`,
    label: '19.06',
    weekday: 'пт',
    headline: 'Второй день',
    sessions: [
      { id: '2026-06-19-0700', time: '07:00', title: 'Разбор Дальнего Востока письменно', tasks: [] },
    ],
  },
];

const ALL_TASKS = Array.from({ length: 27 }, (_, index) => index + 1);

const readStoredJson = (key, fallback) => {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const writeStoredJson = (key, value) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value || {}));
  } catch {
    // Local progress is a comfort feature; losing it should not break the course page.
  }
};

const getStorageKey = (userId, scope) => (
  `${STORAGE_PREFIX}:${scope}:${String(userId || 'guest').trim() || 'guest'}`
);

const getSessionDate = (session) => new Date(`${session.dateKey}T${session.time}:00`);

const getSessionEndDate = (session) => {
  const date = getSessionDate(session);
  date.setMinutes(date.getMinutes() + SESSION_DURATION_MINUTES);
  return date;
};

const formatDayMonth = (date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

const formatSessionDate = (session) => {
  const date = getSessionDate(session);
  return `${formatDayMonth(date)}, ${session.weekday}`;
};

const getDaysUntilExam = (nowMs) => {
  const now = new Date(nowMs);
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const exam = new Date(`${EGE_DATE}T12:00:00`);
  return Math.max(0, Math.ceil((exam.getTime() - todayNoon.getTime()) / (24 * 60 * 60 * 1000)));
};

const getTimeStatus = (session, nowMs) => {
  const startMs = getSessionDate(session).getTime();
  const endMs = getSessionEndDate(session).getTime();
  if (nowMs >= startMs && nowMs <= endMs) return 'live';
  if (nowMs > endMs) return 'past';
  return 'upcoming';
};

const getDayTimeStatus = (day, nowMs) => {
  const first = day.sessions[0];
  const last = day.sessions[day.sessions.length - 1];
  if (!first || !last) return 'upcoming';
  const firstMs = getSessionDate({ ...first, dateKey: day.dateKey }).getTime();
  const lastMs = getSessionEndDate({ ...last, dateKey: day.dateKey }).getTime();
  if (nowMs >= firstMs && nowMs <= lastMs) return 'live';
  if (nowMs > lastMs) return 'past';
  return 'upcoming';
};

const extractYoutubeId = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
};

const getYoutubeWatchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

const getYoutubeSearchUrl = (session) => {
  const query = `Иван на сотку ЕГЭ информатика повторение ${session.title} ${session.dateLabel}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
};

const getSessionSearchText = (session) => (
  `${session.dateLabel} ${session.weekday} ${session.time} ${session.title} ${session.tasks.map((task) => `№${task}`).join(' ')}`
    .toLowerCase()
);

const buildFlatSessions = () => FINAL_REVIEW_DAYS.flatMap((day) => (
  day.sessions.map((session, index) => ({
    ...session,
    dateKey: day.dateKey,
    dateLabel: day.label,
    weekday: day.weekday,
    dayHeadline: day.headline,
    dayIndex: FINAL_REVIEW_DAYS.indexOf(day),
    sessionIndex: index,
  }))
));

const FLAT_REVIEW_SESSIONS = buildFlatSessions();

const pickDefaultSessionId = (sessions, completedMap, nowMs) => {
  const live = sessions.find((session) => getTimeStatus(session, nowMs) === 'live');
  if (live) return live.id;
  const nextUpcoming = sessions.find((session) => getSessionDate(session).getTime() >= nowMs);
  if (nextUpcoming) return nextUpcoming.id;
  const firstUnfinished = sessions.find((session) => !completedMap[session.id]);
  return firstUnfinished?.id || sessions[sessions.length - 1]?.id || '';
};

const normalizeNotesValue = (value) => String(value || '').slice(0, 4000);

const normalizeVideoMap = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.entries(source).reduce((acc, [sessionId, entry]) => {
    const id = String(sessionId || '').trim();
    const youtubeUrl = String(
      typeof entry === 'string' ? entry : (entry?.youtubeUrl || entry?.videoUrl || entry?.url || '')
    ).trim();
    if (!id || !youtubeUrl) return acc;
    acc[id] = {
      ...(entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}),
      youtubeUrl,
    };
    return acc;
  }, {});
};

const FinalReviewSection = ({ userId, role, onOpenTask }) => {
  const progressStorageKey = getStorageKey(userId, 'progress');
  const notesStorageKey = getStorageKey(userId, 'notes');
  const canEditVideos = role === 'teacher' || role === 'admin';
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [completedMap, setCompletedMap] = useState(() => readStoredJson(progressStorageKey, {}));
  const [selectedSessionId, setSelectedSessionId] = useState(() => (
    pickDefaultSessionId(FLAT_REVIEW_SESSIONS, readStoredJson(progressStorageKey, {}), Date.now())
  ));
  const [notesMap, setNotesMap] = useState(() => readStoredJson(notesStorageKey, {}));
  const [videoMap, setVideoMap] = useState({});
  const [videoDraftMap, setVideoDraftMap] = useState({});
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState('');
  const [videoSaveState, setVideoSaveState] = useState({ sessionId: '', status: 'idle', error: '' });
  const [taskQuery, setTaskQuery] = useState('');

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    writeStoredJson(progressStorageKey, completedMap);
  }, [completedMap, progressStorageKey]);

  useEffect(() => {
    writeStoredJson(notesStorageKey, notesMap);
  }, [notesMap, notesStorageKey]);

  useEffect(() => {
    let cancelled = false;

    const loadVideos = async ({ silent = false } = {}) => {
      if (!silent) setVideosLoading(true);
      try {
        const data = await api.getFinalReviewVideos();
        if (cancelled) return;
        const nextVideos = normalizeVideoMap(data?.videos || {});
        setVideoMap(nextVideos);
        setVideoDraftMap((prev) => {
          const nextDrafts = { ...(prev || {}) };
          Object.entries(nextVideos).forEach(([sessionId, entry]) => {
            if (!Object.prototype.hasOwnProperty.call(nextDrafts, sessionId)) {
              nextDrafts[sessionId] = entry.youtubeUrl || '';
            }
          });
          return nextDrafts;
        });
        setVideosError('');
      } catch (error) {
        if (!cancelled) setVideosError(error?.message || 'Не удалось загрузить ссылки на видео.');
      } finally {
        if (!cancelled && !silent) setVideosLoading(false);
      }
    };

    loadVideos();
    const intervalId = window.setInterval(() => loadVideos({ silent: true }), 60000);
    const handleFocus = () => loadVideos({ silent: true });
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const selectedSession = useMemo(
    () => FLAT_REVIEW_SESSIONS.find((session) => session.id === selectedSessionId) || FLAT_REVIEW_SESSIONS[0],
    [selectedSessionId]
  );

  const selectedDay = useMemo(
    () => FINAL_REVIEW_DAYS.find((day) => day.dateKey === selectedSession?.dateKey) || FINAL_REVIEW_DAYS[0],
    [selectedSession?.dateKey]
  );

  const selectedDaySessions = useMemo(() => (
    selectedDay.sessions.map((session, index) => ({
      ...session,
      dateKey: selectedDay.dateKey,
      dateLabel: selectedDay.label,
      weekday: selectedDay.weekday,
      dayHeadline: selectedDay.headline,
      dayIndex: FINAL_REVIEW_DAYS.findIndex((day) => day.dateKey === selectedDay.dateKey),
      sessionIndex: index,
    }))
  ), [selectedDay]);

  const selectedIndex = FLAT_REVIEW_SESSIONS.findIndex((session) => session.id === selectedSession?.id);
  const previousSession = selectedIndex > 0 ? FLAT_REVIEW_SESSIONS[selectedIndex - 1] : null;
  const nextSession = selectedIndex >= 0 && selectedIndex < FLAT_REVIEW_SESSIONS.length - 1 ? FLAT_REVIEW_SESSIONS[selectedIndex + 1] : null;
  const selectedStatus = selectedSession ? getTimeStatus(selectedSession, nowMs) : 'upcoming';
  const selectedVideoLink = videoMap[selectedSession?.id]?.youtubeUrl || selectedSession?.youtubeUrl || '';
  const selectedVideoDraft = Object.prototype.hasOwnProperty.call(videoDraftMap, selectedSession?.id)
    ? videoDraftMap[selectedSession?.id]
    : selectedVideoLink;
  const selectedVideoId = selectedSession?.youtubeId || extractYoutubeId(selectedVideoLink);
  const selectedDraftVideoId = extractYoutubeId(selectedVideoDraft);
  const hasVideoDraftChanges = String(selectedVideoDraft || '').trim() !== String(selectedVideoLink || '').trim();
  const isSavingSelectedVideo = videoSaveState.sessionId === selectedSession?.id && videoSaveState.status === 'saving';
  const selectedVideoSaveError = videoSaveState.sessionId === selectedSession?.id && videoSaveState.status === 'error'
    ? videoSaveState.error
    : '';
  const isSelectedVideoSaved = videoSaveState.sessionId === selectedSession?.id && videoSaveState.status === 'saved';
  const canSaveSelectedVideo = canEditVideos
    && !isSavingSelectedVideo
    && hasVideoDraftChanges
    && (!String(selectedVideoDraft || '').trim() || Boolean(selectedDraftVideoId));
  const selectedNotes = notesMap[selectedSession?.id] || '';
  const isSelectedDone = Boolean(completedMap[selectedSession?.id]);
  const completedCount = FLAT_REVIEW_SESSIONS.filter((session) => completedMap[session.id]).length;
  const progressPercent = FLAT_REVIEW_SESSIONS.length > 0
    ? Math.round((completedCount / FLAT_REVIEW_SESSIONS.length) * 100)
    : 0;
  const daysUntilExam = getDaysUntilExam(nowMs);
  const nextActionSession = FLAT_REVIEW_SESSIONS.find((session) => !completedMap[session.id])
    || FLAT_REVIEW_SESSIONS[FLAT_REVIEW_SESSIONS.length - 1];

  const taskIndex = useMemo(() => {
    const map = new Map();
    FLAT_REVIEW_SESSIONS.forEach((session) => {
      session.tasks.forEach((taskNumber) => {
        const key = Number(taskNumber);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(session);
      });
    });
    return map;
  }, []);

  const filteredSessions = useMemo(() => {
    const query = taskQuery.trim().toLowerCase();
    if (!query) return FLAT_REVIEW_SESSIONS;
    return FLAT_REVIEW_SESSIONS.filter((session) => getSessionSearchText(session).includes(query));
  }, [taskQuery]);

  const toggleDone = (sessionId) => {
    setCompletedMap((prev) => ({
      ...(prev || {}),
      [sessionId]: !prev?.[sessionId],
    }));
  };

  const selectSession = (sessionId) => {
    setSelectedSessionId(sessionId);
  };

  const selectDay = (day) => {
    const sessions = day.sessions.map((session, index) => ({
      ...session,
      dateKey: day.dateKey,
      dateLabel: day.label,
      weekday: day.weekday,
      dayHeadline: day.headline,
      dayIndex: FINAL_REVIEW_DAYS.findIndex((item) => item.dateKey === day.dateKey),
      sessionIndex: index,
    }));
    const firstUnfinished = sessions.find((session) => !completedMap[session.id]);
    selectSession((firstUnfinished || sessions[0])?.id || '');
  };

  const openTask = (taskNumber) => {
    onOpenTask?.(taskNumber, 'basic');
  };

  const openTaskSession = (taskNumber) => {
    const session = taskIndex.get(taskNumber)?.[0];
    if (session) {
      selectSession(session.id);
      return;
    }
    openTask(taskNumber);
  };

  const updateSelectedNote = (value) => {
    const sessionId = selectedSession?.id;
    if (!sessionId) return;
    setNotesMap((prev) => ({
      ...(prev || {}),
      [sessionId]: normalizeNotesValue(value),
    }));
  };

  const updateSelectedVideoDraft = (value) => {
    const sessionId = selectedSession?.id;
    if (!sessionId) return;
    setVideoDraftMap((prev) => ({
      ...(prev || {}),
      [sessionId]: value,
    }));
    setVideoSaveState((prev) => (
      prev.sessionId === sessionId ? { sessionId, status: 'idle', error: '' } : prev
    ));
  };

  const saveSelectedVideoLink = async () => {
    const sessionId = selectedSession?.id;
    if (!canEditVideos || !sessionId) return;
    const youtubeUrl = String(selectedVideoDraft || '').trim();
    if (youtubeUrl && !extractYoutubeId(youtubeUrl)) {
      setVideoSaveState({ sessionId, status: 'error', error: 'Нужна ссылка на YouTube или ID видео.' });
      return;
    }

    setVideoSaveState({ sessionId, status: 'saving', error: '' });
    try {
      const data = await api.updateFinalReviewVideo(sessionId, youtubeUrl);
      const nextVideos = normalizeVideoMap(data?.videos || {});
      setVideoMap(nextVideos);
      setVideoDraftMap((prev) => ({
        ...(prev || {}),
        [sessionId]: youtubeUrl,
      }));
      setVideoSaveState({ sessionId, status: 'saved', error: '' });
      setVideosError('');
    } catch (error) {
      setVideoSaveState({
        sessionId,
        status: 'error',
        error: error?.message || 'Не удалось сохранить ссылку.',
      });
    }
  };

  const statusLabel = selectedStatus === 'live'
    ? 'идёт сейчас'
    : selectedStatus === 'past'
      ? 'запись'
      : 'скоро';

  return (
    <section className="final-review-section mx-auto flex w-full max-w-[1500px] flex-col gap-4 text-slate-950 md:gap-5">
      <div className="surface-panel overflow-hidden rounded-3xl border border-slate-200/80 bg-white/94 p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">
              <CalendarDays size={14} />
              Финальное повторение
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              YouTube-курс по дням до ЕГЭ
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Все эфиры из расписания собраны в один маршрут: выбирай день, смотри запись, отмечай готовность и сразу открывай нужное задание на платформе.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[390px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">До ЕГЭ</div>
              <div className="mt-1 font-mono text-xl font-black text-slate-950">{daysUntilExam}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Готово</div>
              <div className="mt-1 font-mono text-xl font-black text-emerald-700">{`${completedCount}/${FLAT_REVIEW_SESSIONS.length}`}</div>
            </div>
            <button
              type="button"
              onClick={() => selectSession(nextActionSession?.id)}
              className="rounded-2xl border border-slate-900 bg-slate-950 px-3 py-2.5 text-left text-white shadow-sm hover:bg-slate-800"
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Продолжить</div>
              <div className="mt-1 truncate text-sm font-black">{nextActionSession?.dateLabel || selectedSession?.dateLabel}</div>
            </button>
          </div>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-amber-400 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div className="surface-panel overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 md:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-slate-800">
                    <Clock3 size={13} />
                    {selectedSession?.time}
                  </span>
                  <span>{formatSessionDate(selectedSession)}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
                    selectedStatus === 'live'
                      ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                      : selectedStatus === 'past'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                  }`}>
                    {statusLabel}
                  </span>
                </div>
                <h2 className="mt-2 truncate text-xl font-black tracking-tight text-slate-950 md:text-2xl">
                  {selectedSession?.title}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => previousSession && selectSession(previousSession.id)}
                  disabled={!previousSession}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Предыдущий эфир"
                  title="Предыдущий эфир"
                >
                  <ArrowLeft size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => nextSession && selectSession(nextSession.id)}
                  disabled={!nextSession}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Следующий эфир"
                  title="Следующий эфир"
                >
                  <ArrowRight size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleDone(selectedSession?.id)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold ${
                    isSelectedDone
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <CheckCircle2 size={16} />
                  {isSelectedDone ? 'Готово' : 'Отметить'}
                </button>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 bg-slate-950">
                {selectedVideoId ? (
                  <iframe
                    className="aspect-video h-full min-h-[260px] w-full"
                    src={`https://www.youtube.com/embed/${selectedVideoId}`}
                    title={selectedSession?.title || 'Видео повторения'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex aspect-video min-h-[260px] w-full flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-white">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/8 text-amber-300">
                      <Video size={30} />
                    </div>
                    <div>
                      <div className="text-lg font-black">Видео появится здесь</div>
                      <div className="mt-1 max-w-md text-sm leading-6 text-slate-300">
                        {canEditVideos
                          ? 'Вставь ссылку в панели справа, и запись появится у всех учеников.'
                          : 'Преподаватель добавит запись.'}
                      </div>
                    </div>
                    {canEditVideos && (
                      <a
                        href={getYoutubeSearchUrl(selectedSession)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/15"
                      >
                        <Search size={16} />
                        Найти на YouTube
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-4 border-l border-slate-200/80 bg-slate-50/80 p-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Задания эфира</div>
                  {selectedSession?.tasks?.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedSession.tasks.map((taskNumber) => (
                        <button
                          key={`${selectedSession.id}-task-${taskNumber}`}
                          type="button"
                          onClick={() => openTask(taskNumber)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-black text-slate-900 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                        >
                          {`№${taskNumber}`}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                      Это общий разбор без привязки к одному номеру.
                    </div>
                  )}
                </div>

                {canEditVideos ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Ссылка для всех учеников</span>
                      <input
                        value={selectedVideoDraft}
                        onChange={(event) => updateSelectedVideoDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && canSaveSelectedVideo) saveSelectedVideoLink();
                        }}
                        placeholder="https://youtu.be/..."
                        className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400"
                      />
                    </label>
                    {String(selectedVideoDraft || '').trim() && !selectedDraftVideoId && (
                      <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                        Нужна ссылка на YouTube или ID видео.
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <button
                        type="button"
                        onClick={saveSelectedVideoLink}
                        disabled={!canSaveSelectedVideo}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        <CheckCircle2 size={16} />
                        {isSavingSelectedVideo ? 'Сохраняю...' : 'Сохранить'}
                      </button>
                      {selectedVideoLink && (
                        <button
                          type="button"
                          onClick={() => updateSelectedVideoDraft('')}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Очистить
                        </button>
                      )}
                    </div>
                    {selectedVideoSaveError && (
                      <div className="mt-2 text-xs font-bold text-rose-700">{selectedVideoSaveError}</div>
                    )}
                    {isSelectedVideoSaved && (
                      <div className="mt-2 text-xs font-bold text-emerald-700">Ссылка сохранена для всех учеников.</div>
                    )}
                    {videosLoading && (
                      <div className="mt-2 text-xs font-bold text-slate-500">Загружаю опубликованные ссылки...</div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Видео добавляет преподаватель</div>
                    <div className="mt-2 text-sm font-semibold leading-5 text-slate-600">
                      Когда ссылка будет сохранена, запись появится здесь автоматически.
                    </div>
                    {videosError && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                        Не удалось обновить ссылки. Обнови страницу чуть позже.
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-2">
                  {selectedVideoId && (
                    <a
                      href={getYoutubeWatchUrl(selectedVideoId)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
                    >
                      <ExternalLink size={16} />
                      Открыть YouTube
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleDone(selectedSession?.id)}
                    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold ${
                      isSelectedDone
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-slate-900 bg-slate-950 text-white hover:bg-slate-800'
                    }`}
                  >
                    <CheckCircle2 size={16} />
                    {isSelectedDone ? 'Эфир пройден' : 'Отметить просмотр'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="surface-panel rounded-3xl border border-slate-200 bg-white/94 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-950">Найти задание</h2>
                  <p className="mt-1 text-sm text-slate-500">Один тап переносит к нужному эфиру.</p>
                </div>
                <Target size={20} className="text-sky-500" />
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search size={16} className="text-slate-400" />
                <input
                  value={taskQuery}
                  onChange={(event) => setTaskQuery(event.target.value)}
                  placeholder="Дата, номер, тема..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-400"
                />
                {taskQuery && (
                  <button
                    type="button"
                    onClick={() => setTaskQuery('')}
                    className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
                    aria-label="Очистить поиск"
                    title="Очистить"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2">
                {ALL_TASKS.map((taskNumber) => {
                  const sessions = taskIndex.get(taskNumber) || [];
                  const isInSelected = selectedSession?.tasks?.includes(taskNumber);
                  return (
                    <button
                      key={`quick-task-${taskNumber}`}
                      type="button"
                      onClick={() => openTaskSession(taskNumber)}
                      className={`min-h-12 rounded-xl border px-2 text-center font-mono text-sm font-black ${
                        isInSelected
                          ? 'border-sky-400 bg-sky-50 text-sky-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      title={sessions.map((session) => `${session.dateLabel} ${session.time}`).join(', ')}
                    >
                      {`№${taskNumber}`}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="surface-panel rounded-3xl border border-slate-200 bg-white/94 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-950">Заметки к эфиру</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedSession?.title}</p>
                </div>
                <FileText size={20} className="text-amber-500" />
              </div>
              <textarea
                value={selectedNotes}
                onChange={(event) => updateSelectedNote(event.target.value)}
                placeholder="Ключевые идеи, ошибки, что пересмотреть перед экзаменом..."
                className="mt-4 min-h-[220px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-900 placeholder:text-slate-400"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>{formatSessionDate(selectedSession)}</span>
                <span>{`${selectedNotes.length}/4000`}</span>
              </div>
            </div>
          </div>

          <div className="surface-panel rounded-3xl border border-slate-200 bg-white/94 p-4 shadow-sm md:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Карта курса</h2>
                <p className="mt-1 text-sm text-slate-500">Вся сетка повторения со скриншота.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">
                <ListChecks size={15} />
                {`${progressPercent}% пройдено`}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {FINAL_REVIEW_DAYS.map((day) => {
                const daySessions = day.sessions.map((session, index) => ({
                  ...session,
                  dateKey: day.dateKey,
                  dateLabel: day.label,
                  weekday: day.weekday,
                  dayHeadline: day.headline,
                  sessionIndex: index,
                }));
                const isActiveDay = day.dateKey === selectedDay?.dateKey;
                const dayDone = daySessions.every((session) => completedMap[session.id]);
                const dayStatus = getDayTimeStatus(day, nowMs);
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() => selectDay(day)}
                    className={`min-h-[230px] rounded-2xl border p-0 text-left transition ${
                      isActiveDay
                        ? 'border-amber-300 bg-amber-50/80 shadow-[0_14px_34px_rgba(245,158,11,0.18)]'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`flex items-center justify-between rounded-t-2xl px-4 py-3 ${
                      dayStatus === 'live'
                        ? 'bg-rose-500 text-white'
                        : dayDone
                          ? 'bg-emerald-500 text-white'
                          : 'bg-amber-400 text-slate-950'
                    }`}>
                      <span className="font-display text-2xl font-black tracking-tight">{day.label}</span>
                      <span className="text-sm font-black uppercase">{day.weekday}</span>
                    </div>
                    <div className="space-y-3 px-4 py-4">
                      <div className="truncate text-sm font-black text-slate-950">{day.headline}</div>
                      {daySessions.map((session) => (
                        <div key={`${day.dateKey}-${session.id}`} className="grid grid-cols-[52px_1fr_auto] items-start gap-2">
                          <span className="font-mono text-sm font-black text-amber-600">{session.time}</span>
                          <span className="min-w-0 text-sm font-semibold leading-5 text-slate-800">{session.title}</span>
                          {completedMap[session.id] && <CheckCircle2 size={16} className="mt-0.5 text-emerald-500" />}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-5 xl:self-start">
          <div className="surface-panel rounded-3xl border border-slate-200 bg-white/94 p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600">День курса</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  {`${selectedDay?.label} ${selectedDay?.weekday}`}
                </h2>
              </div>
              <PlayCircle size={22} className="text-slate-400" />
            </div>
            <div className="space-y-2">
              {selectedDaySessions.map((session) => {
                const isActive = session.id === selectedSession?.id;
                const status = getTimeStatus(session, nowMs);
                return (
                  <button
                    key={`day-playlist-${session.id}`}
                    type="button"
                    onClick={() => selectSession(session.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      isActive
                        ? 'border-slate-900 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`font-mono text-sm font-black ${isActive ? 'text-amber-300' : 'text-amber-600'}`}>
                          {session.time}
                        </div>
                        <div className="mt-1 text-sm font-bold leading-5">{session.title}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {status === 'live' && <span className="h-2 w-2 rounded-full bg-rose-400" />}
                        {completedMap[session.id] ? (
                          <CheckCircle2 size={17} className={isActive ? 'text-emerald-300' : 'text-emerald-500'} />
                        ) : (
                          <span className={`mt-0.5 h-4 w-4 rounded-full border ${isActive ? 'border-white/35' : 'border-slate-300'}`} />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="surface-panel rounded-3xl border border-slate-200 bg-white/94 p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Быстрый список</h2>
                <p className="mt-1 text-sm text-slate-500">Поиск показывает подходящие эфиры.</p>
              </div>
              <Video size={20} className="text-sky-500" />
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {filteredSessions.length > 0 ? filteredSessions.map((session) => {
                const isActive = session.id === selectedSession?.id;
                return (
                  <button
                    key={`filtered-${session.id}`}
                    type="button"
                    onClick={() => selectSession(session.id)}
                    className={`grid w-full grid-cols-[54px_1fr_auto] items-center gap-2 rounded-2xl border px-3 py-2.5 text-left ${
                      isActive
                        ? 'border-sky-300 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-mono text-xs font-black">{session.dateLabel}</span>
                    <span className="min-w-0 truncate text-sm font-bold">{session.title}</span>
                    <span className="font-mono text-xs font-black text-amber-600">{session.time}</span>
                  </button>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  Ничего не нашлось.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default FinalReviewSection;
