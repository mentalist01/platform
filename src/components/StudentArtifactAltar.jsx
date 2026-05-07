import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package2, Sparkles, X } from 'lucide-react';
import CoinGuideIcon from './CoinGuideTooltip';
import ivanCoin from '../assets/ivan-coin-badge.png';
import artifactSpinMusic from '../assets/artefacts/music/spin.mp3';
import { ARTIFACT_CATALOG_METADATA_BY_ID } from '../data/artifactCatalog';

const artifactModules = import.meta.glob('../assets/artefacts/**/*.png', { eager: true, import: 'default' });

const RANK_FOLDER_TO_ID = {
  'ss-rank': 'SS',
  's-rank': 'S',
  'a-rank': 'A',
  'b-rank': 'B',
  'c-rank': 'C',
};

const RANK_META = {
  SS: {
    label: 'SS',
    title: 'Сверхлегендарный',
    pillClassName: 'border-pink-300 bg-pink-50 text-rose-700',
    accent: '#ff1f6d',
    surface: 'linear-gradient(135deg, rgba(255,228,240,0.98), rgba(255,214,232,0.95) 44%, rgba(254,205,211,0.94))',
    glow: '0 0 34px rgba(255, 31, 109, 0.56), 0 0 78px rgba(239, 68, 68, 0.36), 0 0 118px rgba(244, 63, 94, 0.22)',
  },
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
  'amulet-of-import': 'Амулет импорта',
  'list-comprehension': 'List Comprehension',
  python: 'Python',
  'recursive scroll': 'Рекурсивный свиток',
  crutch: 'Костыль',
  duck: 'Уточка-дебаггер',
  fleshka: 'Флешка с файлами',
  'ring-of-cache': 'Кольцо кэша',
  rocks: 'Камни для игры',
  turtle: 'Черепашка-исполнитель',
  whileTrue: 'while True',
  black_pen: 'Черная ручка',
  coffee: 'Кофе',
  cookie: 'Печенька',
  draft: 'Черновик',
  'transfer-agreement': 'Права на платформу',
};

const ARTIFACT_RANK_ORDER = ['SS', 'S', 'A', 'B', 'C'];

