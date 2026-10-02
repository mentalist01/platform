import { useCallback, useEffect, useState } from 'react';
import { Video, Users, ArrowRight } from 'lucide-react';
import CallSection from './CallSection';
import PublicMeetingRoom from './PublicMeetingRoom';
import { guestMeetingsApi, meetingStorageKey, rememberMeeting } from '../services/guestMeetings';
import './GuestMeetings.css';

export default function GuestMeetingPage() {
  const id = new URLSearchParams(window.location.search).get('meeting') || '';
  const storageKey = meetingStorageKey(id);
  const [meeting, setMeeting] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState('');
  const [notice, setNotice] = useState('');
  const hasMeeting = Boolean(meeting);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await guestMeetingsApi.info(id);
        if (cancelled) return;
        setMeeting(data.meeting);
        let previous;
        try { previous = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { /* Optional recovery. */ }
        if (previous?.token) {
          const resumed = await guestMeetingsApi.join(id, { resumeToken: previous.token });
          if (!cancelled) setIdentity(resumed);
        }
      } catch (e) { if (!cancelled) { setError(e.message); if (e.status === 410 || e.status === 403) setEnded(e.message); } }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [id, storageKey]);
  useEffect(() => {
    if (loading || identity || ended || !hasMeeting) return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const data = await guestMeetingsApi.info(id);
        if (!cancelled) setMeeting(data.meeting);
      } catch (e) {
        if (!cancelled && e.status === 410) setEnded(e.message);
      }
    }, 10_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [ended, id, identity, loading, hasMeeting]);
  const join = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await guestMeetingsApi.join(id, { name });
      rememberMeeting(data);
      setIdentity(data); setMeeting(data.meeting);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const finish = useCallback((message) => { setEnded(message); setIdentity(null); }, []);
  return <main className="guest-meeting-page"><div className="guest-meetings gm-page-inner">
    <nav className="gm-public-nav"><a href="/meetings" className="gm-brand">IVAN100 <span>Встречи</span></a><a href="/meetings" className="gm-platform-link">Создать свою встречу<ArrowRight size={16} /></a></nav>
    {identity?.user.role !== 'meeting-host' &&
    <header className="gm-heading"><span className="gm-icon"><Video size={28} /></span><div>
      <p className="gm-eyebrow">ВСТРЕЧА ПО ПРИГЛАШЕНИЮ</p><h1>{meeting?.title || 'Встреча по ссылке'}</h1>
      <p>{meeting ? `${meeting.hostName} · до ${meeting.maxParticipants} участников` : 'Подключение без регистрации'}</p>
    </div></header>}
    {loading ? <div className="gm-card gm-empty" role="status">Открываем приглашение…</div> : ended || (!meeting && error) ? <div className="gm-card gm-ended"><h2>{ended ? 'Вход во встречу завершён' : 'Встреча недоступна'}</h2><p role="status">{ended || error}</p><a className="gm-button" href="/meetings">Создать свою встречу</a></div> : identity?.user.role === 'meeting-host' ? <PublicMeetingRoom identity={identity} onEnded={finish} /> : identity ? <>
      <p className="gm-identity"><Users size={17} />Вы вошли как <strong>{identity.user.name}</strong></p>
      {notice && <p role="status" className="gm-notice">{notice}</p>}
      <CallSection role="guest" userId={identity.user.id} userName={identity.user.name} meetingId={id}
        meetingToken={identity.token} hideStudentPicker onMeetingEnded={finish} onMeetingNotice={setNotice} />
    </> : <form className="gm-card gm-join-form" onSubmit={join}>
      <h2>Как вас зовут?</h2><p>Организатор и другие участники увидят это имя в звонке.</p>
      <label htmlFor="gm-guest-name">Ваше имя</label><input id="gm-guest-name" autoComplete="given-name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Александр" />
      {error && <p role="alert" className="gm-error">{error}</p>}
      {meeting?.locked && <p className="gm-notice">Организатор закрыл вход для новых участников.</p>}
      <button className="gm-button gm-primary" disabled={busy || !name.trim() || !meeting || meeting.locked}>
        {busy ? 'Подключаем…' : 'Перейти к настройкам'}<ArrowRight size={18} /></button>
      <small>На следующем шаге можно проверить микрофон и камеру.</small>
    </form>}
  </div></main>;
}
