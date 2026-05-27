import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Award,
  CalendarDays,
  Flame,
  MessageSquare,
  Package2,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import { ARTIFACT_CATALOG_METADATA_BY_ID } from '../data/artifactCatalog';

const artifactModules = import.meta.glob('../assets/artefacts/**/*.png', { eager: true, import: 'default' });

const ARTIFACT_IMAGE_BY_ID = new Map(
  Object.entries(artifactModules)
    .map(([path, src]) => {
      const match = path.match(/\/artefacts\/[^/]+\/([^/]+)\.png$/);
      if (!match) return null;
      return [String(match[1] || '').trim(), src];
    })
    .filter(Boolean)
);

const ARTIFACT_RANK_ORDER = ['SS', 'S', 'A', 'B', 'C'];

const RANK_THEME = {
  SS: {
    accent: '#fb7185',
    badgeClassName: 'bg-rose-500/15 text-rose-50',
    frameClassName: 'bg-gradient-to-br from-rose-500/18 via-fuchsia-500/10 to-slate-950/90',
  },
  S: {
    accent: '#f97316',
    badgeClassName: 'bg-orange-500/15 text-orange-50',
    frameClassName: 'bg-gradient-to-br from-orange-500/18 via-amber-500/10 to-slate-950/90',
  },
  A: {
    accent: '#a855f7',
    badgeClassName: 'bg-fuchsia-500/15 text-fuchsia-50',
    frameClassName: 'bg-gradient-to-br from-fuchsia-500/18 via-violet-500/10 to-slate-950/90',
  },
  B: {
    accent: '#38bdf8',
    badgeClassName: 'bg-sky-500/15 text-sky-50',
    frameClassName: 'bg-gradient-to-br from-sky-500/18 via-cyan-500/10 to-slate-950/90',
  },
  C: {
    accent: '#94a3b8',
    badgeClassName: 'bg-slate-500/15 text-slate-50',
    frameClassName: 'bg-gradient-to-br from-slate-400/14 via-slate-500/8 to-slate-950/90',
  },
};

const TILE_THEME = {
  violet: {
    borderClassName: 'bg-violet-500/10',
    iconClassName: 'bg-violet-500/15 text-violet-100',
  },
  sky: {
    borderClassName: 'bg-sky-500/10',
    iconClassName: 'bg-sky-500/15 text-sky-100',
  },
  amber: {
    borderClassName: 'bg-amber-500/10',
    iconClassName: 'bg-amber-500/15 text-amber-100',
  },
  emerald: {
    borderClassName: 'bg-emerald-500/10',
    iconClassName: 'bg-emerald-500/15 text-emerald-100',
  },
};

const BONUS_TONE_CLASSNAME = {
  xp: 'bg-violet-500/12 text-violet-50',
  coins: 'bg-amber-500/12 text-amber-50',
  instant: 'bg-emerald-500/12 text-emerald-50',
};

const clampNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
};

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const formatNumber = (value) => clampNumber(value).toLocaleString('ru-RU');

const formatPercent = (value) => `${clampPercent(value)}%`;

const formatMockScore = (value) => `${clampPercent(value)} б`;

const formatDayCount = (value) => {
  const count = clampNumber(value);
  const mod10 = count % 10;
  const mod100 = count % 100;
  const unit = mod10 === 1 && mod100 !== 11
    ? 'день'
    : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'дня' : 'дней');
  return `${formatNumber(count)} ${unit}`;
};

