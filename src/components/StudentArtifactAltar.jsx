import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package2, Sparkles, X } from 'lucide-react';
import ivanCoin from '../assets/ivan-coin-badge.png';
import artifactSpinMusic from '../assets/artefacts/music/spin.mp3';
import { ARTIFACT_CATALOG_METADATA_BY_ID } from '../data/artifactCatalog';

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

const MIN_SPIN_DURATION_MS = 3000;
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
const ALTAR_SPINNER_SPOKES = Array.from({ length: 8 }, (_, index) => ({
  rotate: `${index * 45}deg`,
  delay: `${index * 70}ms`,
}));

const ARTIFACT_CATALOG = Object.entries(artifactModules)
  .map(([path, src]) => {
    const match = path.match(/\/artefacts\/([^/]+)\/([^/]+)\.png$/);
    if (!match) return null;
    const folder = String(match[1] || '').trim();
    const id = String(match[2] || '').trim();
    if (!id) return null;
    const metadata = ARTIFACT_CATALOG_METADATA_BY_ID.get(id) || null;
    return {
      id,
      rank: metadata?.rank || RANK_FOLDER_TO_ID[folder] || 'C',
      name: metadata?.name || ARTIFACT_LABELS[id] || id,
      description: typeof metadata?.description === 'string' ? metadata.description : '',
      src,
    };
  })
  .filter(Boolean)
  .sort((a, b) => {
    const rankDiff = ARTIFACT_RANK_ORDER.indexOf(a.rank) - ARTIFACT_RANK_ORDER.indexOf(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name, 'ru');
  });

const ARTIFACT_CATALOG_BY_ID = new Map(ARTIFACT_CATALOG.map((artifact) => [artifact.id, artifact]));

const LEGENDARY_TEASER_COPY_BY_ID = {
  krylov: {
    title: 'Секретный помощник',
    power: 'Может очень сильно ускорить прокачку опыта.',
    tags: ['весь опыт', 'экзамен'],
  },
  tears: {
    title: 'След составителей',
    power: 'Может резко усилить награду за самые тяжёлые задачи.',
    tags: ['24-27', 'мощный XP'],
  },
};

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

const normalizeAltarSnapshot = (value) => (value && typeof value === 'object' ? value : null);

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

const BONUS_TONE_CLASSNAME = {
  xp: 'border-violet-200 bg-violet-50/90 text-violet-700',
  coins: 'border-amber-200 bg-amber-50/90 text-amber-700',
  instant: 'border-emerald-200 bg-emerald-50/90 text-emerald-700',
};

const ARTIFACT_EFFECTS_BY_ID = {
  krylov: [
    { tone: 'xp', label: 'Любой опыт', type: 'multiplier', perCopyBonus: 1, hint: 'Усиливает весь получаемый опыт.' },
  ],
  tears: [
    { tone: 'xp', label: 'XP за 24-27', type: 'multiplier', perCopyBonus: 3, hint: 'Работает на самых сложных задачах.' },
  ],
  '1tbssd': [
    { tone: 'xp', label: 'XP за 15-16', type: 'multiplier', perCopyBonus: 0.5, hint: 'Помогает на задачах 15 и 16.' },
  ],
  'list-comprehension': [
    { tone: 'xp', label: 'XP за 17', type: 'multiplier', perCopyBonus: 0.5, hint: 'Усиливает награду за задачу 17.' },
  ],
  python: [
    { tone: 'coins', label: 'Монеты за задания', type: 'multiplier', perCopyBonus: 1, hint: 'Увеличивает монеты за Python-задачи.' },
  ],
  crutch: [
    { tone: 'xp', label: 'Любой опыт', type: 'multiplier', perCopyBonus: 0.1, hint: 'Небольшой, но стабильный бонус к опыту.' },
  ],
  whileTrue: [
    { tone: 'coins', label: 'Монеты за задания', type: 'multiplier', perCopyBonus: 0.2, hint: 'Усиливает монетную награду.' },
  ],
  black_pen: [
    { tone: 'instant', label: 'Разовый опыт', type: 'instant', amount: 1000, unit: 'XP', hint: 'Начисляется за каждую найденную копию.' },
  ],
  coffee: [
    { tone: 'instant', label: 'Разовые монеты', type: 'instant', amount: 5, unit: 'монет', hint: 'Начисляется за каждую найденную копию.' },
  ],
  draft: [
    { tone: 'instant', label: 'Разовый опыт', type: 'instant', amount: 1000, unit: 'XP', hint: 'Начисляется за каждую найденную копию.' },
  ],
};

