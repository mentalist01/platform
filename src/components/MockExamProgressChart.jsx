import React, { useId, useMemo, useState } from 'react';
import {
  CircleDashed,
  Flag,
  LineChart,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { summarizeMockExamProgress } from '../utils/mockExamProgress';

const CHART_WIDTH = 920;
const CHART_HEIGHT = 300;
const PLOT_LEFT = 52;
const PLOT_RIGHT = 24;
const PLOT_TOP = 30;
const PLOT_BOTTOM = 46;
const PLOT_WIDTH = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const Y_TICKS = [100, 75, 50, 25, 0];
const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const formatDate = (value, short = false) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return date.toLocaleDateString('ru-RU', {
    day: short ? '2-digit' : 'numeric',
    month: short ? '2-digit' : 'long',
    year: 'numeric',
  }).replace(' г.', '');
};

const getResultCountLabel = (count) => {
  const value = Math.max(0, Math.round(Number(count) || 0));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} результат`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${value} результата`;
  }
  return `${value} результатов`;
};

const getChartRange = (entries, academicYear) => {
  const entryYears = entries
    .map((entry) => Number(entry?.academicYear?.startYear))
    .filter(Number.isFinite);
  const startYear = Number.isFinite(Number(academicYear?.startYear))
    ? Number(academicYear.startYear)
    : Math.min(...entryYears);
  const lastStartYear = Number.isFinite(Number(academicYear?.startYear))
    ? Number(academicYear.startYear)
    : Math.max(...entryYears);
  const safeStartYear = Number.isFinite(startYear)
    ? startYear
    : new Date().getFullYear();
  const safeLastStartYear = Number.isFinite(lastStartYear)
    ? lastStartYear
    : safeStartYear;

  return {
    startYear: safeStartYear,
    endYear: safeLastStartYear + 1,
    startMs: new Date(safeStartYear, 8, 1, 0, 0, 0, 0).getTime(),
    endMs: new Date(safeLastStartYear + 1, 8, 1, 0, 0, 0, 0).getTime(),
  };
};

const getChartTicks = (range, singleAcademicYear) => {
  if (singleAcademicYear) {
    return [
      new Date(range.startYear, 8, 1),
      new Date(range.startYear, 10, 1),
      new Date(range.startYear + 1, 0, 1),
      new Date(range.startYear + 1, 2, 1),
      new Date(range.startYear + 1, 4, 1),
      new Date(range.startYear + 1, 6, 1),
      new Date(range.startYear + 1, 7, 31, 23, 59, 59, 999),
    ].map((date) => ({
      value: date.getTime(),
      label: MONTH_LABELS[date.getMonth()],
    }));
  }

  const ticks = [];
  for (let year = range.startYear; year <= range.endYear; year += 1) {
    ticks.push({
      value: new Date(year, 8, 1, 0, 0, 0, 0).getTime(),
      label: String(year),
    });
  }
  if (ticks.length <= 6) return ticks;

  const step = Math.ceil((ticks.length - 1) / 5);
  return ticks.filter((_, index) => (
    index === 0 || index === ticks.length - 1 || index % step === 0
  ));
};

const getSourceLabel = (entry) => (
  entry?.source === 'online' ? 'На платформе' : 'Добавлен вручную'
);