const formatDateTime = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const hexToRgba = (hex, alpha) => {
  const normalized = String(hex || '').replace('#', '').trim();
  const safeHex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  if (safeHex.length !== 6) return `rgba(255,255,255,${alpha})`;
  const value = Number.parseInt(safeHex, 16);
  if (Number.isNaN(value)) return `rgba(255,255,255,${alpha})`;
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const buildRingStyle = (percent, accent) => {
  const safePercent = clampPercent(percent);
  const safeAccent = String(accent || '#8b5cf6');
  return {
    background: `conic-gradient(${safeAccent} 0deg ${safePercent * 3.6}deg, var(--student-profile-ring-track, rgba(255,255,255,0.08)) ${safePercent * 3.6}deg 360deg)`,
    boxShadow: `0 0 28px ${hexToRgba(safeAccent, 0.22)}`,
  };
};

const getArtifactVisual = (artifact) => {
  if (!artifact || typeof artifact !== 'object') return null;
  const id = String(artifact.id || '').trim();
  const metadata = ARTIFACT_CATALOG_METADATA_BY_ID.get(id) || null;
  const rank = String(artifact.rank || metadata?.rank || 'C').trim() || 'C';
  return {
    ...artifact,
    id,
    name: metadata?.name || artifact.name || id || 'Артефакт',
    rank,
    src: ARTIFACT_IMAGE_BY_ID.get(id) || '',
  };
};

const getArtifactRankSummary = (collection = []) => (
  ARTIFACT_RANK_ORDER.map((rank) => {
    const items = collection.filter((artifact) => String(artifact?.rank || '') === rank);
    return {
      rank,
      totalOwned: items.reduce((sum, artifact) => sum + clampNumber(artifact?.count), 0),
      uniqueOwned: items.length,
    };
  }).filter((item) => item.totalOwned > 0)
);

const MetricTile = ({ icon, label, value, tone = 'violet' }) => {
  const theme = TILE_THEME[tone] || TILE_THEME.violet;
  return (
    <div className={`student-profile-metric-tile student-profile-metric-tile--${tone} relative min-w-0 overflow-hidden rounded-[1.4rem] px-4 py-4 ${theme.borderClassName}`}>
      <div className="min-w-0 pr-16">
        <div className="student-profile-metric-label truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">{label}</div>
        <div className="student-profile-metric-value mt-2 text-[clamp(1.2rem,2.4vw,1.65rem)] font-black leading-none tracking-tight text-white">
          {value}
        </div>
      </div>
      <div className={`student-profile-metric-icon absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl ${theme.iconClassName}`}>
        {icon ? React.createElement(icon, { size: 19 }) : null}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/5 to-transparent" />
    </div>
  );
};

const GaugeCard = ({ label, value, percent, accent, meta = '', progressLabel = '' }) => (
  <div className="student-profile-gauge-card min-w-0 rounded-[1.55rem] bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
    <div className="student-profile-card-kicker text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">{label}</div>
    <div className="mt-4 flex items-center gap-4">
      <div className="student-profile-gauge-ring relative h-24 w-24 shrink-0 rounded-full p-[7px]" style={buildRingStyle(percent, accent)}>
        <div className="student-profile-gauge-core flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950">
          <div className="student-profile-gauge-value text-2xl font-black tracking-tight text-white">{value}</div>
          <div className="student-profile-gauge-progress mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
            {progressLabel || formatPercent(percent)}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="student-profile-gauge-title break-words text-lg font-bold leading-tight text-white">{label}</div>
        {meta && <div className="student-profile-gauge-meta mt-1 break-words text-sm leading-snug text-slate-300">{meta}</div>}
      </div>
    </div>
  </div>
);

const ArtifactSlot = ({ artifact, active = false, onSelect }) => {
  const rankTheme = RANK_THEME[artifact.rank] || RANK_THEME.C;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(artifact.id)}
      onMouseEnter={() => onSelect?.(artifact.id)}
      onFocus={() => onSelect?.(artifact.id)}
      className={`student-profile-artifact-slot group relative aspect-square w-full overflow-hidden rounded-[1rem] p-1.5 text-left transition duration-200 ${
        active
          ? `student-profile-artifact-slot--active ${rankTheme.frameClassName} shadow-[0_14px_34px_rgba(15,23,42,0.4)]`
          : 'bg-slate-950/50 hover:bg-white/[0.05]'
      }`}
      aria-pressed={active}
      title={artifact.name}
    >
      <div className="absolute left-1.5 top-1.5 z-[1]">
        <span className={`student-profile-artifact-rank rounded-full px-1.5 py-0.5 text-[8px] font-black tracking-[0.14em] ${rankTheme.badgeClassName}`}>
          {artifact.rank}
        </span>
      </div>
      <div className="absolute right-1.5 top-1.5 z-[1]">
        <span className="student-profile-artifact-count rounded-full bg-slate-950/75 px-1.5 py-0.5 text-[9px] font-bold text-white">
          x{formatNumber(artifact.count)}
        </span>
      </div>
      <div className="student-profile-artifact-frame relative flex h-full items-center justify-center overflow-hidden rounded-[0.85rem] bg-slate-950/80">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_62%)]" />
        {artifact.src ? (
          <div className="flex h-full w-full items-center justify-center">
            <img
              src={artifact.src}
              alt={artifact.name}
              className={`h-auto w-auto max-h-[50px] max-w-[50px] object-contain transition duration-200 sm:max-h-[56px] sm:max-w-[56px] ${
                active ? 'scale-110' : 'group-hover:scale-105'
              }`}
              loading="lazy"
            />
          </div>
        ) : (
          <div className="text-2xl font-black text-white/70">{artifact.rank}</div>
        )}
      </div>
    </button>
  );
};

