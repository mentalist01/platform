import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PackageOpen, Sparkles, X } from 'lucide-react';
import chestClosedImage from '../assets/mock-chest/chest-closed.png';
import chestOpenImage from '../assets/mock-chest/chest-open.png';
import ivanCoin from '../assets/ivan-coin-badge-128.webp';
import { ARTIFACT_CATALOG_METADATA } from '../data/artifactCatalog';
import { PROFILE_THEME_CATALOG_BY_ID } from '../data/profileThemeCatalog';

const artifactImageModules = import.meta.glob('../assets/artefacts/**/*.png', { eager: true, import: 'default' });

const ARTIFACT_IMAGE_BY_ID = new Map(
  Object.entries(artifactImageModules)
    .map(([path, src]) => {
      const match = path.match(/\/artefacts\/[^/]+\/([^/]+)\.png$/);
      if (!match) return null;
      return [String(match[1] || '').trim(), src];
    })
    .filter(Boolean)
);

const RANK_META = {
  SS: { label: 'SS', color: '#ff1f6d', title: 'Сверхлегендарный' },
  S: { label: 'S', color: '#ef4444', title: 'Легендарный' },
  A: { label: 'A', color: '#a855f7', title: 'Эпический' },
  B: { label: 'B', color: '#3b82f6', title: 'Редкий' },
  C: { label: 'C', color: '#64748b', title: 'Обычный' },
};

const PROFILE_THEME_RANK_BY_RARITY = {
  legendary: 'S',
  epic: 'A',
  rare: 'B',
  common: 'C',
};

const ARTIFACT_CATALOG = ARTIFACT_CATALOG_METADATA
  .map((artifact) => {
    const id = String(artifact?.id || '').trim();
    if (!id) return null;
    return {
      id,
      rank: String(artifact?.rank || 'C').trim().toUpperCase() || 'C',
      name: String(artifact?.name || id).trim() || id,
      description: typeof artifact?.description === 'string' ? artifact.description : '',
      src: ARTIFACT_IMAGE_BY_ID.get(id) || '',
    };
  })
  .filter(Boolean);

const CHEST_COIN_BURST = Array.from({ length: 32 }, (_, index) => {
  const lane = index % 8;
  const row = Math.floor(index / 8);
  const sideBias = lane - 3.5;
  const wave = Math.sin((index + 1) * 1.37);
  const startX = sideBias * 7 + wave * 6;
  const peakX = sideBias * 42 + wave * 22;
  const peakY = -92 - row * 32 - Math.abs(wave) * 28;
  const fallX = peakX + sideBias * 10 + Math.cos(index * 0.9) * 16;
  const fallY = peakY + 58 + row * 8;
  const collectX = -18 + (lane % 4 - 1.5) * 8 + wave * 5;
  const collectY = (row - 1.5) * 5 + Math.cos(index * 0.72) * 4;
  const scale = 0.76 + ((index % 5) * 0.08);
  return {
    startX: `${Math.round(startX)}px`,
    peakX: `${Math.round(peakX)}px`,
    peakY: `${Math.round(peakY)}px`,
    fallX: `${Math.round(fallX)}px`,
    fallY: `${Math.round(fallY)}px`,
    lateX: `${Math.round(fallX + sideBias * 3)}px`,
    lateY: `${Math.round(fallY + 21)}px`,
    collectX: `${Math.round(collectX)}px`,
    collectY: `${Math.round(collectY)}px`,
    endX: `${Math.round(collectX * 0.3)}px`,
    endY: `${Math.round(collectY * 0.3)}px`,
    delay: `${Math.round(lane * 34 + row * 78)}ms`,
    spin: `${Math.round((index % 2 === 0 ? 1 : -1) * (150 + row * 46 + lane * 13))}deg`,
    scale: scale.toFixed(2),
    peakScale: (scale + 0.16).toFixed(2),
    lateScale: Math.max(0.58, scale - 0.12).toFixed(2),
  };
});

const CHEST_ARTIFACT_SPARKS = Array.from({ length: 18 }, (_, index) => {
  const angle = -118 + index * 14 + Math.sin(index * 1.7) * 9;
  const distance = 54 + (index % 6) * 12 + Math.abs(Math.sin(index * 0.83)) * 24;
  const yLift = 20 + (index % 4) * 9;
  return {
    x: `${Math.round(Math.cos((angle * Math.PI) / 180) * distance)}px`,
    y: `${Math.round(Math.sin((angle * Math.PI) / 180) * distance - yLift)}px`,
    delay: `${Math.round((index % 6) * 18 + Math.floor(index / 6) * 34)}ms`,
    scale: (0.72 + (index % 5) * 0.12).toFixed(2),
    rotate: `${Math.round(angle + 90)}deg`,
  };
});