const formatArtifactMultiplier = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'x1';
  return `x${(Math.round(number * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;
};

const formatArtifactInstantAmount = (amount, unit) => {
  const normalizedAmount = Math.max(0, Math.round(Number(amount) || 0));
  return `+${normalizedAmount.toLocaleString('ru-RU')} ${unit}`;
};

const pluralizeArtifactCopies = (count) => {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} копия`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} копии`;
  return `${value} копий`;
};

const getArtifactDetailEffects = (artifact) => {
  const id = String(artifact?.id || '').trim();
  const count = Math.max(1, Math.floor(Number(artifact?.count) || 1));
  const effects = ARTIFACT_EFFECTS_BY_ID[id] || [];

  if (effects.length === 0) {
    return [{
      tone: 'default',
      label: 'Коллекционный эффект',
      value: 'Без активного бонуса',
      detail: 'Пока этот артефакт работает как трофей коллекции.',
    }];
  }

  return effects.map((effect) => {
    if (effect.type === 'multiplier') {
      const perCopyBonus = Number(effect.perCopyBonus) || 0;
      const singleMultiplier = 1 + perCopyBonus;
      const currentMultiplier = 1 + (perCopyBonus * count);
      return {
        tone: effect.tone,
        label: effect.label,
        value: formatArtifactMultiplier(singleMultiplier),
        detail: count > 1
          ? `Сейчас с ${pluralizeArtifactCopies(count)}: ${formatArtifactMultiplier(currentMultiplier)}`
          : effect.hint,
      };
    }

    if (effect.type === 'instant') {
      const amount = Math.max(0, Math.round(Number(effect.amount) || 0));
      return {
        tone: effect.tone,
        label: effect.label,
        value: formatArtifactInstantAmount(amount, effect.unit),
        detail: count > 1
          ? `Всего с ${pluralizeArtifactCopies(count)}: ${formatArtifactInstantAmount(amount * count, effect.unit)}`
          : effect.hint,
      };
    }

    return {
      tone: effect.tone || 'default',
      label: effect.label || 'Бонус',
      value: effect.value || 'Активен',
      detail: effect.hint || '',
    };
  });
};

const StudentArtifactAltar = ({
  altar = null,
  coinsTotal = 0,
  onSpin,
  spinning = false,
  spinError = '',
}) => {
  const incomingAltar = normalizeAltarSnapshot(altar);
  const incomingLastPull = incomingAltar?.lastPull && typeof incomingAltar.lastPull === 'object'
    ? incomingAltar.lastPull
    : null;
  const incomingTotalPulls = Number.isFinite(Number(incomingAltar?.totalPulls))
    ? Math.max(0, Number(incomingAltar.totalPulls))
    : 0;
  const incomingLastPullKey = useMemo(
    () => getPullKey(incomingLastPull, incomingTotalPulls),
    [incomingLastPull, incomingTotalPulls],
  );
  const [displayAltar, setDisplayAltar] = useState(incomingAltar);
  const spinCost = Number.isFinite(Number((displayAltar || incomingAltar)?.spinCost))
    ? Math.max(1, Number((displayAltar || incomingAltar).spinCost))
    : 20;
  const collection = Array.isArray(displayAltar?.collection) ? displayAltar.collection : [];
  const lastPull = displayAltar?.lastPull && typeof displayAltar.lastPull === 'object' ? displayAltar.lastPull : null;
  const totalPulls = Number.isFinite(Number(displayAltar?.totalPulls)) ? Math.max(0, Number(displayAltar.totalPulls)) : 0;
  const totalOwned = Number.isFinite(Number(displayAltar?.totalOwned)) ? Math.max(0, Number(displayAltar.totalOwned)) : 0;
  const uniqueOwned = Number.isFinite(Number(displayAltar?.uniqueOwned)) ? Math.max(0, Number(displayAltar.uniqueOwned)) : 0;
  const bonusEntries = Array.isArray(displayAltar?.bonuses?.entries)
    ? displayAltar.bonuses.entries.filter((entry) => entry && typeof entry === 'object')
    : [];

  const [altarPhase, setAltarPhase] = useState('idle');
  const [displayPull, setDisplayPull] = useState(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const isSpinStageActive = altarPhase === 'spinning';
  const canSpin = typeof onSpin === 'function' && !spinning && !isSpinStageActive && coinsTotal >= spinCost;
  const spinButtonBusy = spinning || isSpinStageActive;

  const collectedArtifacts = useMemo(() => (
    collection
      .map((artifact) => {
        const id = String(artifact?.id || '').trim();
        if (!id) return null;
        const count = Math.max(0, Math.floor(Number(artifact?.count) || 0));
        if (count <= 0) return null;

        const catalogArtifact = ARTIFACT_CATALOG_BY_ID.get(id) || null;
        const normalizedRank = String(artifact?.rank || catalogArtifact?.rank || 'C').trim().toUpperCase();
        const rank = RANK_META[normalizedRank] ? normalizedRank : 'C';
        const description = typeof artifact?.description === 'string' && artifact.description.trim()
          ? artifact.description.trim()
          : (typeof catalogArtifact?.description === 'string' ? catalogArtifact.description.trim() : '');

        return {
          id,
          rank,
          count,
          name: String(catalogArtifact?.name || artifact?.name || id).trim() || id,
          description,
          src: artifact?.src || catalogArtifact?.src || '',
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const rankDiff = ARTIFACT_RANK_ORDER.indexOf(a.rank) - ARTIFACT_RANK_ORDER.indexOf(b.rank);
        if (rankDiff !== 0) return rankDiff;
        return a.name.localeCompare(b.name, 'ru');
      })
  ), [collection]);

  const collectedRankGroupMap = useMemo(() => (
    collectedArtifacts.reduce((acc, artifact) => {
      const current = acc.get(artifact.rank) || [];
      current.push(artifact);
      acc.set(artifact.rank, current);
      return acc;
    }, new Map())
  ), [collectedArtifacts]);

  const legendaryTeasers = useMemo(() => (
    ARTIFACT_CATALOG
      .filter((artifact) => artifact.rank === 'S')
      .map((artifact) => ({
        ...artifact,
        teaser: LEGENDARY_TEASER_COPY_BY_ID[artifact.id] || {
          title: 'Секретная легендарка',
          power: 'Даёт один из самых сильных бонусов коллекции.',
          tags: ['легендарный', 'сильный бонус'],
        },
      }))
  ), []);

  const spinCycleRef = useRef(false);
  const spinStartedAtRef = useRef(0);
  const hiddenPullRef = useRef(null);
  const latestLastPullRef = useRef(lastPull);
  const pendingAltarRef = useRef(incomingAltar);
  const activeSpinRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const revealTimerRef = useRef(null);
  const resetTimerRef = useRef(null);
  const spinAudioRef = useRef(null);

  const clearRevealTimers = () => {
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const clearAnimationTimers = () => {
    clearRevealTimers();
  };

  const stopSpinAudio = () => {
    const audio = spinAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  };

  const releaseSpinAudio = () => {
    const audio = spinAudioRef.current;
    if (!audio) return;
    audio.loop = false;
  };

  const playSpinAudio = () => {
    let audio = spinAudioRef.current;
    if (!audio && typeof window !== 'undefined') {
      audio = new Audio(artifactSpinMusic);
      audio.volume = 0.03;
      audio.preload = 'auto';
      spinAudioRef.current = audio;
    }
    if (!audio) return;
    audio.loop = true;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  const startSpinSequence = () => {
    clearAnimationTimers();
    stopSpinAudio();
    playSpinAudio();
    spinCycleRef.current = true;
    spinStartedAtRef.current = Date.now();
    pendingAltarRef.current = null;
    hiddenPullRef.current = displayPull || hiddenPullRef.current || null;
    setDisplayPull(null);
    setAltarPhase('spinning');
  };

  const runReveal = (pull) => {
    clearRevealTimers();
    if (!pull) {
      stopSpinAudio();
      spinCycleRef.current = false;
      pendingAltarRef.current = null;
      const restoredPull = hiddenPullRef.current || null;
      setDisplayPull(restoredPull);
      setAltarPhase(restoredPull ? 'settled' : 'idle');
      return;
    }
    const elapsed = spinStartedAtRef.current ? Date.now() - spinStartedAtRef.current : MIN_SPIN_DURATION_MS;
    const delay = Math.max(0, MIN_SPIN_DURATION_MS - elapsed);
    revealTimerRef.current = window.setTimeout(() => {
      releaseSpinAudio();
      const nextDisplayAltar = normalizeAltarSnapshot(pendingAltarRef.current);
      hiddenPullRef.current = pull;
      if (nextDisplayAltar) {
        setDisplayAltar(nextDisplayAltar);
      }
      pendingAltarRef.current = null;
      setDisplayPull(pull);
      setAltarPhase('revealed');
      spinCycleRef.current = false;
      resetTimerRef.current = window.setTimeout(() => {
        setAltarPhase('settled');
      }, REVEAL_VISIBLE_MS);
    }, delay);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeSpinRequestRef.current += 1;
      clearAnimationTimers();
      stopSpinAudio();
      spinAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    latestLastPullRef.current = incomingLastPull;
  }, [incomingLastPull]);

  useEffect(() => {
    if (spinCycleRef.current) {
      pendingAltarRef.current = incomingAltar;
      return undefined;
    }
    pendingAltarRef.current = incomingAltar;
    setDisplayAltar(incomingAltar);
    return undefined;
  }, [incomingAltar, incomingLastPull, incomingLastPullKey]);

  const displayPullMeta = displayPull
    ? ARTIFACT_CATALOG.find((artifact) => artifact.id === displayPull.id) || null
    : null;
  const displayPullRankMeta = RANK_META[displayPull?.rank] || RANK_META.C;
  const hasDisplayStageArtifact = Boolean(displayPull) && (altarPhase === 'revealed' || altarPhase === 'settled');
  const stageMeta = hasDisplayStageArtifact ? displayPullRankMeta : IDLE_ALTAR_META;
  const stageArtifact = hasDisplayStageArtifact ? displayPullMeta : null;
  const stageArtifactDescription = typeof stageArtifact?.description === 'string'
    ? stageArtifact.description.trim()
    : '';

  const altarStageStyle = {
    '--artifact-altar-accent': stageMeta.accent,
    '--artifact-altar-accent-soft': hexToRgba(stageMeta.accent, hasDisplayStageArtifact ? 0.22 : 0.18),
    '--artifact-altar-accent-mid': hexToRgba(stageMeta.accent, hasDisplayStageArtifact ? 0.42 : 0.32),
    '--artifact-altar-accent-strong': hexToRgba(stageMeta.accent, hasDisplayStageArtifact ? 0.68 : 0.52),
    '--artifact-altar-accent-faint': hexToRgba(stageMeta.accent, 0.12),
    '--artifact-altar-core-shadow': hexToRgba(stageMeta.accent, hasDisplayStageArtifact ? 0.35 : 0.24),
  };

  const altarStageTitle = altarPhase === 'spinning'
    ? 'Алтарь собирает энергию'
    : stageArtifact
      ? stageArtifact.name
      : 'Алтарь ждет призыв';

  const altarStageSubtitle = altarPhase === 'spinning'
      ? 'Свет разгорается, кольца ускоряются и внутри алтаря формируется новый артефакт.'
      : stageArtifact
        ? altarPhase === 'revealed'
          ? `${displayPullRankMeta.title}. Артефакт торжественно проявился из алтаря.`
          : `${displayPullRankMeta.title}. Последний выбитый артефакт остается в центре алтаря до следующей крутки.`
        : 'Нажми на кнопку ниже, чтобы разбудить алтарь и получить новый артефакт.';

  const resolvedAltarStageSubtitle = stageArtifactDescription
    ? stageArtifactDescription
    : (altarPhase === 'settled' && stageArtifact
      ? `${displayPullRankMeta.title}.`
      : altarStageSubtitle);
  const stageChipRank = altarPhase === 'spinning'
    ? 'summon'
    : (stageArtifact ? String(displayPull?.rank || 'C').toUpperCase() : 'idle');
  const stageChipStatusText = altarPhase === 'spinning'
    ? '\u042d\u043d\u0435\u0440\u0433\u0438\u044f \u0440\u0430\u0441\u0442\u0435\u0442'
    : stageArtifact
      ? displayPullRankMeta.title
      : '\u0410\u043b\u0442\u0430\u0440\u044c \u0441\u043f\u043e\u043a\u043e\u0435\u043d';

  const selectedArtifact = useMemo(() => {
    if (!selectedArtifactId) return null;
    const fromCollection = collectedArtifacts.find((artifact) => artifact.id === selectedArtifactId);
    if (fromCollection) return fromCollection;
    if (stageArtifact?.id === selectedArtifactId) {
      return {
        ...stageArtifact,
        rank: String(displayPull?.rank || stageArtifact.rank || 'C').toUpperCase(),
        count: Math.max(1, Math.floor(Number(displayPull?.count) || 1)),
      };
    }
    return null;
  }, [collectedArtifacts, displayPull, selectedArtifactId, stageArtifact]);

  const selectedArtifactRankMeta = RANK_META[selectedArtifact?.rank] || RANK_META.C;
  const selectedArtifactEffects = useMemo(
    () => getArtifactDetailEffects(selectedArtifact),
    [selectedArtifact],
  );
  const artifactDetailStyle = selectedArtifact ? {
    '--artifact-detail-accent': selectedArtifactRankMeta.accent,
    '--artifact-detail-accent-soft': hexToRgba(selectedArtifactRankMeta.accent, 0.16),
    '--artifact-detail-accent-mid': hexToRgba(selectedArtifactRankMeta.accent, 0.32),
    '--artifact-detail-accent-strong': hexToRgba(selectedArtifactRankMeta.accent, 0.58),
  } : undefined;

  useEffect(() => {
    if (!selectedArtifactId || selectedArtifact) return;
    setSelectedArtifactId('');
  }, [selectedArtifact, selectedArtifactId]);

  useEffect(() => {
    if (!selectedArtifact) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedArtifactId('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedArtifact]);

  const handleSpinClick = async () => {
    if (!canSpin) return;
    startSpinSequence();
    const requestId = activeSpinRequestRef.current + 1;
    activeSpinRequestRef.current = requestId;
    try {
      const result = typeof onSpin === 'function' ? await onSpin() : null;
      if (!mountedRef.current || activeSpinRequestRef.current !== requestId) return;
      pendingAltarRef.current = normalizeAltarSnapshot(result?.altar) || pendingAltarRef.current;
      const revealedPull = result?.drop && typeof result.drop === 'object'
        ? result.drop
        : (result?.altar?.lastPull && typeof result.altar.lastPull === 'object'
          ? result.altar.lastPull
          : latestLastPullRef.current);
      runReveal(revealedPull || null);
    } catch {
      if (!mountedRef.current || activeSpinRequestRef.current !== requestId) return;
      runReveal(null);
    }
  };

  const artifactDetailModal = selectedArtifact ? (
    <div
      className="student-artifact-detail-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="artifact-detail-title"
      style={artifactDetailStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSelectedArtifactId('');
      }}
    >
      <div className="student-artifact-detail-modal__card" data-rank={selectedArtifact.rank} style={artifactDetailStyle}>
        <div className="student-artifact-detail-modal__ambient student-artifact-detail-modal__ambient--one" />
        <div className="student-artifact-detail-modal__ambient student-artifact-detail-modal__ambient--two" />
        <button
          type="button"
          className="student-artifact-detail-modal__close"
          onClick={() => setSelectedArtifactId('')}
          aria-label="Закрыть карточку артефакта"
        >
          <X size={18} />
        </button>

        <div className="student-artifact-detail-modal__visual">
          <div className="student-artifact-detail-modal__orbit student-artifact-detail-modal__orbit--outer" />
          <div className="student-artifact-detail-modal__orbit student-artifact-detail-modal__orbit--inner" />
          <div className="student-artifact-detail-modal__flare" />
          <img
            src={selectedArtifact.src}
            alt={selectedArtifact.name}
            className="student-artifact-detail-modal__image"
            decoding="async"
          />
          <div className={`student-artifact-altar__rank-pill student-artifact-detail-modal__rank-pill inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold ${selectedArtifactRankMeta.pillClassName}`} data-rank={selectedArtifact.rank}>
            {`Ранг ${selectedArtifact.rank}`}
          </div>
        </div>

        <div className="student-artifact-detail-modal__content">
          <div className="student-artifact-detail-modal__eyebrow">Карточка артефакта</div>
          <h3 id="artifact-detail-title" className="student-artifact-detail-modal__title">
            {selectedArtifact.name}
          </h3>
          <div className="student-artifact-detail-modal__meta-row">
            <span>{selectedArtifactRankMeta.title}</span>
            <span>{pluralizeArtifactCopies(selectedArtifact.count)}</span>
          </div>

          <div className="student-artifact-detail-modal__description">
            {selectedArtifact.description || 'Описание можно добавить в каталоге артефактов.'}
          </div>

          <div className="student-artifact-detail-modal__section-title">Бонусы</div>
          <div className="student-artifact-detail-modal__effects">
            {selectedArtifactEffects.map((effect) => (
              <div
                key={`${selectedArtifact.id}-${effect.label}-${effect.value}`}
                className="student-artifact-detail-modal__effect-card"
                data-tone={String(effect.tone || 'default')}
              >
                <div className="student-artifact-detail-modal__effect-label">{effect.label}</div>
                <div className="student-artifact-detail-modal__effect-value">{effect.value}</div>
                {effect.detail && (
                  <div className="student-artifact-detail-modal__effect-detail">{effect.detail}</div>
                )}
              </div>
            ))}
          </div>

          <div className="student-artifact-detail-modal__hint">
            Нажми вне карточки или Esc, чтобы закрыть.
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
    <div className="student-artifact-altar rounded-[28px] border border-amber-200/80 bg-[radial-gradient(circle_at_top,rgba(255,244,214,0.95),rgba(255,255,255,0.94)_52%,rgba(255,248,233,0.98))] px-4 py-4 shadow-[0_22px_50px_rgba(245,158,11,0.12)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="student-artifact-altar__header-copy">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Алтарь артефактов</div>
          <div className="mt-1 text-base font-semibold text-slate-900">
            Выбивай артефакты за монеты и собирай свою коллекцию
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Одна крутка стоит {spinCost} монет.
          </div>
        </div>
        <div className="student-artifact-altar__wallet inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/90 px-3 py-1.5 text-sm font-semibold text-amber-700 shadow-sm">
          <img src={ivanCoin} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
          <span>{`${Math.max(0, Math.floor(Number(coinsTotal) || 0)).toLocaleString('ru-RU')} монет`}</span>
        </div>
      </div>

      <div className="student-artifact-altar__coin-guide mt-4 rounded-[24px] border border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,250,235,0.96),rgba(255,255,255,0.92))] p-4 shadow-[0_18px_34px_rgba(245,158,11,0.08)]">
        <div className="flex items-center gap-2">
          <img src={ivanCoin} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Где взять монеты</div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="student-artifact-altar__coin-guide-card rounded-2xl border border-white/80 bg-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="text-sm font-semibold text-slate-900">Решай Python-задачи</div>
            <div className="mt-1 text-xs leading-5 text-slate-600">
              За новые решённые задачи из раздела Python начисляются монеты. Чем сложнее тема, тем выше награда.
            </div>
          </div>
          <div className="student-artifact-altar__coin-guide-card rounded-2xl border border-white/80 bg-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="text-sm font-semibold text-slate-900">Решай пробники</div>
            <div className="mt-1 text-xs leading-5 text-slate-600">
              В пробниках есть рубежи наград: 30 баллов = 30 монет, 50 = 50, 80 = 80, 100 = 100. Улучшай результат и забирай новые рубежи.
            </div>
          </div>
          <div className="student-artifact-altar__coin-guide-card rounded-2xl border border-white/80 bg-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="text-sm font-semibold text-slate-900">Получай от учителя</div>
            <div className="mt-1 text-xs leading-5 text-slate-600">
              Учитель может выдать монеты вручную, если захочет наградить тебя отдельно.
            </div>
          </div>
          <div className="student-artifact-altar__coin-guide-card rounded-2xl border border-white/80 bg-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="text-sm font-semibold text-slate-900">Используй артефакты</div>
            <div className="mt-1 text-xs leading-5 text-slate-600">
              Некоторые артефакты сразу дают монеты или усиливают монетную награду за Python-задачи.
            </div>
          </div>
        </div>
      </div>

      {legendaryTeasers.length > 0 && (
        <div className="student-artifact-altar__legendary-teaser mt-4 rounded-[26px] border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="student-artifact-altar__legendary-eyebrow text-xs font-bold uppercase tracking-[0.2em]">
                Тайные легендарки
              </div>
            </div>
            <div className="student-artifact-altar__legendary-note inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold">
              <Sparkles size={13} />
              <span>Ранг S · шанс 5%</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {legendaryTeasers.map((artifact, index) => (
              <div
                key={`legendary-teaser-${artifact.id}`}
                className="student-artifact-altar__legendary-card"
                style={{
                  '--legendary-delay': `${index * 110}ms`,
                  '--legendary-accent': RANK_META.S.accent,
                }}
              >
                <div className="student-artifact-altar__legendary-visual" aria-hidden="true">
                  <span className="student-artifact-altar__legendary-orbit" />
                  <span className="student-artifact-altar__legendary-glow" />
                  <img
                    src={artifact.src}
                    alt=""
                    className="student-artifact-altar__legendary-silhouette"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="min-w-0">
                  <div className="student-artifact-altar__legendary-rank">Секретный S-ранг</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{artifact.teaser.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{artifact.teaser.power}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {artifact.teaser.tags.map((tag) => (
                      <span key={`${artifact.id}-${tag}`} className="student-artifact-altar__legendary-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="student-artifact-altar__stage-shell rounded-[26px] border border-amber-200/80 bg-[linear-gradient(160deg,rgba(120,53,15,0.07),rgba(255,255,255,0.76)_38%,rgba(251,191,36,0.16))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
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
              <span className="artifact-altar-stage__conceal" />
              <span className="artifact-altar-stage__surge artifact-altar-stage__surge--veil" />
              <span className="artifact-altar-stage__surge artifact-altar-stage__surge--flash" />
              <span className="artifact-altar-stage__energy artifact-altar-stage__energy--core" />
              <span className="artifact-altar-stage__energy artifact-altar-stage__energy--ring" />
              <span className="artifact-altar-stage__energy artifact-altar-stage__energy--beam" />
              {stageArtifact ? (
                <>
                  <span className="artifact-altar-stage__focus-burst artifact-altar-stage__focus-burst--one" />
                  <span className="artifact-altar-stage__focus-burst artifact-altar-stage__focus-burst--two" />
                  <button
                    type="button"
                    onClick={() => setSelectedArtifactId(stageArtifact.id)}
                    aria-label={`Открыть карточку артефакта ${stageArtifact.name}`}
                    key={`altar-stage-artifact-${altarPhase}-${stageArtifact.id}-${stageArtifact.rank}-${displayPull?.count || 0}`}
                    className={`artifact-altar-stage__artifact-shell ${
                      altarPhase === 'revealed'
                          ? 'artifact-altar-stage__artifact-shell--revealed'
                          : 'artifact-altar-stage__artifact-shell--settled'
                    }`}
                  >
                    <img
                      src={stageArtifact.src}
                      alt={stageArtifact.name}
                      decoding="async"
                      className="artifact-altar-stage__artifact"
                    />
                  </button>
                </>
              ) : altarPhase === 'spinning' ? (
                <div className="artifact-altar-stage__spinner" aria-hidden="true">
                  <span className="artifact-altar-stage__spinner-aura" />
                  <span className="artifact-altar-stage__spinner-disc artifact-altar-stage__spinner-disc--outer" />
                  <span className="artifact-altar-stage__spinner-disc artifact-altar-stage__spinner-disc--inner" />
                  {ALTAR_SPINNER_SPOKES.map((spoke) => (
                    <span
                      key={`altar-spinner-spoke-${spoke.rotate}`}
                      className="artifact-altar-stage__spinner-spoke"
                      style={{
                        '--spinner-rotate': spoke.rotate,
                        '--spinner-delay': spoke.delay,
                      }}
                    />
                  ))}
                  <span className="artifact-altar-stage__spinner-core" />
                  <Sparkles className="artifact-altar-stage__spinner-icon" />
                </div>
              ) : (
                <Sparkles className="artifact-altar-stage__icon" />
              )}
            </div>

            <div className="artifact-altar-stage__content">
              <div className="artifact-altar-stage__status-row inline-flex items-center justify-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-md">
                <span className={`student-artifact-altar__rank-pill inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${stageMeta.pillClassName || IDLE_ALTAR_META.pillClassName}`} data-rank={stageChipRank}>
                  {altarPhase === 'spinning' ? 'Призыв' : stageArtifact ? `Ранг ${displayPull.rank}` : 'Готовность'}
                </span>
                <span>{stageChipStatusText}</span>
              </div>

              <div className="artifact-altar-stage__copy">
                <div className="artifact-altar-stage__title-band">
                  <div className="artifact-altar-stage__title">{altarStageTitle}</div>
                </div>
                <div className="artifact-altar-stage__subtitle">{resolvedAltarStageSubtitle}</div>
              </div>
            </div>
          </div>

          <div className="student-artifact-altar__summon-shell mt-4 rounded-[24px] border border-amber-200/90 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.98),rgba(255,248,220,0.96)_42%,rgba(254,243,199,0.9)_100%)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_18px_30px_rgba(217,119,6,0.12)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Призыв</div>
                <div className="mt-1 text-sm text-slate-600">
                  Запусти крутку и смотри, как артефакт проявляется в центре алтаря.
                </div>
              </div>
              <button
                type="button"
                onClick={handleSpinClick}
                disabled={!canSpin}
                className={`artifact-altar-spin-button ${spinButtonBusy ? 'artifact-altar-spin-button--spinning' : ''}`}
              >
                <Sparkles size={16} />
                <span>{spinning ? 'Алтарь отвечает...' : `Крутить за ${spinCost}`}</span>
                <img src={ivanCoin} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
              </button>
            </div>

            {!canSpin && !spinButtonBusy && coinsTotal < spinCost && (
              <div className="mt-2 text-xs text-rose-600">
                Нужно еще {(spinCost - Math.max(0, Math.floor(Number(coinsTotal) || 0))).toLocaleString('ru-RU')} монет.
              </div>
            )}
          </div>

          {spinError && (
            <div className="student-artifact-altar__error mt-3 rounded-2xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700">
              {spinError}
            </div>
          )}
        </div>

        <div className="student-artifact-altar__collection-shell rounded-[26px] border border-purple-200/70 bg-white/90 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-purple-600">Коллекция</div>
                <div className="mt-1 text-base font-semibold text-slate-900">Выбитые артефакты</div>
                <div className="mt-1 text-xs text-slate-500">Здесь показываются только найденные артефакты.</div>
              </div>
              <div className="student-artifact-altar__collection-count inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-[11px] font-semibold text-purple-700">
                <Package2 size={14} />
                {`${uniqueOwned}`}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="student-artifact-altar__meta-chip inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {`${uniqueOwned} уникальных`}
              </div>
              <div className="student-artifact-altar__meta-chip inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {`${totalOwned} всего артефактов`}
              </div>
              <div className="student-artifact-altar__meta-chip inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {`${totalPulls} круток`}
              </div>
              {displayPullMeta && (
                <div className={`student-artifact-altar__rank-pill student-artifact-altar__meta-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${displayPullRankMeta.pillClassName}`} data-rank={String(displayPull?.rank || 'C').toUpperCase()}>
                  {`Последний: ${displayPullMeta.name}`}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {bonusEntries.length > 0 && (
                <div className="student-artifact-altar__bonus-shell rounded-2xl border border-violet-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,245,255,0.94))] p-2.5">
                  <div className="student-artifact-altar__bonus-header flex flex-wrap items-center justify-between gap-2">
                    <div className="student-artifact-altar__bonus-title text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600">
                      Суммарный бонус
                    </div>
                    <div className="student-artifact-altar__bonus-count text-[10px] font-semibold text-slate-500">
                      {`${bonusEntries.length} эффект${bonusEntries.length === 1 ? '' : bonusEntries.length < 5 ? 'а' : 'ов'}`}
                    </div>
                  </div>
                  <div className="student-artifact-altar__bonus-list mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {bonusEntries.map((entry) => (
                      <div
                        key={String(entry.id || `${entry.label}-${entry.value}`)}
                        className={`student-artifact-altar__bonus-card rounded-xl border px-2.5 py-1.5 shadow-sm ${BONUS_TONE_CLASSNAME[entry.tone] || 'border-slate-200 bg-slate-50/90 text-slate-700'}`}
                        data-tone={String(entry.tone || 'default')}
                      >
                        <div className="student-artifact-altar__bonus-card-row flex items-baseline justify-between gap-2">
                          <div className="student-artifact-altar__bonus-label min-w-0 truncate text-[10px] font-semibold leading-none">
                            {entry.label}
                          </div>
                          <div className="student-artifact-altar__bonus-value shrink-0 whitespace-nowrap text-sm font-black leading-none">
                            {entry.value}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {collectedArtifacts.length === 0 ? (
                <div className="student-artifact-altar__empty rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-500">
                  Первые артефакты появятся здесь после круток алтаря.
                </div>
              ) : (
                ARTIFACT_RANK_ORDER.map((rank) => {
                  const rankMeta = RANK_META[rank] || RANK_META.C;
                  const rankItems = collectedRankGroupMap.get(rank) || [];
                  if (rankItems.length === 0) return null;

                  return (
                    <div key={`artifact-rank-${rank}`} className="student-artifact-altar__rank-shell rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className={`student-artifact-altar__rank-pill inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${rankMeta.pillClassName}`} data-rank={rank}>
                          {`Ранг ${rank}`}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-500">{rankMeta.title}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {rankItems.map((artifact) => (
                          <button
                            type="button"
                            key={artifact.id}
                            onClick={() => setSelectedArtifactId(artifact.id)}
                            className="student-artifact-altar__artifact-card relative overflow-hidden rounded-2xl border p-2.5 text-left transition"
                            data-rank={rank}
                            style={getRankCardStyle(rank, true)}
                            aria-label={`Открыть карточку артефакта ${artifact.name}`}
                          >
                            <div
                              className="student-artifact-altar__artifact-card-media mx-auto flex h-28 w-full items-center justify-center rounded-[18px] border bg-white/82 p-1"
                              data-rank={rank}
                              style={{
                                borderColor: `${rankMeta.accent}44`,
                                boxShadow: rankMeta.glow,
                              }}
                            >
                              <img
                                src={artifact.src}
                                alt={artifact.name}
                                loading="lazy"
                                decoding="async"
                                className="student-artifact-altar__artifact-card-art h-full w-full object-contain"
                              />
                            </div>
                            <div className="mt-2 min-h-[2.5rem] text-center text-xs font-semibold text-slate-800">
                              {artifact.name}
                            </div>
                            <div className="mt-1 min-h-[4.25rem] text-center text-[11px] leading-5 text-slate-500">
                              {artifact.description || 'Описание можно добавить в каталоге артефактов.'}
                            </div>
                            <div className="mt-1 flex items-center justify-center">
                              <span className={`student-artifact-altar__rank-pill inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${rankMeta.pillClassName}`} data-rank={rank}>
                                {`x${artifact.count}`}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
        </div>
      </div>
    </div>
    {artifactDetailModal && (typeof document !== 'undefined'
      ? createPortal(artifactDetailModal, document.body)
      : artifactDetailModal)}
    </>
  );
};

export default StudentArtifactAltar;
