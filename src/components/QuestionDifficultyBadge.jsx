import React from 'react';
import { Gauge } from 'lucide-react';
import {
  formatDifficultyDuration,
  formatDifficultyTooltip,
  getDifficultyMeta,
  hasEnoughQuestionDifficultyData,
} from '../utils/questionDifficulty';

const LIGHT_LEVEL_CLASSES = {
  very_easy: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  easy: 'border-teal-200 bg-teal-50 text-teal-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  hard: 'border-orange-200 bg-orange-50 text-orange-700',
  very_hard: 'border-rose-200 bg-rose-50 text-rose-700',
};

const DARK_LEVEL_CLASSES = {
  very_easy: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100',
  easy: 'border-teal-400/30 bg-teal-500/12 text-teal-100',
  medium: 'border-amber-400/30 bg-amber-500/12 text-amber-100',
  hard: 'border-orange-400/30 bg-orange-500/12 text-orange-100',
  very_hard: 'border-rose-400/30 bg-rose-500/12 text-rose-100',
};

const formatWrongAttempts = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace('.', ',');
};

const QuestionDifficultyBadge = ({
  difficulty,
  theme = '',
  showDetails = false,
  showWhenEmpty = false,
  minimumSampleSize = 1,
  className = '',
}) => {
  const hasDifficulty = hasEnoughQuestionDifficultyData(difficulty, minimumSampleSize);
  if (!hasDifficulty && !showWhenEmpty) return null;

  const dark = String(theme || '').trim().toLowerCase() === 'dark';
  if (!hasDifficulty) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
          dark
            ? 'border-slate-600/70 bg-slate-800/55 text-slate-300'
            : 'border-slate-200 bg-slate-50 text-slate-500'
        } ${className}`}
        title="Сложность появится после первых решений с новым таймером."
      >
        <Gauge size={12} aria-hidden="true" />
        Собираем данные
      </span>
    );
  }

  const meta = getDifficultyMeta(difficulty);
  const category = meta?.key || difficulty.category || 'medium';
  const levelClass = (dark ? DARK_LEVEL_CLASSES : LIGHT_LEVEL_CLASSES)[category]
    || (dark
      ? 'border-slate-600/70 bg-slate-800/55 text-slate-200'
      : 'border-slate-200 bg-slate-50 text-slate-700');
  const details = showDetails
    ? `В среднем: ${formatDifficultyDuration(difficulty.averageDurationMs)} · неверных попыток: ${formatWrongAttempts(difficulty.averageWrongAttempts)}`
    : '';
  const tooltip = formatDifficultyTooltip(difficulty);

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold shadow-sm ${levelClass} ${className}`}
      title={tooltip}
      aria-label={tooltip}
    >
      <Gauge size={12} aria-hidden="true" />
      <span className="truncate">{meta?.shortLabel || meta?.label || 'Сложность'}</span>
      {difficulty.provisional && (
        <span className="rounded-full border border-current/20 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide opacity-80">
          предв.
        </span>
      )}
      {details && <span className="whitespace-nowrap font-semibold opacity-80">{details}</span>}
    </span>
  );
};

export default QuestionDifficultyBadge;
