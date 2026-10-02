import { useCallback, useEffect, useState } from 'react';
import { Copy, LockKeyhole, MicOff, Users, X } from 'lucide-react';
import CallSection from './CallSection';
import { guestMeetingsApi, guestMeetingLink } from '../services/guestMeetings';

export default function PublicMeetingRoom({ identity, onEnded }) {
  const [meeting, setMeeting] = useState(identity.meeting);
  const [participants, setParticipants] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { token, user } = identity;
  const id = identity.meeting.id;
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const data = await guestMeetingsApi.presence(id, { guest: true, token, signal: controller.signal });
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
  }, [id, token, onEnded]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(guestMeetingLink(id)); setNotice('Ссылка скопирована. Отправьте её друзьям.'); }
    catch { setNotice('Выделите ссылку и скопируйте её сочетанием Ctrl+C.'); }
  };
  const control = async (action, guestId) => {
    setBusy(true); setError('');
    try {
      const data = await guestMeetingsApi.controlPublic(id, token, action, guestId);
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
    {error && <p role="alert" className="gm-error">{error}</p>}
    {notice && <p role="status" className="gm-notice">{notice}</p>}
    <div className="gm-card gm-room-heading"><div><h2>{meeting.title}</h2><p>Вы — организатор · до {meeting.maxParticipants} участников · ссылка на 24 часа</p></div>
      <button className="gm-button gm-danger" disabled={busy} onClick={() => control('close')}>Завершить для всех</button>
      <div className="gm-link-row"><input aria-label="Ссылка для друзей" readOnly value={guestMeetingLink(id)} onFocus={(e) => e.target.select()} />
        <button className="gm-button" onClick={copy}><Copy size={17} />Скопировать ссылку</button></div>
      <p className="gm-host-hint">Управление встречей сохраняется в этой вкладке. Друзьям отправляйте ссылку из поля выше.</p>
    </div>
    <div className="gm-call-layout"><div className="gm-call"><CallSection role="meeting-host" userId={user.id} userName={user.name}
      meetingId={id} meetingToken={token} hideStudentPicker onMeetingEnded={ended} onMeetingNotice={setNotice} /></div>
      <aside className="gm-card gm-participants"><h3><Users size={19} />Участники <span>{participants.length}/{meeting.maxParticipants}</span></h3>
        <button className="gm-button gm-lock" disabled={busy} onClick={() => control(meeting.locked ? 'unlock' : 'lock')}>
          <LockKeyhole size={16} />{meeting.locked ? 'Открыть вход' : 'Закрыть вход'}</button>
        <p>{meeting.locked ? 'Вход для новых участников закрыт. Уже вошедшие смогут восстановить связь.' : 'Присоединиться может любой, у кого есть ссылка.'}</p>
        {!participants.length && <p className="gm-empty">Войдите в звонок и пригласите друзей.</p>}
        <ul>{participants.map((p) => <li key={p.id}><div><strong>{p.name}</strong><small>{p.role === 'meeting-host' ? 'Вы · организатор' : 'Участник'}</small></div>
          {p.role === 'guest' && <div className="gm-guest-controls"><button aria-label={`Выключить микрофон: ${p.name}`} title={`Выключить микрофон: ${p.name}`} disabled={busy} onClick={() => control('mute', p.userId)}><MicOff size={17} /></button>
            <button aria-label={`Отключить: ${p.name}`} title={`Отключить: ${p.name}`} disabled={busy} onClick={() => control('remove', p.userId)}><X size={17} /></button></div>}
        </li>)}</ul>
      </aside>
    </div>
  </>;
}
