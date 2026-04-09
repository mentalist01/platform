import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Package2, Sparkles } from 'lucide-react';
import ivanCoin from '../assets/ivan-coin-badge.png';

const artifactModules = import.meta.glob('../assets/artefacts/**/*.png', { eager: true, import: 'default' });

const RANK_FOLDER_TO_ID = {
  's-rank': 'S',
  'a-rank': 'A',
  'b-rank': 'B',
  'c-rank': 'C',
};

const RANK_META = {
  S: {
    label: 'S',
    title: 'Легендарный',
    pillClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    accent: '#ef4444',
    surface: 'linear-gradient(135deg, rgba(255,241,242,0.98), rgba(254,226,226,0.94))',
    glow: '0 0 26px rgba(239, 68, 68, 0.4), 0 0 54px rgba(249, 115, 22, 0.22)',
  },
  A: {
    label: 'A',
    title: 'Эпический',
    pillClassName: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
    accent: '#a855f7',
    surface: 'linear-gradient(135deg, rgba(250,245,255,0.98), rgba(243,232,255,0.96))',
    glow: '0 0 24px rgba(168, 85, 247, 0.34), 0 0 50px rgba(192, 132, 252, 0.2)',
  },
  B: {
    label: 'B',
    title: 'Редкий',
    pillClassName: 'border-sky-200 bg-sky-50 text-sky-700',
    accent: '#3b82f6',
    surface: 'linear-gradient(135deg, rgba(239,246,255,0.98), rgba(224,242,254,0.96))',
    glow: '0 0 22px rgba(59, 130, 246, 0.28), 0 0 46px rgba(14, 165, 233, 0.18)',
  },
  C: {
    label: 'C',
    title: 'Обычный',
    pillClassName: 'border-slate-200 bg-slate-50 text-slate-700',
    accent: '#64748b',
    surface: 'linear-gradient(135deg, rgba(248,250,252,0.98), rgba(241,245,249,0.96))',
    glow: '0 0 18px rgba(148, 163, 184, 0.2), 0 0 34px rgba(148, 163, 184, 0.14)',
  },
};

const IDLE_ALTAR_META = {
  accent: '#f59e0b',
  title: 'Пробуждение',
  pillClassName: 'border-amber-200 bg-amber-50 text-amber-700',
};

const ARTIFACT_LABELS = {
  krylov: 'Крылов',
  tears: 'Слезы',
  '1tbssd': '1 TB SSD',
  'list-comprehension': 'List Comprehension',
  python: 'Python',
  crutch: 'Костыль',
  whileTrue: 'while True',
  black_pen: 'Черная ручка',
  coffee: 'Кофе',
  draft: 'Черновик',
};

const ARTIFACT_RANK_ORDER = ['S', 'A', 'B', 'C'];
const DEFAULT_RANK_CHANCES = [
  { rank: 'S', chancePercent: 5 },
  { rank: 'A', chancePercent: 10 },
  { rank: 'B', chancePercent: 30 },
  { rank: 'C', chancePercent: 55 },
];

const MIN_SPIN_DURATION_MS = 1500;
const REVEAL_VISIBLE_MS = 3200;
const ALTAR_PARTICLES = [
  { angle: '-82deg', distance: '124px', delay: '0ms', size: '12px' },
  { angle: '-42deg', distance: '142px', delay: '120ms', size: '10px' },
  { angle: '-4deg', distance: '156px', delay: '220ms', size: '14px' },
  { angle: '38deg', distance: '144px', delay: '80ms', size: '11px' },
  { angle: '78deg', distance: '126px', delay: '200ms', size: '12px' },
  { angle: '118deg', distance: '138px', delay: '160ms', size: '9px' },
  { angle: '158deg', distance: '150px', delay: '260ms', size: '10px' },
  { angle: '198deg', distance: '132px', delay: '60ms', size: '12px' },
];

