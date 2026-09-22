import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import AccountSecurityGate from './AccountSecurityGate';

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
  return <main className="fixed inset-0 z-[200] overflow-y-auto bg-slate-50 p-4 sm:p-8">
    <div className="mx-auto max-w-2xl space-y-5 py-6">
      <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">Привяжите свою почту, чтобы не потерять аккаунт</h1>
      <p className="text-sm leading-6 text-slate-600">Это обязательный шаг для всех преподавателей. Укажите почту, к которой у вас есть доступ, и подтвердите её кодом из письма. Адрес останется скрытым. После подтверждения откроется платформа.</p>
      {required === true ? <AccountSecurityGate user={user} onEmailLinked={load} /> : <p role="status">Проверяем защиту аккаунта…</p>}
      {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}<button className="ml-3 underline" onClick={load}>Повторить</button></div>}
      <button className="text-sm font-semibold text-slate-500 underline" onClick={onLogout}>Выйти из аккаунта</button>
    </div>
  </main>;
}
