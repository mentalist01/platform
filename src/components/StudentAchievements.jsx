import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, Check, Code2, Flame, LockKeyhole, Search, Sparkles, Target, Trophy } from 'lucide-react';
import { api, ACHIEVEMENT_PROGRESS_EVENT } from '../services/api.js';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_RARITIES } from '../data/achievementCatalog.js';
import { createAchievementSound } from '../utils/achievementSound.js';
import AchievementToast from './AchievementToast.jsx';
import './StudentAchievements.css';

const ICONS = { ege: Target, python: Code2, mocks: Trophy, practice: Flame, growth: Sparkles };
const CATEGORY_COLORS = { ege: '#7b20ff', python: '#006aff', mocks: '#ffb800', practice: '#ff5217', growth: '#00a66a' };
const EMPTY = { items: [] };
const dateLabel = item => item.historical ? 'За прошлые результаты' : new Date(item.earnedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const soundKey = id => `ivan100:achievement-sound:v1:${id}`;
const readSound = id => { try { return localStorage.getItem(soundKey(id)) !== 'off'; } catch { return true; } };
const ratio = item => Math.min(100, Math.round(item.value / item.target * 100));
function Medal({ item }) {
  const Icon = ICONS[item.category] || Award;
  return <span className={`achievement-medal achievement-medal--${item.rarity}`} aria-hidden="true"><Icon size={25} strokeWidth={1.7} /><span>{Array.from({ length: ['bronze', 'silver', 'gold', 'diamond'].indexOf(item.rarity) + 1 }, (_, index) => <i key={index} />)}</span></span>;
}
function Progress({ item }) {
  return <div className="achievement-progress" role="progressbar" aria-label={item.title} aria-valuemin={0} aria-valuemax={item.target} aria-valuenow={Math.min(item.value, item.target)}><i style={{ width: `${ratio(item)}%` }} /></div>;
}

export default function StudentAchievements({ user, open = false, quiet = false, onOpen }) {
  const [data, setData] = useState(EMPTY), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all'), [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [soundEnabled] = useState(() => readSound(user.id));
  const [queue, setQueue] = useState([]), [retry, setRetry] = useState(0);
  const sound = useRef(null), soundEnabledRef = useRef(soundEnabled), displayed = useRef(new Set());
  useEffect(() => {
    sound.current = createAchievementSound();
    const prime = () => { if (soundEnabledRef.current) sound.current?.prime(); };
    document.addEventListener('pointerdown', prime, { passive: true }); document.addEventListener('keydown', prime);
    return () => { document.removeEventListener('pointerdown', prime); document.removeEventListener('keydown', prime); sound.current?.dispose(); sound.current = null; };
  }, []);
  useEffect(() => {
    if (quiet) return undefined;
    let cancelled = false, busy = false, timer;
    const refresh = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const result = await api.getAchievements();
        if (cancelled) return;
        setData(result); setError('');
        if (!quiet && result.items?.some(item => item.unlocked && !item.seenAt)) {
          const claimed = await api.claimAchievementNotifications();
          if (!cancelled) setQueue(previous => [...previous, ...(claimed.items || []).filter(item => !displayed.current.has(item.id))]);
        }
      } catch (failure) { if (!cancelled) setError(failure.message || 'Не удалось загрузить достижения.'); }
      finally { busy = false; if (!cancelled) setLoading(false); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 180); };
    const focus = () => { if (document.visibilityState === 'visible') schedule(); };
    void refresh();
    const interval = setInterval(refresh, 60_000);
    window.addEventListener(ACHIEVEMENT_PROGRESS_EVENT, schedule); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(interval); window.removeEventListener(ACHIEVEMENT_PROGRESS_EVENT, schedule); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [user.id, quiet, retry]);
  const current = !quiet ? queue[0] : null;
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    const firstAppearance = !displayed.current.has(currentId);
    displayed.current.add(currentId);
    if (firstAppearance && soundEnabledRef.current) sound.current?.play();
  }, [currentId]);
  const earned = data.items.filter(item => item.unlocked);
  const nearest = useMemo(() => {
    const metrics = new Set();
    return data.items.filter(item => !item.unlocked && item.value > 0).sort((a, b) => ratio(b) - ratio(a))
      .filter(item => { if (metrics.has(item.metric)) return false; metrics.add(item.metric); return true; }).slice(0, 3);
  }, [data.items]);
  const visible = useMemo(() => data.items.filter(item => (category === 'all' || item.category === category)
    && (filter === 'all' || (filter === 'earned' ? item.unlocked : !item.unlocked))
    && (!query.trim() || `${item.title} ${item.description}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')))), [data.items, category, filter, query]);
  const dismiss = () => setQueue(previous => previous.slice(previous.length > 3 ? previous.length : 1));
  const completion = data.items.length ? Math.round(earned.length / data.items.length * 100) : 0;
  return <>
    {open && <section className="achievements-page" aria-label="Достижения ученика">
      <header className="achievements-hero">
        <div className="achievements-heading"><span className="achievements-heading-icon" aria-hidden="true"><Award size={24} strokeWidth={1.7} /></span><h1>Достижения</h1></div>
        <div className="achievements-summary">
          <div className="achievements-total"><strong>{earned.length}<span> / {data.items.length || '…'}</span></strong><span>получено</span></div>
          <div className="achievements-summary-progress"><div><span>Коллекция</span><span>{completion}%</span></div><div className="achievement-progress"><i style={{ width: `${completion}%` }} /></div></div>
          <div className="achievements-summary-categories">{ACHIEVEMENT_CATEGORIES.map(entry => { const Icon = ICONS[entry.id]; return <div key={entry.id} style={{ '--achievement-category': CATEGORY_COLORS[entry.id] }}><span><Icon size={15} />{entry.title}</span><strong>{earned.filter(item => item.category === entry.id).length}<small> / {data.items.filter(item => item.category === entry.id).length}</small></strong></div>; })}</div>
        </div>
      </header>
      {loading && <p className="achievements-message" role="status">Загрузка достижений…</p>}
      {error && <div className="achievements-message" role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Попробовать ещё раз</button></div>}
      {!loading && !error && <>
        {nearest.length > 0 && <section className="achievements-nearest"><div className="achievements-section-title"><h2>Ближайшие достижения</h2></div><div className="achievements-nearest-grid">{nearest.map(item => <article key={item.id} style={{ '--achievement-category': CATEGORY_COLORS[item.category] }}><div className="achievement-next-top"><Medal item={item} /><span>{ratio(item)}%</span></div><h3>{item.title}</h3><p>{item.description}</p><div className="achievement-next-progress"><Progress item={item} /><small>{item.value} / {item.target}</small></div></article>)}</div></section>}
        <div className="achievements-section-title achievements-collection-title"><h2>Все достижения <span>{data.items.length}</span></h2><label className="achievements-search"><Search size={17} /><input aria-label="Найти достижение" placeholder="Поиск" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
        <nav className="achievements-categories" aria-label="Категории достижений"><button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Все <small>{data.items.length}</small></button>{ACHIEVEMENT_CATEGORIES.map(entry => { const Icon = ICONS[entry.id]; return <button type="button" key={entry.id} style={{ '--achievement-category': CATEGORY_COLORS[entry.id] }} aria-pressed={category === entry.id} onClick={() => setCategory(entry.id)}><Icon size={16} />{entry.title}</button>; })}</nav>
        <div className="achievements-filter"><div>{[['all', 'Все'], ['earned', 'Получены'], ['locked', 'Не получены']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><span>Показано: {visible.length}</span></div>
        <div className="achievements-grid">{visible.map(item => <article className={`achievement-card${item.unlocked ? ' achievement-card--unlocked' : ''}`} key={item.id} style={{ '--achievement-accent': ACHIEVEMENT_RARITIES[item.rarity].color }}><div className="achievement-card-top"><Medal item={item} /><span className={item.unlocked ? 'achievement-status achievement-status--earned' : 'achievement-status'}>{item.unlocked ? <Check size={13} /> : <LockKeyhole size={12} />}{item.unlocked ? 'Получено' : ACHIEVEMENT_RARITIES[item.rarity].title}</span></div><h3>{item.title}</h3><p>{item.description}</p>{item.unlocked ? <div className="achievement-earned"><span className="achievement-rarity"><i />{ACHIEVEMENT_RARITIES[item.rarity].title}</span><span>{dateLabel(item)}</span></div> : <div className="achievement-locked"><Progress item={item} /><span>{item.value} / {item.target}</span></div>}</article>)}</div>
        {!visible.length && <p className="achievements-message">Ничего не найдено. Измени фильтр или поисковый запрос.</p>}
        <footer className="achievements-footer"><LockKeyhole size={14} /><p>Полученные достижения сохраняются. Перерыв в занятиях их не обнуляет.</p></footer>
      </>}
    </section>}
    {current && createPortal(<AchievementToast key={current.id} item={current} badge={<Medal item={current} />} additionalCount={queue.length > 3 ? queue.length - 1 : 0} onDismiss={dismiss} onOpen={onOpen} />, document.body)}
  </>;
}
