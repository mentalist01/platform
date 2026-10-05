import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { saveTeacherPlatformPayment, teacherPlatformNotifications } from '../services/teacherPlatformPayments';
import BroadcastNotificationsPanel from './BroadcastNotificationsPanel';
import { Button, Card } from './ui';

const formatSubscriptionMonth = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(value || 'текущий месяц');
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
};

const AdminPanel = ({
  teachers,
  teachersLoading,
  teachersError,
  onTeachersChanged,
}) => {
  const [newTeacherName, setNewTeacherName] = useState('');
  const [teacherActionError, setTeacherActionError] = useState('');
  const [teacherActionLoading, setTeacherActionLoading] = useState(false);
  const [lastTeacherCode, setLastTeacherCode] = useState(null);
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [editTeacherName, setEditTeacherName] = useState('');
  const [editTeacherError, setEditTeacherError] = useState('');
  const [editTeacherSaving, setEditTeacherSaving] = useState(false);
  const [resettingTeacherId, setResettingTeacherId] = useState(null);
  const [adminStudents, setAdminStudents] = useState([]);
  const [adminStudentsLoading, setAdminStudentsLoading] = useState(false);
  const [adminStudentsError, setAdminStudentsError] = useState('');
  const [globalManagerSavingId, setGlobalManagerSavingId] = useState(null);
  const [subscriptionDrafts, setSubscriptionDrafts] = useState({});
  const [subscriptionSavingId, setSubscriptionSavingId] = useState(null);
  const [subscriptionPayingId, setSubscriptionPayingId] = useState(null);
  const [paymentNotifications, setPaymentNotifications] = useState([]);
  const [paymentNotificationsError, setPaymentNotificationsError] = useState('');
  const teachersChangedRef = useRef(onTeachersChanged);
  teachersChangedRef.current = onTeachersChanged;
  useEffect(() => {
    let active = true;
    let appliedIds = null;
    const load = () => teacherPlatformNotifications().then(data => {
      if (!active) return;
      const notifications = data.notifications || [];
      const nextIds = new Set(notifications.filter(entry => entry.status === 'applied').map(entry => entry.id));
      if (appliedIds && [...nextIds].some(id => !appliedIds.has(id))) teachersChangedRef.current?.();
      appliedIds = nextIds;
      setPaymentNotifications(notifications);
      setPaymentNotificationsError('');
    }).catch(error => { if (active) setPaymentNotificationsError(error.message); });
    load();
    const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const loadAllStudents = async () => {
    setAdminStudentsLoading(true);
    try {
      const data = await api.getStudents();
      setAdminStudents(data);
      setAdminStudentsError('');
    } catch (err) {
      setAdminStudentsError(err?.message || err);
    } finally {
      setAdminStudentsLoading(false);
    }
  };

  useEffect(() => {
    loadAllStudents();
  }, [teachers?.length]);

  useEffect(() => {
    const next = {};
    (teachers || []).forEach((teacher) => {
      next[teacher.id] = {
        monthlyFee: Number(teacher.subscription?.monthlyFee) > 0 ? String(teacher.subscription.monthlyFee) : '',
        dueDay: String(Number(teacher.subscription?.dueDay) || 10),
        payerName: teacher.subscription?.payerName || '',
      };
    });
    setSubscriptionDrafts(previous => {
      const merged = {};
      for (const [id, draft] of Object.entries(next)) {
        const old = previous[id];
        // A new bank receipt can refresh statuses while an administrator edits a payer.
        merged[id] = old?.dirty ? old : draft;
      }
      return merged;
    });
  }, [teachers]);

  const handleCreateTeacher = async () => {
    const name = newTeacherName.trim();
    if (!name) {
      setTeacherActionError('Введите имя учителя');
      return;
    }
    setTeacherActionLoading(true);
    try {
      const created = await api.createTeacher(name);
      const { code, ...rest } = created || {};
      if (code) setLastTeacherCode({ name: rest?.name || name, code });
      setNewTeacherName('');
      setTeacherActionError('');
      onTeachersChanged?.();
    } catch (err) {
      setTeacherActionError(err?.message || err);
    } finally {
      setTeacherActionLoading(false);
    }
  };

  const handleDeleteTeacher = async (teacher) => {
    if (!teacher?.id) return;
    if (!confirm(`Удалить учителя "${teacher.name}"? Все его ученики и данные будут удалены.`)) return;
    try {
      await api.deleteTeacher(teacher.id);
      onTeachersChanged?.();
      loadAllStudents();
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleResetTeacherCode = async (teacher) => {
    if (!teacher?.id) return;
    if (!confirm(`Сгенерировать новый код для "${teacher.name}"?`)) return;
    setResettingTeacherId(teacher.id);
    try {
      const res = await api.resetTeacherCode(teacher.id);
      if (res?.code) setLastTeacherCode({ name: teacher.name, code: res.code });
      onTeachersChanged?.();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setResettingTeacherId(null);
    }
  };

  const startEditTeacher = (teacher) => {
    if (!teacher?.id) return;
    setEditingTeacherId(teacher.id);
    setEditTeacherName(teacher.name || '');
    setEditTeacherError('');
  };

  const cancelEditTeacher = () => {
    setEditingTeacherId(null);
    setEditTeacherName('');
    setEditTeacherError('');
  };

  const saveEditTeacher = async (teacher) => {
    const name = editTeacherName.trim();
    if (!name) {
      setEditTeacherError('Введите имя учителя');
      return;
    }
    setEditTeacherSaving(true);
    try {
      await api.updateTeacherName(teacher.id, name);
      cancelEditTeacher();
      onTeachersChanged?.();
    } catch (err) {
      setEditTeacherError(err?.message || err);
    } finally {
      setEditTeacherSaving(false);
    }
  };

  const handleToggleGlobalTaskPermission = async (teacher, enabled) => {
    if (!teacher?.id) return;
    setGlobalManagerSavingId(teacher.id);
    try {
      await api.updateTeacherGlobalTaskPermission(teacher.id, enabled);
      onTeachersChanged?.();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setGlobalManagerSavingId(null);
    }
  };

  const handleSaveSubscription = async (teacher) => {
    const draft = subscriptionDrafts[teacher.id] || {};
    const monthlyFee = Math.max(0, Number(String(draft.monthlyFee || '').replace(',', '.')) || 0);
    const dueDay = Math.max(1, Math.min(31, Math.round(Number(draft.dueDay) || 10)));
    setSubscriptionSavingId(teacher.id);
    try {
      await saveTeacherPlatformPayment(teacher.id, monthlyFee, dueDay, draft.payerName || '');
      setSubscriptionDrafts(previous => ({ ...previous, [teacher.id]: { ...previous[teacher.id], dirty: false } }));
      onTeachersChanged?.();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setSubscriptionSavingId(null);
    }
  };

  const handleMarkSubscriptionPaid = async (teacher) => {
    if (!teacher?.id || !(Number(teacher.subscription?.monthlyFee) > 0)) return;
    setSubscriptionPayingId(teacher.id);
    try {
      await api.markTeacherSubscriptionPaid(teacher.id, teacher.subscription?.month, teacher.subscription.monthlyFee);
      onTeachersChanged?.();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setSubscriptionPayingId(null);
    }
  };

  const handleUnmarkSubscriptionPaid = async (teacher) => {
    if (!teacher?.id) return;
    setSubscriptionPayingId(teacher.id);
    try {
      await api.unmarkTeacherSubscriptionPaid(teacher.id, teacher.subscription?.month);
      onTeachersChanged?.();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setSubscriptionPayingId(null);
    }
  };

  const teacherMap = useMemo(() => {
    const map = new Map();
    (teachers || []).forEach((teacher) => map.set(teacher.id, teacher.name));
    return map;
  }, [teachers]);

  return (
    <div className="animate-fadeIn space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Админка</h2>
        <p className="text-gray-500">Управление учителями и всеми учениками</p>
      </div>
      {paymentNotifications.length > 0 && <details className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
        <summary className="cursor-pointer text-sm font-bold text-violet-900">Автооплата платформы · {paymentNotifications.filter(entry => entry.status === 'pending').length} на проверке</summary>
        <div className="mt-3 space-y-2">{paymentNotifications.slice(0, 12).map(entry => <div key={entry.id} className="rounded-xl border border-violet-100 bg-white px-4 py-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2 font-semibold text-slate-800"><span>{entry.teacherName || entry.senderName || 'Неоднозначный плательщик'}</span><span>{entry.amount.toLocaleString('ru-RU')} ₽ · {entry.paymentMonth}</span></div>
          <p className={`mt-1 ${entry.status === 'applied' ? 'text-emerald-700' : 'text-amber-700'}`}>{entry.reason}</p>
        </div>)}</div>
      </details>}

      <BroadcastNotificationsPanel role="admin" />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Учителя</h3>
            <p className="text-xs text-gray-500">Всего: {teachers?.length || 0}. Доступ к общему банку задаётся отдельно для каждого учителя.</p>
          </div>
          {teachersError && <span className="text-xs text-red-500">{teachersError}</span>}
        </div>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <input
            type="text"
            value={newTeacherName}
            onChange={(e) => { setNewTeacherName(e.target.value); setTeacherActionError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTeacher(); }}
            placeholder="Имя учителя"
            className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <Button onClick={handleCreateTeacher} disabled={teacherActionLoading || !newTeacherName.trim()}>
            <Plus size={16} /> Добавить
          </Button>
        </div>
        {teacherActionError && <p className="text-xs text-red-500 mb-3">{teacherActionError}</p>}
        {lastTeacherCode && (
          <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex flex-wrap items-center justify-between gap-2">
            <span>
              Код доступа для <strong>{lastTeacherCode.name}</strong>:
              <span className="font-mono ml-2">{lastTeacherCode.code}</span>
            </span>
            <button
              onClick={() => setLastTeacherCode(null)}
              className="text-xs text-green-700 hover:text-green-900"
              type="button"
            >
              Скрыть
            </button>
          </div>
        )}

        <div className="space-y-2">
          {teachersLoading ? (
            <div className="text-sm text-gray-500">Загрузка списка...</div>
          ) : (teachers || []).length === 0 ? (
            <div className="text-sm text-gray-400">Пока нет учителей. Создайте первого.</div>
          ) : (
            (teachers || []).map((teacher) => (
              <div key={teacher.id} className="p-3 rounded-xl border flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  {editingTeacherId === teacher.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTeacherName}
                        onChange={(e) => setEditTeacherName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditTeacher(teacher);
                          if (e.key === 'Escape') cancelEditTeacher();
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                      />
                      {editTeacherError && <p className="text-xs text-red-500">{editTeacherError}</p>}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-gray-800 truncate">{teacher.name}</p>
                        {teacher.canManageGlobalTaskContent && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                            <CheckCircle2 size={12} /> Общий банк разрешён
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Код: <span className="font-mono">{teacher.codeHint ? `****${teacher.codeHint}` : 'скрыт'}</span>
                      </p>
                      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={Boolean(teacher.canManageGlobalTaskContent)}
                          onChange={(event) => handleToggleGlobalTaskPermission(teacher, event.target.checked)}
                          disabled={globalManagerSavingId === teacher.id}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600 disabled:opacity-50"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-violet-800">
                            Изменять задания для всех преподавателей
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-violet-600">
                            Учитель сможет выбирать: изменить общий банк или только свой.
                          </span>
                        </span>
                      </label>
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="min-w-[140px] flex-1">
                            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Оплата платформы в месяц</span>
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={subscriptionDrafts[teacher.id]?.monthlyFee || ''}
                                onChange={(event) => setSubscriptionDrafts((current) => ({
                                  ...current,
                                  [teacher.id]: { ...(current[teacher.id] || {}), dirty: true, monthlyFee: event.target.value.replace(/[^\d.,]/g, '') },
                                }))}
                                placeholder="0 — без подписки"
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-7 text-sm outline-none focus:border-purple-500"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">₽</span>
                            </div>
                          </label>
                          <label className="w-24">
                            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Срок, день</span>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={subscriptionDrafts[teacher.id]?.dueDay || '10'}
                              onChange={(event) => setSubscriptionDrafts((current) => ({
                                ...current,
                                [teacher.id]: { ...(current[teacher.id] || {}), dirty: true, dueDay: event.target.value },
                              }))}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleSaveSubscription(teacher)}
                            disabled={subscriptionSavingId === teacher.id}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {subscriptionSavingId === teacher.id ? '...' : 'Сохранить'}
                          </button>
                        </div>
                        {teacher.subscription?.monthlyFee > 0 && (
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className={teacher.subscription.status === 'overdue' ? 'font-semibold text-rose-600' : (teacher.subscription.status === 'paid' ? 'text-emerald-700' : 'text-amber-700')}>
                              {teacher.subscription.status === 'paid'
                                ? <><CheckCircle2 size={13} className="mr-1 inline" /> Оплачено за {formatSubscriptionMonth(teacher.subscription.month)}</>
                                : teacher.subscription.status === 'overdue'
                                  ? `Просрочено: ${teacher.subscription.remaining.toLocaleString('ru-RU')} ₽`
                                  : `К оплате: ${teacher.subscription.remaining.toLocaleString('ru-RU')} ₽ за ${formatSubscriptionMonth(teacher.subscription.month)}`}
                            </span>
                            {teacher.subscription.status !== 'paid' ? (
                              <button
                                type="button"
                                onClick={() => handleMarkSubscriptionPaid(teacher)}
                                disabled={subscriptionPayingId === teacher.id}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                {subscriptionPayingId === teacher.id ? '...' : 'Отметить оплату'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleUnmarkSubscriptionPaid(teacher)}
                                disabled={subscriptionPayingId === teacher.id}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                              >
                                {subscriptionPayingId === teacher.id ? '...' : 'Отменить отметку'}
                              </button>
                            )}
                          </div>
                        )}
                        <label className="mt-3 block">
                          <span className="mb-1 block text-xs font-semibold text-slate-700">Имя плательщика в Т-банке</span>
                          <input type="text" maxLength={120} value={subscriptionDrafts[teacher.id]?.payerName || ''}
                            onChange={event => setSubscriptionDrafts(current => ({ ...current, [teacher.id]: { ...current[teacher.id], dirty: true, payerName: event.target.value } }))}
                            placeholder="Например, Александр П."
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500" />
                        </label>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">Укажите имя точно как в банковском уведомлении и нажмите «Сохранить». Перевод на месячную сумму отмечается за месяц его поступления. Пустое имя отключает автоотметку.</p>
                        {teacher.subscription?.payerName && <p className={`mt-2 text-xs font-semibold ${teacher.subscription.autoPaymentEnabled ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {teacher.subscription.autoPaymentEnabled ? '✓ Автоотметка Т-банка подключена' : 'Для автоотметки нужно подключить поток уведомлений Т-банка к счёту владельца платформы'}
                          {teacher.subscription.paymentSource === 'tbank' && ' · Этот месяц оплачен автоматически'}
                        </p>}
                        {paymentNotifications.filter(entry => entry.teacherId === teacher.id && entry.status === 'pending').slice(0, 2).map(entry => <p key={entry.id} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Перевод {entry.amount.toLocaleString('ru-RU')} ₽ от {entry.senderName}: {entry.reason}
                        </p>)}
                        {paymentNotificationsError && <p className="mt-2 text-xs text-rose-600">История автооплат: {paymentNotificationsError}</p>}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 self-end lg:max-w-[310px] lg:justify-end">
                  {editingTeacherId === teacher.id ? (
                    <>
                      <button
                        onClick={() => saveEditTeacher(teacher)}
                        className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-700 disabled:opacity-60"
                        disabled={editTeacherSaving}
                        type="button"
                      >
                        {editTeacherSaving ? '...' : 'Сохранить'}
                      </button>
                      <button
                        onClick={cancelEditTeacher}
                        className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        type="button"
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditTeacher(teacher)}
                        className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        type="button"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleResetTeacherCode(teacher)}
                        className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                        title="Сбросить код"
                        disabled={resettingTeacherId === teacher.id}
                        type="button"
                      >
                        <RefreshCcw size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(teacher)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                        title="Удалить учителя"
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Все ученики</h3>
            <p className="text-xs text-gray-500">Всего: {adminStudents.length}</p>
          </div>
          {adminStudentsError && <span className="text-xs text-red-500">{adminStudentsError}</span>}
        </div>
        {adminStudentsLoading ? (
          <div className="text-sm text-gray-500">Загрузка списка учеников...</div>
        ) : adminStudents.length === 0 ? (
          <div className="text-sm text-gray-400">Пока нет учеников.</div>
        ) : (
          <div className="space-y-2">
            {adminStudents.map((student) => (
              <div key={student.id} className="p-3 rounded-xl border flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{student.name}</p>
                  <p className="text-xs text-gray-500">
                    Учитель: <span className="font-medium text-gray-700">{teacherMap.get(student.teacherId) || 'Неизвестно'}</span>
                  </p>
                </div>
                <span className="text-xs text-gray-400">{student.codeHint ? `****${student.codeHint}` : 'скрыт'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminPanel;