const MockExamProgressChart = ({
  entries = [],
  academicYear = null,
  dark = false,
  role = 'student',
}) => {
  const safeEntries = useMemo(
    () => (Array.isArray(entries) ? entries : []),
    [entries]
  );
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const rawChartId = useId();
  const chartId = rawChartId.replace(/[^a-zA-Z0-9_-]/g, '');
  const summary = useMemo(() => summarizeMockExamProgress(safeEntries), [safeEntries]);
  const range = useMemo(
    () => getChartRange(safeEntries, academicYear),
    [academicYear, safeEntries]
  );
  const ticks = useMemo(
    () => getChartTicks(range, Boolean(academicYear)),
    [academicYear, range]
  );
  const selectedEntry = safeEntries.find((entry) => entry.id === selectedEntryId)
    || safeEntries[safeEntries.length - 1]
    || null;
  const selectedIndex = selectedEntry
    ? safeEntries.findIndex((entry) => entry.id === selectedEntry.id)
    : -1;
  const durationMs = Math.max(1, range.endMs - range.startMs);
  const points = safeEntries.map((entry, index) => {
    const dateRatio = Math.max(0, Math.min(1, (entry.dateMs - range.startMs) / durationMs));
    const scoreRatio = Math.max(0, Math.min(1, Number(entry.score) / 100));
    return {
      ...entry,
      index,
      x: PLOT_LEFT + dateRatio * PLOT_WIDTH,
      y: PLOT_TOP + (1 - scoreRatio) * PLOT_HEIGHT,
    };
  });
  const linePath = points.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(' ');
  const areaPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(PLOT_TOP + PLOT_HEIGHT).toFixed(2)} L ${points[0].x.toFixed(2)} ${(PLOT_TOP + PLOT_HEIGHT).toFixed(2)} Z`
    : '';
  const periodLabel = academicYear
    ? `${academicYear.label} учебный год`
    : 'За всё время';
  const hasOnlineEntries = safeEntries.some((entry) => entry.source === 'online');
  const deltaPositive = Number(summary.delta) >= 0;
  const DeltaIcon = deltaPositive ? TrendingUp : TrendingDown;

  const selectPoint = (entry) => {
    if (entry?.id) setSelectedEntryId(entry.id);
  };

  return (
    <section className={`overflow-hidden rounded-[24px] border shadow-sm ${
      dark
        ? 'border-violet-800/70 bg-slate-900/70'
        : 'border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/55'
    }`} aria-labelledby={`${chartId}-heading`}>
      <header className={`flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between md:px-5 ${
        dark ? 'border-slate-700/80' : 'border-violet-100'
      }`}>
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
            dark
              ? 'bg-violet-900/70 text-violet-200'
              : 'bg-violet-100 text-violet-700'
          }`}>
            <LineChart size={19} />
          </span>
          <div className="min-w-0">
            <h4 id={`${chartId}-heading`} className={`text-base font-black ${
              dark ? 'text-white' : 'text-slate-950'
            }`}>
              Динамика пробников
            </h4>
            <p className={`mt-0.5 text-xs leading-relaxed ${
              dark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Баллы ЕГЭ от первого результата к последнему
            </p>
          </div>
        </div>
        <div className={`self-start rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${
          dark
            ? 'border-violet-700/70 bg-violet-950/60 text-violet-200'
            : 'border-violet-200 bg-white text-violet-700'
        }`}>
          {periodLabel}
        </div>
      </header>

      {safeEntries.length === 0 ? (
        <div className="px-4 py-6 md:px-5">
          <div className={`flex items-start gap-3 rounded-2xl border px-4 py-4 ${
            dark
              ? 'border-slate-700 bg-slate-950/45 text-slate-300'
              : 'border-slate-200 bg-white/80 text-slate-600'
          }`} role="status">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              dark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
            }`}>
              <CircleDashed size={18} />
            </span>
            <div>
              <strong className={`block text-sm ${dark ? 'text-white' : 'text-slate-900'}`}>
                В этом учебном году результатов пока нет
              </strong>
              <span className="mt-1 block text-xs leading-relaxed">
                {role === 'teacher'
                  ? 'Первый завершённый пробник станет стартовой точкой прогресса ученика.'
                  : 'Заверши первый пробник — он станет стартовой точкой твоего прогресса.'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-3.5 md:p-5">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <div className={`rounded-2xl border px-3.5 py-3 ${
              dark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-white/85'
            }`}>
              <div className={`text-[10px] font-extrabold uppercase tracking-[0.1em] ${
                dark ? 'text-slate-400' : 'text-slate-500'
              }`}>Первый</div>
              <strong className={`mt-1 block text-xl font-black ${
                dark ? 'text-white' : 'text-slate-950'
              }`}>{summary.firstScore}</strong>
              <span className={`text-[11px] ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
                баллов
              </span>
            </div>
            <div className={`rounded-2xl border px-3.5 py-3 ${
              dark ? 'border-violet-800/75 bg-violet-950/40' : 'border-violet-200 bg-violet-50/75'
            }`}>
              <div className={`text-[10px] font-extrabold uppercase tracking-[0.1em] ${
                dark ? 'text-violet-300' : 'text-violet-600'
              }`}>Последний</div>
              <strong className={`mt-1 block text-xl font-black ${
                dark ? 'text-violet-100' : 'text-violet-800'
              }`}>{summary.latestScore}</strong>
              <span className={`text-[11px] ${dark ? 'text-violet-300/75' : 'text-violet-600/80'}`}>
                баллов
              </span>
            </div>
            <div className={`rounded-2xl border px-3.5 py-3 ${
              summary.count < 2 || summary.delta === 0
                ? (dark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-white/85')
                : deltaPositive
                  ? (dark ? 'border-emerald-800/70 bg-emerald-950/35' : 'border-emerald-200 bg-emerald-50/70')
                  : (dark ? 'border-rose-800/70 bg-rose-950/35' : 'border-rose-200 bg-rose-50/70')
            }`}>
              <div className={`text-[10px] font-extrabold uppercase tracking-[0.1em] ${
                dark ? 'text-slate-400' : 'text-slate-500'
              }`}>Изменение</div>
              <strong className={`mt-1 flex items-center gap-1 text-xl font-black ${
                summary.count < 2 || summary.delta === 0
                  ? (dark ? 'text-white' : 'text-slate-950')
                  : deltaPositive
                    ? 'text-emerald-500'
                    : 'text-rose-500'
              }`}>
                {summary.count > 1 ? (
                  <>
                    <DeltaIcon size={17} />
                    {`${summary.delta > 0 ? '+' : ''}${summary.delta}`}
                  </>
                ) : '—'}
              </strong>
              <span className={`text-[11px] ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
                от первого
              </span>
            </div>
            <div className={`rounded-2xl border px-3.5 py-3 ${
              dark ? 'border-amber-800/70 bg-amber-950/35' : 'border-amber-200 bg-amber-50/70'
            }`}>
              <div className={`flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ${
                dark ? 'text-amber-300' : 'text-amber-600'
              }`}>
                <Trophy size={12} />
                Лучший
              </div>
              <strong className={`mt-1 block text-xl font-black ${
                dark ? 'text-amber-100' : 'text-amber-800'
              }`}>{summary.bestScore}</strong>
              <span className={`text-[11px] ${dark ? 'text-amber-300/75' : 'text-amber-700/75'}`}>
                баллов
              </span>
            </div>
          </div>

          <div className={`rounded-2xl border px-2 pb-1 pt-3 ${
            dark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-white/85'
          }`}>
            <div className="overflow-x-auto pb-1">
              <svg
                className="h-auto min-w-[680px] w-full"
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                role="img"
                aria-label={`График результатов пробников: ${getResultCountLabel(summary.count)}. Последний результат — ${summary.latestScore} баллов.`}
              >
                <defs>
                  <linearGradient id={`${chartId}-area`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={dark ? '#8b5cf6' : '#7c3aed'} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={dark ? '#8b5cf6' : '#7c3aed'} stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {Y_TICKS.map((value) => {
                  const y = PLOT_TOP + (1 - value / 100) * PLOT_HEIGHT;
                  return (
                    <g key={value} aria-hidden="true">
                      <line
                        x1={PLOT_LEFT}
                        x2={PLOT_LEFT + PLOT_WIDTH}
                        y1={y}
                        y2={y}
                        stroke={dark ? '#334155' : '#e2e8f0'}
                        strokeDasharray={value === 0 ? undefined : '5 6'}
                      />
                      <text
                        x={PLOT_LEFT - 10}
                        y={y + 4}
                        textAnchor="end"
                        fill={dark ? '#64748b' : '#64748b'}
                        fontSize="11"
                        fontWeight="700"
                      >
                        {value}
                      </text>
                    </g>
                  );
                })}

                {ticks.map((tick, index) => {
                  const ratio = Math.max(0, Math.min(1, (tick.value - range.startMs) / durationMs));
                  const x = PLOT_LEFT + ratio * PLOT_WIDTH;
                  return (
                    <g key={`${tick.value}-${tick.label}`} aria-hidden="true">
                      <line
                        x1={x}
                        x2={x}
                        y1={PLOT_TOP + PLOT_HEIGHT}
                        y2={PLOT_TOP + PLOT_HEIGHT + 5}
                        stroke={dark ? '#475569' : '#cbd5e1'}
                      />
                      <text
                        x={x}
                        y={PLOT_TOP + PLOT_HEIGHT + 23}
                        textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}
                        fill={dark ? '#94a3b8' : '#64748b'}
                        fontSize="11"
                        fontWeight="700"
                      >
                        {tick.label}
                      </text>
                    </g>
                  );
                })}

                {points.length === 1 && (
                  <line
                    aria-hidden="true"
                    x1={points[0].x}
                    x2={points[0].x}
                    y1={points[0].y}
                    y2={PLOT_TOP + PLOT_HEIGHT}
                    stroke={dark ? '#8b5cf6' : '#7c3aed'}
                    strokeDasharray="4 5"
                    strokeOpacity="0.35"
                  />
                )}
                {areaPath && (
                  <path aria-hidden="true" d={areaPath} fill={`url(#${chartId}-area)`} />
                )}
                {linePath && points.length > 1 && (
                  <path
                    aria-hidden="true"
                    d={linePath}
                    fill="none"
                    stroke={dark ? '#a78bfa' : '#7c3aed'}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="4"
                  />
                )}

                {points.map((point) => {
                  const active = selectedEntry?.id === point.id;
                  const showScore = points.length <= 8 || active || point.index === points.length - 1;
                  return (
                    <g
                      key={point.id}
                      aria-hidden="true"
                    >
                      <circle cx={point.x} cy={point.y} r="15" fill="transparent" />
                      {active && (
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="10"
                          fill="none"
                          stroke={dark ? '#c4b5fd' : '#8b5cf6'}
                          strokeWidth="3"
                          opacity="0.55"
                        />
                      )}
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={active ? 6 : 5}
                        fill={active ? (dark ? '#ddd6fe' : '#7c3aed') : (dark ? '#a78bfa' : '#8b5cf6')}
                        stroke={dark ? '#0f172a' : '#ffffff'}
                        strokeWidth="3"
                      />
                      {showScore && (
                        <text
                          x={point.x}
                          y={Math.max(15, point.y - 14)}
                          textAnchor="middle"
                          fill={dark ? '#e2e8f0' : '#334155'}
                          fontSize="11"
                          fontWeight="800"
                          aria-hidden="true"
                        >
                          {point.score}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            {safeEntries.length === 1 && (
              <p className={`px-2 pb-2 text-center text-[11px] ${
                dark ? 'text-slate-400' : 'text-slate-500'
              }`}>
                Нужен ещё один результат, чтобы появилась линия динамики
              </p>
            )}
          </div>

          {selectedEntry && (
            <div className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center ${
              dark
                ? 'border-violet-800/70 bg-violet-950/30'
                : 'border-violet-200 bg-violet-50/70'
            }`} aria-live="polite">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                dark ? 'bg-violet-900/65 text-violet-200' : 'bg-white text-violet-700'
              }`}>
                <Flag size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[10px] font-extrabold uppercase tracking-[0.1em] ${
                  dark ? 'text-violet-300' : 'text-violet-600'
                }`}>
                  {`Пробник №${selectedIndex + 1} · ${getSourceLabel(selectedEntry)}`}
                </div>
                <strong className={`mt-0.5 block truncate text-sm ${
                  dark ? 'text-white' : 'text-slate-950'
                }`}>
                  {selectedEntry.title}
                </strong>
                <div className={`mt-0.5 text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <time dateTime={selectedEntry.date}>{formatDate(selectedEntry.date)}</time>
                  {selectedEntry.comment && <span>{` · ${selectedEntry.comment}`}</span>}
                </div>
              </div>
              <strong className={`shrink-0 text-2xl font-black ${
                dark ? 'text-violet-100' : 'text-violet-800'
              }`}>
                {`${selectedEntry.score} `}
                <span className="text-xs font-bold">баллов</span>
              </strong>
            </div>
          )}

          <div>
            <div className={`mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] ${
              dark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {getResultCountLabel(summary.count)}
            </div>
            <ol
              className="flex gap-2 overflow-x-auto pb-1"
              aria-label="Результаты пробников по порядку"
            >
              {safeEntries.map((entry, index) => {
                const active = selectedEntry?.id === entry.id;
                return (
                  <li key={entry.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => selectPoint(entry)}
                      aria-pressed={active}
                      className={`flex min-w-[132px] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                        active
                          ? (dark
                              ? 'border-violet-500 bg-violet-900/55 text-white'
                              : 'border-violet-500 bg-violet-50 text-violet-950 shadow-sm')
                          : (dark
                              ? 'border-slate-700 bg-slate-950/35 text-slate-300 hover:border-violet-700'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300')
                      }`}
                    >
                      <span>
                        <strong className="block text-xs">{`№${index + 1}`}</strong>
                        <time className={`text-[10px] ${
                          active
                            ? (dark ? 'text-violet-200' : 'text-violet-600')
                            : (dark ? 'text-slate-500' : 'text-slate-500')
                        }`} dateTime={entry.date}>
                          {formatDate(entry.date, true)}
                        </time>
                      </span>
                      <strong className="text-base font-black">{entry.score}</strong>
                    </button>
                  </li>
                );
              })}
            </ol>
            {hasOnlineEntries && (
              <p className={`mt-2 text-[11px] leading-relaxed ${
                dark ? 'text-slate-500' : 'text-slate-500'
              }`}>
                Для онлайн-варианта показано последнее завершённое прохождение.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default MockExamProgressChart;
