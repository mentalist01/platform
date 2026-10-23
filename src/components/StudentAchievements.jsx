import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, ArrowRight, Check, Code2, Flame, Gem, LockKeyhole, Search, Sparkles, Target, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { api, ACHIEVEMENT_PROGRESS_EVENT } from '../services/api.js';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_RARITIES } from '../data/achievementCatalog.js';
import { createAchievementSound } from '../utils/achievementSound.js';
import './StudentAchievements.css';

const ICONS = { ege: Target, python: Code2, mocks: Trophy, practice: Flame, growth: Sparkles };
const EMPTY = { items: [] };
const dateLabel = item => item.historical ? 'Учтено из прошлого прогресса' : `Получено ${new Date(item.earnedAt).toLocaleDateString('ru-RU')}`;
const soundKey = id => `ivan100:achievement-sound:v1:${id}`;
const readSound = id => { try { return localStorage.getItem(soundKey(id)) !== 'off'; } catch { return true; } };
const ratio = item => Math.min(100, Math.round(item.value / item.target * 100));
function Medal({ item, large = false }) {
  const Icon = ICONS[item.category] || Award;
  return <span className={`achievement-medal achievement-medal--${item.rarity}${large ? ' achievement-medal--large' : ''}`} aria-hidden="true"><Icon size={large ? 34 : 23} strokeWidth={1.8} /><i><Sparkles size={large ? 16 : 11} /></i></span>;
}

