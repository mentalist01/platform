import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, X } from 'lucide-react';
import { ACHIEVEMENT_RARITIES } from '../data/achievementCatalog.js';
import { ACHIEVEMENT_TOAST_DURATION, createAchievementToastLifetime } from '../utils/achievementToastLifetime.js';
import './AchievementToast.css';

export default function AchievementToast({ item, badge, additionalCount = 0, onDismiss, onOpen }) {
  const [leaving, setLeaving] = useState(false), [paused, setPaused] = useState(false);
  const lifetime = useRef(null), callbacks = useRef({ onDismiss, onOpen });
  useLayoutEffect(() => { callbacks.current = { onDismiss, onOpen }; }, [onDismiss, onOpen]);
  useEffect(() => {
    const clock = createAchievementToastLifetime({
      onExit: () => setLeaving(true), onDismiss: () => callbacks.current.onDismiss(),
      exitDuration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : undefined,
    });
    lifetime.current = clock;
    const visibility = () => {
      if (document.visibilityState === 'hidden') clock.pause('hidden'); else clock.resume('hidden');
      setPaused(clock.isPaused());
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { clock.dispose(); document.removeEventListener('visibilitychange', visibility); lifetime.current = null; };
  }, []);
  const hold = (reason, active) => {
    const clock = lifetime.current;
    if (!clock) return;
    if (active) clock.pause(reason); else clock.resume(reason);
    setPaused(clock.isPaused());
  };
  const close = () => lifetime.current?.dismiss();
  return <aside
    className={`achievement-toast achievement-toast--${item.rarity}`}
    data-phase={leaving ? 'leaving' : 'visible'} data-paused={paused}
    role="status" aria-live="polite" aria-atomic="true"
    style={{ '--achievement-accent': ACHIEVEMENT_RARITIES[item.rarity].color, '--toast-duration': `${ACHIEVEMENT_TOAST_DURATION}ms` }}
    onPointerEnter={event => { if (event.pointerType !== 'touch') hold('hover', true); }}
    onPointerLeave={event => { if (event.pointerType !== 'touch') hold('hover', false); }}
    onFocusCapture={() => hold('focus', true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) hold('focus', false); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}
  >
    <button type="button" className="achievement-toast-main" onClick={() => { close(); callbacks.current.onOpen?.(); }} disabled={leaving}>
      <span className="achievement-toast-emblem" aria-hidden="true">
        <span className="achievement-toast-halo" />
        <svg className="achievement-toast-orbit" viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" pathLength="1" /></svg>
        {badge}
        <span className="achievement-toast-glints"><i /><i /><i /></span>
      </span>
      <span className="achievement-toast-copy">
        <span className="achievement-toast-kicker"><Check size={12} strokeWidth={2.4} />{item.summary ? 'Опыт начислен' : 'Достижение получено'}</span>
        <strong>{item.title}</strong>
        <span className="achievement-toast-description">{item.description}</span>
        {item.xpGained > 0 && <span className="achievement-toast-xp">+{item.xpGained.toLocaleString('ru-RU')} XP</span>}
        <span className="achievement-toast-footer"><span className="achievement-toast-tier">{ACHIEVEMENT_RARITIES[item.rarity].title}{additionalCount > 0 && <span className="achievement-toast-count">+{additionalCount}</span>}</span><span className="achievement-toast-link">Коллекция <ArrowUpRight size={13} /></span></span>
      </span>
    </button>
    <button type="button" className="achievement-toast-close" aria-label="Скрыть уведомление о достижении" disabled={leaving} onClick={close}><X size={15} /></button>
    <span className="achievement-toast-timer" aria-hidden="true"><i /></span>
  </aside>;
}
