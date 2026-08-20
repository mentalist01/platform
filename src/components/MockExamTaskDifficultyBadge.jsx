import React from 'react';
import { Gauge } from 'lucide-react';

import {
  formatDifficultyDuration,
  getDifficultyMeta,
  hasEnoughQuestionDifficultyData,
} from '../utils/questionDifficulty';

const LEVEL_CLASSES = {
  very_easy: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  easy: 'border-teal-200 bg-teal-50 text-teal-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  hard: 'border-orange-200 bg-orange-50 text-orange-700',
  very_hard: 'border-rose-200 bg-rose-50 text-rose-700',
};

const getSolutionWord = (count) => {
  const value = Math.abs(Math.trunc(Number(count) || 0));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'решений';
  if (last === 1) return 'решение';
  if (last >= 2 && last <= 4) return 'решения';
  return 'решений';
};

const MockExamTaskDifficultyBadge = ({
  analytics,
  showDetails = false,
  showSampleSize = false,
  showWhenEmpty = false,
  className = '',
}) => {
  const hasAnalytics = hasEnoughQuestionDifficultyData(analytics, 1);
  if (!hasAnalytics && !showWhenEmpty) return null;
  if (!hasAnalytics) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-500 ${className}`}
        title="Сложность появится после первых решений с активным таймером."
      >
        <Gauge size={12} aria-hidden="true" />
        Собираем данные
      </span>
    );
  }

  const meta = getDifficultyMeta(analytics);
  const category = meta?.key || analytics.category || 'medium';
  const sampleSize = Math.max(0, Math.floor(Number(analytics.sampleSize) || 0));
  const accuracyPercent = Math.max(0, Math.min(100, Math.round(Number(analytics.accuracyPercent) || 0)));
  const averageDuration = formatDifficultyDuration(
    analytics.averageActiveDurationMs ?? analytics.averageDurationMs
  );
  const prefix = analytics.provisional ? 'Предварительно: ' : '';
  const details = [
    showDetails ? `${averageDuration} · ${accuracyPercent}% верно` : '',
    showSampleSize ? `Решений: ${sampleSize}` : '',
  ].filter(Boolean).join(' · ');
  const tooltip = `${prefix}${meta?.label || 'Сложность'} · ${Math.round(Number(analytics.score) || 0)}/100 · Среднее активное время: ${averageDuration} · Верно: ${accuracyPercent}% · ${sampleSize} ${getSolutionWord(sampleSize)}`;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold shadow-sm ${LEVEL_CLASSES[category] || 'border-slate-200 bg-slate-50 text-slate-700'} ${className}`}
      title={tooltip}
      aria-label={tooltip}
    >
      <Gauge size={12} aria-hidden="true" />
      <span className="truncate">{meta?.shortLabel || meta?.label || 'Сложность'}</span>
      {analytics.provisional && (
        <span className="rounded-full border border-current/20 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide opacity-80">
          предв.
        </span>
      )}
      {details && (
        <span className="whitespace-nowrap font-semibold opacity-80">
          {details}
        </span>
      )}
    </span>
  );
};

export default MockExamTaskDifficultyBadge;
