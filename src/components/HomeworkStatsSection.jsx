import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  Info,
  ListChecks,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  HOMEWORK_STAT_STATE,
  buildHomeworkStatistics,
  summarizeHomeworkStatistics,
} from '../utils/homeworkStats';
import { buildMockExamProgressEntries } from '../utils/mockExamProgress';
import MockExamProgressChart from './MockExamProgressChart';

const STATE_META = {
  [HOMEWORK_STAT_STATE.CLEAN]: {
    label: 'Верно сразу',
    shortLabel: 'Сразу верно',
    dotClass: 'bg-emerald-500',
    chipClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    darkChipClass: 'border-emerald-700/70 bg-emerald-950/55 text-emerald-200',
    icon: CheckCircle2,
  },
  [HOMEWORK_STAT_STATE.COMPLETED]: {
    label: 'Пробник завершён',
    shortLabel: 'Завершено',
    dotClass: 'bg-emerald-500',
    chipClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    darkChipClass: 'border-emerald-700/70 bg-emerald-950/55 text-emerald-200',
    icon: CheckCircle2,
  },
  [HOMEWORK_STAT_STATE.WITH_ERRORS]: {
    label: 'Решено после ошибок',
    shortLabel: 'После ошибок',
    dotClass: 'bg-amber-400',
    chipClass: 'border-amber-200 bg-amber-50 text-amber-700',
    darkChipClass: 'border-amber-700/70 bg-amber-950/55 text-amber-200',
    icon: AlertTriangle,
  },
  [HOMEWORK_STAT_STATE.WRONG]: {
    label: 'Есть неверные попытки',
    shortLabel: 'Пока неверно',
    dotClass: 'bg-rose-500',
    chipClass: 'border-rose-200 bg-rose-50 text-rose-700',
    darkChipClass: 'border-rose-700/70 bg-rose-950/55 text-rose-200',
    icon: AlertTriangle,
  },
  [HOMEWORK_STAT_STATE.UNTOUCHED]: {
    label: 'Не приступал',
    shortLabel: 'Не начато',
    dotClass: 'bg-slate-200',
    chipClass: 'border-slate-200 bg-slate-50 text-slate-600',
    darkChipClass: 'border-slate-700 bg-slate-800/80 text-slate-300',
    icon: CircleDashed,
  },
};

const STATUS_META = {
  excellent: {
    label: 'Всё сделано',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    darkClassName: 'border-emerald-700/70 bg-emerald-950/55 text-emerald-200',
    icon: Sparkles,
  },
  complete: {
    label: 'Выполнено с ошибками',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    darkClassName: 'border-amber-700/70 bg-amber-950/55 text-amber-200',
    icon: CheckCircle2,
  },
  attention: {
    label: 'Нужна проверка',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    darkClassName: 'border-rose-700/70 bg-rose-950/55 text-rose-200',
    icon: AlertTriangle,
  },
  'in-progress': {
    label: 'В работе',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    darkClassName: 'border-sky-700/70 bg-sky-950/55 text-sky-200',
    icon: Target,
  },
  'not-started': {
    label: 'Не начато',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    darkClassName: 'border-slate-700 bg-slate-800/80 text-slate-300',
    icon: CircleDashed,
  },
  'no-data': {
    label: 'Нет измеримых заданий',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    darkClassName: 'border-slate-700 bg-slate-800/80 text-slate-300',
    icon: CircleDashed,
  },
};

const formatDate = (value, options = {}) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: options.short ? 'short' : 'long',
    ...(options.year ? { year: 'numeric' } : {}),
  }).replace(' г.', '');
};

const formatCompactDate = (value, withYear = false) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: '2-digit' } : {}),
  });
};

const getHomeworkCountLabel = (count) => {
  const value = Math.max(0, Math.round(Number(count) || 0));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} домашняя работа`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${value} домашние работы`;
  }
  return `${value} домашних работ`;
};

const getTaskCountLabel = (count) => {
  const value = Math.max(0, Math.round(Number(count) || 0));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} задание`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${value} задания`;
  }
  return `${value} заданий`;
};

const isSingularCount = (count) => {
  const value = Math.max(0, Math.round(Number(count) || 0));
  return value % 10 === 1 && value % 100 !== 11;
};

const getLatestHomeworkMessage = (entry, role) => {
  if (!entry || entry.totalCount <= 0) {
    return role === 'teacher'
      ? 'В этой работе нет заданий, которые можно проверить автоматически.'
      : 'Здесь пока нет заданий с автоматической проверкой.';
  }
  if (entry.percent === 100 && entry.withErrorsCount === 0) {
    return role === 'teacher'
      ? 'Работа выполнена полностью и без исправлений.'
      : 'Всё выполнено — и с первой попытки.';
  }
  if (entry.percent === 100) {
    return role === 'teacher'
      ? `Работа закрыта полностью, ${getTaskCountLabel(entry.withErrorsCount)} ${isSingularCount(entry.withErrorsCount) ? 'потребовало' : 'потребовали'} исправления.`
      : `Всё готово. После ошибок исправлено: ${getTaskCountLabel(entry.withErrorsCount)}.`;
  }
  if (entry.wrongCount > 0) {
    return role === 'teacher'
      ? `Сейчас ${getTaskCountLabel(entry.wrongCount)} ${isSingularCount(entry.wrongCount) ? 'ждёт' : 'ждут'} исправления.`
      : `Вернись к заданиям с ошибками: ${getTaskCountLabel(entry.wrongCount)}.`;
  }
  const remainingCount = Math.max(0, entry.totalCount - entry.completedCount);
  return role === 'teacher'
    ? `До завершения осталось ${getTaskCountLabel(remainingCount)}.`
    : `Следующий шаг — выполнить ещё ${getTaskCountLabel(remainingCount)}.`;
};

