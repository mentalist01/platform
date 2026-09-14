import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Crown, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { api } from '../services/api';
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
      };
    });
    setSubscriptionDrafts(next);
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

  const handleSetGlobalManager = async (teacher) => {
    if (!teacher?.id || teacher.canManageGlobalTaskContent) return;
    setGlobalManagerSavingId(teacher.id);
    try {
      await api.setTeacherGlobalTaskManager(teacher.id);
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
      await api.updateTeacherSubscription(teacher.id, monthlyFee, dueDay);
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

      <BroadcastNotificationsPanel role="admin" />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Учителя</h3>
            <p className="text-xs text-gray-500">Всего: {teachers?.length || 0}. Главный учитель управляет общим банком заданий.</p>
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
                            <Crown size={12} /> Главный учитель
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Код: <span className="font-mono">{teacher.codeHint ? `****${teacher.codeHint}` : 'скрыт'}</span>
                      </p>
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
                                  [teacher.id]: { ...(current[teacher.id] || {}), monthlyFee: event.target.value.replace(/[^\d.,]/g, '') },
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
                                [teacher.id]: { ...(current[teacher.id] || {}), dueDay: event.target.value },
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
                      {!teacher.canManageGlobalTaskContent && (
                        <button
                          onClick={() => handleSetGlobalManager(teacher)}
                          className="px-3 py-1 rounded-lg border border-violet-200 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                          disabled={globalManagerSavingId === teacher.id}
                          type="button"
                        >
                          {globalManagerSavingId === teacher.id ? '...' : 'Сделать главным'}
                        </button>
                      )}
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
