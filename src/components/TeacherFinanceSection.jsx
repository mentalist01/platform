import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Save,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';

const formatMoney = (value) => {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: safeAmount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
};

const normalizeNumberInput = (value) => String(value ?? '')
  .replace(',', '.')
  .replace(/[^\d.]/g, '');

const parseAmount = (value) => {
  const normalized = normalizeNumberInput(value).trim();
  if (!normalized) return 0;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
};

const toInputValue = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return String(amount);
};

const formatLessonCount = (value) => {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14
    ? 'занятий'
    : (mod10 === 1 ? 'занятие' : (mod10 >= 2 && mod10 <= 4 ? 'занятия' : 'занятий'));
  return `${count} ${word}`;
};

const formatStudentCount = (value) => {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14
    ? 'учеников'
    : (mod10 === 1 ? 'ученик' : (mod10 >= 2 && mod10 <= 4 ? 'ученика' : 'учеников'));
  return `${count} ${word}`;
};

const formatMonthLabel = (monthKey) => {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return 'Без месяца';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(' г.', '');
};

const getStudentProfitability = (student, commissionDraft) => {
  const profitability = student?.profitability && typeof student.profitability === 'object'
    ? student.profitability
    : {};
  const commissionAmount = parseAmount(commissionDraft);
  const lessonCount = Math.max(0, Math.floor(Number(profitability.lessonCount) || 0));
  const grossRevenue = Math.max(0, Number(profitability.grossRevenue) || 0);
  const receivedRevenue = Math.max(0, Number(profitability.receivedRevenue) || 0);
  const netAfterCommission = Math.round((grossRevenue - commissionAmount) * 100) / 100;
  const remainingToPayback = Math.max(0, Math.round((commissionAmount - grossRevenue) * 100) / 100);
  const paybackPercent = commissionAmount > 0
    ? Math.max(0, Math.min(100, Math.round((grossRevenue / commissionAmount) * 100)))
    : 0;
  const isPaidBack = commissionAmount > 0 && remainingToPayback <= 0;
  return {
    commissionAmount,
    lessonCount,
    grossRevenue,
    receivedRevenue,
    netAfterCommission,
    remainingToPayback,
    paybackPercent,
    isPaidBack,
    needsLessonPrice: Boolean(profitability.needsLessonPrice),
  };
};

const SummaryMetric = ({ icon, label, value, tone = 'violet', hint }) => {
  const tones = {
    violet: 'border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 text-violet-700',
    emerald: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 text-emerald-700',
    sky: 'border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 text-sky-700',
  };
  return (
    <div className={`teacher-finance-simple__summary rounded-2xl border p-4 ${tones[tone] || tones.violet}`} data-tone={tone}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-80">{label}</div>
          <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{value}</div>
          {hint ? <div className="mt-1 text-xs font-medium text-slate-500">{hint}</div> : null}
        </div>
        <div className="teacher-finance-simple__summary-icon rounded-xl border border-white/80 bg-white/80 p-2 shadow-sm">
          {React.createElement(icon, { size: 17 })}
        </div>
      </div>
    </div>
  );
};

