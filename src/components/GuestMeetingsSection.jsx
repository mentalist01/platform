import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, LockKeyhole, MicOff, Plus, Users, Video, X } from 'lucide-react';
import CallSection from './CallSection';
import { guestMeetingsApi, guestMeetingLink } from '../services/guestMeetings';
import './GuestMeetings.css';

export default function GuestMeetingsSection({ user, theme = 'light' }) {
  const [meetings, setMeetings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [title, setTitle] = useState('Пробное занятие');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedId = selected?.id;
  const load = useCallback(async () => {
    try { const data = await guestMeetingsApi.list(); setMeetings(data.meetings); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!selectedId) return undefined;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const data = await guestMeetingsApi.presence(selectedId, { signal: controller.signal });
        if (!controller.signal.aborted) setParticipants(data.participants);
      } catch (e) {
        if (!controller.signal.aborted) {
          if (e.status === 403 || e.status === 410) { setSelected(null); load(); }
          setError(e.message);
        }
      }
    };
    setParticipants([]);
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [selectedId, load]);
  const copy = async (id) => {
    try { await navigator.clipboard.writeText(guestMeetingLink(id)); setNotice('Ссылка скопирована. Отправьте её участникам.'); }
    catch { setNotice('Выделите ссылку в поле и скопируйте её сочетанием Ctrl+C.'); }
  };
  const create = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { const { meeting } = await guestMeetingsApi.create(title); setSelected(meeting); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const control = async (action, guestId) => {
    setBusy(true); setError('');
    try {
      const { meeting } = await guestMeetingsApi.control(selected.id, action, guestId);
      if (action === 'close') { setSelected(null); setNotice('Встреча завершена для всех участников.'); }
      else {
        setSelected(meeting);
        if (action === 'remove') setParticipants((p) => p.filter((entry) => entry.userId !== guestId));
        if (action === 'mute') setNotice('Команда выключить микрофон отправлена участнику.');
      }
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const ended = useCallback((message) => { setSelected(null); setNotice(message); load(); }, [load]);
  return <section className={`guest-meetings ${theme === 'dark' ? 'guest-meetings-dark' : ''}`}>
    <header className="gm-heading"><span className="gm-icon"><Video size={26} /></span><div>
      <p className="gm-eyebrow">СОЗВОНЫ БЕЗ РЕГИСТРАЦИИ</p><h2>Встречи по ссылке</h2>
      <p>Пригласите на пробное занятие или общий созвон — достаточно ссылки и имени. <a href="/meetings">Открытый раздел встреч</a></p>
    </div></header>
    {error && <p role="alert" className="gm-error">{error}</p>}
    {notice && <p role="status" className="gm-notice">{notice}</p>}
    {selected ? <>
      <div className="gm-card gm-room-heading"><div><h3>{selected.title}</h3><p>До 20 участников вместе с вами · ссылка действует до {new Date(selected.expiresAt).toLocaleString('ru-RU')}</p></div>
        <button className="gm-button gm-danger" disabled={busy} onClick={() => control('close')}>Завершить для всех</button>
        <div className="gm-link-row"><input aria-label="Ссылка для гостей" readOnly value={guestMeetingLink(selected.id)} onFocus={(e) => e.target.select()} />
          <button className="gm-button" onClick={() => copy(selected.id)}><Copy size={17} />Скопировать ссылку</button></div>
      </div>
      <div className="gm-call-layout"><div className="gm-call"><CallSection role="teacher" userId={user.id} userName={user.name}
        teacherId={user.id} meetingId={selected.id} hideStudentPicker theme={theme} onMeetingEnded={ended} /></div>
        <aside className="gm-card gm-participants"><h3><Users size={19} />Участники <span>{participants.length}/20</span></h3>
          <button className="gm-button gm-lock" disabled={busy} onClick={() => control(selected.locked ? 'unlock' : 'lock')}>
            <LockKeyhole size={16} />{selected.locked ? 'Открыть вход' : 'Закрыть вход'}</button>
          <p>{selected.locked ? 'Новые гости не смогут войти. Уже вошедшие смогут восстановить связь.' : 'Любой, у кого есть ссылка, может присоединиться.'}</p>
          {!participants.length && <p className="gm-empty">Пока никто не подключился.</p>}
          <ul>{participants.map((p) => <li key={p.id}><div><strong>{p.name}</strong><small>{p.role === 'teacher' ? 'Вы · преподаватель' : 'Гость'}</small></div>
            {p.role === 'guest' && <div className="gm-guest-controls"><button title={`Выключить микрофон: ${p.name}`} aria-label={`Выключить микрофон: ${p.name}`} disabled={busy} onClick={() => control('mute', p.userId)}><MicOff size={17} /></button>
              <button title={`Отключить: ${p.name}`} aria-label={`Отключить: ${p.name}`} disabled={busy} onClick={() => control('remove', p.userId)}><X size={17} /></button></div>}
          </li>)}</ul>
        </aside></div>
    </> : <>
      <form className="gm-card gm-create" onSubmit={create}><label htmlFor="gm-title">Название встречи</label><div className="gm-link-row">
        <input id="gm-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, пробный урок по информатике" />
        <button className="gm-button gm-primary" disabled={busy}><Plus size={18} />{busy ? 'Создаём…' : 'Создать встречу'}</button>
      </div><p>Ссылка действует 24 часа. Микрофон и камера включаются при входе в звонок.</p></form>
      <div className="gm-card"><h3>Ваши встречи</h3>{loading ? <p role="status">Загружаем встречи…</p> : !meetings.length ? <div className="gm-empty"><Link2 size={28} /><p>Создайте первую встречу и отправьте приглашение.</p></div>
        : <ul className="gm-meeting-list">{meetings.map((m) => <li key={m.id}><div><strong>{m.title}</strong><small>{m.open ? `До ${new Date(m.expiresAt).toLocaleString('ru-RU')}` : 'Завершена'}{m.open && m.locked ? ' · вход закрыт' : ''}</small></div>
          {m.open && <div className="gm-list-actions"><button className="gm-button" onClick={() => copy(m.id)}><Copy size={16} />Ссылка</button><button className="gm-button gm-primary" onClick={() => { setSelected(m); setNotice(''); setError(''); }}>Открыть</button></div>}
        </li>)}</ul>}
      </div>
    </>}
  </section>;
}
