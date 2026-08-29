import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  FilePlay,
  History,
  Loader2,
  LogOut,
  RefreshCcw,
  School,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import MockExamProgressChart from './MockExamProgressChart';
import StudentLessonDetailModal from './StudentLessonDetailModal';

const WEEKDAY_META = [
  { order: 1, key: 'monday', short: 'Пн', label: 'Понедельник' },
  { order: 2, key: 'tuesday', short: 'Вт', label: 'Вторник' },
  { order: 3, key: 'wednesday', short: 'Ср', label: 'Среда' },
  { order: 4, key: 'thursday', short: 'Чт', label: 'Четверг' },
  { order: 5, key: 'friday', short: 'Пт', label: 'Пятница' },
  { order: 6, key: 'saturday', short: 'Сб', label: 'Суббота' },
  { order: 7, key: 'sunday', short: 'Вс', label: 'Воскресенье' },
];

const WEEKDAY_BY_KEY = new Map(WEEKDAY_META.map((entry) => [entry.key, entry.order]));
const WEEKDAY_BY_RUSSIAN = new Map(WEEKDAY_META.flatMap((entry) => [
  [entry.label.toLowerCase(), entry.order],
  [entry.short.toLowerCase(), entry.order],
]));

const PAYMENT_META = {
  paid: {
    label: 'Оплачено',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    darkClassName: 'border-emerald-800 bg-emerald-950/60 text-emerald-200',
  },
  unpaid: {
    label: 'Не оплачено',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    darkClassName: 'border-rose-800 bg-rose-950/60 text-rose-200',
  },
  partial: {
    label: 'Частично оплачено',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    darkClassName: 'border-amber-800 bg-amber-950/60 text-amber-200',
  },
  trial: {
    label: 'Пробное',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    darkClassName: 'border-sky-800 bg-sky-950/60 text-sky-200',
  },
  pending: {
    label: 'Предстоящее',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    darkClassName: 'border-slate-700 bg-slate-800 text-slate-300',
  },
};

const HOMEWORK_STATUS_LABELS = {
  excellent: 'Всё сделано',
  complete: 'Выполнена с исправлениями',
  attention: 'Остались ошибки',
  'in-progress': 'В работе',
  'not-started': 'Не начата',
  'no-data': 'Нет данных',
};

const getHomeworkStatusLabel = (entry, isCurrent = false) => {
  if (!isCurrent && entry?.status === 'in-progress') return 'Не завершена';
  if (!isCurrent && entry?.status === 'not-started') return 'Не выполнена';
  return HOMEWORK_STATUS_LABELS[entry?.status] || 'Нет данных';
};

const HOMEWORK_ITEM_LABELS = {
  clean: 'Сразу верно',
  'with-errors': 'Исправлено',
  wrong: 'Пока неверно',
  untouched: 'Не начато',
};

const pad = (value) => String(value).padStart(2, '0');

const toDayKey = (date) => (
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
);

const parseDayKey = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value, options = {}) => {
  const date = parseDayKey(value) || new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: options.short ? 'short' : 'long',
    ...(options.year ? { year: 'numeric' } : {}),
  }).replace(' г.', '');
};

const formatMoney = (value) => (
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value) || 0)} ₽`
);

const formatDuration = (durationMs) => {
  const minutes = Math.max(1, Math.round((Number(durationMs) || 0) / 60000));
  return `${minutes} мин`;
};

const getHomeworkDisplayTitle = (entry) => {
  const issuedAt = String(entry?.issuedAt || '').trim();
  const issuedDate = parseDayKey(issuedAt) || new Date(issuedAt);
  if (!Number.isNaN(issuedDate.getTime())) {
    return `Домашняя работа от ${formatDate(issuedAt, {
      year: issuedDate.getFullYear() !== new Date().getFullYear(),
    })}`;
  }
  const number = Number(entry?.number);
  return Number.isFinite(number) && number > 0
    ? `Домашняя работа №${Math.round(number)}`
    : 'Домашняя работа';
};

const formatUpdatedAt = (value) => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return 'Данные обновлены';
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  return `${sameDay ? 'Сегодня' : formatDate(toDayKey(date), { short: true })}, ${date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const formatUpdatedTime = (value) => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return 'сейчас';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const hasLessonReplay = (lesson) => Boolean(lesson?.replay?.available)
  && (lesson.replay.eventTypes || []).some((type) => type !== 'session');

const getWeekStart = (sourceDate = new Date()) => {
  const date = new Date(sourceDate);
  date.setHours(12, 0, 0, 0);
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  date.setDate(date.getDate() - weekday + 1);
  return date;
};

const getScheduleWeekdayOrder = (entry) => {
  const explicit = Number(entry?.weekdayOrder);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 7) return Math.round(explicit);
  const key = String(entry?.weekdayKey || '').trim().toLowerCase();
  if (WEEKDAY_BY_KEY.has(key)) return WEEKDAY_BY_KEY.get(key);
  const label = String(entry?.day || '').trim().toLowerCase().replace(/\.$/, '');
  return WEEKDAY_BY_RUSSIAN.get(label) || 0;
};

const getPaymentState = (entry, dayKey) => {
  const payment = entry?.payment && typeof entry.payment === 'object' ? entry.payment : null;
  const statesByDate = payment?.statesByDate && typeof payment.statesByDate === 'object'
    ? payment.statesByDate
    : {};
  const resolved = statesByDate[dayKey]
    || (String(payment?.date || '').trim() === dayKey ? payment : null)
    || null;
  const status = String(resolved?.status || '').trim();
  return PAYMENT_META[status] ? { ...resolved, status } : { status: 'pending' };
};

const summarizeUnpaidLessons = (schedule = [], lessons = [], lessonPrice = 0) => {
  const unpaidOccurrenceKeys = new Set();
  const unpaidDateKeys = new Set();
  (Array.isArray(schedule) ? schedule : []).forEach((entry) => {
    const statesByDate = entry?.payment?.statesByDate;
    if (!statesByDate || typeof statesByDate !== 'object') return;
    Object.entries(statesByDate).forEach(([dayKey, state]) => {
      if (state?.status !== 'unpaid') return;
      unpaidOccurrenceKeys.add([
        dayKey,
        String(entry?.time || '').trim(),
        Number(entry?.durationMinutes) || 60,
      ].join(':'));
      if (parseDayKey(dayKey)) unpaidDateKeys.add(dayKey);
    });
  });

  const unpaidHistory = (Array.isArray(lessons) ? lessons : [])
    .filter((lesson) => lesson?.payment?.status === 'unpaid');
  unpaidHistory.forEach((lesson) => {
    const dayKey = String(lesson?.dayKey || lesson?.date || '').trim();
    if (parseDayKey(dayKey)) unpaidDateKeys.add(dayKey);
  });
  const count = Math.max(unpaidOccurrenceKeys.size, unpaidHistory.length);
  const configuredPrice = Math.max(0, Number(lessonPrice) || 0);
  const historyAmount = unpaidHistory.reduce(
    (total, lesson) => total + Math.max(0, Number(lesson?.payment?.amount) || 0),
    0,
  );
  const historyAmountIsComplete = count > 0
    && unpaidHistory.length === count
    && unpaidHistory.every((lesson) => Number(lesson?.payment?.amount) > 0);
  const amountKnown = count > 0 && (configuredPrice > 0 || historyAmountIsComplete);
  const amount = historyAmountIsComplete
    ? historyAmount
    : (configuredPrice > 0 ? configuredPrice * count : 0);

  return {
    count,
    amount,
    amountKnown,
    dates: Array.from(unpaidDateKeys).sort((left, right) => left.localeCompare(right, 'ru')),
  };
};

const formatUnpaidLessonCount = (value) => {
  const count = Math.max(0, Math.round(Number(value) || 0));
  if (count === 1) return 'Не оплачено одно занятие.';
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `Не оплачены ${count} занятия.`;
  }
  if (lastDigit === 1 && lastTwoDigits !== 11) return `Не оплачено ${count} занятие.`;
  return `Не оплачено ${count} занятий.`;
};

const joinRussianList = (items = []) => {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} и ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} и ${items.at(-1)}`;
};

const formatUnpaidLessonDates = (dates = []) => {
  const parsedDates = Array.from(new Set(dates))
    .map((dayKey) => ({ dayKey, date: parseDayKey(dayKey) }))
    .filter((entry) => entry.date)
    .sort((left, right) => left.dayKey.localeCompare(right.dayKey, 'ru'));
  if (parsedDates.length === 0) return '';

  const firstDate = parsedDates[0].date;
  const sameMonth = parsedDates.every(({ date }) => (
    date.getMonth() === firstDate.getMonth() && date.getFullYear() === firstDate.getFullYear()
  ));
  if (sameMonth) {
    const days = joinRussianList(parsedDates.map(({ date }) => String(date.getDate())));
    const month = firstDate.toLocaleDateString('ru-RU', { month: 'long' });
    const year = firstDate.getFullYear() !== new Date().getFullYear()
      ? ` ${firstDate.getFullYear()} года`
      : '';
    return `${days} ${month}${year}`;
  }

  return joinRussianList(parsedDates.map(({ dayKey, date }) => formatDate(dayKey, {
    year: date.getFullYear() !== new Date().getFullYear(),
  })));
};

const formatUnpaidLessonDetail = ({ count = 0, dates = [] } = {}) => {
  const normalizedCount = Math.max(0, Math.round(Number(count) || 0));
  const dateText = formatUnpaidLessonDates(dates);
  if (!dateText) return formatUnpaidLessonCount(normalizedCount);
  if (normalizedCount === 1) return `Не оплачено занятие ${dateText}.`;
  if (dates.length === normalizedCount) return `Не оплачены занятия ${dateText}.`;
  return `${formatUnpaidLessonCount(normalizedCount).replace(/\.$/, '')}: ${dateText}.`;
};

const buildWeek = (schedule = [], sourceDate = new Date()) => {
  const start = getWeekStart(sourceDate);
  const todayKey = toDayKey(new Date());
  return WEEKDAY_META.map((meta, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dayKey = toDayKey(date);
    const lessons = (Array.isArray(schedule) ? schedule : [])
      .filter((entry) => {
        if (!entry || entry.cancelled || entry.isCancelled) return false;
        if (String(entry.status || '').toLowerCase() === 'cancelled') return false;
        const explicitDate = String(entry.date || entry.dayKey || '').trim();
        if (explicitDate) return explicitDate === dayKey;
        if ((Array.isArray(entry.excludedDates) ? entry.excludedDates : []).includes(dayKey)) return false;
        return getScheduleWeekdayOrder(entry) === meta.order;
      })
      .map((entry) => ({ ...entry, paymentState: getPaymentState(entry, dayKey) }))
      .sort((left, right) => String(left.time || '').localeCompare(String(right.time || ''), 'ru'));
    return {
      ...meta,
      date,
      dayKey,
      isToday: dayKey === todayKey,
      lessons,
    };
  });
};

const getNextWeekLesson = (week) => {
  const now = Date.now();
  return week
    .flatMap((day) => day.lessons.map((lesson) => {
      const time = /^\d{2}:\d{2}$/.test(String(lesson.time || '')) ? lesson.time : '23:59';
      const startsAt = new Date(`${day.dayKey}T${time}:00`).getTime();
      return { day, lesson, startsAt };
    }))
    .filter((entry) => Number.isFinite(entry.startsAt) && entry.startsAt >= now)
    .sort((left, right) => left.startsAt - right.startsAt)[0] || null;
};

const PaymentBadge = ({ status = 'pending', dark = false }) => {
  const meta = PAYMENT_META[status] || PAYMENT_META.pending;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-extrabold ${
      dark ? meta.darkClassName : meta.className
    }`}>
      {meta.label}
    </span>
  );
};

