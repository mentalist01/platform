import React, { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';

const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-violet-500';
const buttonClass = 'rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50';

function MailSetup({ onDone, verified }) {
  const [provider, setProvider] = useState('yandex');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const instructions = provider === 'gmail'
    ? 'https://support.google.com/mail/answer/185833?hl=ru'
    : provider === 'mailru' ? 'https://help.mail.ru/mail/security/protection/external/'
      : 'https://yandex.ru/support/id/ru/authorization/app-passwords';
  return <form className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50 p-4" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api.accountSecurity('mail', { provider, email, password, accessCode });
      setEmail(''); setPassword(''); setAccessCode(''); await onDone();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); setPassword(''); setAccessCode(''); }
  }}>
    <h2 className="font-bold text-slate-900">Отправка писем от платформы</h2>
    <p className="text-sm text-slate-600">Однократная настройка для администратора. Ученики и преподаватели будут получать коды со своего аккаунта платформы через этот ящик. Адрес отправителя виден получателям писем — лучше использовать отдельную рабочую почту.</p>
    <label className="block text-sm">Почтовый сервис<select className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value)}><option value="yandex">Яндекс</option><option value="gmail">Gmail</option><option value="mailru">Mail.ru</option></select></label>
    <label className="block text-sm">Ящик для отправки<input className={inputClass} type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
    <label className="block text-sm">Пароль приложения почты<input className={inputClass} type="password" required autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    <a href={instructions} target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold text-violet-700 underline">Как создать пароль приложения</a>
    <label className="block text-sm">Код входа администратора<input className={inputClass} type="password" required autoComplete="off" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} /></label>
    {verified && <p className="text-xs text-slate-600">Изменение также требует действующего подтверждения по почте.</p>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <button className={buttonClass} disabled={busy}>{busy ? 'Проверяем соединение…' : 'Проверить и подключить'}</button>
  </form>;
}

export default function AccountSecurityGate({ user, children, onEmailLinked }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [changing, setChanging] = useState(false);
  const [mailSetup, setMailSetup] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const verified = Boolean(status?.verifiedUntil > clock);
  const load = useCallback(async () => { const result = await api.accountSecurity(); setStatus(result); return result; }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => api.accountSecurity().then((value) => { if (active) setStatus(value); })
      .catch((failure) => { if (active) { setStatus(null); setError(failure.message); } });
    void refresh(); const timer = window.setInterval(refresh, 30_000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { active = false; clearInterval(timer); clearInterval(clockTimer); };
  }, [user.id, user.role]);
  const perform = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const purpose = !status?.emailLinked ? 'bind' : changing ? 'change' : 'manage';
  const requestCode = () => perform(async () => {
    const result = await api.accountSecurity('code', { purpose, email, accessCode });
    setEmail(''); setAccessCode(''); setCode(''); setChallenge(result);
  });
  const cooldown = Math.max(0, Math.ceil(((challenge?.retryAt || 0) - clock) / 1000));
  return <div className="space-y-4 text-slate-800">
    <section className="space-y-4 rounded-2xl border border-violet-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-xl font-black"><LockKeyhole size={22} className="text-violet-600" /> Безопасность аккаунта</h2>
      <p className="text-sm text-slate-600">Привяжите почту, чтобы управлять устройствами. Адрес не показывается в профиле, списках сессий или другим пользователям.</p>
      {user.role === 'teacher' && <p className="text-sm text-slate-600">После привязки почты вход с нового браузера или IP-адреса потребует код из письма. Подтверждённый браузер и сеть запоминаются на 30 дней. Смена VPN также может потребовать подтверждение. Управление сессиями каждый раз открывается отдельно на 10 минут.</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {!status ? <button className={buttonClass} disabled={busy} onClick={() => perform(load)}>Загрузить настройки</button> : <>
        {!status.mailConfigured && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Сначала администратору нужно подключить отправку писем. До подтверждения почты управление сессиями закрыто. Обычная работа и кнопка «Выйти» доступны.</p>}
        {user.role === 'admin' && (!status.mailConfigured || mailSetup) && <MailSetup verified={verified} onDone={async () => { setMailSetup(false); await load(); }} />}
        {verified && !changing ? <>
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><ShieldCheck size={18} /> Этот браузер подтверждён до {new Date(status.verifiedUntil).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <button className={buttonClass} disabled={busy} onClick={() => perform(async () => { await api.accountSecurity('lock'); setStatus((value) => ({ ...value, verifiedUntil: 0 })); setChallenge(null); })}>Закрыть управление</button>
            <button className="font-semibold text-violet-700" onClick={() => { setChanging(true); setChallenge(null); }}>Сменить почту</button>
            {user.role === 'admin' && status.mailConfigured && <button className="font-semibold text-slate-600" onClick={() => setMailSetup((value) => !value)}>Настроить отправку писем</button>}
          </div>
        </> : status.mailConfigured && <form className="max-w-md space-y-3" onSubmit={(event) => { event.preventDefault(); if (!challenge) void requestCode(); else void perform(async () => {
          const result = await api.accountSecurity('verify', { challengeId: challenge.challengeId, code });
          setCode(''); setChallenge(null); setChanging(false); setClock(Date.now()); setStatus(result);
          if (result.emailLinked) onEmailLinked?.();
        }); }}>
          <h3 className="font-bold">{purpose === 'bind' ? 'Привязать личную почту' : purpose === 'change' ? 'Подтвердить новую почту' : 'Подтвердить, что это вы'}</h3>
          {!challenge && <>
            {purpose !== 'manage' && <label className="block text-sm">Почта для получения кодов<input className={inputClass} type="email" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
            {purpose === 'bind' && <label className="block text-sm">Ваш код входа в платформу<input className={inputClass} type="password" autoComplete="off" required value={accessCode} onChange={(event) => setAccessCode(event.target.value)} /></label>}
            <p className="text-sm text-slate-500">{purpose === 'manage' ? 'Отправим одноразовый код на привязанную почту. Адрес скрыт.' : 'Привязка завершится только после ввода кода из письма.'}</p>
          </>}
          {challenge && <>
            <p className="text-sm text-slate-600">Письмо отправлено. Введите код в этом браузере в течение 10 минут. При необходимости проверьте папку «Спам».</p>
            <label className="block text-sm">Код из письма<input className={inputClass} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /></label>
          </>}
          <button className={buttonClass} disabled={busy}>{busy ? 'Подождите…' : challenge ? 'Подтвердить' : 'Получить код'}</button>
          {challenge && <button type="button" className="ml-3 text-sm text-violet-700 disabled:opacity-50" disabled={busy || cooldown > 0} onClick={() => { setChallenge(null); setCode(''); }}>{cooldown ? `Новый код через ${cooldown} с` : 'Запросить новый код'}</button>}
          {changing && <button type="button" className="ml-3 text-sm text-slate-600" onClick={() => { setChanging(false); setChallenge(null); setEmail(''); }}>Отмена</button>}
        </form>}
      </>}
    </section>
    {verified && !changing && children}
  </div>;
}