const ArtifactPreview = ({ artifact }) => {
  const rankTheme = RANK_THEME[artifact.rank] || RANK_THEME.C;
  return (
    <div className={`student-profile-artifact-preview relative overflow-hidden rounded-[1.35rem] p-3 ${rankTheme.frameClassName}`}>
      <div
        className="pointer-events-none absolute -right-8 top-0 h-24 w-24 rounded-full blur-3xl"
        style={{ background: hexToRgba(rankTheme.accent, 0.18) }}
      />
      <div className="relative flex items-center gap-3">
        <div className="student-profile-artifact-preview-visual flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1rem] bg-slate-950/75">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(circle at center, ${hexToRgba(rankTheme.accent, 0.18)}, transparent 68%)` }}
          />
          {artifact.src ? (
            <img
              src={artifact.src}
              alt={artifact.name}
              className="relative z-[1] h-auto w-auto max-h-[56px] max-w-[56px] object-contain"
              loading="lazy"
            />
          ) : (
            <div className="relative z-[1] text-3xl font-black text-white/70">{artifact.rank}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2">
            <span className={`student-profile-artifact-rank rounded-full px-2.5 py-1 text-[10px] font-black tracking-[0.16em] ${rankTheme.badgeClassName}`}>
              {artifact.rank}
            </span>
            <span className="student-profile-artifact-preview-kicker text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Выбрано
            </span>
          </div>
          <div className="student-profile-artifact-preview-title mt-2 truncate text-base font-black text-white">{artifact.name}</div>
        </div>
        <div className="student-profile-artifact-preview-count shrink-0 rounded-full bg-slate-950/75 px-3 py-1 text-sm font-black text-white">
          x{formatNumber(artifact.count)}
        </div>
      </div>
    </div>
  );
};

const StrengthCard = ({ strength }) => {
  const displayNumber = String(strength?.displayNumber || strength?.taskNumber || '').trim();
  const badgeLabel = strength?.isPython
    ? `Python ${displayNumber || 'тема'}`
    : `№${displayNumber || strength?.taskNumber || ''}`;

  return (
    <div className="student-profile-strength-card rounded-[1.35rem] bg-slate-950/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div className="student-profile-strength-badge inline-flex h-11 min-w-[2.75rem] items-center justify-center rounded-2xl bg-emerald-500/12 px-3 text-lg font-black text-emerald-50">
          {badgeLabel}
        </div>
        <span className="student-profile-strength-percent rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-black tracking-[0.14em] text-white">
          {formatPercent(strength.percent)}
        </span>
      </div>
      <div className="student-profile-strength-title mt-3 text-sm font-semibold leading-snug text-white">
        {strength.title}
      </div>
      <div className="student-profile-strength-track mt-3 h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400"
          style={{ width: `${clampPercent(strength.percent)}%` }}
        />
      </div>
    </div>
  );
};

const StudentLeaderboardProfileModal = ({
  open,
  row,
  profile,
  loading = false,
  error = '',
  levelPosition = null,
  weeklyPosition = null,
  chatOpening = false,
  chatError = '',
  onClose,
  onRetry,
  onOpenDirectChat,
  getLeagueByXp,
  getLeagueAuraStyle,
  isAbsoluteOrAboveLeague,
  ABSOLUTE_AURA_CROWN_STYLE,
  getLevelFromXp,
  getLevelProgressFromXp,
  getLeagueIconClassName,
}) => {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  const profileData = profile && typeof profile === 'object' ? profile : null;

  const visualState = useMemo(() => {
    const resolvedXpTotal = clampNumber(profileData?.xpTotal ?? row?.xpTotal);
    const resolvedWeeklyXp = clampNumber(profileData?.weeklyXp ?? row?.weeklyXp);
    const resolvedLevelRaw = Number(profileData?.level ?? row?.level);
    const resolvedLevel = Number.isFinite(resolvedLevelRaw) && resolvedLevelRaw > 0
      ? Math.floor(resolvedLevelRaw)
      : (typeof getLevelFromXp === 'function' ? getLevelFromXp(resolvedXpTotal) : 1);
    const displayName = String(profileData?.publicName || row?.displayName || 'Профиль ученика').trim() || 'Профиль ученика';
    const league = typeof getLeagueByXp === 'function'
      ? getLeagueByXp(resolvedXpTotal)
      : { id: 'blank', label: 'Без лиги', icon: '' };
    const levelProgress = typeof getLevelProgressFromXp === 'function'
      ? getLevelProgressFromXp(resolvedXpTotal)
      : { xpIntoLevel: 0, xpForNextLevel: 1, progressPercent: 0 };
    const xpIntoCurrentLevel = levelProgress.xpIntoLevel;
    const xpForNextLevel = levelProgress.xpForNextLevel;
    const levelProgressPercent = clampPercent(levelProgress.progressPercent);
    const progressSummary = profileData?.progress && typeof profileData.progress === 'object' ? profileData.progress : {};
    const activitySummary = profileData?.activity && typeof profileData.activity === 'object' ? profileData.activity : {};
    const streakSummary = profileData?.streak && typeof profileData.streak === 'object' ? profileData.streak : {};
    const preparationSummary = profileData?.preparation && typeof profileData.preparation === 'object' ? profileData.preparation : {};
    const mockSummary = profileData?.mocks && typeof profileData.mocks === 'object' ? profileData.mocks : {};
    const coinSummary = profileData?.coins && typeof profileData.coins === 'object' ? profileData.coins : {};
    const artifactSummary = profileData?.artifacts && typeof profileData.artifacts === 'object' ? profileData.artifacts : {};
    const profileThemeRaw = profileData?.profileTheme && typeof profileData.profileTheme === 'object'
      ? profileData.profileTheme
      : (row?.profileTheme && typeof row.profileTheme === 'object' ? row.profileTheme : null);
    const profileTheme = profileThemeRaw?.id
      ? {
          id: String(profileThemeRaw.id || '').trim(),
          name: String(profileThemeRaw.name || profileThemeRaw.shortName || profileThemeRaw.id || '').trim(),
          rarity: String(profileThemeRaw.rarity || 'common').trim().toLowerCase(),
        }
      : null;
    const collection = (Array.isArray(artifactSummary.collection) ? artifactSummary.collection : [])
      .map(getArtifactVisual)
      .filter(Boolean)
      .sort((left, right) => {
        const rankDiff = ARTIFACT_RANK_ORDER.indexOf(left.rank) - ARTIFACT_RANK_ORDER.indexOf(right.rank);
        if (rankDiff !== 0) return rankDiff;
        return clampNumber(right.count) - clampNumber(left.count);
      });
    const topCollection = collection.slice(0, 10);
    const bonusEntries = Array.isArray(artifactSummary?.bonuses?.entries)
      ? artifactSummary.bonuses.entries.filter((entry) => entry && typeof entry === 'object')
      : [];

    return {
      displayName,
      league,
      resolvedLevel,
      resolvedXpTotal,
      resolvedWeeklyXp,
      xpIntoCurrentLevel,
      xpForNextLevel,
      levelProgressPercent,
      progressSummary,
      activitySummary,
      streakSummary,
      preparationSummary,
      mockSummary,
      coinSummary,
      artifactSummary,
      profileTheme,
      topCollection,
      collection,
      bonusEntries,
    };
  }, [getLeagueByXp, getLevelFromXp, getLevelProgressFromXp, profileData, row]);

  const [selectedArtifactId, setSelectedArtifactId] = useState('');

  if (!open || typeof document === 'undefined') return null;

  const {
    displayName,
    league,
    resolvedLevel,
    resolvedXpTotal,
    resolvedWeeklyXp,
    xpIntoCurrentLevel,
    xpForNextLevel,
    levelProgressPercent,
    progressSummary,
    activitySummary,
    streakSummary,
    preparationSummary,
    mockSummary,
    coinSummary,
    artifactSummary,
    profileTheme,
    topCollection,
    collection,
    bonusEntries,
  } = visualState;

  const leagueAuraStyle = typeof getLeagueAuraStyle === 'function' ? getLeagueAuraStyle(league?.id) : undefined;
  const isAbsoluteLeague = typeof isAbsoluteOrAboveLeague === 'function' ? isAbsoluteOrAboveLeague(league?.id) : false;
  const remainingXp = Math.max((Number(xpForNextLevel) || 0) - xpIntoCurrentLevel, 0);
  const rankSummary = getArtifactRankSummary(collection);
  const strongestTasks = Array.isArray(progressSummary.strongestTasks) ? progressSummary.strongestTasks.slice(0, 3) : [];
  const bestMock = mockSummary.best && typeof mockSummary.best === 'object' ? mockSummary.best : null;
  const resolvedSelectedArtifactId = topCollection.some((artifact) => artifact.id === selectedArtifactId)
    ? selectedArtifactId
    : (topCollection[0]?.id || '');
  const featuredArtifact = topCollection.find((artifact) => artifact.id === resolvedSelectedArtifactId) || topCollection[0] || null;
  const bestStreak = Math.max(clampNumber(streakSummary.best), clampNumber(streakSummary.current));
  const quickStats = [
    { key: 'week-xp', icon: TrendingUp, label: 'XP 7д', value: formatNumber(resolvedWeeklyXp), tone: 'sky' },
    { key: 'streak', icon: Flame, label: 'Макс. серия', value: formatNumber(bestStreak), tone: 'amber' },
    { key: 'prep-days', icon: CalendarDays, label: 'Подготовка', value: formatDayCount(preparationSummary.days), tone: 'emerald' },
    { key: 'solved', icon: Target, label: 'Реш.', value: formatNumber(progressSummary.solvedQuestions), tone: 'emerald' },
    { key: 'coins', icon: Star, label: 'Монеты', value: formatNumber(coinSummary.balance), tone: 'violet' },
  ];
  const rankCards = [
    { key: 'level', label: 'Топ XP', value: levelPosition ? `#${levelPosition}` : '—' },
    { key: 'week', label: 'Топ 7д', value: weeklyPosition ? `#${weeklyPosition}` : '—' },
  ];
  const profileStudentId = String(profileData?.studentId || row?.studentId || '').trim();
  const isCurrentProfile = Boolean(profileData?.isCurrent || row?.isCurrent);
  const canOpenDirectChat = Boolean(
    profileStudentId
    && !isCurrentProfile
    && typeof onOpenDirectChat === 'function'
  );

  const renderLoadingState = () => (
    <div className="space-y-4 animate-pulse">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={`loading-stat-${index}`} className="h-28 rounded-[1.35rem] bg-white/[0.05]" />
        ))}
      </div>
      <div className="grid gap-4 2xl:grid-cols-[1.05fr,0.95fr]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={`loading-gauge-${index}`} className="h-40 rounded-[1.55rem] bg-white/[0.05]" />
            ))}
          </div>
          <div className="h-72 rounded-[1.6rem] bg-white/[0.05]" />
        </div>
        <div className="min-w-0 space-y-4">
          <div className="h-36 rounded-[1.6rem] bg-white/[0.05]" />
          <div className="h-52 rounded-[1.6rem] bg-white/[0.05]" />
          <div className="h-48 rounded-[1.6rem] bg-white/[0.05]" />
        </div>
      </div>
    </div>
  );

  const renderErrorState = () => (
    <div className="rounded-[1.6rem] bg-rose-500/10 p-5 text-rose-50">
      <div className="text-lg font-semibold">Не удалось загрузить профиль</div>
      <div className="mt-2 text-sm text-rose-100/85">{error || 'Попробуйте ещё раз.'}</div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-rose-50 transition hover:bg-white/15"
        >
          Повторить
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
        >
          Закрыть
        </button>
      </div>
    </div>
  );

  const modal = (
    <div
      className="student-profile-modal-overlay fixed inset-0 z-[1450] overflow-y-auto bg-slate-950/72 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Профиль ученика ${displayName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal-card student-profile-modal-card relative mx-auto w-full max-w-6xl overflow-hidden rounded-[2rem] bg-slate-950 text-slate-100 shadow-[0_35px_120px_rgba(15,23,42,0.72)]"
        data-profile-theme={profileTheme?.id || undefined}
      >
        <div className="student-profile-modal-bg absolute inset-0">
          <div className="student-profile-modal-bg-main absolute inset-x-0 top-0 h-[24rem] sm:h-[26rem] lg:h-[28rem] bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.34),transparent_48%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.25),transparent_40%),linear-gradient(180deg,rgba(59,7,100,0.5)_0%,rgba(37,26,78,0.28)_58%,rgba(2,6,23,0)_100%)]" />
          <div className="student-profile-modal-glow student-profile-modal-glow--left absolute -left-20 top-12 h-44 w-44 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="student-profile-modal-glow student-profile-modal-glow--right absolute -right-10 top-20 h-36 w-36 rounded-full bg-sky-400/10 blur-3xl" />
        </div>

        <div className="relative z-[1] p-4 sm:p-5 lg:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="student-profile-kicker inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/90">
                <Sparkles size={13} />
                Игрок
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <div
                  className={`student-profile-league-avatar relative flex h-24 w-24 shrink-0 items-center justify-center overflow-visible rounded-full ${
                    league?.id === 'blank'
                      ? 'bg-slate-900/70'
                      : 'bg-white/95'
                  }`}
                  title={league?.label || 'Лига'}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute z-0 rounded-full ${
                      isAbsoluteLeague ? 'inset-[-16px] blur-[14px]' : 'inset-[-13px] blur-[11px]'
                    }`}
                    style={leagueAuraStyle}
                  />
                  {isAbsoluteLeague && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[-18px] z-0 rounded-full blur-[15px]"
                      style={ABSOLUTE_AURA_CROWN_STYLE}
                    />
                  )}
                  {league?.icon ? (
                    <img
                      src={league.icon}
                      alt={league.label}
                      className={`relative z-[1] aspect-square object-contain ${getLeagueIconClassName?.(league.id, 'md') || 'h-12 w-12'}`}
                      loading="lazy"
                    />
                  ) : (
                    <span className="relative z-[1] h-9 w-9 rounded-full bg-slate-300" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <div className="student-profile-name min-w-0 max-w-full truncate text-[clamp(1.7rem,4.2vw,2.7rem)] font-black tracking-tight text-white">
                      {displayName}
                    </div>
                    <span
                      className="student-profile-level-badge relative inline-grid h-[3.7rem] w-[3.7rem] shrink-0 place-items-center text-white [filter:drop-shadow(0_14px_22px_rgba(37,99,235,0.24))_drop-shadow(0_8px_18px_rgba(88,28,135,0.32))]"
                      title={`Уровень ${resolvedLevel}`}
                      aria-label={`Уровень ${resolvedLevel}`}
                    >
                      <span className="absolute -inset-1 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.2),transparent_68%)] blur-[1px]" />
                      <span className="absolute inset-0 [clip-path:polygon(50%_0%,88%_15%,98%_54%,73%_94%,27%_94%,2%_54%,12%_15%)] bg-[conic-gradient(from_205deg,#5b21b6,#2563eb,#22d3ee,#7c3aed,#5b21b6)]" />
                      <span className="absolute inset-[2px] [clip-path:polygon(50%_0%,88%_15%,98%_54%,73%_94%,27%_94%,2%_54%,12%_15%)] bg-[linear-gradient(150deg,#7c3aed_0%,#2563eb_48%,#0891b2_100%)] shadow-[inset_0_-14px_20px_rgba(15,23,42,0.3)]" />
                      <span className="absolute inset-[7px] [clip-path:polygon(50%_0%,86%_16%,94%_54%,71%_92%,29%_92%,6%_54%,14%_16%)] bg-[radial-gradient(circle_at_50%_32%,rgba(255,255,255,0.15),rgba(15,23,42,0.04)_44%,rgba(15,23,42,0.2)_100%)]" />
                      <span className="absolute bottom-[0.42rem] h-[2px] w-7 rounded-full bg-cyan-200/50 shadow-[0_0_10px_rgba(34,211,238,0.4)]" />
                      <span className="absolute left-1/2 top-[47%] z-[1] -translate-x-1/2 -translate-y-1/2 text-center text-[1.88rem] font-black leading-none tracking-tight text-white drop-shadow-[0_3px_8px_rgba(15,23,42,0.56)]">
                        {resolvedLevel}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="student-profile-info-chip inline-flex min-h-9 items-center justify-center rounded-full bg-white/5 px-3 text-xs font-semibold leading-none text-slate-100">
                      {league?.label || 'Без лиги'}
                    </span>
                    <span className="student-profile-info-chip inline-flex min-h-9 items-center justify-center rounded-full bg-white/5 px-3 text-xs font-semibold leading-none text-slate-100">
                      {`${formatNumber(resolvedXpTotal)} XP`}
                    </span>
                    {canOpenDirectChat && (
                      <button
                        type="button"
                        onClick={() => onOpenDirectChat(profileStudentId)}
                        disabled={chatOpening}
                        className="student-profile-direct-button inline-flex min-h-9 items-center justify-center gap-2 rounded-2xl border border-cyan-200/70 bg-gradient-to-r from-cyan-400 via-sky-500 to-fuchsia-500 px-4 text-sm font-black leading-none text-white shadow-[0_16px_34px_rgba(14,165,233,0.28),0_0_0_1px_rgba(255,255,255,0.12)_inset] transition hover:-translate-y-0.5 hover:border-white/80 hover:shadow-[0_20px_42px_rgba(168,85,247,0.34),0_0_0_1px_rgba(255,255,255,0.18)_inset] disabled:cursor-wait disabled:translate-y-0 disabled:opacity-70"
                      >
                        <MessageSquare size={13} />
                        {chatOpening ? 'Открываем...' : 'Личные сообщения'}
                      </button>
                    )}
                    {profileData?.isCurrent && (
                      <span className="student-profile-info-chip student-profile-info-chip--self inline-flex min-h-9 items-center justify-center rounded-full bg-emerald-500/10 px-3 text-xs font-semibold leading-none text-emerald-100">
                        Это вы
                      </span>
                    )}
                    {profileTheme && (
                      <span className="student-profile-modal-card__theme-chip inline-flex min-h-9 items-center justify-center rounded-full bg-white/5 px-3 text-xs font-semibold leading-none text-slate-100">
                        {profileTheme.name || profileTheme.id}
                      </span>
                    )}
                  </div>
                  {chatError && (
                    <div className="mt-2 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100">
                      {chatError}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="student-profile-close-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-slate-100 transition hover:bg-white/10"
              aria-label="Закрыть профиль"
            >
              <X size={20} />
            </button>
          </div>

          {loading && profileData && (
            <div className="student-profile-loading-pill mt-4 inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100">
              <span className="h-2 w-2 rounded-full bg-sky-300 animate-pulse" />
              Обновляем...
            </div>
          )}

          <div className="mt-5">
            {!profileData && loading
              ? renderLoadingState()
              : error && !profileData
                ? renderErrorState()
                : (
                  <div className="grid gap-4 2xl:grid-cols-[1.06fr,0.94fr]">
                    <div className="min-w-0 space-y-4">
                      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                        {quickStats.map((item) => (
                          <MetricTile
                            key={item.key}
                            icon={item.icon}
                            label={item.label}
                            value={item.value}
                            tone={item.tone}
                          />
                        ))}
                      </div>

                      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                        <GaugeCard
                          label="Уровень"
                          value={String(resolvedLevel)}
                          percent={levelProgressPercent}
                          accent="#8b5cf6"
                          meta={`${formatNumber(remainingXp)} XP до следующего`}
                        />
                        <GaugeCard
                          label="Курс"
                          value={formatPercent(progressSummary.overallPercent)}
                          percent={progressSummary.overallPercent}
                          accent="#14b8a6"
                          meta={`${formatNumber(progressSummary.completedTasks)} / ${formatNumber(progressSummary.totalTasks)} задач`}
                        />
                        <GaugeCard
                          label="Пробник"
                          value={formatMockScore(bestMock?.score ?? mockSummary.bestScore)}
                          percent={mockSummary.bestScore}
                          accent="#f59e0b"
                          progressLabel="баллы"
                          meta={bestMock?.title || `${formatNumber(mockSummary.solvedCount)} решено`}
                        />
                      </div>

                      <div className="student-profile-section-card rounded-[1.6rem] bg-white/[0.045] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="student-profile-section-title text-sm font-semibold text-white">Артефакты</div>
                          <div className="flex flex-wrap gap-2">
                            {rankSummary.length > 0 ? rankSummary.map((item) => {
                              const theme = RANK_THEME[item.rank] || RANK_THEME.C;
                              return (
                                <span
                                  key={`artifact-rank-${item.rank}`}
                                  className={`student-profile-rank-summary-badge rounded-full px-2.5 py-1 text-[11px] font-black tracking-[0.16em] ${theme.badgeClassName}`}
                                >
                                  {`${item.rank} x${formatNumber(item.totalOwned)}`}
                                </span>
                              );
                            }) : (
                              <span className="student-profile-pill rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                                Пусто
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4">
                          {topCollection.length > 0 && featuredArtifact ? (
                            <div className="space-y-3">
                              <ArtifactPreview
                                artifact={featuredArtifact}
                              />
                              <div className="student-profile-collection-card rounded-[1.45rem] bg-slate-950/36 p-3 sm:p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="student-profile-card-kicker text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                                    Коллекция
                                  </div>
                                  <div className="student-profile-section-meta text-xs text-slate-400">
                                    {`${formatNumber(topCollection.length)} из ${formatNumber(collection.length)}`}
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                                  {topCollection.map((artifact) => (
                                    <ArtifactSlot
                                      key={`artifact-${artifact.id}`}
                                      artifact={artifact}
                                      active={featuredArtifact.id === artifact.id}
                                      onSelect={setSelectedArtifactId}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="student-profile-empty-state w-full rounded-[1.35rem] bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-400">
                              Артефактов пока нет
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {rankCards.map((item) => (
                          <div key={item.key} className="student-profile-section-card student-profile-rank-card rounded-[1.45rem] bg-white/[0.045] p-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                            <div className="student-profile-card-kicker text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">{item.label}</div>
                            <div className="student-profile-rank-value mt-2 text-[2rem] font-black tracking-tight text-white">{item.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <MetricTile
                          icon={Shield}
                          label="Активн. дни"
                          value={formatNumber(activitySummary.weeklyActiveDays)}
                          tone="sky"
                        />
                        <MetricTile
                          icon={Award}
                          label="Реш. пробн."
                          value={formatNumber(mockSummary.solvedCount)}
                          tone="violet"
                        />
                        <MetricTile
                          icon={Package2}
                          label="Крутки"
                          value={formatNumber(artifactSummary.totalPulls)}
                          tone="amber"
                        />
                        <MetricTile
                          icon={Trophy}
                          label="Идеал"
                          value={formatNumber(mockSummary.perfectCount)}
                          tone="emerald"
                        />
                      </div>

                      <div className="student-profile-section-card rounded-[1.6rem] bg-white/[0.045] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="student-profile-section-title text-sm font-semibold text-white">Лучший пробник</div>
                          <div className="student-profile-section-meta text-xs text-slate-400">
                            {bestMock?.updatedAt ? formatDateTime(bestMock.updatedAt) : `${formatNumber(mockSummary.solvedCount)} решено`}
                          </div>
                        </div>
                        <div className="mt-4">
                          {bestMock ? (
                            <div className="grid gap-4 sm:grid-cols-[auto,1fr] sm:items-center">
                              <div className="student-profile-best-mock-score inline-flex h-24 w-24 items-center justify-center rounded-[1.55rem] bg-amber-500/12 text-[1.9rem] font-black tracking-tight text-amber-50 shadow-[0_0_36px_rgba(245,158,11,0.16)]">
                                {formatMockScore(bestMock.score)}
                              </div>
                              <div className="min-w-0">
                                <div className="student-profile-best-mock-title text-lg font-bold leading-snug text-white">
                                  {bestMock.title}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="student-profile-pill rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100">
                                    {`${formatNumber(bestMock.solvedTasks)} / ${formatNumber(bestMock.totalTasks)} задач`}
                                  </span>
                                  <span className="student-profile-pill rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100">
                                    {`Средний: ${formatMockScore(mockSummary.averageScore)}`}
                                  </span>
                                  <span className="student-profile-pill rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100">
                                    {`Всего решено: ${formatNumber(mockSummary.solvedCount)}`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="student-profile-empty-state rounded-[1.35rem] bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                              Пока нет решённых пробников
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="student-profile-section-card rounded-[1.6rem] bg-white/[0.045] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="student-profile-section-title text-sm font-semibold text-white">Сильные стороны</div>
                          <div className="student-profile-section-meta text-xs text-slate-400">{formatNumber(strongestTasks.length)}</div>
                        </div>
                        <div className="mt-4 grid gap-3">
                          {strongestTasks.length > 0 ? strongestTasks.map((strength) => (
                            <StrengthCard
                              key={`strength-${strength.taskId}`}
                              strength={strength}
                            />
                          )) : (
                            <div className="student-profile-empty-state rounded-[1.35rem] bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                              Сильные стороны пока собираются
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="student-profile-section-card rounded-[1.6rem] bg-white/[0.045] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="student-profile-section-title text-sm font-semibold text-white">Эффекты</div>
                          <div className="student-profile-section-meta text-xs text-slate-400">{formatNumber(bonusEntries.length)}</div>
                        </div>
                        <div className="mt-4 grid gap-2">
                          {bonusEntries.length > 0 ? bonusEntries.map((entry) => (
                            <div
                              key={`bonus-${entry.id || entry.label}`}
                              className={`student-profile-bonus-card rounded-2xl px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${BONUS_TONE_CLASSNAME[entry.tone] || 'bg-white/5 text-slate-100'}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 truncate text-sm font-semibold">{entry.label || 'Бонус'}</div>
                                <div className="shrink-0 text-base font-black">{entry.value || 'Активен'}</div>
                              </div>
                            </div>
                          )) : (
                            <div className="student-profile-empty-state rounded-[1.35rem] bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                              Эффектов пока нет
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default StudentLeaderboardProfileModal;