const SectionHeading = ({ number, icon, eyebrow, title, description, dark, tone = 'violet' }) => {
  const lightTone = {
    violet: 'border-violet-200 bg-violet-100 text-violet-700',
    sky: 'border-sky-200 bg-sky-100 text-sky-700',
    emerald: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  }[tone] || 'border-violet-200 bg-violet-100 text-violet-700';
  const darkTone = {
    violet: 'border-violet-800 bg-violet-950 text-violet-200',
    sky: 'border-sky-800 bg-sky-950 text-sky-200',
    emerald: 'border-emerald-800 bg-emerald-950 text-emerald-200',
  }[tone] || 'border-violet-800 bg-violet-950 text-violet-200';

  return (
    <div className="mb-5 flex items-start gap-3.5">
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border ${dark ? darkTone : lightTone}`}>
        {number ? (
          <span className="text-xl font-black tracking-[-0.05em]">{number}</span>
        ) : React.createElement(icon, { size: 21 })}
      </span>
      <div className="min-w-0 pt-0.5">
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] ${
          dark ? 'text-slate-400' : 'text-slate-500'
        }`}>
          {React.createElement(icon, { size: 13 })}
          {eyebrow}
        </span>
        <h2 className={`mt-1 text-xl font-black leading-tight tracking-[-0.02em] md:text-2xl ${dark ? 'text-white' : 'text-slate-950'}`}>
          {title}
        </h2>
        {description && (
          <p className={`mt-1 max-w-2xl text-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

const MobileDetailSection = ({
  sectionId,
  icon,
  title,
  summary,
  open,
  onToggle,
  dark,
  tone = 'violet',
  children,
}) => {
  const Icon = icon;
  const triggerId = `${sectionId}-trigger`;
  const panelId = `${sectionId}-panel`;
  const lightTone = {
    violet: 'border-violet-200 bg-white',
    sky: 'border-sky-200 bg-white',
    emerald: 'border-emerald-200 bg-white',
  }[tone] || 'border-violet-200 bg-white';
  const darkTone = {
    violet: 'border-violet-900 bg-slate-900/85',
    sky: 'border-sky-900 bg-slate-900/85',
    emerald: 'border-emerald-900 bg-slate-900/85',
  }[tone] || 'border-violet-900 bg-slate-900/85';
  const lightIcon = {
    violet: 'bg-violet-100 text-violet-700',
    sky: 'bg-sky-100 text-sky-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  }[tone] || 'bg-violet-100 text-violet-700';
  const darkIcon = {
    violet: 'bg-violet-950 text-violet-200',
    sky: 'bg-sky-950 text-sky-200',
    emerald: 'bg-emerald-950 text-emerald-200',
  }[tone] || 'bg-violet-950 text-violet-200';

  return (
    <section className={`overflow-hidden rounded-[24px] border-2 shadow-sm ${dark ? darkTone : lightTone}`}>
      <button
        id={triggerId}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-20 w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
      >
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${dark ? darkIcon : lightIcon}`}>
          <Icon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-base font-black leading-tight">{title}</strong>
          <span className={`mt-1 block text-[13px] font-semibold leading-snug ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
            {summary}
          </span>
        </span>
        <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
          {open ? 'Скрыть' : 'Открыть'}
          <ChevronDown size={17} className={`transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!open}
        className={`border-t p-3.5 ${dark ? 'border-slate-700' : 'border-slate-200 bg-slate-50/60'}`}
      >
        {open ? children : null}
      </div>
    </section>
  );
};

const ParentDashboard = ({ theme = '', onLogout }) => {
  const dark = theme === 'dark';
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lessons, setLessons] = useState([]);
  const [lessonPage, setLessonPage] = useState({ hasMore: false, nextOffset: null, total: 0 });
  const [loadingMoreLessons, setLoadingMoreLessons] = useState(false);
  const [showAllHomework, setShowAllHomework] = useState(false);
  const [activeMobileSection, setActiveMobileSection] = useState('recordings');
  const [detailState, setDetailState] = useState({ open: false, lesson: null, data: null, loading: false, error: '' });

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getParentOverview();
      setOverview(data);
      setLessons(Array.isArray(data?.lessons?.items) ? data.lessons.items : []);
      setLessonPage({
        hasMore: Boolean(data?.lessons?.hasMore),
        nextOffset: data?.lessons?.nextOffset ?? null,
        total: Number(data?.lessons?.total) || 0,
      });
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось загрузить кабинет родителя.');
      setOverview(null);
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previousTitle = document.title;
    document.title = overview?.student?.name
      ? `Успеваемость ${overview.student.name}`
      : 'Кабинет родителя';
    return () => { document.title = previousTitle; };
  }, [overview?.student?.name]);

  const week = useMemo(() => buildWeek(overview?.schedule || []), [overview?.schedule]);
  const upcomingSchedule = useMemo(() => {
    const nextWeekDate = new Date();
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    return [...week, ...buildWeek(overview?.schedule || [], nextWeekDate)];
  }, [overview?.schedule, week]);
  const nextLesson = useMemo(() => getNextWeekLesson(upcomingSchedule), [upcomingSchedule]);
  const mockEntries = Array.isArray(overview?.mocks?.entries) ? overview.mocks.entries : [];
  const homeworkEntries = Array.isArray(overview?.homework?.entries) ? overview.homework.entries : [];
  const orderedHomeworkEntries = [...homeworkEntries].reverse();
  const homeworkSummary = overview?.homework?.summary || {};
  const finance = overview?.finance || {};

  const loadMoreLessons = async () => {
    if (!lessonPage.hasMore || loadingMoreLessons) return;
    setLoadingMoreLessons(true);
    try {
      const page = await api.getParentLessons({ offset: lessonPage.nextOffset, limit: 12 });
      setLessons((current) => [...current, ...(Array.isArray(page?.items) ? page.items : [])]);
      setLessonPage({
        hasMore: Boolean(page?.hasMore),
        nextOffset: page?.nextOffset ?? null,
        total: Number(page?.total) || lessonPage.total,
      });
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось загрузить продолжение истории.');
    } finally {
      setLoadingMoreLessons(false);
    }
  };

  const openLesson = async (lesson) => {
    if (!lesson?.key || !overview?.student?.id) return;
    setDetailState({ open: true, lesson, data: null, loading: true, error: '' });
    try {
      const data = await api.getLessonHistoryDetail(overview.student.id, lesson.key);
      setDetailState({ open: true, lesson: data?.lesson || lesson, data, loading: false, error: '' });
    } catch (requestError) {
      setDetailState({
        open: true,
        lesson,
        data: null,
        loading: false,
        error: requestError?.message || 'Не удалось открыть занятие.',
      });
    }
  };

  if (loading) {
    return (
      <div className="app-min-h app-shell grid place-items-center p-4">
        <div className={`flex items-center gap-3 rounded-3xl border px-5 py-4 shadow-sm ${
          dark ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-purple-100 bg-white text-slate-700'
        }`} role="status">
          <Loader2 size={20} className="animate-spin text-violet-500" />
          <div>
            <strong className="block text-sm">Собираем отчёт ученика</strong>
            <span className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Расписание, прогресс и домашняя работа</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="app-min-h app-shell grid place-items-center p-4">
        <section className={`w-full max-w-lg rounded-[28px] border p-6 text-center shadow-sm ${
          dark ? 'border-rose-900 bg-slate-900 text-slate-100' : 'border-rose-200 bg-white text-slate-900'
        }`} role="alert">
          <AlertCircle size={30} className="mx-auto text-rose-500" />
          <h1 className="mt-3 text-lg font-black">Не удалось открыть кабинет</h1>
          <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{error}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={loadOverview} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">
              Повторить
            </button>
            <button type="button" onClick={onLogout} className={`rounded-xl border px-4 py-2 text-sm font-bold ${
              dark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600'
            }`}>
              Выйти
            </button>
          </div>
        </section>
      </div>
    );
  }

  const student = overview?.student || {};
  const studentFirstName = String(student.name || 'Ученик').trim().split(/\s+/)[0] || 'Ученик';
  const initials = String(student.name || 'У')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const financeStatus = finance.paymentStatus === 'paid'
    ? 'paid'
    : (finance.paymentStatus === 'partial'
      ? 'partial'
      : (finance.paymentStatus === 'unpaid' ? 'unpaid' : 'pending'));
  const unpaidLessons = summarizeUnpaidLessons(
    overview?.schedule,
    lessons,
    finance.lessonPrice,
  );
  const unpaidLessonDetail = formatUnpaidLessonDetail(unpaidLessons);
  const monthlyOutstanding = Math.max(0, Number(finance.outstanding) || 0);
  const paymentAmount = Math.max(monthlyOutstanding, unpaidLessons.amount);
  const paymentAmountKnown = paymentAmount > 0
    && (monthlyOutstanding > 0 || unpaidLessons.amountKnown);
  const paymentRequired = paymentAmount > 0
    || unpaidLessons.count > 0
    || ['unpaid', 'partial'].includes(financeStatus);
  const currentHomeworkEntry = orderedHomeworkEntries.find((entry) => entry.isLatest)
    || orderedHomeworkEntries[0]
    || null;
  const latestMockScore = overview?.mocks?.summary?.latestScore;
  const mockDelta = overview?.mocks?.summary?.delta;
  const mobileWeekLessons = week.flatMap((day) => (
    day.lessons.map((lesson) => ({ day, lesson }))
  ));
  const recentMockEntries = [...mockEntries].reverse().slice(0, 5);
  const visibleHomeworkEntries = showAllHomework
    ? orderedHomeworkEntries
    : orderedHomeworkEntries.slice(0, 5);
  const mobileHomeworkEntries = showAllHomework
    ? orderedHomeworkEntries
    : orderedHomeworkEntries.slice(0, 3);
  const homeworkAveragePercent = Number(homeworkSummary.averagePercent) || 0;
  const fullyCompletedHomeworkCount = Number(homeworkSummary.fullyCompletedCount) || 0;
  const homeworkOverallCount = Math.max(0, Number(homeworkSummary.homeworkCount) || 0);
  const hasEnoughHomeworkHistory = homeworkEntries.length >= 3;
  const homeworkHabit = !hasEnoughHomeworkHistory
    ? 'Пока мало данных'
    : homeworkAveragePercent >= 100
      ? `${studentFirstName} всё выполняет`
      : homeworkAveragePercent >= 90
        ? `${studentFirstName} почти всё выполняет`
      : homeworkAveragePercent >= 75
        ? `${studentFirstName} обычно выполняет большую часть`
        : homeworkAveragePercent >= 50
          ? `${studentFirstName} часто оставляет часть заданий`
          : `${studentFirstName} часто не доделывает`;
  const homeworkHabitIsGood = hasEnoughHomeworkHistory && homeworkAveragePercent >= 75;
  const completedTasksOutOfTen = Math.max(1, Math.min(9, Math.round(homeworkAveragePercent / 10)));
  const homeworkAverageExplanation = homeworkAveragePercent >= 100
    ? 'В среднем выполняет все задания.'
    : homeworkAveragePercent <= 0
      ? 'Задания пока обычно остаются невыполненными.'
      : `Обычно делает примерно ${completedTasksOutOfTen} из 10 заданий — ${homeworkAveragePercent}% в среднем.`;
  const homeworkCompletionExplanation = homeworkOverallCount === 0
    ? 'Работ с наступившим сроком пока нет.'
    : homeworkOverallCount === 1
      ? fullyCompletedHomeworkCount === 1
        ? 'Учтённая работа закончена полностью.'
        : 'Учтённая работа не закончена полностью.'
    : fullyCompletedHomeworkCount === 0
      ? `Ни одна из ${homeworkOverallCount} учтённых работ не закончена полностью.`
      : fullyCompletedHomeworkCount === 1
        ? `Полностью закончена 1 из ${homeworkOverallCount} учтённых работ.`
        : `Полностью закончены ${fullyCompletedHomeworkCount} из ${homeworkOverallCount} учтённых работ.`;
  const currentHomeworkPercent = Number(currentHomeworkEntry?.percent) || 0;
  const currentHomeworkHasErrors = Number(currentHomeworkEntry?.wrongCount) > 0
    || currentHomeworkEntry?.status === 'attention';
  const currentHomeworkTone = currentHomeworkEntry?.isOverdue
    ? 'danger'
    : currentHomeworkHasErrors
      ? 'warning'
      : currentHomeworkPercent >= 100 || !currentHomeworkEntry
        ? 'success'
        : 'progress';
  const currentHomeworkNeedsAttention = Boolean(currentHomeworkEntry)
    && (currentHomeworkPercent < 100 || currentHomeworkHasErrors || currentHomeworkEntry.isOverdue);
  const homeworkHabitNeedsAttention = hasEnoughHomeworkHistory && homeworkAveragePercent < 75;
  const currentHomeworkProgressText = !currentHomeworkEntry
    ? 'Сейчас ничего сдавать не нужно.'
    : currentHomeworkEntry.isOverdue
      ? `Сделано ${currentHomeworkPercent}%, срок уже прошёл.`
      : currentHomeworkHasErrors
        ? `Сделано ${currentHomeworkPercent}%, но остались ошибки.`
        : currentHomeworkPercent >= 100
          ? 'Ученик всё сделал.'
          : currentHomeworkPercent > 0
            ? `Ученик сделал ${currentHomeworkPercent}%, работа ещё не закончена.`
            : 'Ученик пока не начинал.';
  const currentHomeworkMobileText = !currentHomeworkEntry
    ? 'Сейчас ничего сдавать не нужно.'
    : [
      currentHomeworkPercent >= 100
        ? 'Готово полностью'
        : currentHomeworkPercent > 0
          ? `Сделано ${currentHomeworkPercent}%`
          : 'Пока не начата',
      currentHomeworkEntry.isOverdue
        ? 'срок прошёл'
        : currentHomeworkHasErrors
          ? 'остались ошибки'
          : '',
      currentHomeworkEntry.dueAt && !currentHomeworkEntry.isOverdue
        ? `до ${formatDate(currentHomeworkEntry.dueAt, { short: true })}`
        : '',
    ].filter(Boolean).join(' · ');
  const recentReplayLessons = lessons.filter(hasLessonReplay).slice(0, 2);
  const latestReplayLesson = recentReplayLessons[0] || null;
  const openMobileSection = (section, targetId) => {
    setActiveMobileSection(section);
    if (typeof document === 'undefined') return;
    window.requestAnimationFrame(() => {
      const sectionTrigger = document.getElementById(`parent-mobile-${section}-trigger`);
      sectionTrigger?.focus({ preventScroll: true });
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const overviewCards = [
    {
      href: '#parent-homework',
      mobileSection: 'homework',
      icon: CheckCircle2,
      label: 'Текущая домашняя работа',
      value: currentHomeworkEntry
        ? getHomeworkDisplayTitle(currentHomeworkEntry)
        : 'Пока не задана',
      detail: currentHomeworkProgressText,
      mobileDetail: currentHomeworkMobileText,
      meta: currentHomeworkEntry?.dueAt
        ? `Сдать до ${formatDate(currentHomeworkEntry.dueAt)}`
        : '',
      progress: currentHomeworkEntry ? currentHomeworkPercent : null,
      progressClass: currentHomeworkTone === 'danger'
        ? 'bg-rose-500'
        : currentHomeworkTone === 'warning'
          ? 'bg-amber-500'
          : currentHomeworkTone === 'progress'
            ? 'bg-violet-500'
            : 'bg-emerald-500',
      isImportant: currentHomeworkNeedsAttention,
      mobileFlag: currentHomeworkEntry?.isOverdue
        ? 'Просрочена'
        : currentHomeworkHasErrors
          ? 'Есть ошибки'
          : currentHomeworkNeedsAttention
            ? 'Не закончена'
            : '',
      mobileFlagClass: currentHomeworkTone === 'danger'
        ? 'bg-rose-600 text-white'
        : currentHomeworkTone === 'warning'
          ? 'bg-amber-500 text-white'
          : 'bg-violet-600 text-white',
      valueClass: 'md:text-xl',
      actionLabel: 'Посмотреть задания',
      lightClass: currentHomeworkNeedsAttention
        ? currentHomeworkTone === 'danger'
          ? 'border-rose-300 bg-rose-50'
          : currentHomeworkTone === 'warning'
            ? 'border-amber-300 bg-amber-50'
            : 'border-violet-300 bg-violet-50'
        : 'border-slate-200 bg-white',
      darkClass: currentHomeworkNeedsAttention
        ? currentHomeworkTone === 'danger'
          ? 'border-rose-800 bg-rose-950/40'
          : currentHomeworkTone === 'warning'
            ? 'border-amber-800 bg-amber-950/40'
            : 'border-violet-800 bg-violet-950/40'
        : 'border-slate-700 bg-slate-900/70',
      iconClass: currentHomeworkTone === 'danger'
        ? (dark ? 'bg-rose-900 text-rose-200' : 'bg-rose-600 text-white')
        : currentHomeworkTone === 'warning'
          ? (dark ? 'bg-amber-900 text-amber-200' : 'bg-amber-500 text-white')
          : currentHomeworkTone === 'progress'
            ? (dark ? 'bg-violet-900 text-violet-200' : 'bg-violet-600 text-white')
            : (dark ? 'bg-emerald-900 text-emerald-200' : 'bg-emerald-600 text-white'),
      actionClass: currentHomeworkTone === 'danger'
        ? (dark ? 'text-rose-200' : 'text-rose-700')
        : currentHomeworkTone === 'warning'
          ? (dark ? 'text-amber-200' : 'text-amber-800')
          : currentHomeworkTone === 'progress'
            ? (dark ? 'text-violet-200' : 'text-violet-700')
            : (dark ? 'text-emerald-200' : 'text-emerald-700'),
    },
    {
      href: '#parent-homework',
      mobileSection: 'homework',
      icon: History,
      label: 'Домашняя работа в целом',
      value: homeworkHabit,
      detail: hasEnoughHomeworkHistory
        ? homeworkAverageExplanation
        : `Вывод появится после трёх выданных работ. Сейчас выдано: ${homeworkEntries.length}.`,
      mobileDetail: hasEnoughHomeworkHistory
        ? `${homeworkAverageExplanation} ${homeworkCompletionExplanation}`.trim()
        : `${homeworkEntries.length} из 3 выданных работ для вывода`,
      meta: homeworkCompletionExplanation,
      progress: hasEnoughHomeworkHistory ? homeworkAveragePercent : null,
      progressLabel: hasEnoughHomeworkHistory ? `${homeworkAveragePercent}%` : '',
      progressClass: homeworkAveragePercent >= 90
        ? 'bg-emerald-500'
        : homeworkAveragePercent >= 75
          ? 'bg-violet-500'
          : homeworkAveragePercent >= 50
            ? 'bg-amber-500'
            : 'bg-rose-500',
      valueClass: 'md:text-xl',
      actionLabel: 'Все домашние работы',
      isImportant: homeworkHabitNeedsAttention,
      mobileFlag: homeworkHabitNeedsAttention ? 'Важно' : '',
      mobileFlagClass: 'bg-amber-500 text-white',
      lightClass: homeworkHabitNeedsAttention
        ? 'border-amber-300 bg-amber-50'
        : 'border-slate-200 bg-white',
      darkClass: homeworkHabitNeedsAttention
        ? 'border-amber-800 bg-amber-950/40'
        : 'border-slate-700 bg-slate-900/70',
      iconClass: !hasEnoughHomeworkHistory
        ? (dark ? 'bg-violet-900 text-violet-200' : 'bg-violet-600 text-white')
        : homeworkHabitIsGood
        ? (dark ? 'bg-emerald-900 text-emerald-200' : 'bg-emerald-600 text-white')
        : (dark ? 'bg-amber-900 text-amber-200' : 'bg-amber-500 text-white'),
      actionClass: !hasEnoughHomeworkHistory
        ? (dark ? 'text-violet-200' : 'text-violet-700')
        : homeworkHabitIsGood
        ? (dark ? 'text-emerald-200' : 'text-emerald-700')
        : (dark ? 'text-amber-200' : 'text-amber-800'),
    },
    {
      href: '#parent-results',
      mobileSection: 'results',
      icon: BarChart3,
      label: 'Последний пробник',
      value: latestMockScore == null ? 'Результата пока нет' : `${latestMockScore} баллов`,
      detail: latestMockScore == null
        ? 'После первого пробника здесь появится результат.'
        : mockEntries.length <= 1 || mockDelta == null
          ? 'Это первый результат.'
          : `${mockDelta >= 0 ? 'Рост' : 'Снижение'} на ${Math.abs(mockDelta)} баллов от первого результата.`,
      mobileDetail: latestMockScore == null
        ? 'Появится после первого пробника.'
        : mockEntries.length <= 1 || mockDelta == null
          ? 'Это первый результат.'
          : `${mockDelta >= 0 ? 'Рост' : 'Снижение'} на ${Math.abs(mockDelta)} баллов.`,
      valueClass: 'md:text-2xl',
      actionLabel: 'Посмотреть динамику',
      isImportant: false,
      lightClass: 'border-slate-200 bg-white',
      darkClass: 'border-slate-700 bg-slate-900/70',
      iconClass: dark ? 'bg-sky-900 text-sky-200' : 'bg-sky-600 text-white',
      actionClass: dark ? 'text-sky-200' : 'text-sky-700',
    },
    {
      icon: CreditCard,
      label: 'Оплата',
      value: paymentRequired
        ? paymentAmountKnown
          ? `Нужно оплатить ${formatMoney(paymentAmount)}`
          : unpaidLessons.count === 1
            ? 'Есть неоплаченное занятие'
            : unpaidLessons.count > 1
              ? 'Есть неоплаченные занятия'
              : 'Есть задолженность'
        : (financeStatus === 'paid' ? 'Всё оплачено' : 'Оплачивать пока не нужно'),
      detail: paymentRequired
        ? unpaidLessons.count > 0
          ? unpaidLessonDetail
            : paymentAmountKnown
              ? 'Осталась сумма за этот месяц.'
              : 'Сумма пока не указана.'
        : financeStatus === 'paid'
          ? 'Задолженности нет.'
          : 'Новых начислений нет.',
      mobileDetail: paymentRequired
        ? unpaidLessons.count > 0
          ? unpaidLessonDetail
          : 'Осталась сумма за этот месяц.'
        : financeStatus === 'paid'
          ? 'Задолженности нет.'
          : 'Новых начислений нет.',
      valueClass: 'md:text-xl',
      isImportant: paymentRequired,
      mobileFlag: paymentRequired ? 'К оплате' : '',
      mobileFlagClass: 'bg-rose-600 text-white',
      lightClass: paymentRequired
        ? 'border-rose-300 bg-rose-50'
        : 'border-slate-200 bg-white',
      darkClass: paymentRequired
        ? 'border-rose-800 bg-rose-950/40'
        : 'border-slate-700 bg-slate-900/70',
      iconClass: paymentRequired
        ? (dark ? 'bg-rose-900 text-rose-200' : 'bg-rose-600 text-white')
        : (dark ? 'bg-emerald-900 text-emerald-200' : 'bg-emerald-600 text-white'),
    },
  ];
  return (
    <div
      className={`app-min-h app-shell ${dark ? 'text-slate-100' : 'text-slate-900'}`}
      style={{
        background: dark
          ? 'radial-gradient(circle at 8% 0%, rgba(91, 33, 182, 0.18), transparent 30rem), #020617'
          : 'radial-gradient(circle at 8% 0%, rgba(124, 58, 237, 0.09), transparent 32rem), #f6f7fb',
      }}
    >
      <header
        className={`sticky top-0 z-20 border-b backdrop-blur-xl ${
        dark ? 'border-slate-800 bg-slate-950/90' : 'border-purple-100 bg-white/90'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-4 py-3 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 font-black text-white shadow-lg shadow-violet-500/20">
              {student.avatarDataUrl
                ? <img src={student.avatarDataUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                : initials}
            </div>
            <div className="min-w-0">
              <div className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${dark ? 'text-violet-300' : 'text-violet-600'}`}>
                Кабинет родителя
              </div>
              <h1 className="truncate text-base font-black md:text-lg">{student.name || 'Ученик'}</h1>
              <span className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {student.grade === 'graduate' ? 'Выпускник' : `${student.grade || 11} класс`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadOverview}
              className={`grid h-10 w-10 place-items-center rounded-xl border transition ${
                dark ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
              }`}
              aria-label="Обновить данные"
              title="Обновить"
            >
              <RefreshCcw size={17} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${
                dark ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-600'
              }`}
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] space-y-4 px-4 py-4 pb-12 md:space-y-12 md:px-7 md:py-8 md:pb-16">
        {error && (
          <div className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${
            dark ? 'border-amber-900 bg-amber-950/40 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`} role="status">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className={`overflow-hidden rounded-[26px] border-2 shadow-[0_20px_55px_rgba(15,23,42,0.12)] md:rounded-[32px] ${
          dark
            ? 'border-slate-700 bg-slate-900/90 shadow-black/30'
            : 'border-white bg-white/95'
        }`} aria-label="Главное об учёбе">
          <div className="h-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 md:hidden" />
          <header className={`flex items-center justify-between gap-3 border-b p-4 md:p-5 lg:p-7 ${
            dark ? 'border-slate-700 bg-slate-950/25' : 'border-slate-100 bg-white'
            }`}>
            <div>
              <span className={`hidden text-base font-extrabold md:inline ${dark ? 'text-violet-300' : 'text-violet-700'}`}>
                Коротко об учёбе
              </span>
              <h2 className="text-xl font-black tracking-[-0.035em] md:mt-1 md:text-3xl">
                <span className="md:hidden">Главное на сегодня</span>
                <span className="hidden md:inline">Вот что важно на сегодня</span>
              </h2>
            </div>
            <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold md:px-3 md:text-xs ${
              dark ? 'border-slate-700 bg-slate-900 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              <Clock3 size={13} />
              <span className="md:hidden">{formatUpdatedTime(overview?.generatedAt)}</span>
              <span className="hidden md:inline">Обновлено {formatUpdatedAt(overview?.generatedAt)}</span>
            </span>
          </header>

          <div className={`grid gap-2.5 p-3 md:hidden ${dark ? 'bg-slate-950/20' : 'bg-slate-50/70'}`}>
              {overviewCards.map((card) => {
                const Icon = card.icon;
                const CardTag = card.mobileSection ? 'button' : 'div';
                return (
                  <CardTag
                    key={`mobile-${card.label}`}
                    {...(card.mobileSection ? {
                      type: 'button',
                      onClick: () => openMobileSection(card.mobileSection, card.href.slice(1)),
                      'aria-expanded': activeMobileSection === card.mobileSection,
                      'aria-controls': `parent-mobile-${card.mobileSection}-panel`,
                    } : {})}
                    className={`group block w-full rounded-[20px] border-2 p-3.5 text-left ${
                      card.isImportant
                        ? 'shadow-[0_10px_24px_rgba(15,23,42,0.12)]'
                        : 'shadow-sm'
                    } ${card.mobileSection ? 'transition active:scale-[0.99]' : ''} ${dark ? card.darkClass : card.lightClass}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${card.iconClass}`}>
                        <Icon size={17} />
                      </span>
                      <span className={`min-w-0 flex-1 text-xs font-extrabold leading-tight ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {card.label}
                      </span>
                      {card.mobileFlag && !card.mobileSection && (
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold ${card.mobileFlagClass}`}>
                          {card.mobileFlag}
                        </span>
                      )}
                      {card.mobileSection && (
                        <span className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-extrabold shadow-sm ${
                          dark ? 'border-slate-700 bg-slate-900/80' : 'border-white bg-white/90'
                        } ${card.actionClass}`}>
                          Подробнее
                          <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
                        </span>
                      )}
                    </span>
                    <strong className="mt-2 block text-[17px] font-black leading-tight tracking-[-0.01em]">
                      {card.value}
                    </strong>
                    <span className={`mt-1 block text-[13px] font-semibold leading-snug ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {card.mobileDetail || card.detail}
                    </span>
                    {Number.isFinite(card.progress) && (
                      <span className="mt-2.5 block">
                        {card.progressLabel && (
                          <span className="mb-1 block text-right text-xs font-black">{card.progressLabel}</span>
                        )}
                        <span className={`block h-1.5 overflow-hidden rounded-full ${dark ? 'bg-slate-800' : 'bg-white'}`}>
                          <span
                            className={`block h-full rounded-full ${card.progressClass || 'bg-emerald-500'}`}
                            style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }}
                          />
                        </span>
                      </span>
                    )}
                  </CardTag>
                );
              })}
          </div>

          <div className={`hidden gap-3 p-4 md:grid md:grid-cols-2 xl:grid-cols-4 ${
            dark ? 'bg-slate-950/20' : 'bg-slate-50/60'
          }`}>
            {overviewCards.map((card) => {
              const Icon = card.icon;
              const CardTag = card.href ? 'a' : 'div';
              return (
                <CardTag
                  key={card.label}
                  {...(card.href ? { href: card.href } : {})}
                  className={`group flex items-start gap-2.5 rounded-2xl border-2 p-3 shadow-sm md:min-h-[218px] md:flex-col md:gap-3 md:p-5 ${
                    card.href
                      ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]'
                      : ''
                  } ${dark ? card.darkClass : card.lightClass}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl shadow-sm md:h-12 md:w-12 ${card.iconClass}`}>
                    <Icon size={18} className="md:hidden" />
                    <Icon size={21} className="hidden md:block" />
                  </span>
                  <span className="min-w-0 flex-1 md:flex md:w-full md:flex-col">
                    <span className={`block text-[12px] font-extrabold leading-snug md:text-sm ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {card.label}
                    </span>
                    <strong className={`mt-0.5 block text-[16px] font-black leading-tight md:mt-2 md:text-lg ${card.valueClass || 'md:text-xl'}`}>
                      {card.value}
                    </strong>
                    <span className={`mt-1 block text-[13px] font-semibold leading-snug md:hidden ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {card.mobileDetail || card.detail}
                    </span>
                    <span className={`mt-2 hidden text-[15px] font-semibold leading-relaxed md:block ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {card.detail}
                    </span>
                    {Number.isFinite(card.progress) && (
                      <span className="mt-3 hidden md:block">
                        {card.progressLabel && (
                          <span className="mb-1.5 block text-right text-sm font-black">{card.progressLabel}</span>
                        )}
                        <span className={`block h-2.5 overflow-hidden rounded-full ${dark ? 'bg-slate-800' : 'bg-white'}`}>
                          <span
                            className={`block h-full rounded-full ${card.progressClass || 'bg-emerald-500'}`}
                            style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }}
                          />
                        </span>
                      </span>
                    )}
                    {card.meta && (
                      <span className={`mt-2 hidden text-[13px] leading-relaxed md:block ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {card.meta}
                      </span>
                    )}
                  </span>
                  {card.href && (
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-extrabold shadow-sm md:mt-auto md:h-auto md:w-auto md:px-3 md:py-2 ${
                      dark ? 'border-slate-700 bg-slate-900/80' : 'border-white bg-white/90'
                    } ${card.actionClass}`}>
                      <span className="hidden md:inline">{card.actionLabel || 'Подробнее'}</span>
                      <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
                    </span>
                  )}
                </CardTag>
              );
            })}
          </div>
        </section>

        <div id="parent-recordings" className="scroll-mt-24">
          <div className="md:hidden">
            <MobileDetailSection
              sectionId="parent-mobile-recordings"
              icon={FilePlay}
              title="Записи занятий"
              summary={latestReplayLesson
                ? `Последняя — ${formatDate(latestReplayLesson.dayKey)} · ${formatDuration(latestReplayLesson.replay.durationMs)}. Всего занятий: ${lessonPage.total}.`
                : `Записей пока нет. Занятий в архиве: ${lessonPage.total}.`}
              open={activeMobileSection === 'recordings'}
              onToggle={() => setActiveMobileSection((current) => (
                current === 'recordings' ? '' : 'recordings'
              ))}
              dark={dark}
              tone="violet"
            >
              {recentReplayLessons.length === 0 ? (
                <p className={`rounded-2xl border border-dashed p-3.5 text-sm leading-relaxed ${
                  dark ? 'border-slate-700 text-slate-400' : 'border-slate-300 bg-white text-slate-600'
                }`}>
                  Записей пока нет. Они появятся после завершённых занятий.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentReplayLessons.map((lesson) => (
                    <button
                      key={`mobile-replay-${lesson.key}`}
                      type="button"
                      onClick={() => openLesson(lesson)}
                      className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left shadow-sm ${
                        dark ? 'border-violet-900 bg-slate-900' : 'border-violet-200 bg-white'
                      }`}
                    >
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        dark ? 'bg-violet-950 text-violet-200' : 'bg-violet-600 text-white'
                      }`}><FilePlay size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm leading-tight">
                          {formatDate(lesson.dayKey, { year: true })} · {lesson.time || 'время не указано'}
                        </strong>
                        <span className={`mt-1 block truncate text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                          {lesson.topic?.text || lesson.subject || 'Материалы занятия'}
                        </span>
                        <span className={`mt-1 block text-xs font-bold ${dark ? 'text-violet-300' : 'text-violet-700'}`}>
                          Открыть запись · {formatDuration(lesson.replay.durationMs)}
                        </span>
                      </span>
                      <ArrowRight size={17} className={dark ? 'text-violet-300' : 'text-violet-700'} />
                    </button>
                  ))}
                </div>
              )}

              <details className={`group mt-3 overflow-hidden rounded-2xl border ${
                dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
              }`}>
                <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    dark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}><History size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm">Все прошедшие занятия</strong>
                    <span className={`mt-0.5 block text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {lessonPage.total > 0 ? `В архиве: ${lessonPage.total}` : 'Архив пока пуст'}
                    </span>
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold ${
                    dark ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    Показать
                    <ChevronDown size={16} className="transition group-open:rotate-180" />
                  </span>
                </summary>
                <div className={`border-t p-3 ${dark ? 'border-slate-700' : 'border-slate-200 bg-slate-50/60'}`}>
                  {lessons.length === 0 ? (
                    <p className={`rounded-2xl border border-dashed p-3.5 text-sm ${
                      dark ? 'border-slate-700 text-slate-400' : 'border-slate-300 bg-white text-slate-600'
                    }`}>
                      История появится после первого завершённого занятия.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {lessons.map((lesson) => {
                        const hasReplay = hasLessonReplay(lesson);
                        return (
                          <button
                            key={`mobile-lesson-${lesson.key}`}
                            type="button"
                            onClick={() => openLesson(lesson)}
                            className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${
                              dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
                            }`}
                          >
                            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                              hasReplay
                                ? (dark ? 'bg-violet-950 text-violet-200' : 'bg-violet-100 text-violet-700')
                                : (dark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600')
                            }`}>
                              {hasReplay ? <FilePlay size={18} /> : <School size={18} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <strong className="text-sm">{formatDate(lesson.dayKey, { year: true })}</strong>
                                <PaymentBadge status={lesson.payment?.status} dark={dark} />
                              </span>
                              <span className={`mt-1 block truncate text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                                {lesson.time || 'Время не указано'} · {lesson.topic?.text || lesson.subject || 'Материалы занятия'}
                              </span>
                              <span className={`mt-1 block text-xs font-bold ${dark ? 'text-violet-300' : 'text-violet-700'}`}>
                                {hasReplay ? 'Открыть запись и материалы' : 'Открыть материалы'}
                              </span>
                            </span>
                            <ArrowRight size={17} className={dark ? 'text-slate-400' : 'text-slate-500'} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {lessonPage.hasMore && (
                    <button
                      type="button"
                      onClick={loadMoreLessons}
                      disabled={loadingMoreLessons}
                      className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold disabled:opacity-60 ${
                        dark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {loadingMoreLessons ? <Loader2 size={16} className="animate-spin" /> : <History size={16} />}
                      {loadingMoreLessons ? 'Загружаем…' : 'Показать ещё занятия'}
                    </button>
                  )}
                </div>
              </details>
            </MobileDetailSection>
          </div>

          <section
          aria-labelledby="parent-recordings-title"
          className={`hidden rounded-[26px] border-2 p-4 shadow-[0_14px_35px_rgba(76,29,149,0.10)] md:block md:rounded-[30px] md:p-5 ${
            dark
              ? 'border-violet-900 bg-slate-900/90'
              : 'border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/70'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
              dark ? 'bg-violet-950 text-violet-200' : 'bg-violet-100 text-violet-700'
            }`}>
              <FilePlay size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="parent-recordings-title" className="text-lg font-black leading-tight md:text-xl">
                Записи занятий
              </h2>
              <p className={`mt-0.5 text-xs md:text-sm ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                Последние записи можно открыть сразу.
              </p>
            </div>
            <a
              href="#parent-lesson-history"
              className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-extrabold transition ${
                dark
                  ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                  : 'border-violet-200 bg-white text-violet-700 hover:border-violet-300'
              }`}
            >
              Все занятия
            </a>
          </div>

          {recentReplayLessons.length === 0 ? (
            <div className={`mt-3 rounded-2xl border border-dashed px-4 py-3 text-sm ${
              dark ? 'border-slate-700 text-slate-400' : 'border-slate-300 bg-white/70 text-slate-600'
            }`}>
              Записей пока нет. Они появятся здесь после занятий.
            </div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {recentReplayLessons.map((lesson) => (
                <button
                  key={`recent-replay-${lesson.key}`}
                  type="button"
                  onClick={() => openLesson(lesson)}
                  className={`group flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    dark
                      ? 'border-slate-700 bg-slate-950/50 hover:border-violet-700'
                      : 'border-white bg-white hover:border-violet-200'
                  }`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    dark ? 'bg-violet-950 text-violet-200' : 'bg-violet-600 text-white'
                  }`}>
                    <FilePlay size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm">
                      {formatDate(lesson.dayKey, { year: true })} · {lesson.time || 'время не указано'}
                    </strong>
                    <span className={`mt-0.5 block truncate text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {lesson.topic?.text || lesson.subject || 'Материалы занятия'}
                    </span>
                    <span className={`mt-1 block text-[11px] font-bold ${dark ? 'text-violet-300' : 'text-violet-700'}`}>
                      Запись {formatDuration(lesson.replay.durationMs)}
                    </span>
                  </span>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
                    dark ? 'border-slate-700 bg-slate-900 text-violet-300' : 'border-violet-100 bg-violet-50 text-violet-700'
                  }`}>
                    <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
          </section>
        </div>

        <div id="parent-schedule" className="scroll-mt-24">
          <div className="md:hidden">
            <MobileDetailSection
              sectionId="parent-mobile-schedule"
              icon={CalendarDays}
              title="Расписание"
              summary={nextLesson
                ? `Ближайшее — ${formatDate(nextLesson.day.dayKey)} в ${nextLesson.lesson.time || 'уточняем время'}. На этой неделе: ${mobileWeekLessons.length}.`
                : 'На ближайшие две недели занятий нет.'}
              open={activeMobileSection === 'schedule'}
              onToggle={() => setActiveMobileSection((current) => (
                current === 'schedule' ? '' : 'schedule'
              ))}
              dark={dark}
              tone="violet"
            >
              <div className={`rounded-2xl border-2 p-3.5 ${
                nextLesson
                  ? (dark ? 'border-violet-800 bg-violet-950/35' : 'border-violet-200 bg-violet-50')
                  : (dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white')
              }`}>
                <span className={`text-xs font-extrabold uppercase tracking-[0.08em] ${
                  dark ? 'text-violet-300' : 'text-violet-700'
                }`}>Ближайшее занятие</span>
                <strong className="mt-1.5 block text-base leading-tight">
                  {nextLesson
                    ? `${formatDate(nextLesson.day.dayKey)} в ${nextLesson.lesson.time || 'уточняем время'}`
                    : 'Занятий пока не запланировано'}
                </strong>
                {nextLesson && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={`min-w-0 truncate text-sm ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {nextLesson.lesson.subject || nextLesson.lesson.title || 'Занятие по информатике'}
                    </span>
                    <PaymentBadge status={nextLesson.lesson.paymentState?.status} dark={dark} />
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <strong className="text-sm">На этой неделе</strong>
                  <span className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {`${formatDate(week[0]?.dayKey, { short: true })} — ${formatDate(week[6]?.dayKey, { short: true })}`}
                  </span>
                </div>
                {mobileWeekLessons.length === 0 ? (
                  <p className={`rounded-2xl border border-dashed p-3.5 text-sm ${
                    dark ? 'border-slate-700 text-slate-400' : 'border-slate-300 bg-white text-slate-600'
                  }`}>
                    На этой неделе занятий нет.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {mobileWeekLessons.map(({ day, lesson }) => (
                      <article
                        key={`mobile-schedule-${day.dayKey}-${lesson.id || lesson.externalEventId || lesson.time}`}
                        className={`flex items-center gap-3 rounded-2xl border p-3 ${
                          day.isToday
                            ? (dark ? 'border-violet-700 bg-violet-950/30' : 'border-violet-300 bg-violet-50')
                            : (dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white')
                        }`}
                      >
                        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-center ${
                          day.isToday
                            ? (dark ? 'bg-violet-900 text-violet-100' : 'bg-violet-600 text-white')
                            : (dark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700')
                        }`}>
                          <span>
                            <strong className="block text-xs leading-none">{day.short}</strong>
                            <span className="mt-1 block text-[11px] leading-none">{day.date.getDate()}</span>
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block text-sm">{lesson.time || 'Время уточняется'}</strong>
                          <span className={`mt-0.5 block truncate text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                            {lesson.subject || lesson.title || 'Занятие по информатике'}
                          </span>
                        </span>
                        <PaymentBadge status={lesson.paymentState?.status} dark={dark} />
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </MobileDetailSection>
          </div>

          <section className={`hidden rounded-[32px] border-2 border-t-[6px] p-4 shadow-[0_18px_45px_rgba(76,29,149,0.12)] md:block md:p-6 ${
          dark
            ? 'border-slate-700 border-t-violet-500 bg-slate-900/90 shadow-black/25'
            : 'border-violet-200 border-t-violet-600 bg-gradient-to-br from-violet-50/70 via-white to-white'
        }`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <SectionHeading
              number="01"
              icon={CalendarDays}
              eyebrow="Сначала"
              title="Занятия и расписание"
              description="Сразу видно ближайшее занятие; ниже — вся текущая неделя."
              dark={dark}
              tone="violet"
            />
            <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              dark ? 'border-slate-700 bg-slate-950/50 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              {`${formatDate(week[0]?.dayKey, { short: true })} — ${formatDate(week[6]?.dayKey, { short: true })}`}
            </span>
          </div>

          <div className={`mb-5 flex flex-col gap-3 rounded-2xl border-2 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
            nextLesson
              ? (dark ? 'border-violet-800 bg-violet-950/40' : 'border-violet-200 bg-violet-50/80')
              : (dark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-slate-50')
          }`}>
            <div className="flex min-w-0 items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                dark ? 'bg-violet-900/70 text-violet-200' : 'bg-violet-600 text-white'
              }`}><CalendarDays size={18} /></span>
              <div className="min-w-0">
                <span className={`text-xs font-extrabold uppercase tracking-[0.1em] ${dark ? 'text-violet-300' : 'text-violet-700'}`}>
                  Ближайшее занятие
                </span>
                <strong className="mt-1 block text-base font-black">
                  {nextLesson
                    ? `${formatDate(nextLesson.day.dayKey)} в ${nextLesson.lesson.time || 'уточняем время'}`
                    : 'На ближайшие две недели занятий нет'}
                </strong>
                {nextLesson && (
                  <span className={`mt-1 block text-sm ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {nextLesson.lesson.subject || nextLesson.lesson.title || 'Занятие по информатике'}
                  </span>
                )}
              </div>
            </div>
            {nextLesson && <PaymentBadge status={nextLesson.lesson.paymentState?.status} dark={dark} />}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {week.map((day) => (
              <article key={day.dayKey} className={`min-h-[118px] rounded-2xl border-2 p-3.5 shadow-sm ${
                day.lessons.length === 0 && !day.isToday ? 'hidden lg:block' : ''
              } ${
                day.isToday
                  ? (dark ? 'border-violet-600 bg-violet-950/50' : 'border-violet-400 bg-violet-50')
                  : (dark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-slate-50/60')
              }`}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong className={`text-sm ${day.isToday ? 'text-violet-500' : ''}`}>{day.short}</strong>
                  <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-500'}`}>{day.date.getDate()}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {day.lessons.length === 0 ? (
                    <span className={`text-xs ${dark ? 'text-slate-600' : 'text-slate-400'}`}>Нет занятия</span>
                  ) : day.lessons.map((lesson) => (
                    <div key={`${lesson.id || lesson.externalEventId || 'lesson'}-${lesson.time}`} className={`rounded-xl border-2 px-2.5 py-2 ${
                      dark ? 'border-slate-700 bg-slate-900' : 'border-violet-100 bg-white shadow-sm'
                    }`}>
                      <strong className="block text-sm">{lesson.time || '—'}</strong>
                      <span className={`mt-0.5 block truncate text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {lesson.subject || lesson.title || 'Занятие по информатике'}
                      </span>
                      <div className="mt-1.5"><PaymentBadge status={lesson.paymentState?.status} dark={dark} /></div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          </section>
        </div>

        <div id="parent-results" className="scroll-mt-24">
          <div className="md:hidden">
            <MobileDetailSection
              sectionId="parent-mobile-results"
              icon={BarChart3}
              title="Пробники"
              summary={latestMockScore == null
                ? 'Завершённых пробников пока нет.'
                : `${latestMockScore} баллов за последний пробник${mockDelta == null || mockEntries.length <= 1
                  ? ' · это первый результат.'
                  : ` · ${mockDelta >= 0 ? 'рост' : 'снижение'} на ${Math.abs(mockDelta)}.`}`}
              open={activeMobileSection === 'results'}
              onToggle={() => setActiveMobileSection((current) => (
                current === 'results' ? '' : 'results'
              ))}
              dark={dark}
              tone="sky"
            >
              {recentMockEntries.length === 0 ? (
                <p className={`rounded-2xl border border-dashed p-3.5 text-sm leading-relaxed ${
                  dark ? 'border-slate-700 text-slate-400' : 'border-slate-300 bg-white text-slate-600'
                }`}>
                  После первого завершённого пробника здесь появится результат и его дата.
                </p>
              ) : (
                <>
                  <div className={`rounded-2xl border-2 p-3.5 ${
                    dark ? 'border-sky-900 bg-sky-950/25' : 'border-sky-200 bg-sky-50'
                  }`}>
                    <span className={`text-xs font-extrabold uppercase tracking-[0.08em] ${
                      dark ? 'text-sky-300' : 'text-sky-700'
                    }`}>Что изменилось</span>
                    <strong className="mt-1.5 block text-base leading-tight">
                      {mockEntries.length <= 1 || mockDelta == null
                        ? 'Это первый результат — сравнение появится после следующего пробника.'
                        : `${mockDelta >= 0 ? 'Результат вырос' : 'Результат снизился'} на ${Math.abs(mockDelta)} баллов от первого пробника.`}
                    </strong>
                  </div>
                  <div className="mt-3 space-y-2">
                    <strong className="block text-sm">Последние результаты</strong>
                    {recentMockEntries.map((entry, index) => (
                      <article
                        key={`mobile-mock-${entry.id || entry.date || index}`}
                        className={`flex items-center gap-3 rounded-2xl border p-3 ${
                          dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <span className={`grid h-11 min-w-11 shrink-0 place-items-center rounded-xl px-2 font-black ${
                          dark ? 'bg-sky-950 text-sky-200' : 'bg-sky-100 text-sky-800'
                        }`}>
                          {Number(entry.score) || 0}
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm">{entry.title || 'Пробник'}</strong>
                          <span className={`mt-1 block text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                            {formatDate(entry.date, { year: true })} · {Number(entry.score) || 0} баллов
                          </span>
                        </span>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </MobileDetailSection>
          </div>

          <section className={`hidden rounded-[32px] border-2 border-t-[6px] p-4 shadow-[0_18px_45px_rgba(3,105,161,0.12)] md:block md:p-6 ${
          dark
            ? 'border-slate-700 border-t-sky-500 bg-slate-900/90 shadow-black/25'
            : 'border-sky-200 border-t-sky-600 bg-gradient-to-br from-sky-50/70 via-white to-white'
        }`}>
          <SectionHeading
            number="02"
            icon={BarChart3}
            eyebrow="Затем"
            title="Результаты пробников"
            description="Главный вывод — сверху; график ниже показывает, как менялся результат."
            dark={dark}
            tone="sky"
          />
          <div className={`mb-5 flex flex-col gap-2 rounded-2xl border-2 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
            dark ? 'border-sky-900 bg-sky-950/25' : 'border-sky-200 bg-sky-50/70'
          }`}>
            <div>
              <span className={`text-xs font-extrabold uppercase tracking-[0.1em] ${dark ? 'text-sky-300' : 'text-sky-700'}`}>
                Коротко о результате
              </span>
              <strong className="mt-1 block text-base font-black">
                {latestMockScore == null
                  ? 'Завершённых пробников пока нет'
                  : `Последний результат — ${latestMockScore} баллов`}
              </strong>
            </div>
            {mockDelta != null && (
              <span className={`self-start rounded-full px-3 py-1.5 text-xs font-extrabold sm:self-center ${
                mockDelta >= 0
                  ? (dark ? 'bg-emerald-950/60 text-emerald-200' : 'bg-emerald-100 text-emerald-800')
                  : (dark ? 'bg-amber-950/60 text-amber-200' : 'bg-amber-100 text-amber-800')
              }`}>
                {`${mockDelta >= 0 ? '+' : ''}${mockDelta} от первого результата`}
              </span>
            )}
          </div>
          <MockExamProgressChart entries={mockEntries} dark={dark} role="parent" />
          </section>
        </div>

        <div id="parent-homework" className="scroll-mt-24">
          <div className="md:hidden">
            <MobileDetailSection
              sectionId="parent-mobile-homework"
              icon={CheckCircle2}
              title="Домашняя работа"
              summary={!currentHomeworkEntry
                ? 'Новых заданий сейчас нет.'
                : `${currentHomeworkEntry.isOverdue ? 'Просрочена' : 'Текущая'} · выполнено ${currentHomeworkPercent}%${
                  currentHomeworkEntry.dueAt && !currentHomeworkEntry.isOverdue
                    ? ` · до ${formatDate(currentHomeworkEntry.dueAt, { short: true })}`
                    : ''
                }.`}
              open={activeMobileSection === 'homework'}
              onToggle={() => setActiveMobileSection((current) => (
                current === 'homework' ? '' : 'homework'
              ))}
              dark={dark}
              tone="emerald"
            >
              {currentHomeworkEntry ? (
                <div className={`rounded-2xl border-2 p-3.5 ${
                  currentHomeworkTone === 'danger'
                    ? (dark ? 'border-rose-800 bg-rose-950/30' : 'border-rose-300 bg-rose-50')
                    : currentHomeworkTone === 'warning'
                      ? (dark ? 'border-amber-800 bg-amber-950/30' : 'border-amber-300 bg-amber-50')
                      : (dark ? 'border-violet-800 bg-violet-950/25' : 'border-violet-200 bg-violet-50')
                }`}>
                  <span className={`text-xs font-extrabold uppercase tracking-[0.08em] ${
                    dark ? 'text-slate-300' : 'text-slate-600'
                  }`}>Текущая работа</span>
                  <strong className="mt-1.5 block text-base leading-tight">
                    {getHomeworkDisplayTitle(currentHomeworkEntry)}
                  </strong>
                  <p className={`mt-1.5 text-sm font-semibold leading-relaxed ${
                    dark ? 'text-slate-300' : 'text-slate-700'
                  }`}>
                    {currentHomeworkProgressText}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className={`h-2.5 flex-1 overflow-hidden rounded-full ${dark ? 'bg-slate-800' : 'bg-white'}`}>
                      <div
                        className={`h-full rounded-full ${
                          currentHomeworkTone === 'danger'
                            ? 'bg-rose-500'
                            : currentHomeworkTone === 'warning'
                              ? 'bg-amber-500'
                              : currentHomeworkTone === 'success'
                                ? 'bg-emerald-500'
                                : 'bg-violet-500'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, currentHomeworkPercent))}%` }}
                      />
                    </div>
                    <strong className="text-sm">{currentHomeworkPercent}%</strong>
                  </div>
                  {currentHomeworkEntry.dueAt && (
                    <span className={`mt-2 block text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {currentHomeworkEntry.isOverdue
                        ? `Срок был ${formatDate(currentHomeworkEntry.dueAt)}`
                        : `Сдать до ${formatDate(currentHomeworkEntry.dueAt)}`}
                    </span>
                  )}
                </div>
              ) : (
                <p className={`rounded-2xl border border-dashed p-3.5 text-sm ${
                  dark ? 'border-slate-700 text-slate-400' : 'border-slate-300 bg-white text-slate-600'
                }`}>
                  Новых заданий сейчас нет.
                </p>
              )}

              <div className={`mt-3 rounded-2xl border-2 p-3.5 ${
                dark ? 'border-emerald-900 bg-emerald-950/20' : 'border-emerald-200 bg-emerald-50'
              }`}>
                <span className={`text-xs font-extrabold uppercase tracking-[0.08em] ${
                  dark ? 'text-emerald-300' : 'text-emerald-700'
                }`}>Как делает домашнюю работу</span>
                <strong className="mt-1.5 block text-base">{homeworkHabit}</strong>
                <p className={`mt-1.5 text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {hasEnoughHomeworkHistory
                    ? `${homeworkAverageExplanation} ${homeworkCompletionExplanation}`.trim()
                    : `Вывод появится после трёх выданных работ. Сейчас выдано: ${homeworkEntries.length}.`}
                </p>
                <span className={`mt-2 block text-[11px] ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
                  В общий процент входят выполненные работы и работы после срока, выданные с 29 июня 2026 года.
                </span>
              </div>

              <div className="mt-3">
                <strong className="mb-2 block text-sm">Последние работы</strong>
                {mobileHomeworkEntries.length === 0 ? (
                  <p className={`rounded-2xl border border-dashed p-3.5 text-sm ${
                    dark ? 'border-slate-700 text-slate-400' : 'border-slate-300 bg-white text-slate-600'
                  }`}>
                    Домашних работ с 29 июня пока нет.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {mobileHomeworkEntries.map((entry) => (
                      <details key={`mobile-homework-${entry.id}`} className={`group overflow-hidden rounded-2xl border-2 ${
                        entry.isOverdue
                          ? (dark ? 'border-rose-900 bg-rose-950/20' : 'border-rose-200 bg-white')
                          : Number(entry.percent) >= 100
                            ? (dark ? 'border-emerald-900 bg-emerald-950/20' : 'border-emerald-200 bg-white')
                            : (dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white')
                      }`}>
                        <summary className="flex cursor-pointer list-none items-center gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400">
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <strong className="text-sm leading-tight">{getHomeworkDisplayTitle(entry)}</strong>
                              {(entry.isLatest || entry.id === currentHomeworkEntry?.id) && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                                  dark ? 'bg-violet-950 text-violet-200' : 'bg-violet-100 text-violet-700'
                                }`}>Текущая</span>
                              )}
                              {entry.isOverdue && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                                  dark ? 'bg-rose-950 text-rose-200' : 'bg-rose-100 text-rose-700'
                                }`}>Просрочена</span>
                              )}
                            </span>
                            <span className={`mt-1.5 block text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                              {getHomeworkStatusLabel(entry, entry.isLatest || entry.id === currentHomeworkEntry?.id)} · {Number(entry.percent) || 0}%
                              {entry.dueAt ? ` · срок ${formatDate(entry.dueAt, { short: true })}` : ''}
                            </span>
                          </span>
                          <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold ${
                            dark ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            Подробнее
                            <ChevronDown size={16} className="transition group-open:rotate-180" />
                          </span>
                        </summary>
                        <div className={`border-t p-3 ${dark ? 'border-slate-700' : 'border-slate-200 bg-slate-50/60'}`}>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              ['Выполнено', entry.completedCount, 'text-emerald-500'],
                              ['Исправлено', entry.withErrorsCount, 'text-amber-500'],
                              ['Неверно', entry.wrongCount, 'text-rose-500'],
                              ['Не начато', entry.untouchedCount, dark ? 'text-slate-400' : 'text-slate-600'],
                            ].map(([label, value, tone]) => (
                              <div key={label} className={`rounded-xl border p-2.5 ${dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                                <strong className={`block text-lg ${tone}`}>{Number(value) || 0}</strong>
                                <span className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
                {orderedHomeworkEntries.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllHomework((current) => !current)}
                    aria-expanded={showAllHomework}
                    className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
                      dark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <ChevronDown size={17} className={`transition ${showAllHomework ? 'rotate-180' : ''}`} />
                    {showAllHomework
                      ? 'Скрыть старые работы'
                      : `Показать ещё ${orderedHomeworkEntries.length - 3}`}
                  </button>
                )}
              </div>
            </MobileDetailSection>
          </div>

          <section className={`hidden rounded-[32px] border-2 border-t-[6px] p-4 shadow-[0_18px_45px_rgba(4,120,87,0.12)] md:block md:p-6 ${
          dark
            ? 'border-slate-700 border-t-emerald-500 bg-slate-900/90 shadow-black/25'
            : 'border-emerald-200 border-t-emerald-600 bg-gradient-to-br from-emerald-50/70 via-white to-white'
        }`}>
          <SectionHeading
            number="03"
            icon={CheckCircle2}
            eyebrow="И последнее"
            title="Домашняя работа"
            description="Учитываются выполненные работы и работы после срока, выданные с 29 июня 2026 года."
            dark={dark}
            tone="emerald"
          />
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: 'Среднее выполнение',
                value: `${Number(homeworkSummary.averagePercent) || 0}%`,
                className: dark
                  ? 'border-violet-800 bg-violet-950/40'
                  : 'border-violet-200 bg-violet-50',
              },
              {
                label: 'Полностью выполнено',
                value: Number(homeworkSummary.fullyCompletedCount) || 0,
                className: dark
                  ? 'border-emerald-800 bg-emerald-950/40'
                  : 'border-emerald-200 bg-emerald-50',
              },
              {
                label: 'Не завершено',
                value: Number(homeworkSummary.incompleteCount) || 0,
                className: dark
                  ? 'border-amber-800 bg-amber-950/40'
                  : 'border-amber-200 bg-amber-50',
              },
              {
                label: 'С ошибками',
                value: Number(homeworkSummary.withErrorsCount) || 0,
                className: dark
                  ? 'border-rose-800 bg-rose-950/40'
                  : 'border-rose-200 bg-rose-50',
              },
            ].map(({ label, value, className }) => (
              <div key={label} className={`rounded-2xl border-2 px-3.5 py-3.5 shadow-sm ${className}`}>
                <span className={`text-xs font-bold leading-tight ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
                <strong className="mt-1 block text-xl font-black">{value}</strong>
              </div>
            ))}
          </div>
          {homeworkEntries.length === 0 ? (
            <div className={`rounded-2xl border border-dashed p-5 text-center text-sm ${
              dark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'
            }`}>Домашних работ с 29 июня 2026 года пока нет.</div>
          ) : (
            <div className="space-y-3">
              {visibleHomeworkEntries.map((entry) => (
                <details key={entry.id} className={`group rounded-2xl border-2 border-l-4 shadow-sm transition hover:shadow-md ${
                  entry.isOverdue
                    ? (dark
                      ? 'border-rose-900 border-l-rose-500 bg-rose-950/20'
                      : 'border-rose-200 border-l-rose-500 bg-white')
                    : Number(entry.percent) >= 100
                      ? (dark
                        ? 'border-emerald-900 border-l-emerald-500 bg-emerald-950/20'
                        : 'border-emerald-200 border-l-emerald-500 bg-white')
                      : (dark
                        ? 'border-slate-700 border-l-violet-500 bg-slate-950/60'
                        : 'border-slate-200 border-l-violet-500 bg-white')
                }`}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="truncate text-sm">{getHomeworkDisplayTitle(entry)}</strong>
                        {(entry.isLatest || entry.id === currentHomeworkEntry?.id) && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            dark ? 'bg-violet-950 text-violet-200' : 'bg-violet-100 text-violet-700'
                          }`}>Текущая</span>
                        )}
                        {entry.isOverdue && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            dark ? 'bg-rose-950 text-rose-200' : 'bg-rose-100 text-rose-700'
                          }`}>Просрочена</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className={`h-2.5 flex-1 overflow-hidden rounded-full ${dark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                          <div className={`h-full rounded-full ${
                            Number(entry.percent) >= 100 ? 'bg-emerald-500' : Number(entry.percent) > 0 ? 'bg-violet-500' : 'bg-slate-300'
                          }`} style={{ width: `${Number(entry.percent) || 0}%` }} />
                        </div>
                        <strong className="w-10 text-right text-xs">{entry.percent == null ? '—' : `${entry.percent}%`}</strong>
                      </div>
                      <span className={`mt-1.5 block text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {`${getHomeworkStatusLabel(
                          entry,
                          entry.isLatest || entry.id === currentHomeworkEntry?.id,
                        )} · ${
                          entry.dueAt
                            ? `срок ${formatDate(entry.dueAt, { short: true })}`
                            : `выдано ${formatDate(entry.issuedAt, { short: true })}`
                        }`}
                      </span>
                    </div>
                    <span className={`hidden text-xs font-bold sm:inline ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Подробнее</span>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
                      dark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}>
                      <ChevronDown size={17} className="transition group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className={`border-t p-3.5 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ['Выполнено', entry.completedCount, 'text-emerald-500'],
                        ['После ошибок', entry.withErrorsCount, 'text-amber-500'],
                        ['Неверно', entry.wrongCount, 'text-rose-500'],
                        ['Не начато', entry.untouchedCount, dark ? 'text-slate-400' : 'text-slate-500'],
                      ].map(([label, value, tone]) => (
                        <div key={label} className={`rounded-xl border px-2.5 py-2 ${dark ? 'border-slate-700' : 'border-slate-200 bg-white'}`}>
                          <strong className={`block text-lg ${tone}`}>{Number(value) || 0}</strong>
                          <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-500'}`}>{label}</span>
                        </div>
                      ))}
                    </div>
                    {(entry.goals || []).length > 0 && (
                      <div className="mt-3 space-y-2">
                        {entry.goals.map((goal) => (
                          <div key={goal.id}>
                            <strong className="text-xs">{goal.label}</strong>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {(goal.items || []).map((item) => (
                                <span key={item.id} className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${
                                  item.state === 'clean'
                                    ? (dark ? 'border-emerald-800 bg-emerald-950/50 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700')
                                    : item.state === 'with-errors'
                                      ? (dark ? 'border-amber-800 bg-amber-950/50 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-700')
                                      : item.state === 'wrong'
                                        ? (dark ? 'border-rose-800 bg-rose-950/50 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-700')
                                        : (dark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-white text-slate-500')
                                }`} title={HOMEWORK_ITEM_LABELS[item.state] || ''}>
                                  {item.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              ))}
              {orderedHomeworkEntries.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllHomework((current) => !current)}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition ${
                    dark
                      ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                  }`}
                  aria-expanded={showAllHomework}
                >
                  <ChevronDown size={17} className={`transition ${showAllHomework ? 'rotate-180' : ''}`} />
                  {showAllHomework
                    ? 'Скрыть старые работы'
                    : `Показать ещё ${orderedHomeworkEntries.length - 5}`}
                </button>
              )}
            </div>
          )}
          </section>
        </div>

        <section id="parent-lesson-history" className={`hidden scroll-mt-24 overflow-hidden rounded-[28px] border border-dashed md:block ${
          dark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-300 bg-white/70'
        }`} aria-label="Дополнительная информация">
          <details className="group/archive">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 sm:p-5">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                dark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
              }`}><History size={20} /></span>
              <div className="min-w-0 flex-1">
                <span className={`text-xs font-extrabold uppercase tracking-[0.12em] ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
                  Дополнительно · при необходимости
                </span>
                <h2 className="mt-1 text-base font-black sm:text-lg">Все занятия и записи</h2>
                <p className={`mt-1 text-xs sm:text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {`${lessonPage.total} занятий в архиве · за месяц ${finance.completedLessons || 0} занятий`}
                </p>
              </div>
              <ChevronDown size={20} className={`shrink-0 transition group-open/archive:rotate-180 ${dark ? 'text-slate-500' : 'text-slate-400'}`} />
            </summary>
            <div className={`border-t p-4 sm:p-5 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
          {lessons.length === 0 ? (
            <div className={`rounded-2xl border border-dashed p-5 text-center text-sm ${dark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
              История появится после первого завершённого занятия.
            </div>
          ) : (
            <div className="space-y-2">
              {lessons.map((lesson) => {
                const hasReplay = hasLessonReplay(lesson);
                return (
                  <details key={lesson.key} className={`group/lesson rounded-2xl border ${
                    dark ? 'border-slate-700 bg-slate-950/30' : 'border-slate-200 bg-slate-50/50'
                  }`}>
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        hasReplay
                          ? (dark ? 'bg-violet-950 text-violet-200' : 'bg-violet-100 text-violet-700')
                          : (dark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500')
                      }`}>
                        {hasReplay ? <FilePlay size={18} /> : <School size={18} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm">{formatDate(lesson.dayKey, { year: true })}</strong>
                          <PaymentBadge status={lesson.payment?.status} dark={dark} />
                        </div>
                        <span className={`mt-1 block truncate text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {`${lesson.time || 'Время не указано'} · ${lesson.topic?.text || lesson.subject || 'Тема не сохранилась'}`}
                        </span>
                      </div>
                      {hasReplay && (
                        <span className={`hidden items-center gap-1 text-[10px] font-extrabold sm:inline-flex ${dark ? 'text-violet-300' : 'text-violet-600'}`}>
                          <Sparkles size={12} /> Запись
                        </span>
                      )}
                      <ChevronDown size={18} className={`shrink-0 transition group-open/lesson:rotate-180 ${dark ? 'text-slate-500' : 'text-slate-400'}`} />
                    </summary>
                    <div className={`border-t p-3.5 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className={`rounded-xl border px-3 py-2 ${dark ? 'border-slate-700' : 'border-slate-200 bg-white'}`}>
                          <span className={`flex items-center gap-1 text-[10px] ${dark ? 'text-slate-500' : 'text-slate-500'}`}><Clock3 size={12} /> Продолжительность</span>
                          <strong className="mt-1 block text-sm">{`${lesson.durationMinutes || 60} мин`}</strong>
                        </div>
                        <div className={`rounded-xl border px-3 py-2 ${dark ? 'border-slate-700' : 'border-slate-200 bg-white'}`}>
                          <span className={`flex items-center gap-1 text-[10px] ${dark ? 'text-slate-500' : 'text-slate-500'}`}><CreditCard size={12} /> Оплата</span>
                          <strong className="mt-1 block text-sm">{lesson.payment?.amount > 0 ? formatMoney(lesson.payment.amount) : PAYMENT_META[lesson.payment?.status]?.label || 'Статус не указан'}</strong>
                        </div>
                        <div className={`rounded-xl border px-3 py-2 ${dark ? 'border-slate-700' : 'border-slate-200 bg-white'}`}>
                          <span className={`flex items-center gap-1 text-[10px] ${dark ? 'text-slate-500' : 'text-slate-500'}`}><FilePlay size={12} /> Запись</span>
                          <strong className="mt-1 block text-sm">{hasReplay ? formatDuration(lesson.replay.durationMs) : 'Нет записи'}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openLesson(lesson)}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
                      >
                        {hasReplay ? <FilePlay size={16} /> : <School size={16} />}
                        {hasReplay ? 'Открыть запись и материалы' : 'Открыть материалы занятия'}
                      </button>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
          {lessonPage.hasMore && (
            <button
              type="button"
              onClick={loadMoreLessons}
              disabled={loadingMoreLessons}
              className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                dark ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
              }`}
            >
              {loadingMoreLessons ? <Loader2 size={16} className="animate-spin" /> : <History size={16} />}
              {loadingMoreLessons ? 'Загружаем…' : 'Показать ещё занятия'}
            </button>
          )}
            </div>
          </details>
        </section>
      </main>

      <StudentLessonDetailModal
        open={detailState.open}
        lesson={detailState.data?.lesson || detailState.lesson}
        materials={detailState.data?.materials || []}
        replay={detailState.data?.replay || null}
        topicText={detailState.data?.lesson?.topic?.text || detailState.lesson?.topic?.text || ''}
        loading={detailState.loading}
        error={detailState.error}
        studentId={student.id}
        onClose={() => setDetailState({ open: false, lesson: null, data: null, loading: false, error: '' })}
        onRetry={() => openLesson(detailState.lesson)}
      />
    </div>
  );
};

export default ParentDashboard;
