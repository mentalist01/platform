import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Link2, MonitorUp, Users, Video } from 'lucide-react';
import { guestMeetingsApi, guestMeetingLink, rememberMeeting } from '../services/guestMeetings';
import PublicMeetingRoom from './PublicMeetingRoom';
import './GuestMeetings.css';

export default function PublicMeetingsPage() {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [invitation, setInvitation] = useState('');
  const [config, setConfig] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [previousIdentity, setPreviousIdentity] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [ended, setEnded] = useState('');
  useEffect(() => {
    let cancelled = false;
    guestMeetingsApi.publicConfig().then((data) => { if (!cancelled) setConfig(data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  const create = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await guestMeetingsApi.createPublic(name, title);
      rememberMeeting(data);
      window.history.replaceState(null, '', guestMeetingLink(data.meeting.id));
      setIdentity(data);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const join = (event) => {
    event.preventDefault(); setJoinError('');
    let id = invitation.trim();
    if (!/^[a-f0-9-]{36}$/.test(id)) {
      try { id = new URL(id).searchParams.get('meeting') || ''; } catch { id = ''; }
    }
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) {
      setJoinError('Вставьте ссылку на встречу IVAN100, которую вам прислали.'); return;
    }
    window.location.assign(guestMeetingLink(id));
  };
  const finish = useCallback((message) => { setEnded(message); setIdentity(null); }, []);
  const leave = () => { rememberMeeting(identity, false); setPreviousIdentity(identity); setIdentity(null); };
  const returnToRoom = async () => {
    setBusy(true); setError('');
    try {
      const data = await guestMeetingsApi.join(previousIdentity.meeting.id, { resumeToken: previousIdentity.token });
      rememberMeeting(data); setIdentity(data); setPreviousIdentity(null);
    } catch (e) { setError(e.message); if ([403, 410].includes(e.status)) setEnded(e.message); }
    finally { setBusy(false); }
  };
  return <main className="guest-meeting-page"><div className="guest-meetings gm-page-inner">
    <nav className="gm-public-nav"><a href="/meetings" className="gm-brand">IVAN100 <span>Встречи</span></a><a className="gm-platform-link" href="/">Учебная платформа<ArrowRight size={16} /></a></nav>
    {ended ? <div className="gm-card gm-ended"><h1>Встреча завершена</h1><p>{ended}</p><a className="gm-button gm-primary" href="/meetings">Создать новую встречу</a></div>
      : identity ? <PublicMeetingRoom identity={identity} onEnded={finish} onLeft={leave} />
      : previousIdentity ? <div className="gm-card gm-ended"><h1>Вы вышли из встречи</h1><p>Остальные участники могут продолжать разговор.</p>{error && <p className="gm-error" role="alert">{error}</p>}<button className="gm-button gm-primary" disabled={busy} onClick={returnToRoom}>Вернуться во встречу</button><a className="gm-button" href="/meetings">Новая встреча</a></div> : <>
        <div className="gm-public-hero"><header><span className="gm-public-kicker"><Video size={16} />Видеозвонки без регистрации</span>
          <h1>Соберите друзей.<br /><span>Отправьте ссылку.</span></h1><p className="gm-public-intro">Общайтесь, включайте камеры и делитесь экраном. Для встречи достаточно имени — вашим друзьям тоже не нужен аккаунт.</p>
          <div className="gm-public-features"><span><Users size={18} />До 20 человек</span><span><MonitorUp size={18} />Показ экрана</span><span><Link2 size={18} />Одна ссылка для всех</span></div>
          <div className="gm-public-preview" aria-hidden="true"><div className="gm-preview-person"><span>В</span><b>Вы</b></div><div className="gm-preview-person"><span>А</span><b>Аня</b></div><div className="gm-preview-person"><span>М</span><b>Миша</b></div><div className="gm-preview-person"><span>Д</span><b>Даша</b></div></div>
        </header>
        <div><form className="gm-card gm-public-create" onSubmit={create}><h2>Новая встреча</h2><p>Создайте комнату и пригласите остальных.</p>
          <label htmlFor="gm-host-name">Ваше имя</label><input id="gm-host-name" required maxLength={80} autoComplete="given-name" placeholder="Как вас представить?" value={name} onChange={(e) => setName(e.target.value)} />
          <label htmlFor="gm-public-title">Название встречи <span>необязательно</span></label><input id="gm-public-title" maxLength={120} placeholder="Например, встреча с друзьями" value={title} onChange={(e) => setTitle(e.target.value)} />
          {error && <p role="alert" className="gm-error">{error}</p>}
          {config && !config.enabled && <p role="status" className="gm-notice">Создание встреч временно недоступно. По приглашению можно войти ниже.</p>}
          <button className="gm-button gm-primary" disabled={busy || !name.trim() || !config?.enabled}><Video size={19} />{busy ? 'Создаём комнату…' : 'Создать встречу'}<ArrowRight size={18} /></button>
          <small>Ссылка действует 24 часа. Камеру и микрофон включаете вы.</small>
        </form>
        <form className="gm-card gm-public-join" onSubmit={join}><h2>Уже есть приглашение?</h2><label className="sr-only" htmlFor="gm-invitation">Ссылка на встречу</label><div className="gm-link-row"><input id="gm-invitation" type="text" placeholder="Вставьте ссылку на встречу" value={invitation} onChange={(e) => setInvitation(e.target.value)} /><button className="gm-button" disabled={!invitation.trim()}>Войти<ArrowRight size={16} /></button></div>
          {joinError && <p role="alert" className="gm-error">{joinError}</p>}
        </form></div>
        </div>
      </>}
  </div></main>;
}
