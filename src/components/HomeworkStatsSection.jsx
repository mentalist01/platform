import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
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

const STATE_META = {
  [HOMEWORK_STAT_STATE.CLEAN]: {
    label: 'Верно сразу',
    shortLabel: 'Сразу верно',
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

const formatCompactDate = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
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

const summarizeGoal = (goal) => {
  const items = Array.isArray(goal?.items) ? goal.items : [];
  const completedCount = items.filter((item) => (
    item.state === HOMEWORK_STAT_STATE.CLEAN
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
            state === HOMEWORK_STAT_STATE.CLEAN
              ? 'text-emerald-500'
              : state === HOMEWORK_STAT_STATE.WITH_ERRORS
                ? 'text-amber-500'
                : state === HOMEWORK_STAT_STATE.WRONG
                  ? 'text-rose-500'
                  : 'text-slate-400'
          } />
          {meta.label}
        </span>
        <span className={dark ? 'text-slate-400' : 'text-slate-400'}>{items.length}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.id}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${
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
  const [referenceNowMs] = useState(() => Date.now());
  const statistics = useMemo(() => buildHomeworkStatistics({
    homeworks,
    studentData,
    testsDb: testsDb || {},
    mockExams,
    mockAttemptsByExam,
    nowMs: referenceNowMs,
  }), [homeworks, mockAttemptsByExam, mockExams, referenceNowMs, studentData, testsDb]);
  const yearOptions = useMemo(() => {
    const byKey = new Map();
    statistics.forEach((entry) => {
      if (entry.academicYear?.key) byKey.set(entry.academicYear.key, entry.academicYear);
    });
    return Array.from(byKey.values()).sort((left, right) => right.startYear - left.startYear);
  }, [statistics]);
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
  const estimatedHistory = filteredStatistics.some((entry) => entry.estimated);
  const trendPositive = summary.trend >= 0;
  const TrendIcon = trendPositive ? TrendingUp : TrendingDown;

  if (!Array.isArray(homeworks) || homeworks.length === 0) {
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
    <section className={`overflow-hidden rounded-[30px] border shadow-[0_18px_45px_rgba(79,70,229,0.10)] ${
      dark
        ? 'border-slate-700 bg-slate-950/75'
        : 'border-purple-200/80 bg-white/95'
    }`}>
      <header className={`relative overflow-hidden border-b p-4 md:p-6 ${
        dark
          ? 'border-slate-700 bg-gradient-to-br from-slate-900 via-indigo-950/70 to-slate-900'
          : 'border-purple-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50'
      }`}>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full blur-3xl ${
            dark ? 'bg-indigo-700/20' : 'bg-purple-200/55'
          }`}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
              dark
                ? 'border-indigo-700/70 bg-indigo-950/60 text-indigo-200'
                : 'border-indigo-200 bg-white/80 text-indigo-600'
            }`}>
              <BarChart3 size={13} />
              Статистика по ДЗ
            </div>
            <h3 className={`mt-3 text-xl font-black md:text-2xl ${dark ? 'text-white' : 'text-slate-950'}`}>
              От первой домашки до текущей
            </h3>
            <p className={`mt-1 max-w-2xl text-xs leading-relaxed md:text-sm ${
              dark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {role === 'teacher'
                ? 'Каждый столбец — отдельная домашняя работа. Видно, что решено сразу, после ошибок и где ученик остановился.'
                : 'Каждый столбец — отдельная домашняя работа. Можно увидеть прогресс и темы, которые стоит повторить.'}
            </p>
          </div>
          <label className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold ${
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className={`rounded-2xl border p-3 ${
            dark ? 'border-indigo-800/65 bg-indigo-950/40' : 'border-indigo-100 bg-indigo-50/70'
          }`}>
            <div className={`text-[10px] font-black uppercase tracking-[0.13em] ${
              dark ? 'text-indigo-300' : 'text-indigo-500'
            }`}>Среднее выполнение</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <strong className={`text-2xl font-black ${dark ? 'text-indigo-100' : 'text-indigo-700'}`}>
                {summary.averagePercent}%
              </strong>
              {summary.homeworkCount >= 4 && summary.trend !== 0 && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-black ${
                  trendPositive ? 'text-emerald-500' : 'text-rose-500'
                }`}>
                  <TrendIcon size={12} />
                  {`${summary.trend > 0 ? '+' : ''}${summary.trend} п.п.`}
                </span>
              )}
            </div>
          </div>
          <div className={`rounded-2xl border p-3 ${
            dark ? 'border-emerald-800/65 bg-emerald-950/35' : 'border-emerald-100 bg-emerald-50/70'
          }`}>
            <div className={`text-[10px] font-black uppercase tracking-[0.13em] ${
              dark ? 'text-emerald-300' : 'text-emerald-600'
            }`}>Выполнено полностью</div>
            <div className="mt-1 flex items-end gap-1.5">
              <strong className={`text-2xl font-black ${dark ? 'text-emerald-100' : 'text-emerald-700'}`}>
                {summary.fullyCompletedCount}
              </strong>
              <span className={`pb-1 text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-400'}`}>
                {`из ${summary.homeworkCount}`}
              </span>
            </div>
          </div>
          <div className={`rounded-2xl border p-3 ${
            dark ? 'border-sky-800/65 bg-sky-950/35' : 'border-sky-100 bg-sky-50/70'
          }`}>
            <div className={`text-[10px] font-black uppercase tracking-[0.13em] ${
              dark ? 'text-sky-300' : 'text-sky-600'
            }`}>Полностью в срок</div>
            <div className="mt-1 flex items-end gap-1.5">
              <strong className={`text-2xl font-black ${dark ? 'text-sky-100' : 'text-sky-700'}`}>
                {summary.onTimeCount}
              </strong>
              <span className={`pb-1 text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-400'}`}>
                домашних
              </span>
            </div>
          </div>
          <div className={`rounded-2xl border p-3 ${
            dark ? 'border-amber-800/65 bg-amber-950/35' : 'border-amber-100 bg-amber-50/70'
          }`}>
            <div className={`text-[10px] font-black uppercase tracking-[0.13em] ${
              dark ? 'text-amber-300' : 'text-amber-600'
            }`}>Были ошибки</div>
            <div className="mt-1 flex items-end gap-1.5">
              <strong className={`text-2xl font-black ${dark ? 'text-amber-100' : 'text-amber-700'}`}>
                {summary.withErrorsCount}
              </strong>
              <span className={`pb-1 text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-400'}`}>
                домашних
              </span>
            </div>
          </div>
        </div>

        <div className={`rounded-[24px] border p-3 md:p-4 ${
          dark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-slate-50/75'
        }`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className={`text-sm font-black ${dark ? 'text-white' : 'text-slate-900'}`}>
                Динамика по домашним работам
              </h4>
              <p className={`mt-0.5 text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {`${getHomeworkCountLabel(filteredStatistics.length)} · нажмите на столбец для подробностей`}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] font-bold">
              {Object.entries(STATE_META).map(([state, meta]) => (
                <span key={state} className={`inline-flex items-center gap-1.5 ${
                  dark ? 'text-slate-300' : 'text-slate-600'
                }`}>
                  <i className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                  {meta.shortLabel}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <div
              aria-hidden="true"
              className={`flex h-[172px] w-8 shrink-0 flex-col justify-between pb-9 text-right text-[9px] font-bold ${
                dark ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </div>
            <div ref={chartRef} className="min-w-0 flex-1 overflow-x-auto pb-1">
              <div
                className="flex min-w-max items-end gap-2.5 pr-2"
                role="group"
                aria-label="Домашние работы по порядку"
              >
                {filteredStatistics.map((entry) => {
                  const active = selectedHomework?.id === entry.id;
                  const total = Math.max(1, Number(entry.totalCount) || 0);
                  const segments = [
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
                    {
                      key: HOMEWORK_STAT_STATE.WRONG,
                      count: entry.wrongCount,
                      className: 'bg-rose-500',
                    },
                    {
                      key: HOMEWORK_STAT_STATE.UNTOUCHED,
                      count: entry.untouchedCount,
                      className: dark ? 'bg-slate-700' : 'bg-slate-200',
                    },
                  ];
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedHomeworkId(entry.id)}
                      className={`group flex w-12 shrink-0 flex-col items-center rounded-xl px-1 py-1.5 text-center transition ${
                        active
                          ? (dark
                              ? 'bg-indigo-900/60 ring-2 ring-indigo-400'
                              : 'bg-white shadow-md ring-2 ring-indigo-500')
                          : (dark ? 'hover:bg-slate-800' : 'hover:bg-white')
                      }`}
                      aria-pressed={active}
                      aria-label={`Домашняя работа ${entry.number}, ${formatDate(entry.issuedAt)}, выполнено ${entry.percent ?? 0}%`}
                      title={`${formatDate(entry.issuedAt)} · ${entry.percent ?? 0}%`}
                    >
                      <strong className={`mb-1 text-[10px] font-black ${
                        active
                          ? (dark ? 'text-indigo-200' : 'text-indigo-700')
                          : (dark ? 'text-slate-300' : 'text-slate-600')
                      }`}>
                        {entry.percent == null ? '—' : `${entry.percent}%`}
                      </strong>
                      <span className={`relative flex h-28 w-7 flex-col-reverse overflow-hidden rounded-[9px] border ${
                        active
                          ? 'border-indigo-400'
                          : (dark ? 'border-slate-700' : 'border-slate-200')
                      }`}>
                        {segments.map((segment) => (
                          segment.count > 0 ? (
                            <i
                              key={segment.key}
                              className={`${segment.className} block w-full transition-opacity group-hover:opacity-90`}
                              style={{ height: `${(segment.count / total) * 100}%` }}
                            />
                          ) : null
                        ))}
                        {entry.totalCount <= 0 && (
                          <i className={`absolute inset-0 ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} />
                        )}
                      </span>
                      <span className={`mt-1.5 text-[9px] font-black ${
                        dark ? 'text-slate-300' : 'text-slate-600'
                      }`}>
                        {`ДЗ ${entry.number}`}
                      </span>
                      <time className={`text-[9px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {formatCompactDate(entry.issuedAt)}
                      </time>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {selectedHomework && (() => {
          const status = STATUS_META[selectedHomework.status] || STATUS_META['no-data'];
          const StatusIcon = status.icon;
          const dueAtMs = Date.parse(selectedHomework.dueAt || '');
          const duePassed = Number.isFinite(dueAtMs) && dueAtMs < referenceNowMs;
          return (
            <article className={`rounded-[26px] border ${
              dark ? 'border-slate-700 bg-slate-900/55' : 'border-slate-200 bg-white'
            }`}>
              <div className={`border-b p-4 md:p-5 ${
                dark ? 'border-slate-700' : 'border-slate-100'
              }`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${
                        dark ? 'text-indigo-300' : 'text-indigo-500'
                      }`}>
                        {`Домашняя работа №${selectedHomework.number}`}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${
                        dark ? status.darkClassName : status.className
                      }`}>
                        <StatusIcon size={11} />
                        {status.label}
                      </span>
                    </div>
                    <h4 className={`mt-2 text-lg font-black leading-tight md:text-xl ${
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
                    </div>
                  </div>
                  <div className={`flex shrink-0 items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                    dark
                      ? 'border-indigo-800/70 bg-indigo-950/45'
                      : 'border-indigo-100 bg-indigo-50/70'
                  }`}>
                    <div>
                      <div className={`text-[9px] font-black uppercase tracking-[0.14em] ${
                        dark ? 'text-indigo-300' : 'text-indigo-500'
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

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
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
                  ].map((item) => (
                    <div key={item.label} className={`rounded-xl border px-3 py-2 ${item.className}`}>
                      <strong className="block text-lg font-black">{item.value}</strong>
                      <span className="text-[10px] font-bold">{item.label}</span>
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
                        <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5">
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
                              dark ? 'text-slate-500' : 'text-slate-400'
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
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5">
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
                          dark ? 'text-slate-500' : 'text-slate-400'
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

        {estimatedHistory && (
          <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[11px] leading-relaxed ${
            dark
              ? 'border-slate-700 bg-slate-900/55 text-slate-400'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <span>
              Старые результаты восстановлены по сохранённому журналу попыток. Для домашних,
              созданных до появления журнала, и для пробников отдельные детали могут быть приблизительными.
            </span>
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeworkStatsSection;
