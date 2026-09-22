import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  Laptop,
  Loader2,
  LogOut,
  MonitorSmartphone,
  RefreshCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { api } from '../services/api';
import AccountSecurityGate from './AccountSecurityGate';

const ROLE_LABELS = {
  admin: 'Администратор',
  teacher: 'Учитель',
  student: 'Ученик',
  parent: 'Родитель',
  lead: 'Гость',
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(date);
};

const formatLastSeen = (value) => {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return 'активность неизвестна';
  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < 90_000) return 'активность только что';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return formatDateTime(value);
};

const getDeviceIcon = (type) => {
  if (type === 'mobile') return Smartphone;
  if (type === 'tablet') return Tablet;
  return Laptop;
};

const SessionManagementSection = ({ user }) => {
  const isAdmin = user?.role === 'admin';
  const [scope, setScope] = useState('self');
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const payload = await api.getAuthSessions({ scope, query: query.trim() });
      setSessions(Array.isArray(payload?.sessions) ? payload.sessions : []);
      setError('');
    } catch (loadError) {
      setSessions([]);
      setError(loadError?.message || 'Не удалось загрузить активные сессии');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [query, scope]);

  useEffect(() => {
    const debounce = window.setTimeout(() => void load(), query.trim() ? 250 : 0);
    const refresh = window.setInterval(() => void load({ silent: true }), 30_000);
    return () => {
      window.clearTimeout(debounce);
      window.clearInterval(refresh);
    };
  }, [load, query]);

  const revoke = async (session) => {
    if (!session?.id || session.current || busyId) return;
    setBusyId(session.id);
    setError('');
    setNotice('');
    try {
      await api.revokeAuthSession(session.id);
      setSessions((current) => current.filter((entry) => entry.id !== session.id));
      setNotice('Сессия завершена. На этом устройстве потребуется войти заново.');
    } catch (revokeError) {
      setError(revokeError?.message || 'Не удалось завершить сессию');
    } finally {
      setBusyId('');
    }
  };

  const revokeOthers = async () => {
    if (busyId) return;
    setBusyId('others');
    setError('');
    setNotice('');
    try {
      const result = await api.revokeOtherAuthSessions();
      setSessions((current) => current.filter((entry) => entry.current || (
        scope === 'all' && (entry.user?.id !== user?.id || entry.user?.role !== user?.role)
      )));
      setNotice(`Завершено сессий: ${Number(result?.removed) || 0}.`);
    } catch (revokeError) {
      setError(revokeError?.message || 'Не удалось завершить остальные сессии');
    } finally {
      setBusyId('');
    }
  };

  const groups = useMemo(() => {
    const map = new Map();
    sessions.forEach((session) => {
      const key = `${session.user?.role || ''}:${session.user?.id || ''}`;
      if (!map.has(key)) map.set(key, { user: session.user, sessions: [] });
      map.get(key).sessions.push(session);
    });
    return Array.from(map.values());
  }, [sessions]);

  const ownOtherCount = sessions.filter((session) => (
    !session.current && session.user?.id === user?.id && session.user?.role === user?.role
  )).length;
  const onlineCount = sessions.filter((session) => Date.now() - Date.parse(session.lastSeenAt || '') < 5 * 60 * 1000).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-950 px-5 py-5 text-white sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-violet-100"><MonitorSmartphone size={24} /></span>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Безопасность аккаунта</div>
                <h1 className="mt-1 text-2xl font-black sm:text-3xl">Активные сессии</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-300">Устройства, на которых сейчас выполнен вход. Незнакомую сессию можно завершить одним нажатием.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200">{onlineCount} активны сейчас</span>
              <span className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-slate-200">{sessions.length} всего</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button type="button" onClick={() => setScope('all')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${scope === 'all' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600'}`}>Все аккаунты</button>
                <button type="button" onClick={() => setScope('self')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${scope === 'self' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600'}`}>Мои устройства</button>
              </div>
            )}
            {isAdmin && scope === 'all' && (
              <label className="relative min-w-[240px] flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, роль, устройство, IP" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-400" />
              </label>
            )}
          </div>
          <div className="flex items-center gap-2">
            {ownOtherCount > 0 && (
              <button type="button" disabled={Boolean(busyId)} onClick={() => void revokeOthers()} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                {busyId === 'others' ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                Завершить мои остальные ({ownOtherCount})
              </button>
            )}
            <button type="button" disabled={loading} onClick={() => void load()} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" title="Обновить">
              <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {error && <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
          {notice && <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}
          {loading ? (
            <div className="grid min-h-[260px] place-items-center text-sm font-semibold text-slate-500"><span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Загружаем сессии...</span></div>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm font-semibold text-slate-500">По этому фильтру сессий нет.</div>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <section key={`${group.user?.role}:${group.user?.id}`}>
                  {(isAdmin && scope === 'all') && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-black text-slate-900">{group.user?.name || 'Пользователь'}</span>
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700">{ROLE_LABELS[group.user?.role] || group.user?.role}</span>
                      <span className="text-xs text-slate-400">{group.sessions.length} устройств</span>
                    </div>
                  )}
                  <div className="grid gap-3 lg:grid-cols-2">
                    {group.sessions.map((session) => {
                      const DeviceIcon = getDeviceIcon(session.device?.type);
                      const online = Date.now() - Date.parse(session.lastSeenAt || '') < 5 * 60 * 1000;
                      return (
                        <article key={session.id} className={`rounded-2xl border p-4 ${session.current ? 'border-violet-300 bg-violet-50/70' : 'border-slate-200 bg-white'}`}>
                          <div className="flex items-start gap-3">
                            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${session.current ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}><DeviceIcon size={21} /></span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-extrabold text-slate-900">{session.device?.label || 'Неизвестное устройство'}</span>
                                {session.current && <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-black text-white"><ShieldCheck size={11} /> Это устройство</span>}
                                {online && !session.current && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">Сейчас онлайн</span>}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span>{session.ipAddress ? `IP ${session.ipAddress}` : 'IP не определён'}</span>
                                <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {formatLastSeen(session.lastSeenAt)}</span>
                              </div>
                              <div className="mt-1 text-[11px] text-slate-400">Вход: {formatDateTime(session.createdAt)}</div>
                            </div>
                            {!session.current && (
                              <button type="button" disabled={Boolean(busyId)} onClick={() => void revoke(session)} className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
                                {busyId === session.id ? <Loader2 size={14} className="animate-spin" /> : 'Завершить'}
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default function ProtectedSessions({ user }) {
  return <AccountSecurityGate user={user}><SessionManagementSection user={user} /></AccountSecurityGate>;
}
