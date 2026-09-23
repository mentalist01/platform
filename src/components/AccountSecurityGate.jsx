import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, CircleAlert, KeyRound, LoaderCircle, LockKeyhole, Mail, Send, Settings2, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import VerificationCodeInput from './VerificationCodeInput';
import './AccountSecurity.css';

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
  return <form className="security-mail-setup" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api.accountSecurity('mail', { provider, email, password, accessCode });
      setEmail(''); setPassword(''); setAccessCode(''); await onDone();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); setPassword(''); setAccessCode(''); }
  }}>
    <div className="security-form-heading"><span className="security-icon-small"><Send size={20} /></span><div><span className="security-eyebrow">Для администратора</span><h3>Почта платформы</h3></div></div>
    <p className="security-description">С этого ящика платформа отправляет коды входа. Это отдельная настройка, она не меняет вашу личную почту.</p>
    <div className="security-notice"><CircleAlert size={17} /><p>Адрес отправителя виден в письмах. Лучше использовать отдельный рабочий ящик.</p></div>
    <fieldset className="security-providers" disabled={busy}><legend className="security-label">Почтовый сервис</legend>
      {[['yandex', 'Яндекс'], ['gmail', 'Gmail'], ['mailru', 'Mail.ru']].map(([value, label]) => <label key={value} className={provider === value ? 'is-selected' : ''}>
        <input type="radio" name="mail-provider" value={value} checked={provider === value} onChange={() => setProvider(value)} /><span>{label}</span>{provider === value && <Check size={15} />}
      </label>)}
    </fieldset>
    <div className="security-fields-grid">
      <label className="security-field">Ящик для отправки<input type="email" required autoComplete="off" placeholder="mail@example.ru" disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="security-field">Пароль приложения почты<input type="password" required autoComplete="off" disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    </div>
    <a href={instructions} target="_blank" rel="noopener noreferrer" className="security-link">Как создать пароль приложения <ArrowRight size={15} /></a>
    <label className="security-field">Код входа администратора<input type="password" required autoComplete="off" disabled={busy} value={accessCode} onChange={(e) => setAccessCode(e.target.value)} /></label>
    {verified && <p className="security-hint">Для изменения также нужно действующее подтверждение по почте.</p>}
    {error && <div role="alert" className="security-alert"><CircleAlert size={18} /><span>{error}</span></div>}
    <button className="security-primary" disabled={busy}>{busy ? <LoaderCircle size={18} className="security-spin" /> : <Send size={18} />}{busy ? 'Проверяем соединение…' : 'Проверить и подключить'}</button>
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
  const verified = Boolean(status?.sessionVerified || status?.verifiedUntil > clock);
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
  const unlocked = verified && !changing;
  const showForm = status?.mailConfigured && !unlocked;
  return <div className="account-security-root">
    <section className={`security-card${unlocked ? ' security-card-verified' : ''}`} aria-label="Безопасность аккаунта">
      {unlocked ? <div className="security-success">
        <span className="security-success-icon"><ShieldCheck size={27} /></span>
        <div className="security-success-copy"><span className="security-eyebrow">Безопасность аккаунта</span><h2>Этот вход подтверждён</h2><p>Управляйте сессиями без повторных кодов, пока вы в аккаунте. Ваша почта скрыта.</p></div>
        <div className="security-success-actions"><span className="security-badge"><Check size={14} /> Под защитой</span><button className="security-link" onClick={() => { setChanging(true); setChallenge(null); setError(''); }}>Сменить почту <ArrowRight size={15} /></button>
          {user.role === 'admin' && status.mailConfigured && <button className="security-link security-link-muted" onClick={() => setMailSetup((value) => !value)} aria-expanded={mailSetup}><Settings2 size={15} /> Почта платформы</button>}
        </div>
      </div> : <div className="security-layout">
        <div className="security-intro">
          <span className="security-eyebrow"><LockKeyhole size={15} /> Безопасность аккаунта</span>
          <div className="security-art" aria-hidden="true"><div className="security-art-icon"><ShieldCheck size={42} strokeWidth={1.5} /></div><span className="security-art-check"><Check size={17} strokeWidth={3} /></span></div>
          <h2>{purpose === 'change' ? 'Обновим вашу почту' : status?.emailLinked ? 'Защита в ваших руках' : 'Сохраните доступ к аккаунту'}</h2>
          <p>{purpose === 'change' ? 'Укажите новый адрес и подтвердите его кодом из письма.' : status?.emailLinked ? 'Подтвердите этот вход один раз, чтобы управлять своими устройствами.' : 'Привяжите личную почту. Она поможет защитить ваш аккаунт и управлять устройствами.'}</p>
          <div className="security-benefits"><div><LockKeyhole size={18} /><span><strong>Почта только для вас</strong><small>Адрес не виден в профиле и другим людям</small></span></div><div><ShieldCheck size={18} /><span><strong>{user.role === 'teacher' ? 'Защита новых входов' : 'Контроль устройств'}</strong><small>{user.role === 'teacher' ? 'Новый браузер или сеть — вход с кодом из письма' : 'Проверяйте и завершайте незнакомые сессии'}</small></span></div></div>
        </div>
        <div className="security-content">
          {showForm && <>
            {purpose !== 'manage' && <ol className="security-steps" aria-label="Шаги привязки почты"><li className={!challenge ? 'is-active' : 'is-done'} aria-current={!challenge ? 'step' : undefined}><span>{challenge ? <Check size={13} /> : '1'}</span> Почта</li><li className={challenge ? 'is-active' : ''} aria-current={challenge ? 'step' : undefined}><span>2</span> Подтверждение</li></ol>}
            <form className="security-form" onSubmit={(event) => { event.preventDefault(); if (!challenge) void requestCode(); else void perform(async () => {
              const result = await api.accountSecurity('verify', { challengeId: challenge.challengeId, code });
              setCode(''); setChallenge(null); setChanging(false); setClock(Date.now()); setStatus(result);
              if (result.emailLinked) onEmailLinked?.();
            }); }}>
              <div className="security-form-heading"><span className="security-icon-small">{challenge ? <Mail size={23} /> : <KeyRound size={22} />}</span><div><h3>{challenge ? 'Проверьте вашу почту' : purpose === 'bind' ? 'Ваша личная почта' : purpose === 'change' ? 'Новый адрес почты' : 'Подтвердите, что это вы'}</h3><p>{challenge ? 'Мы отправили вам код подтверждения' : purpose === 'manage' ? 'Почта привязана. Осталось подтвердить этот вход' : 'Укажите адрес, к которому у вас есть доступ'}</p></div></div>
              {!challenge ? <>
                {purpose !== 'manage' && <label className="security-field">Электронная почта<input type="email" autoComplete="off" placeholder="you@example.ru" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
                {purpose === 'bind' && <label className="security-field">Ваш код входа в платформу<input type="password" autoComplete="off" required disabled={busy} value={accessCode} onChange={(event) => setAccessCode(event.target.value)} /><span className="security-hint">Код, с которым вы входите на сайт. Пароль от почты здесь не нужен.</span></label>}
                {purpose === 'manage' && <p className="security-description">Отправим одноразовый код на вашу личную почту. После подтверждения управление будет доступно до выхода из аккаунта.</p>}
              </> : <>
                <VerificationCodeInput value={code} onChange={setCode} disabled={busy} invalid={Boolean(error)} />
                <p className="security-hint">Код действует 10 минут. Можно вставить все шесть цифр сразу.</p>
              </>}
              {error && <div role="alert" className="security-alert"><CircleAlert size={18} /><span>{error}</span></div>}
              <button className="security-primary" disabled={busy || (Boolean(challenge) && code.length !== 6)}>{busy ? <><LoaderCircle size={18} className="security-spin" /> Проверяем…</> : <>{challenge ? purpose === 'manage' ? 'Подтвердить вход' : 'Подтвердить почту' : 'Получить код'}<ArrowRight size={18} /></>}</button>
              {challenge ? <div className="security-resend"><p>Нет письма? Проверьте папку «Спам».</p><button type="button" className="security-link" disabled={busy || cooldown > 0} onClick={() => { setChallenge(null); setCode(''); setError(''); }}>{cooldown ? `Запросить снова через ${cooldown} с` : 'Запросить новый код'}</button></div> : <p className="security-footnote"><LockKeyhole size={13} /> {purpose === 'manage' ? 'Адрес скрыт в целях безопасности' : 'Привязка завершится после ввода кода из письма'}</p>}
              {changing && <button type="button" disabled={busy} className="security-link security-link-muted" onClick={() => { setChanging(false); setChallenge(null); setEmail(''); setError(''); }}><ChevronLeft size={16} /> Отменить смену почты</button>}
            </form>
          </>}
          {!status && <div className="security-loading"><ShieldCheck size={32} /><h3>Проверяем защиту аккаунта</h3><p className="security-description">Загружаем настройки безопасности…</p>{error && <div role="alert" className="security-alert">{error}</div>}<button className="security-secondary" disabled={busy} onClick={() => perform(load)}>Повторить проверку</button></div>}
          {status && !status.mailConfigured && <div className="security-loading"><Mail size={32} /><h3>Подключим отправку писем</h3><p className="security-description">{user.role === 'admin' ? 'Сначала настройте рабочий ящик платформы в форме ниже. После этого можно привязать личную почту.' : 'Администратору нужно настроить отправку писем. После этого вы сможете подтвердить почту и управлять устройствами.'}</p></div>}
        </div>
      </div>}
      {unlocked && error && <div role="alert" className="security-alert">{error}</div>}
      {user.role === 'admin' && status && (!status.mailConfigured || mailSetup) && <MailSetup verified={verified} onDone={async () => { setMailSetup(false); await load(); }} />}
    </section>
    {unlocked && children}
  </div>;
}