const summarizeGoal = (goal) => {
  const items = Array.isArray(goal?.items) ? goal.items : [];
  const completedCount = items.filter((item) => (
    item.state === HOMEWORK_STAT_STATE.CLEAN
    || item.state === HOMEWORK_STAT_STATE.COMPLETED
    || item.state === HOMEWORK_STAT_STATE.WITH_ERRORS
  )).length;
  return {
    totalCount: items.length,
    completedCount,
    percent: items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0,
  };
};

const DetailStateGroup = ({ state, items, dark }) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <div className={`rounded-2xl border p-3 ${
      dark ? 'border-slate-700/80 bg-slate-900/55' : 'border-slate-200/80 bg-white/80'
    }`}>
      <div className={`flex items-center justify-between gap-2 text-xs font-bold ${
        dark ? 'text-slate-200' : 'text-slate-700'
      }`}>
        <span className="inline-flex items-center gap-1.5">
          <Icon size={14} className={
            state === HOMEWORK_STAT_STATE.CLEAN || state === HOMEWORK_STAT_STATE.COMPLETED
              ? 'text-emerald-500'
              : state === HOMEWORK_STAT_STATE.WITH_ERRORS
                ? 'text-amber-500'
                : state === HOMEWORK_STAT_STATE.WRONG
                  ? 'text-rose-500'
                  : 'text-slate-400'
          } />
          {meta.label}
        </span>
        <span className={dark ? 'text-slate-400' : 'text-slate-500'}>{items.length}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.id}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold ${
              dark ? meta.darkChipClass : meta.chipClass
            }`}
            title={item.wrongCount > 0
              ? `${item.label}: неверных попыток — ${item.wrongCount}`
              : item.label}
          >
            {item.label}
            {item.wrongCount > 0 && (
              <small className="font-black opacity-75">{`×${item.wrongCount}`}</small>
            )}
            {item.completedLate && (
              <Clock3 size={10} aria-label="Выполнено после срока" />
            )}
          </span>
        ))}
      </div>
    </div>
  );
};

const HomeworkStatsSection = ({
  homeworks = [],
  studentData = {},
  testsDb = null,
  mockExams = [],
  mockAttemptsByExam = {},
  role = 'student',
  theme = '',
}) => {
  const dark = String(theme || '').trim().toLowerCase() === 'dark';
  const chartRef = useRef(null);
  const detailRef = useRef(null);
  const homeworkButtonRefs = useRef(new Map());
  const [referenceNowMs] = useState(() => Date.now());
  const statistics = useMemo(() => buildHomeworkStatistics({
    homeworks,
    studentData,
    testsDb: testsDb || {},
    mockExams,
    mockAttemptsByExam,
    nowMs: referenceNowMs,
  }), [homeworks, mockAttemptsByExam, mockExams, referenceNowMs, studentData, testsDb]);
  const mockExamProgressEntries = useMemo(() => buildMockExamProgressEntries({
    studentData,
    mockExams,
    mockAttemptsByExam,
  }), [mockAttemptsByExam, mockExams, studentData]);
  const yearOptions = useMemo(() => {
    const byKey = new Map();
    statistics.forEach((entry) => {
      if (entry.academicYear?.key) byKey.set(entry.academicYear.key, entry.academicYear);
    });
    mockExamProgressEntries.forEach((entry) => {
      if (entry.academicYear?.key) byKey.set(entry.academicYear.key, entry.academicYear);
    });
    return Array.from(byKey.values()).sort((left, right) => right.startYear - left.startYear);
  }, [mockExamProgressEntries, statistics]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedHomeworkId, setSelectedHomeworkId] = useState('');
  const resolvedSelectedYear = (
    selectedYear === 'all' || yearOptions.some((year) => year.key === selectedYear)
      ? selectedYear
      : (yearOptions[0]?.key || '')
  );

  const filteredStatistics = useMemo(() => (
    resolvedSelectedYear === 'all' || !resolvedSelectedYear
      ? statistics
      : statistics.filter((entry) => entry.academicYear?.key === resolvedSelectedYear)
  ), [resolvedSelectedYear, statistics]);
  const filteredMockExamProgressEntries = useMemo(() => (
    resolvedSelectedYear === 'all' || !resolvedSelectedYear
      ? mockExamProgressEntries
      : mockExamProgressEntries.filter((entry) => (
          entry.academicYear?.key === resolvedSelectedYear
        ))
  ), [mockExamProgressEntries, resolvedSelectedYear]);
  const selectedAcademicYear = resolvedSelectedYear === 'all'
    ? null
    : yearOptions.find((year) => year.key === resolvedSelectedYear) || null;
  const summary = useMemo(
    () => summarizeHomeworkStatistics(filteredStatistics),
    [filteredStatistics]
  );

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (chartRef.current) chartRef.current.scrollLeft = chartRef.current.scrollWidth;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [filteredStatistics]);

  const selectedHomework = filteredStatistics.find((entry) => entry.id === selectedHomeworkId)
    || filteredStatistics[filteredStatistics.length - 1]
    || null;
  const latestHomework = filteredStatistics[filteredStatistics.length - 1] || null;
  const selectedHomeworkIndex = selectedHomework
    ? filteredStatistics.findIndex((entry) => entry.id === selectedHomework.id)
    : -1;
  const estimatedHistory = filteredStatistics.some((entry) => entry.estimated);
  const showMethodNote = estimatedHistory || filteredStatistics.length > 1;
  const trendPositive = summary.trend >= 0;
  const TrendIcon = trendPositive ? TrendingUp : TrendingDown;
  const selectHomework = (entry, { focusButton = false, revealDetails = false } = {}) => {
    if (!entry) return;
    setSelectedHomeworkId(entry.id);
    window.requestAnimationFrame(() => {
      const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth';
      const button = homeworkButtonRefs.current.get(entry.id);
      button?.scrollIntoView({ behavior: scrollBehavior, block: 'nearest', inline: 'center' });
      if (focusButton) button?.focus({ preventScroll: true });
      if (revealDetails && window.matchMedia('(max-width: 767px)').matches) {
        detailRef.current?.scrollIntoView({ behavior: scrollBehavior, block: 'start' });
      }
    });
  };
  const handleTimelineKeyDown = (event, entryIndex) => {
    let nextIndex = null;
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, entryIndex - 1);
    if (event.key === 'ArrowRight') {
      nextIndex = Math.min(filteredStatistics.length - 1, entryIndex + 1);
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = filteredStatistics.length - 1;
    if (nextIndex == null || nextIndex === entryIndex) return;
    event.preventDefault();
    selectHomework(filteredStatistics[nextIndex], { focusButton: true });
  };

  const hasHomeworkHistory = Array.isArray(homeworks) && homeworks.length > 0;

  if (!hasHomeworkHistory && mockExamProgressEntries.length === 0) {
    return (
      <section className={`rounded-[28px] border p-6 text-center shadow-sm ${
        dark
          ? 'border-slate-700 bg-slate-900/75 text-slate-300'
          : 'border-slate-200 bg-white/90 text-slate-600'
      }`}>
        <span className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${
          dark ? 'bg-slate-800 text-slate-400' : 'bg-purple-50 text-purple-500'
        }`}>
          <BarChart3 size={22} />
        </span>
        <h3 className={`mt-3 text-base font-black ${dark ? 'text-white' : 'text-slate-900'}`}>
          Статистика появится после первой домашней работы
        </h3>
        <p className="mx-auto mt-1 max-w-lg text-sm">
          Здесь будет хронология, процент выполнения и задания, в которых были ошибки.
        </p>
      </section>
    );
  }

  if (testsDb == null) {
    return (
      <section className={`rounded-[28px] border p-5 shadow-sm ${
        dark ? 'border-slate-700 bg-slate-900/75' : 'border-slate-200 bg-white/90'
      }`}>
        <div className="animate-pulse space-y-4">
          <div className={`h-7 w-64 rounded-xl ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={`h-20 rounded-2xl ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} />
            ))}
          </div>
          <div className={`h-52 rounded-3xl ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} />
        </div>
      </section>
    );
  }

  return (
    <section className={`overflow-hidden rounded-[30px] border shadow-[0_20px_55px_rgba(79,70,229,0.11)] ${
      dark
        ? 'border-slate-700 bg-slate-950/75'
        : 'border-purple-200/80 bg-white/95'
    }`}>
      <header className={`relative overflow-hidden border-b p-5 md:px-6 md:py-5 ${
        dark
          ? 'border-slate-700 bg-gradient-to-br from-slate-900 via-indigo-950/70 to-slate-900'
          : 'border-purple-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/70'
      }`}>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full blur-3xl ${
            dark ? 'bg-indigo-700/20' : 'bg-purple-200/55'
          }`}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] shadow-sm ${
              dark
                ? 'border-indigo-700/70 bg-indigo-950/60 text-indigo-200'
                : 'border-indigo-200 bg-white/80 text-indigo-600'
            }`}>
              <BarChart3 size={13} />
              Учебная аналитика
            </div>
            <h3 className={`mt-3 text-2xl font-black tracking-tight md:text-[28px] ${dark ? 'text-white' : 'text-slate-950'}`}>
              История выполнения
            </h3>
            <p className={`mt-1 max-w-2xl text-xs leading-relaxed md:text-sm ${
              dark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {role === 'teacher'
                ? (filteredStatistics.length > 0
                    ? 'Каждый столбец — отдельная домашняя работа. Видно, что решено сразу, после ошибок и где ученик остановился.'
                    : 'Здесь видна динамика результатов пробников ученика в течение учебного года.')
                : (filteredStatistics.length > 0
                    ? 'Каждый столбец — отдельная домашняя работа. Можно увидеть прогресс и темы, которые стоит повторить.'
                    : 'Здесь можно увидеть, как меняются твои результаты пробников в течение учебного года.')}
            </p>
          </div>
          <label className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-bold shadow-sm transition focus-within:ring-2 focus-within:ring-indigo-400/35 ${
            dark
              ? 'border-slate-700 bg-slate-900/80 text-slate-300'
              : 'border-slate-200 bg-white/90 text-slate-600'
          }`}>
            <CalendarDays size={15} className="text-indigo-500" />
            <span className="sr-only">Учебный год</span>
            <select
              value={resolvedSelectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              className={`bg-transparent outline-none ${dark ? 'text-white' : 'text-slate-800'}`}
              aria-label="Учебный год"
            >
              {yearOptions.map((year) => (
                <option key={year.key} value={year.key} className={dark ? 'bg-slate-900' : 'bg-white'}>
                  {`${year.label} учебный год`}
                </option>
              ))}
              {yearOptions.length > 1 && (
                <option value="all" className={dark ? 'bg-slate-900' : 'bg-white'}>За всё время</option>
              )}
            </select>
          </label>
        </div>
      </header>

      <div className="space-y-4 p-3.5 md:space-y-5 md:p-6">
        {hasHomeworkHistory && summary.homeworkCount === 0 && (
          <div className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-sm ${
            dark
              ? 'border-slate-700 bg-slate-900/65 text-slate-300'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`} role="status">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
              dark ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-500'
            }`}>
              <CircleDashed size={17} />
            </span>
            <div>
              <strong className={`block ${dark ? 'text-white' : 'text-slate-900'}`}>
                {filteredStatistics.length === 0
                  ? 'В выбранном периоде нет домашних работ'
                  : 'В выбранном периоде пока нечего сравнивать'}
              </strong>
              <span className="mt-0.5 block text-xs leading-relaxed">
                {filteredStatistics.length === 0
                  ? 'Можно смотреть динамику пробников за этот учебный год.'
                  : 'Домашние работы есть, но в них нет заданий с доступной автоматической проверкой.'}
              </span>
            </div>
          </div>
        )}

        {filteredStatistics.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className={`relative overflow-hidden rounded-2xl border p-3.5 shadow-sm ${
            dark ? 'border-indigo-800/65 bg-indigo-950/40' : 'border-indigo-100 bg-indigo-50/70'
          }`}>
            <span className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl ${
              dark ? 'bg-indigo-900/70 text-indigo-200' : 'bg-white/80 text-indigo-600'
            }`}>
              <BarChart3 size={16} />
            </span>
            <div className={`pr-9 text-[11px] font-extrabold uppercase tracking-[0.1em] ${
              dark ? 'text-indigo-300' : 'text-indigo-600'
            }`}>Среднее по ДЗ</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <strong className={`text-2xl font-black ${dark ? 'text-indigo-100' : 'text-indigo-700'}`}>
                {summary.homeworkCount > 0 ? `${summary.averagePercent}%` : '—'}
              </strong>
              {summary.homeworkCount >= 4 && summary.trend !== 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[11px] font-extrabold ${
                    trendPositive ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                  title="Последние 3 домашние работы по сравнению с предыдущими 3"
                  aria-label={`Тренд последних трёх домашних работ: ${summary.trend > 0 ? 'рост' : 'снижение'} на ${Math.abs(summary.trend)} процентных пункта`}
                >
                  <TrendIcon size={12} />
                  {`${summary.trend > 0 ? '+' : ''}${summary.trend} п.п.`}
                </span>
              )}
            </div>
          </div>
          <div className={`relative overflow-hidden rounded-2xl border p-3.5 shadow-sm ${
            dark ? 'border-emerald-800/65 bg-emerald-950/35' : 'border-emerald-100 bg-emerald-50/70'
          }`}>
            <span className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl ${
              dark ? 'bg-emerald-900/70 text-emerald-200' : 'bg-white/80 text-emerald-600'
            }`}>
              <CheckCircle2 size={16} />
            </span>
            <div className={`pr-9 text-[11px] font-extrabold uppercase tracking-[0.1em] ${
              dark ? 'text-emerald-300' : 'text-emerald-600'
            }`}>Выполнено полностью</div>
            <div className="mt-1 flex items-end gap-1.5">
              <strong className={`text-2xl font-black ${dark ? 'text-emerald-100' : 'text-emerald-700'}`}>
                {summary.fullyCompletedCount}
              </strong>
              <span className={`pb-1 text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {`из ${summary.homeworkCount}`}
              </span>
            </div>
          </div>
          <div className={`relative overflow-hidden rounded-2xl border p-3.5 shadow-sm ${
            dark ? 'border-sky-800/65 bg-sky-950/35' : 'border-sky-100 bg-sky-50/70'
          }`}>
            <span className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl ${
              dark ? 'bg-sky-900/70 text-sky-200' : 'bg-white/80 text-sky-600'
            }`}>
              <Clock3 size={16} />
            </span>
            <div className={`pr-9 text-[11px] font-extrabold uppercase tracking-[0.1em] ${
              dark ? 'text-sky-300' : 'text-sky-600'
            }`}>Полностью в срок</div>
            <div className="mt-1 flex items-end gap-1.5">
              <strong className={`text-2xl font-black ${dark ? 'text-sky-100' : 'text-sky-700'}`}>
                {summary.onTimeCount}
              </strong>
              <span className={`pb-1 text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {`из ${summary.homeworkCount}`}
              </span>
            </div>
          </div>
          <div className={`relative overflow-hidden rounded-2xl border p-3.5 shadow-sm ${
            dark ? 'border-amber-800/65 bg-amber-950/35' : 'border-amber-100 bg-amber-50/70'
          }`}>
            <span className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl ${
              dark ? 'bg-amber-900/70 text-amber-200' : 'bg-white/80 text-amber-600'
            }`}>
              <AlertTriangle size={16} />
            </span>
            <div className={`pr-9 text-[11px] font-extrabold uppercase tracking-[0.1em] ${
              dark ? 'text-amber-300' : 'text-amber-600'
            }`}>Были ошибки</div>
            <div className="mt-1 flex items-end gap-1.5">
              <strong className={`text-2xl font-black ${dark ? 'text-amber-100' : 'text-amber-700'}`}>
                {summary.withErrorsCount}
              </strong>
              <span className={`pb-1 text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {`из ${summary.homeworkCount}`}
              </span>
            </div>
          </div>
          </div>
        )}

        <MockExamProgressChart
          entries={filteredMockExamProgressEntries}
          academicYear={selectedAcademicYear}
          dark={dark}
          role={role}
        />

        {latestHomework && (
          <div className={`flex flex-col gap-3 rounded-2xl border px-3.5 py-3 sm:flex-row sm:items-center ${
            dark
              ? 'border-indigo-800/70 bg-indigo-950/35'
              : 'border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-purple-50/55'
          }`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              dark ? 'bg-indigo-900/75 text-indigo-200' : 'bg-white text-indigo-600 shadow-sm'
            }`}>
              <Target size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[11px] font-extrabold uppercase tracking-[0.11em] ${
                dark ? 'text-indigo-300' : 'text-indigo-600'
              }`}>
                {`Последняя в периоде · ДЗ №${latestHomework.number}`}
              </div>
              <strong className={`mt-0.5 block truncate text-sm ${
                dark ? 'text-white' : 'text-slate-900'
              }`}>
                {latestHomework.title}
              </strong>
              <p className={`mt-0.5 text-xs leading-relaxed ${
                dark ? 'text-slate-300' : 'text-slate-600'
              }`}>
                {getLatestHomeworkMessage(latestHomework, role)}
              </p>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
              <strong className={`text-xl font-black ${
                dark ? 'text-indigo-100' : 'text-indigo-700'
              }`}>
                {latestHomework.percent == null ? '—' : `${latestHomework.percent}%`}
              </strong>
              {selectedHomework?.id !== latestHomework.id && (
                <button
                  type="button"
                  onClick={() => selectHomework(latestHomework, { revealDetails: true })}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    dark
                      ? 'border-indigo-700 bg-indigo-900/60 text-indigo-100 hover:bg-indigo-900'
                      : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
                  }`}
                >
                  Открыть
                </button>
              )}
            </div>
          </div>
        )}

        {filteredStatistics.length > 0 && (
          <div className={`rounded-[24px] border p-3.5 shadow-sm md:p-4 ${
            dark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-white'
          }`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className={`text-sm font-black ${dark ? 'text-white' : 'text-slate-900'}`}>
                Динамика по домашним работам
              </h4>
              <p className={`mt-0.5 text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                {`${getHomeworkCountLabel(filteredStatistics.length)} · высота столбца показывает выполненную долю`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
              {Object.entries(STATE_META).map(([state, meta]) => (
                <span key={state} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 ${
                  dark ? meta.darkChipClass : meta.chipClass
                }`}>
                  <i className={`h-2 w-2 rounded-full ${
                    state === HOMEWORK_STAT_STATE.UNTOUCHED && dark
                      ? 'bg-slate-700'
                      : meta.dotClass
                  }`} />
                  {meta.shortLabel}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <div
              aria-hidden="true"
              className={`flex h-[172px] w-8 shrink-0 flex-col justify-between pb-9 text-right text-[10px] font-bold ${
                dark ? 'text-slate-500' : 'text-slate-500'
              }`}
            >
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </div>
            <div className="relative min-w-0 flex-1">
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-[22px] h-28">
                <i className={`absolute inset-x-0 top-0 border-t border-dashed ${dark ? 'border-slate-700/70' : 'border-slate-200'}`} />
                <i className={`absolute inset-x-0 top-1/2 border-t border-dashed ${dark ? 'border-slate-700/70' : 'border-slate-200'}`} />
                <i className={`absolute inset-x-0 bottom-0 border-t border-dashed ${dark ? 'border-slate-700/70' : 'border-slate-200'}`} />
              </div>
              <div
                ref={chartRef}
                className="homework-stats-chart relative z-[1] min-w-0 overflow-x-auto pb-1"
                aria-label="График выполнения домашних работ. Используйте стрелки влево и вправо для навигации."
              >
                <div
                  className="flex w-max min-w-full items-end justify-end gap-2 pr-2"
                  role="group"
                  aria-label="Домашние работы по порядку"
                >
                {filteredStatistics.map((entry, entryIndex) => {
                  const active = selectedHomework?.id === entry.id;
                  const completedTotal = Math.max(1, Number(entry.completedCount) || 0);
                  const completedSegments = [
                    {
                      key: HOMEWORK_STAT_STATE.COMPLETED,
                      count: entry.completionOnlyCount,
                      className: 'bg-emerald-500',
                    },
                    {
                      key: HOMEWORK_STAT_STATE.CLEAN,
                      count: entry.cleanCount,
                      className: 'bg-emerald-500',
                    },
                    {
                      key: HOMEWORK_STAT_STATE.WITH_ERRORS,
                      count: entry.withErrorsCount,
                      className: 'bg-amber-400',
                    },
                  ];
                  const resultLabel = entry.percent == null
                    ? 'нет измеримых данных'
                    : `выполнено ${entry.percent}%`;
                  return (
                    <button
                      key={entry.id}
                      ref={(element) => {
                        if (element) homeworkButtonRefs.current.set(entry.id, element);
                        else homeworkButtonRefs.current.delete(entry.id);
                      }}
                      type="button"
                      onClick={() => selectHomework(entry, { revealDetails: true })}
                      onKeyDown={(event) => handleTimelineKeyDown(event, entryIndex)}
                      className={`homework-stats-chart-button group flex w-14 shrink-0 flex-col items-center rounded-2xl px-1 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:w-16 ${
                        active
                          ? (dark
                              ? 'bg-indigo-900/60 ring-2 ring-indigo-400'
                              : 'bg-indigo-50/80 shadow-md ring-2 ring-indigo-500')
                          : (dark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-50/90')
                      }`}
                      aria-pressed={active}
                      aria-controls="homework-stats-detail"
                      aria-label={`Домашняя работа ${entry.number}, ${formatDate(entry.issuedAt)}, ${resultLabel}; сразу верно ${entry.cleanCount}, после ошибок ${entry.withErrorsCount}, пока неверно ${entry.wrongCount}, не начато ${entry.untouchedCount}`}
                      title={`${formatDate(entry.issuedAt)} · ${entry.percent == null ? 'нет данных' : `${entry.percent}%`}`}
                    >
                      <strong className={`mb-1 text-[11px] font-extrabold ${
                        active
                          ? (dark ? 'text-indigo-200' : 'text-indigo-700')
                          : (dark ? 'text-slate-300' : 'text-slate-600')
                      }`}>
                        {entry.percent == null ? '—' : `${entry.percent}%`}
                      </strong>
                      <span className={`relative block h-28 w-8 overflow-hidden rounded-[10px] border shadow-inner ${
                        active
                          ? 'border-indigo-400'
                          : (dark ? 'border-slate-700' : 'border-slate-200')
                      } ${dark ? 'bg-slate-800/90' : 'bg-slate-100'}`}>
                        {entry.percent != null && entry.completedCount > 0 && (
                          <span
                            className="absolute inset-x-0 bottom-0 flex flex-col-reverse overflow-hidden rounded-b-[8px] transition-[height] duration-300"
                            style={{ height: `${entry.percent}%` }}
                            aria-hidden="true"
                          >
                            {completedSegments.map((segment) => (
                              segment.count > 0 ? (
                                <i
                                  key={segment.key}
                                  className={`${segment.className} block w-full`}
                                  style={{ height: `${(segment.count / completedTotal) * 100}%` }}
                                />
                              ) : null
                            ))}
                          </span>
                        )}
                        {entry.wrongCount > 0 && (
                          <span
                            className="absolute right-0 top-1 grid min-h-4 min-w-4 place-items-center rounded-l-md bg-rose-500 px-1 text-[9px] font-black leading-4 text-white shadow-sm"
                            aria-hidden="true"
                          >
                            {entry.wrongCount}
                          </span>
                        )}
                      </span>
                      <span className={`mt-1.5 text-[11px] font-extrabold ${
                        dark ? 'text-slate-300' : 'text-slate-600'
                      }`}>
                        {`ДЗ ${entry.number}`}
                      </span>
                      <time className={`text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {formatCompactDate(entry.issuedAt, resolvedSelectedYear === 'all')}
                      </time>
                    </button>
                  );
                })}
                </div>
              </div>
            </div>
          </div>
          {filteredStatistics.length > 5 && (
            <p className={`mt-2 text-center text-[11px] sm:hidden ${
              dark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Смахните график, чтобы увидеть более ранние работы
            </p>
          )}
          </div>
        )}

        {selectedHomework && (() => {
          const status = STATUS_META[selectedHomework.status] || STATUS_META['no-data'];
          const StatusIcon = status.icon;
          const dueAtMs = Date.parse(selectedHomework.dueAt || '');
          const duePassed = Number.isFinite(dueAtMs) && dueAtMs < referenceNowMs;
          return (
            <article
              ref={detailRef}
              id="homework-stats-detail"
              aria-labelledby="homework-stats-detail-title"
              className={`homework-stats-detail scroll-mt-20 overflow-hidden rounded-[26px] border shadow-[0_12px_35px_rgba(79,70,229,0.07)] ${
              dark ? 'border-slate-700 bg-slate-900/55' : 'border-purple-100 bg-white'
              }`}
            >
              <div className={`border-b p-4 md:p-5 ${
                dark
                  ? 'border-slate-700 bg-gradient-to-br from-slate-900/80 to-indigo-950/30'
                  : 'border-purple-100 bg-gradient-to-br from-white via-white to-indigo-50/55'
              }`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[11px] font-extrabold uppercase tracking-[0.12em] ${
                        dark ? 'text-indigo-300' : 'text-indigo-600'
                      }`}>
                        {`Домашняя работа №${selectedHomework.number}`}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${
                        dark ? status.darkClassName : status.className
                      }`}>
                        <StatusIcon size={11} />
                        {status.label}
                      </span>
                    </div>
                    <h4 id="homework-stats-detail-title" className={`mt-2 text-lg font-black leading-tight md:text-xl ${
                      dark ? 'text-white' : 'text-slate-950'
                    }`}>
                      {selectedHomework.title}
                    </h4>
                    <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold ${
                      dark ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={13} />
                        {`Выдано ${formatDate(selectedHomework.issuedAt, { year: true })}`}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={13} />
                        {selectedHomework.dueAt
                          ? `Срок ${formatDate(selectedHomework.dueAt, { year: true })}`
                          : 'Срок не указан'}
                      </span>
                      {selectedHomework.isOverdue && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                          dark ? 'bg-rose-950/60 text-rose-200' : 'bg-rose-100 text-rose-700'
                        }`}>
                          <AlertTriangle size={11} />
                          Просрочено
                        </span>
                      )}
                      {selectedHomework.lateCompletedCount > 0 && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                          dark ? 'bg-amber-950/60 text-amber-200' : 'bg-amber-100 text-amber-700'
                        }`}>
                          <Clock3 size={11} />
                          {`После срока: ${selectedHomework.lateCompletedCount}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <div className={`flex items-center justify-between gap-1 rounded-xl border p-1 ${
                      dark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'
                    }`} aria-label="Переключение между домашними работами">
                      <button
                        type="button"
                        onClick={() => selectHomework(filteredStatistics[selectedHomeworkIndex - 1])}
                        disabled={selectedHomeworkIndex <= 0}
                        className={`grid h-8 w-8 place-items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-30 ${
                          dark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                        aria-label="Предыдущая домашняя работа"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className={`min-w-14 text-center text-[11px] font-bold ${
                        dark ? 'text-slate-300' : 'text-slate-600'
                      }`}>
                        {`${selectedHomeworkIndex + 1} из ${filteredStatistics.length}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => selectHomework(filteredStatistics[selectedHomeworkIndex + 1])}
                        disabled={selectedHomeworkIndex >= filteredStatistics.length - 1}
                        className={`grid h-8 w-8 place-items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-30 ${
                          dark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                        aria-label="Следующая домашняя работа"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                      dark
                        ? 'border-indigo-800/70 bg-indigo-950/45'
                        : 'border-indigo-100 bg-indigo-50/70'
                    }`}>
                      <div>
                        <div className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${
                          dark ? 'text-indigo-300' : 'text-indigo-600'
                      }`}>
                          {selectedHomework.isLatest ? 'На сейчас' : 'Итог'}
                        </div>
                        <div className={`text-2xl font-black ${dark ? 'text-indigo-100' : 'text-indigo-700'}`}>
                          {selectedHomework.percent == null ? '—' : `${selectedHomework.percent}%`}
                        </div>
                      </div>
                      <div className={`h-9 w-px ${dark ? 'bg-indigo-800' : 'bg-indigo-200'}`} />
                      <div className={`text-[11px] font-bold ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
                        <strong className={`block text-sm ${dark ? 'text-white' : 'text-slate-900'}`}>
                          {`${selectedHomework.completedCount}/${selectedHomework.totalCount}`}
                        </strong>
                        выполнено
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`mt-4 grid grid-cols-2 gap-2 ${
                  selectedHomework.completionOnlyCount > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
                }`}>
                  {[
                    selectedHomework.completionOnlyCount > 0 ? {
                      label: 'Завершено',
                      value: selectedHomework.completionOnlyCount,
                      className: dark
                        ? 'border-emerald-800/70 bg-emerald-950/35 text-emerald-200'
                        : 'border-emerald-100 bg-emerald-50 text-emerald-700',
                    } : null,
                    {
                      label: 'Сразу верно',
                      value: selectedHomework.cleanCount,
                      className: dark
                        ? 'border-emerald-800/70 bg-emerald-950/35 text-emerald-200'
                        : 'border-emerald-100 bg-emerald-50 text-emerald-700',
                    },
                    {
                      label: 'После ошибок',
                      value: selectedHomework.withErrorsCount,
                      className: dark
                        ? 'border-amber-800/70 bg-amber-950/35 text-amber-200'
                        : 'border-amber-100 bg-amber-50 text-amber-700',
                    },
                    {
                      label: 'Пока неверно',
                      value: selectedHomework.wrongCount,
                      className: dark
                        ? 'border-rose-800/70 bg-rose-950/35 text-rose-200'
                        : 'border-rose-100 bg-rose-50 text-rose-700',
                    },
                    {
                      label: 'Не начато',
                      value: selectedHomework.untouchedCount,
                      className: dark
                        ? 'border-slate-700 bg-slate-800/70 text-slate-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600',
                    },
                  ].filter(Boolean).map((item) => (
                    <div key={item.label} className={`rounded-xl border px-3 py-2 shadow-sm ${item.className}`}>
                      <strong className="block text-lg font-black">{item.value}</strong>
                      <span className="text-[11px] font-bold">{item.label}</span>
                    </div>
                  ))}
                </div>

                {duePassed && selectedHomework.checkpointPercent != null && (
                  <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                    dark
                      ? 'border-slate-700 bg-slate-800/55 text-slate-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}>
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Clock3 size={13} />
                      Результат к дедлайну
                    </span>
                    <strong className={dark ? 'text-white' : 'text-slate-900'}>
                      {`${selectedHomework.checkpointPercent}%`}
                      {selectedHomework.percent > selectedHomework.checkpointPercent
                        ? ` · после срока +${selectedHomework.percent - selectedHomework.checkpointPercent} п.п.`
                        : ''}
                    </strong>
                  </div>
                )}
              </div>

              <div className="space-y-3 p-3.5 md:p-5">
                {selectedHomework.goals.length > 0 ? (
                  selectedHomework.goals.map((goal) => {
                    const goalSummary = summarizeGoal(goal);
                    return (
                      <details
                        key={goal.id}
                        className={`group rounded-2xl border ${
                          dark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-slate-50/60'
                        }`}
                        open={selectedHomework.goals.length === 1}
                      >
                        <summary className={`flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 ${
                          dark ? 'hover:bg-slate-800/65' : 'hover:bg-white'
                        }`}>
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                            dark ? 'bg-indigo-950 text-indigo-300' : 'bg-indigo-100 text-indigo-600'
                          }`}>
                            {goal.type === 'mock' ? <ListChecks size={17} /> : <Target size={17} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <strong className={`block truncate text-sm ${dark ? 'text-white' : 'text-slate-900'}`}>
                              {goal.label}
                            </strong>
                            <span className={`text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {`${goalSummary.completedCount} из ${goalSummary.totalCount} · ${goalSummary.percent}%`}
                            </span>
                          </div>
                          <ChevronRight
                            size={17}
                            className={`shrink-0 transition group-open:rotate-90 ${
                              dark ? 'text-slate-500' : 'text-slate-500'
                            }`}
                          />
                        </summary>
                        <div className={`grid gap-2 border-t p-3 md:grid-cols-2 ${
                          dark ? 'border-slate-700' : 'border-slate-200'
                        }`}>
                          {Object.keys(STATE_META).map((state) => (
                            <DetailStateGroup
                              key={state}
                              state={state}
                              items={goal.items.filter((item) => item.state === state)}
                              dark={dark}
                            />
                          ))}
                        </div>
                      </details>
                    );
                  })
                ) : (
                  <div className={`rounded-2xl border border-dashed p-4 text-sm ${
                    dark
                      ? 'border-slate-700 bg-slate-900/50 text-slate-400'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}>
                    Автоматически проверяемых заданий в этой домашней работе нет.
                  </div>
                )}

                {selectedHomework.checklist.totalCount > 0 && (
                  <details className={`group rounded-2xl border ${
                    dark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-slate-50/60'
                  }`}>
                    <summary className={`flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 ${
                      dark ? 'hover:bg-slate-800/65' : 'hover:bg-white'
                    }`}>
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                        dark ? 'bg-sky-950 text-sky-300' : 'bg-sky-100 text-sky-600'
                      }`}>
                        <ListChecks size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <strong className={`block text-sm ${dark ? 'text-white' : 'text-slate-900'}`}>
                          Чек-лист ученика
                        </strong>
                        <span className={`text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {`${selectedHomework.checklist.completedCount} из ${selectedHomework.checklist.totalCount} отмечено`}
                          {selectedHomework.goals.length > 0 ? ' · не влияет на объективный процент' : ''}
                        </span>
                      </div>
                      <ChevronRight
                        size={17}
                        className={`shrink-0 transition group-open:rotate-90 ${
                          dark ? 'text-slate-500' : 'text-slate-500'
                        }`}
                      />
                    </summary>
                    <div className={`space-y-1.5 border-t p-3 ${
                      dark ? 'border-slate-700' : 'border-slate-200'
                    }`}>
                      {selectedHomework.checklist.items.map((item) => {
                        const completed = item.state === HOMEWORK_STAT_STATE.CLEAN;
                        return (
                          <div
                            key={item.id}
                            className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 text-xs ${
                              completed
                                ? (dark
                                    ? 'border-emerald-800/70 bg-emerald-950/35 text-emerald-200'
                                    : 'border-emerald-100 bg-emerald-50 text-emerald-700')
                                : (dark
                                    ? 'border-slate-700 bg-slate-900 text-slate-400'
                                    : 'border-slate-200 bg-white text-slate-500')
                            }`}
                          >
                            <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded ${
                              completed
                                ? 'bg-emerald-500 text-white'
                                : (dark ? 'border border-slate-600' : 'border border-slate-300')
                            }`}>
                              {completed && <Check size={11} />}
                            </span>
                            <span className={completed ? 'line-through opacity-80' : ''}>{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            </article>
          );
        })()}

        {showMethodNote && (
          <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-xs leading-relaxed ${
            dark
              ? 'border-slate-700 bg-slate-900/55 text-slate-400'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}>
            <Info size={14} className="mt-0.5 shrink-0 text-indigo-500" />
            <span>
              Статистика собрана по журналу попыток и периодам между выдачами ДЗ. Если сроки
              пересекались или старых событий уже нет в журнале, отдельные значения могут быть приблизительными.
            </span>
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeworkStatsSection;
