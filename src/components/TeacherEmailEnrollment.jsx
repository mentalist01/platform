import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import AccountSecurityGate from './AccountSecurityGate';
import { LogoMark } from './Identity';

// Check once on entering the account, before mounting the lesson workspace.
// Enabling SMTP while a teacher is already teaching must not interrupt a call.
export default function TeacherEmailEnrollment({ user, onLogout, children }) {
  const [required, setRequired] = useState(null);
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try { setRequired((await api.accountSecurity()).enrollmentRequired === true); }
    catch (failure) { setError(failure.message); }
  };
  useEffect(() => { void load(); }, [user.id]);
  if (required === false) return children;
  return <main className="security-enrollment">
    <div className="security-enrollment-inner">
      <header className="security-enrollment-header"><LogoMark /><button className="security-link security-link-muted" onClick={onLogout}>Выйти из аккаунта</button></header>
      <div className="security-enrollment-title"><h1>Привяжите почту, чтобы не потерять аккаунт</h1>
      <p>Один обязательный шаг для всех преподавателей. Подтвердите личную почту — и продолжайте работу на платформе.</p></div>
      {required === true ? <AccountSecurityGate user={user} onEmailLinked={load} /> : <p role="status">Проверяем защиту аккаунта…</p>}
      {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}<button className="ml-3 underline" onClick={load}>Повторить</button></div>}
      <p className="security-enrollment-footer">Адрес останется скрытым от учеников и других преподавателей.</p>
    </div>
  </main>;
}
