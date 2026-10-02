import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, LockKeyhole, MicOff, MoreHorizontal, Users, Video, X } from 'lucide-react';
import CallSection from './CallSection';
import { guestMeetingsApi, guestMeetingLink } from '../services/guestMeetings';

export default function PublicMeetingRoom({ identity, onEnded, onLeft, teacher = false, theme = 'light' }) {
  const [meeting, setMeeting] = useState(identity.meeting);
  const [participants, setParticipants] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { token, user } = identity;
  const id = identity.meeting.id;
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const data = await guestMeetingsApi.presence(id, { guest: !teacher, token, signal: controller.signal });
        if (!controller.signal.aborted) setParticipants(data.participants);
      } catch (e) {
        if (controller.signal.aborted) return;
        if ([403, 410].includes(e.status)) onEnded(e.message);
        else setError(e.message);
      }
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [id, token, teacher, onEnded]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') { setPanel(''); setMenuOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(guestMeetingLink(id)); setNotice('Ссылка скопирована. Отправьте её друзьям.'); }
    catch { setNotice('Выделите ссылку и скопируйте её сочетанием Ctrl+C.'); }
  };
  const control = async (action, guestId) => {
    setBusy(true); setError('');
    try {
      const data = teacher ? await guestMeetingsApi.control(id, action, guestId)
        : await guestMeetingsApi.controlPublic(id, token, action, guestId);
      if (action === 'close') onEnded('Вы завершили встречу для всех участников.');
      else {
        setMeeting(data.meeting);
        if (action === 'remove') setParticipants((items) => items.filter((p) => p.userId !== guestId));
        if (action === 'mute') setNotice('Микрофон участника выключен. Он может включить его снова.');
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const ended = useCallback((message) => onEnded(message), [onEnded]);
  return <>
    <header className="gm-heading gm-live-heading"><span className="gm-icon"><Video size={28} /></span><div className="gm-live-title">
      <p className="gm-eyebrow">ВСТРЕЧА ПО ССЫЛКЕ</p><h1>{meeting.title}</h1><p>Вы — организатор · до {meeting.maxParticipants} участников</p>
    </div><div className="gm-room-toolbar">
      <button className="gm-button" aria-expanded={panel === 'invite'} onClick={() => setPanel((value) => value === 'invite' ? '' : 'invite')}><Link2 size={17} />Пригласить</button>
      <button className="gm-button" aria-expanded={panel === 'participants'} onClick={() => setPanel((value) => value === 'participants' ? '' : 'participants')}><Users size={17} />Участники {participants.length}</button>
      <div className="gm-room-menu"><button className="gm-button gm-room-more" aria-label="Управление встречей" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={21} /></button>
        {menuOpen && <div className="gm-room-menu-content"><button className="gm-button gm-danger" disabled={busy} onClick={() => { setMenuOpen(false); control('close'); }}>Завершить для всех</button></div>}
      </div>
    </div></header>
    {error && <p role="alert" className="gm-error">{error}</p>}
    {notice && <p role="status" className="gm-notice">{notice}</p>}
    {panel === 'invite' && <section className="gm-card gm-invite-panel" aria-label="Приглашение во встречу"><div className="gm-invite-title"><h3>Пригласить во встречу</h3><button className="gm-button gm-room-more" aria-label="Закрыть приглашение" onClick={() => setPanel('')}><X size={17} /></button></div>
      <div className="gm-link-row"><input aria-label="Ссылка для друзей" readOnly value={guestMeetingLink(id)} onFocus={(e) => e.target.select()} />
        <button className="gm-button" onClick={copy}><Copy size={17} />Скопировать ссылку</button></div><p>Отправьте ссылку участникам. Для входа достаточно имени.</p>
    </section>}
    <div className={panel === 'participants' ? 'gm-call-layout' : ''}><div className="gm-call"><CallSection role={teacher ? 'teacher' : 'meeting-host'} userId={user.id} userName={user.name} teacherId={teacher ? user.id : undefined} theme={theme}
      meetingId={id} meetingToken={token} hideStudentPicker initialMicEnabled={false} autoStartToken={1}
      onMeetingEnded={ended} onMeetingNotice={setNotice} onMeetingLeft={onLeft} /></div>
      {panel === 'participants' && <aside className="gm-card gm-participants" aria-label="Участники встречи"><h3><Users size={19} />Участники <span>{participants.length}/{meeting.maxParticipants}</span><button className="gm-button gm-room-more" aria-label="Закрыть участников" onClick={() => setPanel('')}><X size={16} /></button></h3>
        <button className="gm-button gm-lock" disabled={busy} onClick={() => control(meeting.locked ? 'unlock' : 'lock')}>
          <LockKeyhole size={16} />{meeting.locked ? 'Открыть вход' : 'Закрыть вход'}</button>
        <p>{meeting.locked ? 'Вход для новых участников закрыт. Уже вошедшие смогут восстановить связь.' : 'Присоединиться может любой, у кого есть ссылка.'}</p>
        {!participants.length && <p className="gm-empty">Войдите в звонок и пригласите друзей.</p>}
        <ul>{participants.map((p) => <li key={p.id}><div><strong>{p.name}</strong><small>{['meeting-host', 'teacher'].includes(p.role) ? 'Вы · организатор' : 'Участник'}</small></div>
          {p.role === 'guest' && <div className="gm-guest-controls"><button aria-label={`Выключить микрофон: ${p.name}`} title={`Выключить микрофон: ${p.name}`} disabled={busy} onClick={() => control('mute', p.userId)}><MicOff size={17} /></button>
            <button aria-label={`Отключить: ${p.name}`} title={`Отключить: ${p.name}`} disabled={busy} onClick={() => control('remove', p.userId)}><X size={17} /></button></div>}
        </li>)}</ul>
      </aside>}
    </div>
  </>;
}
