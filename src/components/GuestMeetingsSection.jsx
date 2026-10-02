import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Link2, Plus, Video } from 'lucide-react';
import PublicMeetingRoom from './PublicMeetingRoom';
import { guestMeetingsApi, guestMeetingLink } from '../services/guestMeetings';
import './GuestMeetings.css';

export default function GuestMeetingsSection({ user, theme = 'light' }) {
  const [meetings, setMeetings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState('Пробное занятие');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const restored = useRef(false);
  const selectionKey = `ivan100-teacher-meeting:${user.id}`;
  const load = useCallback(async () => {
    try {
      const data = await guestMeetingsApi.list(); setMeetings(data.meetings);
      if (!restored.current) {
        restored.current = true;
        let previous;
        try { previous = sessionStorage.getItem(selectionKey); } catch { /* Optional recovery. */ }
        const meeting = data.meetings.find((item) => item.id === previous && item.open);
        if (meeting) setSelected(meeting);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [selectionKey]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (loading) return;
    try {
      if (selected) sessionStorage.setItem(selectionKey, selected.id);
      else sessionStorage.removeItem(selectionKey);
    } catch { /* The current meeting works without browser storage. */ }
  }, [loading, selected, selectionKey]);
  const copy = async (id) => {
    try { await navigator.clipboard.writeText(guestMeetingLink(id)); setNotice('Ссылка скопирована. Отправьте её участникам.'); }
    catch { setNotice(guestMeetingLink(id)); }
  };
  const create = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { const { meeting } = await guestMeetingsApi.create(title); setSelected(meeting); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const ended = useCallback((message) => { setSelected(null); setNotice(message); load(); }, [load]);
  return <section className={`guest-meetings ${theme === 'dark' ? 'guest-meetings-dark' : ''}`}>
    {selected ? <PublicMeetingRoom identity={{ meeting: selected, user }} teacher theme={theme} onEnded={ended} onLeft={() => setSelected(null)} /> : <>
      <header className="gm-heading"><span className="gm-icon"><Video size={26} /></span><div>
        <p className="gm-eyebrow">СОЗВОНЫ БЕЗ РЕГИСТРАЦИИ</p><h2>Встречи по ссылке</h2>
        <p>Пригласите на пробное занятие или общий созвон — достаточно ссылки и имени. <a href="/meetings">Открытый раздел встреч</a></p>
      </div></header>
      {error && <p role="alert" className="gm-error">{error}</p>}
      {notice && <p role="status" className="gm-notice">{notice}</p>}
      <form className="gm-card gm-create" onSubmit={create}><label htmlFor="gm-title">Название встречи</label><div className="gm-link-row">
        <input id="gm-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, пробный урок по информатике" />
        <button className="gm-button gm-primary" disabled={busy}><Plus size={18} />{busy ? 'Создаём…' : 'Создать встречу'}</button>
      </div><p>Ссылка действует 24 часа. После создания вы окажетесь во встрече с выключенными микрофоном и камерой.</p></form>
      <div className="gm-card"><h3>Ваши встречи</h3>{loading ? <p role="status">Загружаем встречи…</p> : !meetings.length ? <div className="gm-empty"><Link2 size={28} /><p>Создайте первую встречу и отправьте приглашение.</p></div>
        : <ul className="gm-meeting-list">{meetings.map((m) => <li key={m.id}><div><strong>{m.title}</strong><small>{m.open ? `До ${new Date(m.expiresAt).toLocaleString('ru-RU')}` : 'Завершена'}{m.open && m.locked ? ' · вход закрыт' : ''}</small></div>
          {m.open && <div className="gm-list-actions"><button className="gm-button" onClick={() => copy(m.id)}><Copy size={16} />Ссылка</button><button className="gm-button gm-primary" onClick={() => { setSelected(m); setNotice(''); setError(''); }}>Открыть</button></div>}
        </li>)}</ul>}
      </div>
    </>}
  </section>;
}