const TeacherFinanceSection = ({ teacherId, studentsLoading }) => {
  const [snapshot, setSnapshot] = useState(null);
  const [commissionDrafts, setCommissionDrafts] = useState({});
  const [commissionBaselines, setCommissionBaselines] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingStudentId, setSavingStudentId] = useState('');
  const [error, setError] = useState('');

  const applySnapshot = (data) => {
    const nextSnapshot = data && typeof data === 'object' ? data : {};
    const drafts = {};
    (Array.isArray(nextSnapshot.students) ? nextSnapshot.students : []).forEach((student) => {
      drafts[student.id] = toInputValue(student?.profile?.commissionAmount);
    });
    setSnapshot(nextSnapshot);
    setCommissionDrafts(drafts);
    setCommissionBaselines(drafts);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getTeacherFinance(undefined, teacherId);
        if (cancelled) return;
        applySnapshot(data);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  const studentRows = useMemo(() => (
    (Array.isArray(snapshot?.students) ? snapshot.students : [])
      .filter((student) => !student.deletedAt)
      .map((student) => {
        const commissionDraft = commissionDrafts[student.id] ?? '';
        return {
          ...student,
          commissionDraft,
          metrics: getStudentProfitability(student, commissionDraft),
          dirty: commissionDraft !== (commissionBaselines[student.id] ?? ''),
        };
      })
      .sort((left, right) => String(left.displayName || '').localeCompare(String(right.displayName || ''), 'ru'))
  ), [commissionBaselines, commissionDrafts, snapshot?.students]);

  const totals = useMemo(() => studentRows.reduce((acc, student) => {
    acc.lessonCount += student.metrics.lessonCount;
    acc.grossRevenue += student.metrics.grossRevenue;
    acc.receivedRevenue += student.metrics.receivedRevenue;
    acc.commissionAmount += student.metrics.commissionAmount;
    acc.netAfterCommission += student.metrics.netAfterCommission;
    return acc;
  }, {
    lessonCount: 0,
    grossRevenue: 0,
    receivedRevenue: 0,
    commissionAmount: 0,
    netAfterCommission: 0,
  }), [studentRows]);

  const incomeByMonth = useMemo(() => {
    const serverRows = Array.isArray(snapshot?.incomeByMonth) ? snapshot.incomeByMonth : [];
    const fallbackRows = Array.isArray(snapshot?.history) ? snapshot.history : [];
    const source = serverRows.length > 0 ? serverRows : fallbackRows;
    return source
      .map((item) => ({
        month: String(item?.month || '').trim(),
        lessonCount: Math.max(0, Math.floor(Number(item?.lessonCount ?? item?.completedLessons) || 0)),
        grossRevenue: Math.max(0, Number(item?.grossRevenue ?? item?.accruedRevenue) || 0),
        receivedRevenue: Math.max(0, Number(item?.receivedRevenue ?? item?.cashflow) || 0),
      }))
      .filter((item) => /^\d{4}-\d{2}$/.test(item.month))
      .sort((left, right) => right.month.localeCompare(left.month, 'ru'));
  }, [snapshot?.history, snapshot?.incomeByMonth]);

  const handleCommissionChange = (studentId, value) => {
    setCommissionDrafts((prev) => ({
      ...prev,
      [studentId]: normalizeNumberInput(value),
    }));
    setError('');
  };

  const handleSave = async (student) => {
    const commissionAmount = parseAmount(commissionDrafts[student.id]);
    setSavingStudentId(student.id);
    try {
      const data = await api.updateTeacherFinanceStudent(
        student.id,
        {
          month: snapshot?.month || new Date().toISOString().slice(0, 7),
          commissionAmount,
        },
        teacherId
      );
      applySnapshot(data);
      setError('');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSavingStudentId('');
    }
  };

  return (
    <div className="teacher-finance-simple space-y-4">
      <Card className="teacher-finance-simple__hero overflow-hidden border border-violet-200 bg-gradient-to-br from-white via-violet-50/75 to-sky-50/70 shadow-[0_18px_45px_rgba(109,40,217,0.12)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-violet-700">
              <CircleDollarSign size={14} />
              Доход и комиссия
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Доход по ученикам</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              Введите разовую комиссию. Количество прошедших занятий и доход платформа возьмёт из календаря автоматически.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-violet-200 bg-white/85 px-3 py-2 text-xs font-bold text-violet-700 shadow-sm">
            <Users size={15} />
            {formatStudentCount(studentRows.length)}
          </div>
        </div>

        {!loading ? (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SummaryMetric
              icon={TrendingUp}
              label="Начислено по занятиям"
              value={formatMoney(totals.grossRevenue)}
              hint={formatLessonCount(totals.lessonCount)}
              tone="violet"
            />
            <SummaryMetric
              icon={WalletCards}
              label="Фактически получено"
              value={formatMoney(totals.receivedRevenue)}
              hint="По отмеченным оплатам"
              tone="sky"
            />
            <SummaryMetric
              icon={CheckCircle2}
              label="После комиссий"
              value={formatMoney(totals.netAfterCommission)}
              hint={`Комиссии: ${formatMoney(totals.commissionAmount)}`}
              tone="emerald"
            />
          </div>
        ) : null}
      </Card>

      {!loading && incomeByMonth.length > 0 ? (
        <Card className="teacher-finance-simple__months border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
                <CalendarDays size={14} />
                История дохода
              </div>
              <h3 className="mt-1 text-lg font-black text-slate-950">Доход по месяцам</h3>
            </div>
            <p className="text-xs font-medium text-slate-500">Считается автоматически по прошедшим занятиям</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {incomeByMonth.map((month) => {
              const isCurrentMonth = month.month === (snapshot?.month || new Date().toISOString().slice(0, 7));
              return (
                <div
                  key={month.month}
                  className={`teacher-finance-simple__month rounded-2xl border p-3 ${
                    isCurrentMonth
                      ? 'border-violet-200 bg-violet-50/80'
                      : 'border-slate-200 bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-black text-slate-900">{formatMonthLabel(month.month)}</div>
                    {isCurrentMonth ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-violet-700">
                        Сейчас
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xl font-black text-slate-950">{formatMoney(month.grossRevenue)}</div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-500">
                    <span>{formatLessonCount(month.lessonCount)}</span>
                    <span>Получено {formatMoney(month.receivedRevenue)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-violet-100 bg-white px-5 py-10 text-center text-sm text-slate-500 shadow-sm">
          Загружаю доходы по ученикам…
        </div>
      ) : null}

      {!loading && studentRows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-violet-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
          {studentsLoading ? 'Список учеников ещё загружается.' : 'Добавьте ученика, чтобы увидеть доход и окупаемость.'}
        </div>
      ) : null}

      {!loading ? (
        <div className="space-y-3">
          {studentRows.map((student) => {
            const { metrics } = student;
            const lessonPrice = Number(student?.profile?.lessonPrice) || Number(student?.record?.lessonPrice) || 0;
            const saving = savingStudentId === student.id;
            return (
              <Card key={student.id} className="teacher-finance-simple__student border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-slate-950">{student.displayName}</h3>
                        {metrics.commissionAmount > 0 ? (
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${
                            metrics.isPaidBack
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                              : 'border-amber-200 bg-amber-100 text-amber-700'
                          }`}>
                            {metrics.isPaidBack ? 'Комиссия окупилась' : 'Ещё не окупилась'}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                        <span>{formatLessonCount(metrics.lessonCount)}</span>
                        <span>{lessonPrice > 0 ? `${formatMoney(lessonPrice)} за занятие` : 'Стоимость занятия не указана'}</span>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                      <label className="min-w-0 flex-1 lg:w-56">
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Комиссия за ученика</span>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={student.commissionDraft}
                            onChange={(event) => handleCommissionChange(student.id, event.target.value)}
                            placeholder="Например, 15 000"
                            className="teacher-finance-simple__input w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-9 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₽</span>
                        </div>
                      </label>
                      <Button
                        onClick={() => handleSave(student)}
                        disabled={!student.dirty || saving}
                        className="self-end sm:min-w-32"
                      >
                        <Save size={15} />
                        {saving ? 'Сохраняю…' : 'Сохранить'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="teacher-finance-simple__metric rounded-2xl border border-violet-200 bg-violet-50/75 p-3" data-tone="violet">
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">Доход по календарю</div>
                      <div className="mt-1 text-xl font-black text-slate-950">{formatMoney(metrics.grossRevenue)}</div>
                    </div>
                    <div className="teacher-finance-simple__metric rounded-2xl border border-sky-200 bg-sky-50/75 p-3" data-tone="sky">
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-700">Получено</div>
                      <div className="mt-1 text-xl font-black text-slate-950">{formatMoney(metrics.receivedRevenue)}</div>
                    </div>
                    <div className={`teacher-finance-simple__metric rounded-2xl border p-3 ${
                      metrics.netAfterCommission >= 0
                        ? 'border-emerald-200 bg-emerald-50/75'
                        : 'border-amber-200 bg-amber-50/75'
                    }`} data-tone={metrics.netAfterCommission >= 0 ? 'emerald' : 'amber'}>
                      <div className={`text-[10px] font-black uppercase tracking-[0.12em] ${
                        metrics.netAfterCommission >= 0 ? 'text-emerald-700' : 'text-amber-700'
                      }`}>
                        После комиссии
                      </div>
                      <div className="mt-1 text-xl font-black text-slate-950">{formatMoney(metrics.netAfterCommission)}</div>
                    </div>
                    <div className="teacher-finance-simple__metric rounded-2xl border border-slate-200 bg-slate-50/80 p-3" data-tone="slate">
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Окупаемость</div>
                      <div className="mt-1 text-sm font-black text-slate-900">
                        {metrics.commissionAmount <= 0
                          ? 'Введите комиссию'
                          : (metrics.isPaidBack
                            ? `Окупилась на ${formatMoney(Math.max(0, metrics.netAfterCommission))}`
                            : `Осталось ${formatMoney(metrics.remainingToPayback)}`)}
                      </div>
                    </div>
                  </div>

                  {metrics.commissionAmount > 0 ? (
                    <div>
                      <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500">
                        <span>{metrics.isPaidBack ? 'Комиссия полностью окупилась' : 'Прогресс окупаемости'}</span>
                        <span>{metrics.paybackPercent}%</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                        <div
                          className={`h-full rounded-full transition-[width] ${
                            metrics.isPaidBack
                              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                              : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                          }`}
                          style={{ width: `${metrics.paybackPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {metrics.needsLessonPrice ? (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                      <Clock3 size={14} />
                      Укажите стоимость занятия в разделе «Ученики», чтобы доход рассчитался.
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default TeacherFinanceSection;