const CHEST_CLOSE_ANIMATION_MS = 1240;

const normalizeChestArtifact = (artifact) => {
  const id = String(artifact?.id || artifact?.artifactId || '').trim();
  const catalogArtifact = ARTIFACT_CATALOG.find((item) => item.id === id) || null;
  if (!id && !catalogArtifact) return null;
  const rank = String(artifact?.rank || catalogArtifact?.rank || 'C').trim().toUpperCase() || 'C';
  return {
    id: id || catalogArtifact.id,
    rank,
    name: String(artifact?.name || catalogArtifact?.name || id || 'Артефакт').trim(),
    description: typeof artifact?.description === 'string' && artifact.description.trim()
      ? artifact.description.trim()
      : (catalogArtifact?.description || ''),
    src: artifact?.src || catalogArtifact?.src || ARTIFACT_IMAGE_BY_ID.get(id) || '',
  };
};

const normalizeChestProfileTheme = (theme) => {
  const id = String(theme?.id || theme?.themeId || '').trim();
  const catalogTheme = PROFILE_THEME_CATALOG_BY_ID.get(id) || null;
  if (!id || !catalogTheme) return null;
  const rarity = String(theme?.rarity || catalogTheme.rarity || 'common').trim().toLowerCase();
  const rank = PROFILE_THEME_RANK_BY_RARITY[rarity] || 'C';
  return {
    id,
    kind: 'profile-theme',
    rank,
    rarity,
    name: String(theme?.name || catalogTheme.name || id).trim() || id,
    description: typeof theme?.description === 'string' && theme.description.trim()
      ? theme.description.trim()
      : (catalogTheme.description || ''),
    src: '',
    accent: typeof theme?.accent === 'string' && theme.accent.trim()
      ? theme.accent.trim()
      : (catalogTheme.accent || ''),
    isNew: Boolean(theme?.isNew),
  };
};

const normalizeChestRewards = (rewards) => (
  (Array.isArray(rewards) ? rewards : [])
    .map((reward, index) => {
      const artifacts = (Array.isArray(reward?.artifacts) ? reward.artifacts : [])
        .map(normalizeChestArtifact)
        .filter(Boolean);
      const profileThemes = (Array.isArray(reward?.profileThemes) ? reward.profileThemes : [])
        .map(normalizeChestProfileTheme)
        .filter(Boolean);
      const prizes = [
        ...artifacts.map((artifact) => ({ ...artifact, kind: 'artifact' })),
        ...profileThemes,
      ].slice(0, 3);
      return {
        id: String(reward?.id || `mock-chest-${index}`).trim() || `mock-chest-${index}`,
        coinsGained: Math.max(0, Math.floor(Number(reward?.coinsGained ?? reward?.coins ?? 0) || 0)),
        milestoneScore: Math.max(0, Math.floor(Number(reward?.milestoneScore) || 0)),
        chestIndex: Math.max(1, Math.floor(Number(reward?.chestIndex) || (index + 1))),
        artifacts: artifacts.slice(0, 2),
        profileThemes,
        prizes,
      };
    })
    .filter((reward) => reward.coinsGained > 0 || reward.prizes.length > 0)
);

const getPhaseStep = (phase) => {
  if (phase === 'done') return 4;
  if (phase === 'prize-three') return 4;
  if (phase === 'artifact-two') return 3;
  if (phase === 'artifact-one') return 2;
  if (phase === 'coins') return 1;
  return 0;
};

const getVisibleCoinBalanceTarget = () => {
  if (typeof document === 'undefined') return null;
  const selectors = [
    '[data-coin-balance-target="top"]',
    '[data-coin-balance-target="dock"]',
    '.level-progress-coin',
    '.xp-flight-dock-coin',
  ];
  const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  const seen = new Set();
  return candidates.find((element) => {
    if (!element || seen.has(element)) return false;
    seen.add(element);
    const rect = element.getBoundingClientRect();
    const style = typeof window !== 'undefined' ? window.getComputedStyle(element) : null;
    return rect.width >= 12
      && rect.height >= 12
      && style?.display !== 'none'
      && style?.visibility !== 'hidden'
      && style?.opacity !== '0';
  }) || null;
};

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const getVisibleArtifactCollectionTarget = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const selectors = [
    '[data-tour="rating-artifacts"] .student-artifact-altar__artifact-card',
    '[data-tour="rating-artifacts"]',
    '.student-artifact-altar__collection-shell',
  ];
  const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  const seen = new Set();
  const target = candidates.find((element) => {
    if (!element || seen.has(element)) return false;
    seen.add(element);
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width >= 24
      && rect.height >= 24
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0';
  });
  if (!target) return null;

  const rect = target.getBoundingClientRect();
  const targetX = rect.left + (rect.width * 0.5);
  const targetY = rect.top + Math.min(rect.height * 0.46, 150);
  return {
    x: clampNumber(targetX, 54, Math.max(54, window.innerWidth - 54)),
    y: clampNumber(targetY, 54, Math.max(54, window.innerHeight - 54)),
  };
};