const ARTIFACT_CATALOG = Object.entries(artifactModules)
  .map(([path, src]) => {
    const match = path.match(/\/artefacts\/([^/]+)\/([^/]+)\.png$/);
    if (!match) return null;
    const folder = String(match[1] || '').trim();
    const rank = RANK_FOLDER_TO_ID[folder] || 'C';
    const id = String(match[2] || '').trim();
    if (!id) return null;
    return {
      id,
      rank,
      name: ARTIFACT_LABELS[id] || id,
      src,
    };
  })
  .filter(Boolean)
  .sort((a, b) => {
    const rankDiff = ARTIFACT_RANK_ORDER.indexOf(a.rank) - ARTIFACT_RANK_ORDER.indexOf(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name, 'ru');
  });

const rankGroupMap = ARTIFACT_CATALOG.reduce((acc, artifact) => {
  const current = acc.get(artifact.rank) || [];
  current.push(artifact);
  acc.set(artifact.rank, current);
  return acc;
}, new Map());

const hexToRgba = (hex, alpha) => {
  const normalized = String(hex || '').replace('#', '').trim();
  if (!normalized) return `rgba(245, 158, 11, ${alpha})`;
  const safeHex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  if (safeHex.length !== 6) return `rgba(245, 158, 11, ${alpha})`;
  const value = Number.parseInt(safeHex, 16);
  if (Number.isNaN(value)) return `rgba(245, 158, 11, ${alpha})`;
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const getPullKey = (pull, totalPulls) => {
  if (!pull || typeof pull !== 'object') return `none:${totalPulls}`;
  return [
    pull.id,
    pull.rank,
    pull.count,
    pull.pulledAt,
    totalPulls,
  ]
    .map((value) => String(value ?? '').trim())
    .join(':');
};

const getRankCardStyle = (rank, owned = true) => {
  const meta = RANK_META[rank] || RANK_META.C;
  if (!owned) {
    return {
      borderColor: 'rgba(203, 213, 225, 0.92)',
      background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(248,250,252,0.92))',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
    };
  }
  return {
    borderColor: `${meta.accent}55`,
    background: meta.surface,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.88), ${meta.glow}`,
  };
};

const StudentArtifactAltar = ({
  altar = null,
  coinsTotal = 0,
  onSpin,
  spinning = false,
  spinError = '',
}) => {
  const spinCost = Number.isFinite(Number(altar?.spinCost)) ? Math.max(1, Number(altar.spinCost)) : 20;
  const rankChances = Array.isArray(altar?.rankChances) && altar.rankChances.length > 0
    ? altar.rankChances
    : DEFAULT_RANK_CHANCES;
  const collection = Array.isArray(altar?.collection) ? altar.collection : [];
  const lastPull = altar?.lastPull && typeof altar.lastPull === 'object' ? altar.lastPull : null;
  const totalPulls = Number.isFinite(Number(altar?.totalPulls)) ? Math.max(0, Number(altar.totalPulls)) : 0;
  const totalOwned = Number.isFinite(Number(altar?.totalOwned)) ? Math.max(0, Number(altar.totalOwned)) : 0;
  const uniqueOwned = Number.isFinite(Number(altar?.uniqueOwned)) ? Math.max(0, Number(altar.uniqueOwned)) : 0;
  const canSpin = typeof onSpin === 'function' && !spinning && coinsTotal >= spinCost;

  const [altarPhase, setAltarPhase] = useState(lastPull ? 'settled' : 'idle');
  const [displayPull, setDisplayPull] = useState(lastPull);

  const ownedById = useMemo(() => (
    collection.reduce((acc, artifact) => {
      const id = String(artifact?.id || '').trim();
      if (!id) return acc;
      acc.set(id, Math.max(0, Math.floor(Number(artifact?.count) || 0)));
      return acc;
    }, new Map())
  ), [collection]);

  const lastPullKey = useMemo(() => getPullKey(lastPull, totalPulls), [lastPull, totalPulls]);
  const previousPullKeyRef = useRef(lastPullKey);
  const spinCycleRef = useRef(false);
  const spinStartedAtRef = useRef(0);
  const pendingRevealRef = useRef(null);
  const revealTimerRef = useRef(null);
  const resetTimerRef = useRef(null);

  const clearAnimationTimers = () => {
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const runReveal = (pull) => {
    clearAnimationTimers();
    if (!pull) {
      spinCycleRef.current = false;
      setAltarPhase(displayPull ? 'settled' : 'idle');
      return;
    }
    pendingRevealRef.current = null;
    const elapsed = spinStartedAtRef.current ? Date.now() - spinStartedAtRef.current : MIN_SPIN_DURATION_MS;
    const delay = Math.max(0, MIN_SPIN_DURATION_MS - elapsed);
    revealTimerRef.current = window.setTimeout(() => {
      setDisplayPull(pull);
      setAltarPhase('revealed');
      spinCycleRef.current = false;
      resetTimerRef.current = window.setTimeout(() => {
        setAltarPhase('settled');
      }, REVEAL_VISIBLE_MS);
    }, delay);
  };

  useEffect(() => () => {
    clearAnimationTimers();
  }, []);

  useEffect(() => {
    if (!spinning) {
      return undefined;
    }
    clearAnimationTimers();
    spinCycleRef.current = true;
    spinStartedAtRef.current = Date.now();
    pendingRevealRef.current = null;
    setAltarPhase('spinning');
    return undefined;
  }, [spinning]);

  useEffect(() => {
    const previousKey = previousPullKeyRef.current;
    if (lastPullKey === previousKey) {
      return undefined;
    }
    previousPullKeyRef.current = lastPullKey;
    if (!spinCycleRef.current) {
      setDisplayPull(lastPull);
      setAltarPhase(lastPull ? 'settled' : 'idle');
      return undefined;
    }
    pendingRevealRef.current = lastPull;
    if (!spinning) {
      runReveal(lastPull);
    }
    return undefined;
  }, [lastPull, lastPullKey, spinning]);

  useEffect(() => {
    if (spinning) {
      return undefined;
    }
    if (pendingRevealRef.current) {
      runReveal(pendingRevealRef.current);
      return undefined;
    }
    if (spinCycleRef.current) {
      spinCycleRef.current = false;
      setAltarPhase(displayPull ? 'settled' : 'idle');
    }
    return undefined;
  }, [spinning]);

  const displayPullMeta = displayPull
    ? ARTIFACT_CATALOG.find((artifact) => artifact.id === displayPull.id) || null
    : null;
  const displayPullRankMeta = RANK_META[displayPull?.rank] || RANK_META.C;
  const hasStageArtifact = Boolean(displayPull) && (altarPhase === 'revealed' || altarPhase === 'settled');
  const stageMeta = hasStageArtifact ? displayPullRankMeta : IDLE_ALTAR_META;
  const stageArtifact = hasStageArtifact ? displayPullMeta : null;

  const altarStageStyle = {
    '--artifact-altar-accent': stageMeta.accent,
    '--artifact-altar-accent-soft': hexToRgba(stageMeta.accent, hasStageArtifact ? 0.22 : 0.18),
    '--artifact-altar-accent-mid': hexToRgba(stageMeta.accent, hasStageArtifact ? 0.42 : 0.32),
    '--artifact-altar-accent-strong': hexToRgba(stageMeta.accent, hasStageArtifact ? 0.68 : 0.52),
    '--artifact-altar-accent-faint': hexToRgba(stageMeta.accent, 0.12),
    '--artifact-altar-core-shadow': hexToRgba(stageMeta.accent, hasStageArtifact ? 0.35 : 0.24),
  };

  const altarStageTitle = altarPhase === 'spinning'
    ? 'Алтарь собирает энергию'
    : stageArtifact
      ? stageArtifact.name
      : 'Алтарь ждет призыв';

  const altarStageSubtitle = altarPhase === 'spinning'
    ? 'Кольца вращаются, руны разгораются и подготавливают выпадение.'
    : stageArtifact
      ? altarPhase === 'revealed'
        ? `${displayPullRankMeta.title}. Артефакт торжественно проявился из алтаря.`
        : `${displayPullRankMeta.title}. Последний выбитый артефакт остается в центре алтаря до следующей крутки.`
      : 'Нажми на кнопку ниже, чтобы разбудить алтарь и получить новый артефакт.';

  return (
    <div className="rounded-[28px] border border-amber-200/80 bg-[radial-gradient(circle_at_top,rgba(255,244,214,0.95),rgba(255,255,255,0.94)_52%,rgba(255,248,233,0.98))] px-4 py-4 shadow-[0_22px_50px_rgba(245,158,11,0.12)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Алтарь артефактов</div>
          <div className="mt-1 text-base font-semibold text-slate-900">
            Выбивай артефакты за монеты и собирай свою коллекцию
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Одна крутка стоит {spinCost} монет. Чем выше ранг, тем мощнее свечение и появление.
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/90 px-3 py-1.5 text-sm font-semibold text-amber-700 shadow-sm">
          <img src={ivanCoin} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
          <span>{`${Math.max(0, Math.floor(Number(coinsTotal) || 0)).toLocaleString('ru-RU')} монет`}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-[26px] border border-amber-200/80 bg-[linear-gradient(160deg,rgba(120,53,15,0.07),rgba(255,255,255,0.76)_38%,rgba(251,191,36,0.16))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <div
            className={`artifact-altar-stage ${
              altarPhase === 'spinning'
                ? 'artifact-altar-stage--spinning'
                : altarPhase === 'revealed'
                  ? 'artifact-altar-stage--revealed'
                  : altarPhase === 'settled'
                    ? 'artifact-altar-stage--settled'
                    : 'artifact-altar-stage--idle'
            }`}
            style={altarStageStyle}
            aria-live="polite"
          >
            <div className="artifact-altar-stage__backdrop" />
            <div className="artifact-altar-stage__aurora artifact-altar-stage__aurora--left" />
            <div className="artifact-altar-stage__aurora artifact-altar-stage__aurora--right" />
            <div className="artifact-altar-stage__halo artifact-altar-stage__halo--outer" />
            <div className="artifact-altar-stage__halo artifact-altar-stage__halo--inner" />
            <div className="artifact-altar-stage__orbit artifact-altar-stage__orbit--outer" />
            <div className="artifact-altar-stage__orbit artifact-altar-stage__orbit--inner" />
            <div className="artifact-altar-stage__rune-ring" />

            {ALTAR_PARTICLES.map((particle, index) => (
              <span
                key={`altar-particle-${particle.angle}-${index}`}
                className="artifact-altar-stage__particle"
                style={{
                  '--particle-angle': particle.angle,
                  '--particle-distance': particle.distance,
                  '--particle-delay': particle.delay,
                  '--particle-size': particle.size,
                }}
              />
            ))}

            <div className="artifact-altar-stage__pedestal">
              <div className="artifact-altar-stage__pedestal-core" />
            </div>

            <div className="artifact-altar-stage__focus">
              {stageArtifact ? (
                <>
                  <span className="artifact-altar-stage__focus-burst artifact-altar-stage__focus-burst--one" />
                  <span className="artifact-altar-stage__focus-burst artifact-altar-stage__focus-burst--two" />
                  <img
                    src={stageArtifact.src}
                    alt={stageArtifact.name}
                    decoding="async"
                    className="artifact-altar-stage__artifact"
                  />
                </>
              ) : (
                <Sparkles className="artifact-altar-stage__icon" />
              )}
            </div>

            <div className="artifact-altar-stage__content">
              <div className="inline-flex items-center justify-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-md">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${stageMeta.pillClassName || IDLE_ALTAR_META.pillClassName}`}>
                  {altarPhase === 'spinning' ? 'Призыв' : stageArtifact ? `Ранг ${displayPull.rank}` : 'Готовность'}
                </span>
                <span>{altarPhase === 'spinning' ? 'Энергия растет' : stageArtifact ? (altarPhase === 'revealed' ? displayPullRankMeta.title : 'Последний трофей') : 'Алтарь спокоен'}</span>
              </div>

              <div className="artifact-altar-stage__title">{altarStageTitle}</div>
              <div className="artifact-altar-stage__subtitle">{altarStageSubtitle}</div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-amber-200/90 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.98),rgba(255,248,220,0.96)_42%,rgba(254,243,199,0.9)_100%)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_18px_30px_rgba(217,119,6,0.12)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Призыв</div>
                <div className="mt-1 text-sm text-slate-600">
                  Запусти крутку и смотри, как артефакт проявляется в центре алтаря.
                </div>
              </div>
              <button
                type="button"
                onClick={onSpin}
                disabled={!canSpin}
                className={`artifact-altar-spin-button ${spinning ? 'artifact-altar-spin-button--spinning' : ''}`}
              >
                <Sparkles size={16} />
                <span>{spinning ? 'Алтарь отвечает...' : `Крутить за ${spinCost}`}</span>
                <img src={ivanCoin} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
              </button>
            </div>

            {!canSpin && !spinning && coinsTotal < spinCost && (
              <div className="mt-2 text-xs text-rose-600">
                Нужно еще {(spinCost - Math.max(0, Math.floor(Number(coinsTotal) || 0))).toLocaleString('ru-RU')} монет.
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {rankChances.map((entry) => {
              const rank = String(entry?.rank || '').trim().toUpperCase();
              const meta = RANK_META[rank] || RANK_META.C;
              const chancePercent = Math.max(0, Math.floor(Number(entry?.chancePercent) || 0));
              return (
                <div
                  key={`artifact-chance-${rank}`}
                  className="rounded-2xl border px-3 py-2 text-center shadow-sm"
                  style={getRankCardStyle(rank, true)}
                >
                  <div className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.pillClassName}`}>
                    {`Ранг ${rank}`}
                  </div>
                  <div className="mt-2 text-lg font-black text-slate-900">{`${chancePercent}%`}</div>
                  <div className="text-[11px] text-slate-500">{meta.title}</div>
                </div>
              );
            })}
          </div>

          {spinError && (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700">
              {spinError}
            </div>
          )}
        </div>

        <div className="rounded-[26px] border border-purple-200/70 bg-white/90 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-purple-600">Коллекция</div>
                <div className="mt-1 text-base font-semibold text-slate-900">Все артефакты алтаря</div>
                <div className="mt-1 text-xs text-slate-500">Не выбитые артефакты отображаются приглушенно.</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-[11px] font-semibold text-purple-700">
                <Package2 size={14} />
                {`${uniqueOwned}/${ARTIFACT_CATALOG.length}`}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {`${uniqueOwned}/${ARTIFACT_CATALOG.length} уникальных`}
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {`${totalOwned} всего артефактов`}
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {`${totalPulls} круток`}
              </div>
              {displayPullMeta && (
                <div className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${displayPullRankMeta.pillClassName}`}>
                  {`Последний: ${displayPullMeta.name}`}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {ARTIFACT_RANK_ORDER.map((rank) => {
                const rankMeta = RANK_META[rank] || RANK_META.C;
                const rankItems = rankGroupMap.get(rank) || [];
                return (
                  <div key={`artifact-rank-${rank}`} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${rankMeta.pillClassName}`}>
                        {`Ранг ${rank}`}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500">{rankMeta.title}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {rankItems.map((artifact) => {
                        const ownedCount = ownedById.get(artifact.id) || 0;
                        const owned = ownedCount > 0;
                        return (
                          <div
                            key={artifact.id}
                            className="relative overflow-hidden rounded-2xl border p-2.5 transition"
                            style={getRankCardStyle(rank, owned)}
                          >
                            <div
                              className={`mx-auto flex h-20 w-full items-center justify-center rounded-[18px] border bg-white/82 p-2 ${
                                owned ? '' : 'opacity-75'
                              }`}
                              style={{
                                borderColor: owned ? `${rankMeta.accent}44` : 'rgba(203,213,225,0.7)',
                                boxShadow: owned ? rankMeta.glow : 'none',
                              }}
                            >
                              <img
                                src={artifact.src}
                                alt={artifact.name}
                                loading="lazy"
                                decoding="async"
                                className={`h-full w-full object-contain ${owned ? '' : 'grayscale opacity-40'}`}
                              />
                            </div>
                            <div className="mt-2 min-h-[2.5rem] text-center text-xs font-semibold text-slate-800">
                              {artifact.name}
                            </div>
                            <div className="mt-1 flex items-center justify-center">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${owned ? rankMeta.pillClassName : 'border-slate-200 bg-white text-slate-500'}`}>
                                {owned ? `x${ownedCount}` : 'не найден'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
        </div>
      </div>
    </div>
  );
};

export default StudentArtifactAltar;