const MIN_SPIN_DURATION_MS = 3000;
const SPIN_RUPTURE_MS = 520;
const REVEAL_VISIBLE_MS = 3200;
const DUPLICATE_COIN_FLIGHT_DURATION_MS = 1160;
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
    // Ignore legacy/stray art files that are not present in the canonical artifact catalog.
    if (!metadata) return null;
    return {
      id,
      rank: metadata.rank || RANK_FOLDER_TO_ID[folder] || 'C',
      name: metadata.name || ARTIFACT_LABELS[id] || id,
      description: typeof metadata.description === 'string' ? metadata.description : '',
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
  'transfer-agreement': {
    title: '????',
    power: 'Меняет правила игры',
    tags: ['SS-ранг', 'особый статус'],
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

const createDuplicateCoinFlights = (sourceRect, targetRect, coinsAmount) => {
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 720;
  const sourceCenterX = Number.isFinite(sourceRect?.left)
    ? sourceRect.left + ((Number.isFinite(sourceRect?.width) ? sourceRect.width : 0) / 2)
    : (viewportW * 0.5);
  const sourceCenterY = Number.isFinite(sourceRect?.top)
    ? sourceRect.top + ((Number.isFinite(sourceRect?.height) ? sourceRect.height : 0) * 0.44)
    : (viewportH * 0.56);
  const targetCenterX = Number.isFinite(targetRect?.left)
    ? targetRect.left + ((Number.isFinite(targetRect?.width) ? targetRect.width : 0) / 2)
    : (viewportW * 0.72);
  const targetCenterY = Number.isFinite(targetRect?.top)
    ? targetRect.top + ((Number.isFinite(targetRect?.height) ? targetRect.height : 0) / 2)
    : (viewportH * 0.18);
  const amount = Math.max(1, Math.floor(Number(coinsAmount) || 0));
  const count = Math.max(7, Math.min(20, Math.round(6 + (amount / 5))));
  const coins = [];
  let maxLandingMs = 0;
  for (let index = 0; index < count; index += 1) {
    const progress = count > 1 ? index / (count - 1) : 0;
    const startX = sourceCenterX + ((Math.random() - 0.5) * Math.max(34, (Number(sourceRect?.width) || 92) * 0.72));
    const startY = sourceCenterY + ((Math.random() - 0.5) * Math.max(22, (Number(sourceRect?.height) || 70) * 0.62));
    const endX = targetCenterX + ((Math.random() - 0.5) * Math.max(10, (Number(targetRect?.width) || 56) * 0.38));
    const endY = targetCenterY + ((Math.random() - 0.5) * Math.max(8, (Number(targetRect?.height) || 28) * 0.44));
    const horizontalCurve = (Math.random() - 0.5) * Math.max(54, Math.min(viewportW * 0.12, 132));
    const verticalLift = 84 + (Math.random() * 92);
    const midX = startX + ((endX - startX) * 0.4) + horizontalCurve;
    const midY = Math.min(startY, endY) - verticalLift;
    const delayMs = Math.round(progress * 360 + (Math.random() * 70));
    const durationMs = Math.round(DUPLICATE_COIN_FLIGHT_DURATION_MS * (0.82 + (Math.random() * 0.24)));
    const landingMs = delayMs + Math.round(durationMs * 0.9);
    if (landingMs > maxLandingMs) maxLandingMs = landingMs;
    coins.push({
      id: `artifact-coin-flight-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      sizePx: Math.round(17 + (Math.random() * 8)),
      delayMs,
      durationMs,
      startX,
      startY,
      midX,
      midY,
      endX,
      endY,
      rotateDeg: Math.round((Math.random() * 100) - 50),
    });
  }
  return { coins, maxLandingMs };
};

const getRankCardStyle = (rank, owned = true) => {
  const meta = RANK_META[rank] || RANK_META.C;
  const accentSoft = hexToRgba(meta.accent, 0.16);
  const accentMid = hexToRgba(meta.accent, 0.28);
  const accentStrong = hexToRgba(meta.accent, 0.44);
  const baseVars = {
    '--artifact-card-accent': meta.accent,
    '--artifact-card-accent-soft': accentSoft,
    '--artifact-card-accent-mid': accentMid,
    '--artifact-card-accent-strong': accentStrong,
  };
  if (!owned) {
    return {
      ...baseVars,
      borderColor: 'rgba(203, 213, 225, 0.92)',
      background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(248,250,252,0.92))',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
    };
  }
  return {
    ...baseVars,
    borderColor: hexToRgba(meta.accent, 0.38),
    background: `radial-gradient(circle at 50% 10%, rgba(255,255,255,0.98) 0%, ${accentSoft} 42%, rgba(255,255,255,0) 72%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.97))`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.92), 0 10px 24px rgba(15,23,42,0.1), 0 0 0 1px ${hexToRgba(meta.accent, 0.08)}, ${meta.glow}`,
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
  'amulet-of-import': [
    { tone: 'coins', label: 'Монеты за задания', type: 'multiplier', perCopyBonus: 0.5, hint: 'Усиливает монеты за Python-задачи.' },
  ],
  'list-comprehension': [
    { tone: 'xp', label: 'XP за 17', type: 'multiplier', perCopyBonus: 0.5, hint: 'Усиливает награду за задачу 17.' },
  ],
  python: [
    { tone: 'coins', label: 'Монеты за задания', type: 'multiplier', perCopyBonus: 1, hint: 'Увеличивает монеты за Python-задачи.' },
  ],
  'recursive scroll': [
    { tone: 'xp', label: 'XP за 16', type: 'multiplier', perCopyBonus: 0.5, hint: 'Помогает с рекурсивными алгоритмами.' },
  ],
  crutch: [
    { tone: 'xp', label: 'Любой опыт', type: 'multiplier', perCopyBonus: 0.1, hint: 'Небольшой, но стабильный бонус к опыту.' },
  ],
  duck: [
    { tone: 'xp', label: 'Любой опыт', type: 'multiplier', perCopyBonus: 0.15, hint: 'Помогает быстрее замечать ошибки в решениях.' },
  ],
  fleshka: [
    { tone: 'xp', label: 'XP за файлы', type: 'multiplier', perCopyBonus: 0.25, hint: 'Работает на заданиях 17, 24, 26 и 27.' },
  ],
  rocks: [
    { tone: 'xp', label: 'XP за 19-21', type: 'multiplier', perCopyBonus: 0.5, hint: 'Усиливает награду за игровые задачи.' },
  ],
  'ring-of-cache': [
    { tone: 'xp', label: 'XP за 16/19-21', type: 'multiplier', perCopyBonus: 0.5, hint: 'Помнит уже посчитанные состояния.' },
  ],
  turtle: [
    { tone: 'xp', label: 'XP за 6', type: 'multiplier', perCopyBonus: 1, hint: 'Работает на задаче про Черепаху.' },
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
  cookie: [
    { tone: 'instant', label: 'Разовый опыт', type: 'instant', amount: 500, unit: 'XP', hint: 'Начисляется за каждую найденную копию.' },
    { tone: 'instant', label: 'Разовые монеты', type: 'instant', amount: 3, unit: 'монеты', hint: 'Начисляется за каждую найденную копию.' },
  ],
  draft: [
    { tone: 'instant', label: 'Разовый опыт', type: 'instant', amount: 1000, unit: 'XP', hint: 'Начисляется за каждую найденную копию.' },
  ],
};

const formatArtifactBonusPercent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 1) return '+0%';
  const percent = Math.round((number - 1) * 10000) / 100;
  return `+${percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
};

const formatArtifactBonusDelta = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '+0%';
  const percent = Math.round(number * 10000) / 100;
  return `+${percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
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
  const level = Math.max(1, Math.floor(Number(artifact?.level) || 1));
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
      const currentMultiplier = 1 + (perCopyBonus * level);
      const nextLevel = Math.floor(Number(artifact?.upgrade?.nextLevel) || 0);
      const nextMultiplier = nextLevel > level ? 1 + (perCopyBonus * nextLevel) : null;
      return {
        tone: effect.tone,
        label: effect.label,
        value: formatArtifactBonusPercent(currentMultiplier),
        detail: '',
      };
    }

    if (effect.type === 'instant') {
      const amount = Math.max(0, Math.round(Number(effect.amount) || 0));
      return {
        tone: effect.tone,
        label: effect.label,
        value: formatArtifactInstantAmount(amount, effect.unit),
        detail: count > 1
          ? `Всего выбито: ${pluralizeArtifactCopies(count)}. Уровень ${level}.`
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

const buildArtifactUpgradeComparisons = (artifact, nextLevel) => {
  const id = String(artifact?.id || '').trim();
  const currentLevel = Math.max(1, Math.floor(Number(artifact?.level) || 1));
  const targetLevel = Math.max(currentLevel + 1, Math.floor(Number(nextLevel) || currentLevel + 1));
  const effects = ARTIFACT_EFFECTS_BY_ID[id] || [];
  const multiplierComparisons = effects
    .filter((effect) => effect?.type === 'multiplier')
    .map((effect) => {
      const perLevelBonus = Number(effect.perCopyBonus) || 0;
      const beforeMultiplier = 1 + (perLevelBonus * currentLevel);
      const afterMultiplier = 1 + (perLevelBonus * targetLevel);
      return {
        tone: effect.tone || 'default',
        label: effect.label || 'Бонус',
        before: formatArtifactBonusPercent(beforeMultiplier),
        after: formatArtifactBonusPercent(afterMultiplier),
        delta: formatArtifactBonusDelta(afterMultiplier - beforeMultiplier),
      };
    });

  if (multiplierComparisons.length > 0) return multiplierComparisons;

  return [{
    tone: 'default',
    label: 'Уровень артефакта',
    before: `${currentLevel}`,
    after: `${targetLevel}`,
    delta: `+${targetLevel - currentLevel}`,
  }];
};

const StudentArtifactAltar = ({
  altar = null,
  coinsTotal = 0,
  onSpin,
  onUpgrade,
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
  const [spinIntensity, setSpinIntensity] = useState('idle');
  const [displayPull, setDisplayPull] = useState(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const [upgradingArtifactId, setUpgradingArtifactId] = useState('');
  const [upgradeError, setUpgradeError] = useState('');
  const [upgradeFlash, setUpgradeFlash] = useState(null);
  const [upgradeShowcase, setUpgradeShowcase] = useState(null);
  const [duplicateCoinFlights, setDuplicateCoinFlights] = useState([]);
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
          level: Math.max(1, Math.floor(Number(artifact?.level) || 1)),
          cards: Math.max(0, Math.floor(Number(artifact?.cards) || 0)),
          upgrade: artifact?.upgrade && typeof artifact.upgrade === 'object' ? artifact.upgrade : null,
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
      .filter((artifact) => artifact.rank === 'SS' || artifact.rank === 'S')
      .map((artifact) => ({
        ...artifact,
        teaser: LEGENDARY_TEASER_COPY_BY_ID[artifact.id] || {
          title: artifact.rank === 'SS' ? 'Неизвестный артефакт' : 'Секретная легендарка',
          power: artifact.rank === 'SS'
            ? 'Очень редкая находка алтаря с особым статусом.'
            : 'Даёт один из самых сильных бонусов коллекции.',
          tags: artifact.rank === 'SS' ? ['SS-ранг', 'тайная находка'] : ['легендарный', 'сильный бонус'],
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
  const spinRuptureTimerRef = useRef(null);
  const spinAudioRef = useRef(null);
  const upgradeFlashTimerRef = useRef(null);
  const duplicateCoinFlightTimerRef = useRef(null);
  const duplicateCoinFlightKeyRef = useRef('');
  const stageArtifactShellRef = useRef(null);
  const walletRef = useRef(null);

  const clearDuplicateCoinFlightTimer = () => {
    if (duplicateCoinFlightTimerRef.current) {
      window.clearTimeout(duplicateCoinFlightTimerRef.current);
      duplicateCoinFlightTimerRef.current = null;
    }
  };

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

  const clearSpinPhaseTimers = () => {
    if (spinRuptureTimerRef.current) {
      window.clearTimeout(spinRuptureTimerRef.current);
      spinRuptureTimerRef.current = null;
    }
  };

  const clearAnimationTimers = () => {
    clearRevealTimers();
    clearSpinPhaseTimers();
    clearDuplicateCoinFlightTimer();
    if (upgradeFlashTimerRef.current) {
      window.clearTimeout(upgradeFlashTimerRef.current);
      upgradeFlashTimerRef.current = null;
    }
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
    setUpgradeShowcase(null);
    setDuplicateCoinFlights([]);
    setDisplayPull(null);
    setSpinIntensity('building');
    setAltarPhase('spinning');
  };

  const runReveal = (pull) => {
    clearRevealTimers();
    if (!pull) {
      clearSpinPhaseTimers();
      stopSpinAudio();
      spinCycleRef.current = false;
      pendingAltarRef.current = null;
      const restoredPull = hiddenPullRef.current || null;
      setDisplayPull(restoredPull);
      setSpinIntensity('idle');
      setAltarPhase(restoredPull ? 'settled' : 'idle');
      return;
    }
    const elapsed = spinStartedAtRef.current ? Date.now() - spinStartedAtRef.current : MIN_SPIN_DURATION_MS;
    const delay = Math.max(0, MIN_SPIN_DURATION_MS - elapsed);
    const revealDelay = Math.max(delay, SPIN_RUPTURE_MS);
    spinRuptureTimerRef.current = window.setTimeout(() => {
      setSpinIntensity('rupture');
      spinRuptureTimerRef.current = null;
    }, Math.max(0, revealDelay - SPIN_RUPTURE_MS));
    revealTimerRef.current = window.setTimeout(() => {
      releaseSpinAudio();
      const nextDisplayAltar = normalizeAltarSnapshot(pendingAltarRef.current);
      hiddenPullRef.current = pull;
      if (nextDisplayAltar) {
        setDisplayAltar(nextDisplayAltar);
      }
      pendingAltarRef.current = null;
      clearSpinPhaseTimers();
      setDisplayPull(pull);
      setSpinIntensity('idle');
      setAltarPhase('revealed');
      spinCycleRef.current = false;
      resetTimerRef.current = window.setTimeout(() => {
        setAltarPhase('settled');
      }, REVEAL_VISIBLE_MS);
    }, revealDelay);
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
  const displayPullMaxLevelDuplicateCoins = Math.max(0, Math.floor(Number(displayPull?.maxLevelDuplicateCoins) || 0));
  const displayPullMaxLevelDuplicateText = displayPullMaxLevelDuplicateCoins > 0
    ? `Артефакт уже на максимальном уровне. Компенсация: +${displayPullMaxLevelDuplicateCoins.toLocaleString('ru-RU')} монет.`
    : '';
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
    '--artifact-altar-spin-ramp-duration': `${MIN_SPIN_DURATION_MS}ms`,
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

  const resolvedAltarStageSubtitle = displayPullMaxLevelDuplicateText
    ? displayPullMaxLevelDuplicateText
    : stageArtifactDescription
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

  useEffect(() => {
    if (altarPhase !== 'revealed' || displayPullMaxLevelDuplicateCoins <= 0) return undefined;
    const rewardKey = [
      displayPull?.id,
      displayPull?.rank,
      displayPull?.count,
      displayPull?.pulledAt,
      displayPullMaxLevelDuplicateCoins,
    ].map((value) => String(value ?? '').trim()).join(':');
    if (!rewardKey || duplicateCoinFlightKeyRef.current === rewardKey) return undefined;
    duplicateCoinFlightKeyRef.current = rewardKey;

    const launchTimer = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!mountedRef.current) return;
          const sourceRect = stageArtifactShellRef.current?.getBoundingClientRect?.();
          const targetRect = walletRef.current?.getBoundingClientRect?.();
          if (
            !sourceRect
            || !targetRect
            || sourceRect.width < 8
            || sourceRect.height < 8
            || targetRect.width < 8
            || targetRect.height < 8
          ) {
            return;
          }
          clearDuplicateCoinFlightTimer();
          const { coins, maxLandingMs } = createDuplicateCoinFlights(
            sourceRect,
            targetRect,
            displayPullMaxLevelDuplicateCoins
          );
          setDuplicateCoinFlights(coins);
          duplicateCoinFlightTimerRef.current = window.setTimeout(() => {
            duplicateCoinFlightTimerRef.current = null;
            setDuplicateCoinFlights([]);
          }, maxLandingMs + 460);
        });
      });
    }, 340);

    return () => window.clearTimeout(launchTimer);
  }, [
    altarPhase,
    displayPull?.count,
    displayPull?.id,
    displayPull?.pulledAt,
    displayPull?.rank,
    displayPullMaxLevelDuplicateCoins,
  ]);

  const selectedArtifact = useMemo(() => {
    if (!selectedArtifactId) return null;
    const fromCollection = collectedArtifacts.find((artifact) => artifact.id === selectedArtifactId);
    if (fromCollection) return fromCollection;
    if (stageArtifact?.id === selectedArtifactId) {
      return {
        ...stageArtifact,
        rank: String(displayPull?.rank || stageArtifact.rank || 'C').toUpperCase(),
        count: Math.max(1, Math.floor(Number(displayPull?.count) || 1)),
        level: Math.max(1, Math.floor(Number(displayPull?.level) || 1)),
        cards: Math.max(0, Math.floor(Number(displayPull?.cards) || 0)),
        upgrade: displayPull?.upgrade && typeof displayPull.upgrade === 'object' ? displayPull.upgrade : null,
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
  const selectedArtifactLevel = Math.max(1, Math.floor(Number(selectedArtifact?.level) || 1));
  const selectedUpgrade = selectedArtifact?.upgrade && typeof selectedArtifact.upgrade === 'object'
    ? selectedArtifact.upgrade
    : null;
  const selectedCardsAvailable = Math.max(0, Math.floor(Number(selectedUpgrade?.cardsAvailable ?? selectedArtifact?.cards) || 0));
  const selectedCardsRequired = Math.max(0, Math.floor(Number(selectedUpgrade?.cardsRequired) || 0));
  const selectedCoinsRequired = Math.max(0, Math.floor(Number(selectedUpgrade?.coinsRequired) || 0));
  const selectedNextLevel = Math.max(0, Math.floor(Number(selectedUpgrade?.nextLevel) || 0));
  const selectedUpgradeProgress = selectedCardsRequired > 0
    ? Math.min(100, Math.round((selectedCardsAvailable / selectedCardsRequired) * 100))
    : 100;
  const selectedUpgradeIsMax = Boolean(selectedUpgrade?.isMaxLevel) || selectedArtifactLevel >= Math.max(1, Math.floor(Number(selectedUpgrade?.maxLevel) || 5));
  const selectedUpgradeCopiesReady = Boolean(
    !selectedUpgradeIsMax
    && selectedCardsRequired > 0
    && selectedCardsAvailable >= selectedCardsRequired
  );
  const selectedUpgradeCanAffordCoins = selectedCoinsRequired <= Math.max(0, Math.floor(Number(coinsTotal) || 0));
  const selectedUpgradeCanSubmit = Boolean(
    selectedArtifact
    && typeof onUpgrade === 'function'
    && !selectedUpgradeIsMax
    && selectedCardsRequired > 0
    && selectedUpgradeCopiesReady
    && selectedUpgradeCanAffordCoins
    && !upgradingArtifactId
  );
  const selectedUpgradeButtonLabel = selectedUpgradeIsMax
    ? 'Максимальный уровень'
    : upgradingArtifactId === selectedArtifact?.id
      ? 'Улучшаем...'
      : 'Улучшить';
  const selectedUpgradeComparisons = useMemo(
    () => (
      selectedArtifact && !selectedUpgradeIsMax
        ? buildArtifactUpgradeComparisons(selectedArtifact, selectedNextLevel || selectedArtifactLevel + 1)
        : []
    ),
    [selectedArtifact, selectedArtifactLevel, selectedNextLevel, selectedUpgradeIsMax],
  );

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

  const handleUpgradeClick = async () => {
    if (!selectedArtifact || !selectedUpgradeCanSubmit) return;
    setUpgradeError('');
    setUpgradingArtifactId(selectedArtifact.id);
    const upgradeArtifactSnapshot = { ...selectedArtifact };
    const upgradeFromLevel = selectedArtifactLevel;
    const upgradeToLevel = selectedNextLevel || selectedArtifactLevel + 1;
    try {
      const result = await onUpgrade(selectedArtifact.id);
      if (!mountedRef.current) return;
      const nextDisplayAltar = normalizeAltarSnapshot(result?.altar);
      if (nextDisplayAltar) {
        pendingAltarRef.current = nextDisplayAltar;
        setDisplayAltar(nextDisplayAltar);
      }
      const resolvedLevel = Math.max(upgradeFromLevel + 1, Math.floor(Number(result?.level) || upgradeToLevel));
      setUpgradeShowcase({
        id: `${upgradeArtifactSnapshot.id}-${resolvedLevel}-${Date.now()}`,
        artifact: upgradeArtifactSnapshot,
        fromLevel: upgradeFromLevel,
        toLevel: resolvedLevel,
        comparisons: buildArtifactUpgradeComparisons(upgradeArtifactSnapshot, resolvedLevel),
      });
      setUpgradeFlash({ artifactId: selectedArtifact.id, level: resolvedLevel });
      if (upgradeFlashTimerRef.current) {
        window.clearTimeout(upgradeFlashTimerRef.current);
      }
      upgradeFlashTimerRef.current = window.setTimeout(() => {
        setUpgradeFlash(null);
        upgradeFlashTimerRef.current = null;
      }, 1500);
    } catch (err) {
      if (!mountedRef.current) return;
      setUpgradeError(err?.message || 'Не удалось улучшить артефакт.');
    } finally {
      if (mountedRef.current) {
        setUpgradingArtifactId('');
      }
    }
  };

  const upgradeShowcaseRankMeta = RANK_META[upgradeShowcase?.artifact?.rank] || RANK_META.C;
  const upgradeShowcaseStyle = upgradeShowcase ? {
    '--artifact-upgrade-accent': upgradeShowcaseRankMeta.accent,
    '--artifact-upgrade-accent-soft': hexToRgba(upgradeShowcaseRankMeta.accent, 0.2),
    '--artifact-upgrade-accent-mid': hexToRgba(upgradeShowcaseRankMeta.accent, 0.38),
    '--artifact-upgrade-accent-strong': hexToRgba(upgradeShowcaseRankMeta.accent, 0.62),
  } : undefined;

  const upgradeShowcaseOverlay = upgradeShowcase ? (
    <div
      key={upgradeShowcase.id}
      className="student-artifact-upgrade-showcase"
      style={upgradeShowcaseStyle}
      role="button"
      tabIndex={0}
      aria-label="Улучшение артефакта завершено. Нажмите, чтобы закрыть."
      onMouseDown={() => setUpgradeShowcase(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
          event.preventDefault();
          setUpgradeShowcase(null);
        }
      }}
    >
      <div className="student-artifact-upgrade-showcase__void" />
      <div className="student-artifact-upgrade-showcase__burst student-artifact-upgrade-showcase__burst--one" />
      <div className="student-artifact-upgrade-showcase__burst student-artifact-upgrade-showcase__burst--two" />
      <div className="student-artifact-upgrade-showcase__artifact">
        <div className="student-artifact-upgrade-showcase__level">
          {`Уровень ${upgradeShowcase.fromLevel} -> ${upgradeShowcase.toLevel}`}
        </div>
        <img
          src={upgradeShowcase.artifact.src}
          alt={upgradeShowcase.artifact.name}
          className="student-artifact-upgrade-showcase__image"
          decoding="async"
        />
      </div>
      <div className="student-artifact-upgrade-showcase__results">
        <div className="student-artifact-upgrade-showcase__kicker">Артефакт улучшен</div>
        <div className="student-artifact-upgrade-showcase__title">{upgradeShowcase.artifact.name}</div>
        <div className="student-artifact-upgrade-showcase__rows">
          {upgradeShowcase.comparisons.map((entry) => (
            <div
              key={`${upgradeShowcase.id}-${entry.label}`}
              className="student-artifact-upgrade-showcase__row"
              data-tone={String(entry.tone || 'default')}
            >
              <div className="student-artifact-upgrade-showcase__label">{entry.label}</div>
              <div className="student-artifact-upgrade-showcase__numbers">
                <span className="student-artifact-upgrade-showcase__before">{entry.before}</span>
                <span className="student-artifact-upgrade-showcase__arrow">{'→'}</span>
                <span className="student-artifact-upgrade-showcase__after">{entry.after}</span>
                <strong className="student-artifact-upgrade-showcase__delta">{entry.delta}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

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
      <div
        className={`student-artifact-detail-modal__card ${
          upgradeFlash?.artifactId === selectedArtifact.id ? 'student-artifact-detail-modal__card--upgraded' : ''
        }`}
        data-rank={selectedArtifact.rank}
        style={artifactDetailStyle}
      >
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
          <div className="student-artifact-detail-modal__level-badge">
            <span>Ур.</span>
            <strong>{selectedArtifactLevel}</strong>
          </div>
        </div>

        <div className="student-artifact-detail-modal__content">
          <div className="student-artifact-detail-modal__eyebrow">Карточка артефакта</div>
          <h3 id="artifact-detail-title" className="student-artifact-detail-modal__title">
            {selectedArtifact.name}
          </h3>
          <div className="student-artifact-detail-modal__meta-row">
            <span>{selectedArtifactRankMeta.title}</span>
            <span>{`Уровень ${selectedArtifactLevel}`}</span>
            <span>{pluralizeArtifactCopies(selectedArtifact.count)}</span>
            {!selectedUpgradeIsMax && <span>{`${selectedCardsAvailable}/${selectedCardsRequired} копий`}</span>}
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

          <div className="student-artifact-detail-modal__upgrade-panel">
            <div className="student-artifact-detail-modal__upgrade-head">
              <div>
                <div className="student-artifact-detail-modal__upgrade-kicker">Прокачка</div>
                <div className="student-artifact-detail-modal__upgrade-title">
                  {selectedUpgradeIsMax ? 'Максимальный уровень' : `Уровень ${selectedArtifactLevel} -> ${selectedNextLevel}`}
                </div>
              </div>
            </div>

            {selectedUpgradeIsMax ? (
              <div className="student-artifact-detail-modal__upgrade-max">
                Артефакт полностью улучшен.
              </div>
            ) : (
              <>
                <div className="student-artifact-detail-modal__upgrade-progress-row">
                  <span>Копии</span>
                  <strong>{`${selectedCardsAvailable}/${selectedCardsRequired}`}</strong>
                </div>
                <div className={`student-artifact-detail-modal__upgrade-track ${
                  selectedUpgradeCopiesReady ? 'student-artifact-detail-modal__upgrade-track--ready' : ''
                }`}>
                  <div
                    className="student-artifact-detail-modal__upgrade-fill"
                    style={{ width: `${selectedUpgradeProgress}%` }}
                  />
                </div>
                {selectedUpgradeComparisons.length > 0 && (
                  <div className="student-artifact-detail-modal__upgrade-preview">
                    {selectedUpgradeComparisons.map((entry) => (
                      <div
                        key={`${selectedArtifact.id}-upgrade-preview-${entry.label}`}
                        className="student-artifact-detail-modal__upgrade-preview-item"
                        data-tone={String(entry.tone || 'default')}
                      >
                        <span className="student-artifact-detail-modal__upgrade-preview-label">{entry.label}</span>
                        <span className="student-artifact-detail-modal__upgrade-preview-values">
                          <span>{entry.before}</span>
                          <span className="student-artifact-detail-modal__upgrade-preview-arrow" aria-hidden="true">↑</span>
                          <strong>{entry.after}</strong>
                          <em>{entry.delta}</em>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="student-artifact-detail-modal__upgrade-button"
                  disabled={!selectedUpgradeCanSubmit}
                  onClick={handleUpgradeClick}
                >
                  <Sparkles size={16} />
                  <span>{selectedUpgradeButtonLabel}</span>
                  <span className="student-artifact-detail-modal__upgrade-button-price">
                    <span>{selectedCoinsRequired.toLocaleString('ru-RU')}</span>
                    <CoinGuideIcon />
                  </span>
                </button>
                {!selectedUpgradeCanAffordCoins && (
                  <div className="student-artifact-detail-modal__upgrade-warning">
                    Не хватает монет.
                  </div>
                )}
                {selectedCardsAvailable < selectedCardsRequired && (
                  <div className="student-artifact-detail-modal__upgrade-warning">
                    Нужно больше копий этого артефакта.
                  </div>
                )}
              </>
            )}
            {upgradeError && (
              <div className="student-artifact-detail-modal__upgrade-error">{upgradeError}</div>
            )}
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
        <div
          ref={walletRef}
          className={`student-artifact-altar__wallet inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/90 px-3 py-1.5 text-sm font-semibold text-amber-700 shadow-sm ${duplicateCoinFlights.length > 0 ? 'student-artifact-altar__wallet--receiving' : ''}`}
          data-tour="rating-coins"
        >
          <CoinGuideIcon className="h-4 w-4 object-contain" />
          <span>{`${Math.max(0, Math.floor(Number(coinsTotal) || 0)).toLocaleString('ru-RU')} монет`}</span>
        </div>
      </div>

      <div className="student-artifact-altar__tour-target mt-4 flow-root" data-tour="rating-altar">
      {legendaryTeasers.length > 0 && (
        <div className="student-artifact-altar__legendary-teaser rounded-[26px] border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="student-artifact-altar__legendary-eyebrow text-xs font-bold uppercase tracking-[0.2em]">
                Тайные легендарки
              </div>
            </div>
            <div className="student-artifact-altar__legendary-note inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold">
              <Sparkles size={13} />
              <span>SS 1% · S 5%</span>
            </div>
          </div>

          <div className="student-artifact-altar__legendary-grid mt-3">
            {legendaryTeasers.map((artifact, index) => {
              const teaserRankMeta = RANK_META[artifact.rank] || RANK_META.S;
              const isSecretSuperRank = artifact.rank === 'SS';
              return (
                <div
                  key={`legendary-teaser-${artifact.id}`}
                  className="student-artifact-altar__legendary-card"
                  data-rank={artifact.rank}
                  style={{
                    '--legendary-delay': `${index * 110}ms`,
                    '--legendary-accent': teaserRankMeta.accent,
                    '--legendary-accent-soft': hexToRgba(teaserRankMeta.accent, isSecretSuperRank ? 0.28 : 0.18),
                    '--legendary-accent-mid': hexToRgba(teaserRankMeta.accent, isSecretSuperRank ? 0.48 : 0.28),
                    '--legendary-accent-strong': hexToRgba(teaserRankMeta.accent, isSecretSuperRank ? 0.72 : 0.42),
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
                    <div className="student-artifact-altar__legendary-rank">{`Секретный ${artifact.rank}-ранг`}</div>
                    <div className="student-artifact-altar__legendary-title mt-1 text-sm font-black text-slate-900">{artifact.teaser.title}</div>
                    <div className="student-artifact-altar__legendary-power mt-1 text-xs leading-5 text-slate-600">{artifact.teaser.power}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {artifact.teaser.tags.map((tag) => (
                      <span key={`${artifact.id}-${tag}`} className="student-artifact-altar__legendary-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`${legendaryTeasers.length > 0 ? 'mt-4 ' : ''}grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]`}>
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
            } ${altarPhase === 'spinning' ? `artifact-altar-stage--spin-${spinIntensity}` : ''}`}
            data-rank={stageChipRank}
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
                    ref={stageArtifactShellRef}
                    type="button"
                    onClick={() => setSelectedArtifactId(stageArtifact.id)}
                    aria-label={`Открыть карточку артефакта ${stageArtifact.name}`}
                    key={`altar-stage-artifact-${altarPhase}-${stageArtifact.id}-${stageArtifact.rank}-${displayPull?.count || 0}`}
                    className={`artifact-altar-stage__artifact-shell ${
                      altarPhase === 'revealed'
                          ? 'artifact-altar-stage__artifact-shell--revealed'
                          : 'artifact-altar-stage__artifact-shell--settled'
                    }`}
                    data-rank={String(displayPull?.rank || stageArtifact.rank || 'C').toUpperCase()}
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
                {displayPullMaxLevelDuplicateCoins > 0 && (
                  <div className="artifact-altar-stage__coin-reward" aria-label={`Компенсация ${displayPullMaxLevelDuplicateCoins.toLocaleString('ru-RU')} монет`}>
                    <CoinGuideIcon />
                    <span>{`+${displayPullMaxLevelDuplicateCoins.toLocaleString('ru-RU')} монет за максимум`}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="student-artifact-altar__summon-shell mt-4 rounded-[24px] border border-amber-200/90 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.98),rgba(255,248,220,0.96)_42%,rgba(254,243,199,0.9)_100%)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_18px_30px_rgba(217,119,6,0.12)]" data-tour="rating-altar-spin">
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
                <CoinGuideIcon className="h-4 w-4 object-contain" />
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

        <div className="student-artifact-altar__collection-shell rounded-[26px] border border-purple-200/70 bg-white/90 p-4 shadow-soft" data-tour="rating-artifacts">
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
                <div className="student-artifact-altar__bonus-shell rounded-2xl border border-violet-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,245,255,0.94))] p-2.5" data-tour="rating-artifact-bonuses">
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
                  const rankTotal = ARTIFACT_CATALOG.filter((artifact) => artifact.rank === rank).length;
                  const rankCollected = Math.min(rankTotal, rankItems.length);
                  const rankRemaining = Math.max(0, rankTotal - rankCollected);

                  return (
                    <div key={`artifact-rank-${rank}`} className="student-artifact-altar__rank-shell rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className={`student-artifact-altar__rank-pill inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${rankMeta.pillClassName}`} data-rank={rank}>
                          {`Ранг ${rank}`}
                        </div>
                        <div className="student-artifact-altar__rank-progress">
                          <span>{rankMeta.title}</span>
                          <span>{`Выбито ${rankCollected}/${rankTotal}`}</span>
                          <span>{`Осталось ${rankRemaining}`}</span>
                        </div>
                      </div>
                      <div className="student-artifact-altar__artifact-grid grid">
                        {rankItems.map((artifact) => {
                          const artifactUpgrade = artifact.upgrade;
                          const artifactCardsAvailable = Math.max(0, Math.floor(Number(artifactUpgrade?.cardsAvailable ?? artifact.cards) || 0));
                          const artifactCardsRequired = Math.max(0, Math.floor(Number(artifactUpgrade?.cardsRequired) || 0));
                          const artifactUpgradeCopiesReady = Boolean(
                            artifactUpgrade
                            && !artifactUpgrade.isMaxLevel
                            && artifactCardsRequired > 0
                            && artifactCardsAvailable >= artifactCardsRequired
                          );
                          const artifactUpgradeProgress = artifactUpgrade?.isMaxLevel
                            ? 100
                            : artifactUpgrade
                              ? Math.min(100, Math.round((artifactCardsAvailable / Math.max(1, artifactCardsRequired)) * 100))
                              : 0;

                          return (
                            <button
                              type="button"
                              key={artifact.id}
                              onClick={() => setSelectedArtifactId(artifact.id)}
                              className="student-artifact-altar__artifact-card student-artifact-altar__artifact-card--compact relative overflow-hidden rounded-2xl border p-2 text-left transition"
                              data-rank={rank}
                              style={getRankCardStyle(rank, true)}
                              aria-label={`Открыть карточку артефакта ${artifact.name}`}
                            >
                              <div className="student-artifact-altar__artifact-frame">
                                <div
                                  className="student-artifact-altar__artifact-card-media"
                                  data-rank={rank}
                                >
                                  <img
                                    src={artifact.src}
                                    alt={artifact.name}
                                    loading="lazy"
                                    decoding="async"
                                    className="student-artifact-altar__artifact-card-art"
                                  />
                                  <div className="student-artifact-altar__artifact-level-strip">
                                    {`${artifact.level}-й уровень`}
                                  </div>
                                </div>

                                {artifactUpgrade && (
                                  <div
                                    className={`student-artifact-altar__mini-upgrade student-artifact-altar__mini-upgrade--card ${
                                      artifactUpgrade.isMaxLevel ? 'student-artifact-altar__mini-upgrade--max' : ''
                                    } ${artifactUpgradeCopiesReady ? 'student-artifact-altar__mini-upgrade--ready' : ''}`}
                                  >
                                    <span className="student-artifact-altar__mini-upgrade-arrow" aria-hidden="true" />
                                    <div className="student-artifact-altar__mini-upgrade-meter">
                                      <div className="student-artifact-altar__mini-upgrade-track">
                                        <div
                                          className="student-artifact-altar__mini-upgrade-fill"
                                          style={{
                                            width: `${artifactUpgradeProgress}%`,
                                          }}
                                        />
                                        <span className="student-artifact-altar__mini-upgrade-value">
                                          {artifactUpgrade.isMaxLevel ? 'MAX' : `${artifactCardsAvailable}/${artifactCardsRequired}`}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
        </div>
      </div>
      </div>
    </div>
    {duplicateCoinFlights.length > 0 && (typeof document !== 'undefined'
      ? createPortal(
        <div className="xp-flight-overlay artifact-altar-coin-flight-overlay" aria-hidden="true">
          {duplicateCoinFlights.map((coin) => (
            <span
              key={coin.id}
              className="coin-flight-item artifact-altar-coin-flight"
              style={{
                '--coin-size': `${coin.sizePx}px`,
                '--coin-delay': `${coin.delayMs}ms`,
                '--coin-duration': `${coin.durationMs}ms`,
                '--coin-start-x': `${coin.startX}px`,
                '--coin-start-y': `${coin.startY}px`,
                '--coin-mid-x': `${coin.midX}px`,
                '--coin-mid-y': `${coin.midY}px`,
                '--coin-end-x': `${coin.endX}px`,
                '--coin-end-y': `${coin.endY}px`,
                '--coin-rotate': `${coin.rotateDeg}deg`,
              }}
            >
              <img src={ivanCoin} alt="" aria-hidden="true" draggable="false" />
            </span>
          ))}
        </div>,
        document.body
      )
      : null)}
    {artifactDetailModal && (typeof document !== 'undefined'
      ? createPortal(artifactDetailModal, document.body)
      : artifactDetailModal)}
    {upgradeShowcaseOverlay && (typeof document !== 'undefined'
      ? createPortal(upgradeShowcaseOverlay, document.body)
      : upgradeShowcaseOverlay)}
    </>
  );
};

export default StudentArtifactAltar;