export default function StudentAchievements({ user, open = false, quiet = false, onOpen }) {
  const [data, setData] = useState(EMPTY), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all'), [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => readSound(user.id));
  const [queue, setQueue] = useState([]), [preview, setPreview] = useState(null), [retry, setRetry] = useState(0);
  const sound = useRef(null), soundEnabledRef = useRef(soundEnabled), displayed = useRef(new Set());
  soundEnabledRef.current = soundEnabled;
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
  const current = !quiet ? (preview || queue[0]) : null;
  const currentId = current?.id;
  const isPreview = Boolean(preview);
  useEffect(() => {
    if (!currentId) return;
    const firstAppearance = !displayed.current.has(currentId);
    displayed.current.add(currentId);
    if (firstAppearance && soundEnabledRef.current) sound.current?.play();
    const timer = setTimeout(() => { if (isPreview) setPreview(null); else setQueue(previous => previous.slice(previous.length > 3 ? previous.length : 1)); }, 6500);
    return () => clearTimeout(timer);
  }, [currentId, isPreview]);
  const earned = data.items.filter(item => item.unlocked);
  const nearest = useMemo(() => {
    const metrics = new Set();
    return data.items.filter(item => !item.unlocked && item.value > 0).sort((a, b) => ratio(b) - ratio(a))
      .filter(item => { if (metrics.has(item.metric)) return false; metrics.add(item.metric); return true; }).slice(0, 3);
  }, [data.items]);
  const visible = useMemo(() => data.items.filter(item => (category === 'all' || item.category === category)
    && (filter === 'all' || (filter === 'earned' ? item.unlocked : !item.unlocked))
    && (!query.trim() || `${item.title} ${item.description}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')))), [data.items, category, filter, query]);
  const toggleSound = () => {
    const next = !soundEnabled; setSoundEnabled(next);
    try { localStorage.setItem(soundKey(user.id), next ? 'on' : 'off'); } catch { /* Browser storage can be blocked. */ }
    if (next) { sound.current?.prime(); sound.current?.play(); }
  };
  const dismiss = () => { if (preview) setPreview(null); else setQueue(previous => previous.slice(previous.length > 3 ? previous.length : 1)); };
  return <>
    {open && <section className="achievements-page" aria-label="Достижения ученика">
      <header className="achievements-hero">
        <div><span className="achievements-eyebrow"><Sparkles size={15} /> ТВОЯ ИСТОРИЯ ПРОГРЕССА</span><h1>Маленькие шаги.<br /><em>Большие достижения.</em></h1><p>Решай, пробуй, исправляй ошибки. Здесь остаётся каждый важный шаг на пути к ЕГЭ.</p>
          <div className="achievements-hero-actions"><button type="button" onClick={toggleSound} aria-pressed={soundEnabled}>{soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />} {soundEnabled ? 'Звук включён' : 'Без звука'}</button><button type="button" onClick={() => { const item = data.items.find(entry => entry.id === 'ege-solves-1'); if (item) { sound.current?.prime(); setPreview({ ...item, id: `preview-${Date.now()}` }); } }} disabled={!data.items.length}><Sparkles size={17} /> Проверить уведомление</button></div>
        </div>
        <div className="achievements-collection-mark"><span className="achievements-trophy"><Trophy size={58} strokeWidth={1.4} /><Sparkles size={21} /></span><strong>{earned.length}<small> / {data.items.length || '…'}</small></strong><span>наград в твоей коллекции</span><div className="achievement-progress"><i style={{ width: `${data.items.length ? earned.length / data.items.length * 100 : 0}%` }} /></div></div>
      </header>
      {loading && <p className="achievements-message" role="status">Собираем твою коллекцию…</p>}
      {error && <div className="achievements-message" role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Попробовать ещё раз</button></div>}
      {!loading && !error && <>
        {nearest.length > 0 && <section className="achievements-nearest"><div className="achievements-section-title"><div><span>ЕЩЁ НЕМНОГО</span><h2>Следующие цели</h2></div><span>В твоём темпе</span></div><div className="achievements-nearest-grid">{nearest.map(item => <article key={item.id}><Medal item={item} /><div><h3>{item.title}</h3><p>{item.description}</p><div className="achievement-progress"><i style={{ width: `${ratio(item)}%` }} /></div><small>{item.value} из {item.target}</small></div></article>)}</div></section>}
        <div className="achievements-section-title"><div><span>КАЖДАЯ НАГРАДА — ТВОЙ РЕЗУЛЬТАТ</span><h2>Коллекция достижений</h2></div><label className="achievements-search"><Search size={17} /><input aria-label="Найти достижение" placeholder="Найти достижение" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
        <nav className="achievements-categories" aria-label="Категории достижений"><button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Все <small>{data.items.length}</small></button>{ACHIEVEMENT_CATEGORIES.map(entry => { const Icon = ICONS[entry.id]; return <button type="button" key={entry.id} aria-pressed={category === entry.id} onClick={() => setCategory(entry.id)}><Icon size={16} />{entry.title}</button>; })}</nav>
        <div className="achievements-filter"><div>{[['all', 'Все награды'], ['earned', 'Получены'], ['locked', 'Впереди']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><span>{visible.length} в этом разделе</span></div>
        <div className="achievements-grid">{visible.map(item => <article className={`achievement-card${item.unlocked ? ' achievement-card--unlocked' : ''}`} key={item.id} style={{ '--achievement-accent': ACHIEVEMENT_RARITIES[item.rarity].color }}><div className="achievement-card-top"><Medal item={item} /><span className="achievement-rarity"><Gem size={11} />{ACHIEVEMENT_RARITIES[item.rarity].title}</span></div><h3>{item.title}</h3><p>{item.description}</p>{item.unlocked ? <div className="achievement-earned"><Check size={15} /><span>{dateLabel(item)}</span></div> : <div className="achievement-locked"><div className="achievement-progress"><i style={{ width: `${ratio(item)}%` }} /></div><span><LockKeyhole size={12} />{item.value} / {item.target}</span></div>}</article>)}</div>
        {!visible.length && <p className="achievements-message">Таких наград пока нет. Попробуй другую категорию или запрос.</p>}
        <footer className="achievements-footer"><Award size={18} /><p>Награды выдаются один раз и остаются с тобой. Прошлые решения уже учтены. Достижения не расходуют монеты и не меняют правила начисления XP. Звук настраивается на этом устройстве.</p></footer>
      </>}
    </section>}
    {current && createPortal(<aside className="achievement-toast" role="status" aria-live="polite" style={{ '--achievement-accent': ACHIEVEMENT_RARITIES[current.rarity].color }}><button className="achievement-toast-main" type="button" onClick={() => { dismiss(); onOpen?.(); }}><Medal item={current} /><span><small>{preview ? 'ПРИМЕР УВЕДОМЛЕНИЯ' : 'ДОСТИЖЕНИЕ ПОЛУЧЕНО'}</small><strong>{current.title}</strong><span>{!preview && queue.length > 3 ? `И ещё ${queue.length - 1} наград — открой коллекцию` : current.description}</span></span><ArrowRight size={17} /></button><button type="button" className="achievement-toast-close" aria-label="Скрыть уведомление о достижении" onClick={dismiss}><X size={15} /></button><i className="achievement-toast-timer" /></aside>, document.body)}
  </>;
}
