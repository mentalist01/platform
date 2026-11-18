import { useEffect, useRef, useState } from 'react';
import { resolveApiUrl } from '../utils/runtimeUrls.js';
import { fallbackLinks, readLessonFallback, saveLessonFallback, clearLessonFallback } from '../utils/lessonFallback.js';
import './LessonFallback.css';

export default function LessonFallback({ user }) {
  const owner = user && ['teacher', 'student'].includes(user.role) ? `${user.role}:${user.id}` : '';
  const authToken = user?.authToken || '';
  const [links, setLinks] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkRef = useRef(null);
  useEffect(() => {
    let stopped = false; let running = false; let failures = 0; let loadedAt = 0; let controller;
    setLinks(readLessonFallback(localStorage, owner));
    setUnavailable(false); setMinimized(false);
    if (!owner) { clearLessonFallback(localStorage); return undefined; }
    const check = async () => {
      if (running || stopped) return;
      running = true; setChecking(true);
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const health = await fetch(resolveApiUrl('/api/availability'), { cache: 'no-store', signal: controller.signal });
        if (!health.ok || !(await health.json()).available) throw Error('unavailable');
        if (stopped) return;
        failures = 0; setUnavailable(false); setMinimized(false);
        if (Date.now() - loadedAt > 60_000) {
          const response = await fetch(resolveApiUrl('/api/lesson-fallback'), { credentials: 'include', cache: 'no-store',
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}, signal: controller.signal });
          if (stopped) return;
          if ([401, 403].includes(response.status)) { clearLessonFallback(localStorage); setLinks([]); }
          else if (response.ok) {
            const list = fallbackLinks((await response.json()).links);
            if (stopped) return;
            saveLessonFallback(localStorage, owner, list); setLinks(list); loadedAt = Date.now();
          }
        }
      } catch {
        if (!stopped && ++failures >= 2) {
          setLinks(readLessonFallback(localStorage, owner)); setUnavailable(true);
        }
      } finally { clearTimeout(timeout); running = false; if (!stopped) setChecking(false); }
    };
    checkRef.current = check;
    void check();
    const timer = setInterval(check, 10_000);
    window.addEventListener('online', check); window.addEventListener('offline', check);
    return () => { stopped = true; controller?.abort(); clearInterval(timer); checkRef.current = null;
      window.removeEventListener('online', check); window.removeEventListener('offline', check); };
  }, [owner, authToken]);
  if (!owner || !unavailable) return null;
  if (minimized) return <button className="lesson-fallback-mini" onClick={() => setMinimized(false)}>Нет связи с платформой · открыть Телемост</button>;
  return <aside className="lesson-fallback" aria-labelledby="fallback-title" role="dialog" aria-modal="false">
    <div className="lesson-fallback-card">
      <span className="lesson-fallback-kicker">Продолжим занятие</span>
      <h2 id="fallback-title">Платформа временно недоступна</h2>
      <p>Извините за перерыв. Не удаётся связаться с сервером: возможен сбой хостинга или соединения. Вы можете продолжить урок в Телемосте.</p>
      {links.length > 0 ? <><p className="lesson-fallback-note">Заранее сохранённые ссылки на занятия:</p>
        <div className="lesson-fallback-links">{links.map(link => <a key={link.id} href={link.url} target="_blank" rel="noreferrer">{link.name}<span>Открыть Телемост ↗</span></a>)}</div></>
        : <p>Ссылка на Телемост ещё не сохранена в этом браузере. Свяжитесь с преподавателем привычным способом. Резервную ссылку нужно настроить до сбоя.</p>}
      {user.role === 'teacher' && <p>В локальном пульте выберите «Телемост / внешняя доска». Он работает без сервера; проверьте изображение и обе шкалы звука. <a href="http://127.0.0.1:18765/" target="_blank" rel="noreferrer">Открыть пульт ↗</a></p>}
      <div className="lesson-fallback-actions"><button disabled={checking} onClick={() => checkRef.current?.()}>{checking ? 'Проверяем…' : 'Проверить соединение'}</button><button onClick={() => setMinimized(true)}>Свернуть и остаться на странице</button></div>
      <small>Проверяем восстановление автоматически. Несохранённая работа остаётся на этой странице.</small>
    </div>
  </aside>;
}