const MockChestOpeningOverlay = ({ rewards, onClose }) => {
  const safeRewards = useMemo(() => normalizeChestRewards(rewards), [rewards]);
  const [rewardIndex, setRewardIndex] = useState(0);
  const [phase, setPhase] = useState('landing');
  const [chestPressTick, setChestPressTick] = useState(0);
  const [coinPrizeTarget, setCoinPrizeTarget] = useState({ x: '0px', y: '-32vh' });
  const [isClosing, setIsClosing] = useState(false);
  const [artifactExitTargets, setArtifactExitTargets] = useState([]);
  const coinLayerRef = useRef(null);
  const artifactRefs = useRef([]);
  const closeTimerRef = useRef(null);
  const currentReward = safeRewards[rewardIndex] || null;
  const phaseStep = getPhaseStep(phase);
  const hasCoinReward = Boolean(currentReward && currentReward.coinsGained > 0);
  const maxRevealStep = currentReward ? Math.min(4, 1 + currentReward.prizes.length) : 0;
  const canAdvance = phaseStep < maxRevealStep;
  const rewardReady = currentReward && phaseStep >= maxRevealStep;
  const isLastReward = rewardIndex >= safeRewards.length - 1;
  const visiblePrizeCount = currentReward
    ? Math.min(currentReward.prizes.length, Math.max(0, phaseStep - 1))
    : 0;
  const chestAriaLabel = phaseStep <= 0
    ? (hasCoinReward ? 'Открыть монеты из сундука' : 'Открыть первую награду из сундука')
    : (phaseStep < maxRevealStep ? 'Открыть следующую награду' : 'Забрать награду');

  const canInteractWithChest = !isClosing && (canAdvance || rewardReady);
  const chestPressClass = chestPressTick > 0
    ? `mock-chest--press-${chestPressTick % 2 === 0 ? 'even' : 'odd'}`
    : '';

  useEffect(() => {
    if (!currentReward || isClosing) return undefined;
    const timer = window.setTimeout(() => {
      setPhase((prevPhase) => (prevPhase === 'landing' ? 'ready' : prevPhase));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [currentReward, isClosing]);

  useEffect(() => () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  useLayoutEffect(() => {
    if (!hasCoinReward || phaseStep < 1 || typeof window === 'undefined') return undefined;

    const measureCoinBalanceTarget = () => {
      const coinLayer = coinLayerRef.current;
      const coinBalanceTarget = getVisibleCoinBalanceTarget();
      if (!coinLayer || !coinBalanceTarget) return;

      const layerRect = coinLayer.getBoundingClientRect();
      const targetRect = coinBalanceTarget.getBoundingClientRect();
      const targetX = (targetRect.left + (targetRect.width / 2)) - layerRect.left;
      const targetY = (targetRect.top + (targetRect.height / 2)) - layerRect.top;
      const nextTarget = {
        x: `${Math.round(targetX)}px`,
        y: `${Math.round(targetY)}px`,
      };

      setCoinPrizeTarget((prevTarget) => (
        prevTarget.x === nextTarget.x && prevTarget.y === nextTarget.y ? prevTarget : nextTarget
      ));
    };

    measureCoinBalanceTarget();
    const rafId = window.requestAnimationFrame(measureCoinBalanceTarget);
    window.addEventListener('resize', measureCoinBalanceTarget);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', measureCoinBalanceTarget);
    };
  }, [hasCoinReward, phaseStep, rewardIndex, currentReward?.coinsGained]);

  if (!currentReward || typeof document === 'undefined') return null;

  const measureArtifactExitTargets = () => {
    if (typeof window === 'undefined') return [];
    const collectionTarget = getVisibleArtifactCollectionTarget();
    const fallbackTarget = {
      x: Math.max(72, window.innerWidth - 120),
      y: Math.max(72, window.innerHeight - 110),
    };
    const target = collectionTarget || fallbackTarget;
    return currentReward.prizes.slice(0, 3).map((_, index) => {
      const element = artifactRefs.current[index] || null;
      const rect = element?.getBoundingClientRect?.();
      const originX = rect ? rect.left + (rect.width / 2) : (window.innerWidth / 2);
      const originY = rect ? rect.top + (rect.height / 2) : (window.innerHeight / 2);
      const pairOffset = currentReward.prizes.length > 1 ? (index - ((currentReward.prizes.length - 1) / 2)) * 26 : 0;
      return {
        x: `${Math.round(target.x + pairOffset - originX)}px`,
        y: `${Math.round(target.y + (index * 10) - originY)}px`,
        rotate: `${index === 0 ? -12 : (index === 1 ? 12 : 4)}deg`,
        delay: `${index * 90}ms`,
      };
    });
  };

  const requestClose = (completed = false) => {
    if (isClosing) return;
    setArtifactExitTargets(measureArtifactExitTargets());
    setIsClosing(true);

    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose?.({ completed });
    }, prefersReducedMotion ? 0 : CHEST_CLOSE_ANIMATION_MS);
  };

  const advanceChest = () => {
    if (isClosing) return;
    if (canInteractWithChest) {
      setChestPressTick((prev) => (prev + 1) % 1000);
    }
    if (rewardReady) {
      finishCurrentReward();
      return;
    }
    if (!canAdvance) return;
    if (phaseStep <= 0) {
      setPhase(hasCoinReward ? 'coins' : 'artifact-one');
      return;
    }
    if (phaseStep === 1) {
      setPhase('artifact-one');
      return;
    }
    if (phaseStep === 2) {
      setPhase('artifact-two');
      return;
    }
    setPhase('prize-three');
  };

  const finishCurrentReward = () => {
    if (!isLastReward) {
      setPhase('landing');
      setRewardIndex((prev) => prev + 1);
      return;
    }
    requestClose(true);
  };

  const modal = (
    <div
      className={`mock-chest-overlay mock-chest-overlay--${phase} ${isClosing ? 'mock-chest-overlay--closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Открытие сундука с наградами"
    >
      <div className="mock-chest-overlay__aura" aria-hidden="true" />
      <div className="mock-chest-overlay__stars" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => (
          <span key={index} style={{ '--star-index': index }} />
        ))}
      </div>

      <button
        type="button"
        className="mock-chest-overlay__close"
        onClick={(event) => {
          event.stopPropagation();
          requestClose(false);
        }}
        aria-label="Закрыть открытие сундука"
        disabled={isClosing}
      >
        <X size={18} />
      </button>

      <div
        className={`mock-chest-stage ${canInteractWithChest ? 'mock-chest-stage--clickable' : ''}`}
        onClick={advanceChest}
      >
        <div className="mock-chest-stage__kicker">
          <PackageOpen size={17} />
          <span>{safeRewards.length > 1 ? `Сундук ${rewardIndex + 1}/${safeRewards.length}` : 'Сундук получен'}</span>
        </div>

        <button
          type="button"
          className={`mock-chest mock-chest--image ${phaseStep >= 1 ? 'mock-chest--opened' : ''} ${canInteractWithChest ? 'mock-chest--clickable' : ''} ${chestPressClass}`}
          onClick={(event) => {
            event.stopPropagation();
            advanceChest();
          }}
          disabled={!canInteractWithChest}
          aria-label={chestAriaLabel}
        >
          <span className="mock-chest__shine" />
          <span className="mock-chest__asset-shell" aria-hidden="true">
            <img
              className="mock-chest__asset mock-chest__asset--closed"
              src={chestClosedImage}
              alt=""
              draggable="false"
            />
            <img
              className="mock-chest__asset mock-chest__asset--open"
              src={chestOpenImage}
              alt=""
              draggable="false"
            />
            <span className="mock-chest__asset-glow" />
            <span className="mock-chest__asset-spark mock-chest__asset-spark--one" />
            <span className="mock-chest__asset-spark mock-chest__asset-spark--two" />
            <span className="mock-chest__asset-spark mock-chest__asset-spark--three" />
          </span>
          <span className="mock-chest__base" />
        </button>

        {hasCoinReward && phaseStep >= 1 && (
          <div
            ref={coinLayerRef}
            className="mock-chest-coins"
            style={{
              '--coin-prize-x': coinPrizeTarget.x,
              '--coin-prize-y': coinPrizeTarget.y,
            }}
            aria-hidden="true"
          >
            {CHEST_COIN_BURST.map((coin, index) => (
              <span
                key={index}
                className="mock-chest-coin"
                style={{
                  '--coin-start-x': coin.startX,
                  '--coin-peak-x': coin.peakX,
                  '--coin-peak-y': coin.peakY,
                  '--coin-fall-x': coin.fallX,
                  '--coin-fall-y': coin.fallY,
                  '--coin-late-x': coin.lateX,
                  '--coin-late-y': coin.lateY,
                  '--coin-collect-x': coin.collectX,
                  '--coin-collect-y': coin.collectY,
                  '--coin-end-x': coin.endX,
                  '--coin-end-y': coin.endY,
                  '--coin-delay': coin.delay,
                  '--coin-spin': coin.spin,
                  '--coin-scale': coin.scale,
                  '--coin-peak-scale': coin.peakScale,
                  '--coin-late-scale': coin.lateScale,
                }}
              >
                <img src={ivanCoin} alt="" draggable="false" />
              </span>
            ))}
          </div>
        )}

        {hasCoinReward && (
          <div
            className={`mock-chest-coin-prize ${phaseStep >= 1 ? 'is-visible' : ''}`}
            aria-label={`${currentReward.coinsGained.toLocaleString('ru-RU')} монет`}
          >
            <img src={ivanCoin} alt="" draggable="false" />
            <span>{`+${currentReward.coinsGained.toLocaleString('ru-RU')}`}</span>
          </div>
        )}

        <div
          className={`mock-chest-artifacts ${phaseStep >= 2 ? 'is-awakening' : ''} ${
            visiblePrizeCount === 1 ? 'mock-chest-artifacts--single' : ''
          } ${visiblePrizeCount === 2 ? 'mock-chest-artifacts--pair' : ''} ${
            visiblePrizeCount >= 3 ? 'mock-chest-artifacts--trio' : ''
          }`}
        >
          {currentReward.prizes.slice(0, 3).map((prize, index) => {
            const meta = RANK_META[prize.rank] || RANK_META.C;
            const revealStep = index === 0 ? 2 : (index === 1 ? 3 : 4);
            const exitTarget = artifactExitTargets[index] || null;
            const isProfileTheme = prize.kind === 'profile-theme';
            return (
              <div
                key={`${prize.kind || 'artifact'}-${prize.id}-${index}`}
                ref={(node) => {
                  artifactRefs.current[index] = node;
                }}
                className={`mock-chest-artifact mock-chest-artifact--${String(prize.rank || 'C').toLowerCase()} ${
                  isProfileTheme ? 'mock-chest-artifact--profile-theme' : ''
                } ${phaseStep >= revealStep ? 'is-visible' : ''}`}
                style={{
                  '--artifact-color': prize.accent || meta.color,
                  '--artifact-delay': index === 0 ? '0ms' : '80ms',
                  '--artifact-exit-x': exitTarget?.x || '0px',
                  '--artifact-exit-y': exitTarget?.y || '0px',
                  '--artifact-exit-rotate': exitTarget?.rotate || '0deg',
                  '--artifact-exit-delay': exitTarget?.delay || '0ms',
                }}
              >
                <span className="mock-chest-artifact__flare" aria-hidden="true" />
                <span className="mock-chest-artifact__sparks" aria-hidden="true">
                  {CHEST_ARTIFACT_SPARKS.map((spark, sparkIndex) => (
                    <span
                      key={sparkIndex}
                      style={{
                        '--spark-x': spark.x,
                        '--spark-y': spark.y,
                        '--spark-delay': spark.delay,
                        '--spark-scale': spark.scale,
                        '--spark-rotate': spark.rotate,
                      }}
                    />
                  ))}
                </span>
                <span className="mock-chest-artifact__mystery" aria-hidden="true" />
                <div className="mock-chest-artifact__rank">{meta.label}</div>
                <div className="mock-chest-artifact__image">
                  {prize.src ? (
                    <img src={prize.src} alt="" draggable="false" />
                  ) : isProfileTheme ? (
                    <span className="mock-chest-artifact__theme-preview" data-profile-theme={prize.id}>
                      <Sparkles size={28} />
                    </span>
                  ) : (
                    <Sparkles size={54} />
                  )}
                </div>
                <div className="mock-chest-artifact__name">{prize.name}</div>
                <div className="mock-chest-artifact__title">
                  {isProfileTheme
                    ? (prize.isNew ? 'Новое оформление' : 'Дубликат оформления')
                    : meta.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default MockChestOpeningOverlay;
