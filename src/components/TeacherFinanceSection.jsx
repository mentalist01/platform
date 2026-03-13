import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  RefreshCcw,
  Save,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'debt', label: 'С долгом' },
  { id: 'paid', label: 'Оплачено' },
  { id: 'archived', label: 'Архив' },
];

const toInputValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '';
  return Number.isInteger(num) ? String(num) : String(num);
};

const normalizeNumberInput = (value) => String(value ?? '').replace(',', '.');

const parseNonNegativeNumber = (value) => {
  const normalized = normalizeNumberInput(value).trim();
  if (!normalized) return 0;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100) / 100;
};

const parsePaymentDay = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const num = Math.round(Number(normalized));
  if (!Number.isFinite(num) || num < 1 || num > 31) return null;
  return num;
};

const getCurrentMonthKey = () => new Date().toISOString().slice(0, 7);

const shiftMonth = (monthKey, delta) => {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return getCurrentMonthKey();
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const date = new Date(Date.UTC(year, monthIndex + Number(delta || 0), 1));
  return date.toISOString().slice(0, 7);
};

const formatMonthLabel = (monthKey) => {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return 'Текущий месяц';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

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

const createMonthDraft = (settings = {}) => ({
  otherIncome: toInputValue(settings.otherIncome),
  otherExpenses: toInputValue(settings.otherExpenses),
  incomeGoal: toInputValue(settings.incomeGoal),
  note: typeof settings.note === 'string' ? settings.note : '',
});

const createStudentDraft = (record = {}) => ({
  pricingMode: record.pricingMode === 'monthly' ? 'monthly' : 'perLesson',
  lessonPrice: toInputValue(record.lessonPrice),
  monthlyRate: toInputValue(record.monthlyRate),
  plannedLessons: toInputValue(record.plannedLessons),
  completedLessons: toInputValue(record.completedLessons),
  cancelledLessons: toInputValue(record.cancelledLessons),
  paidAmount: toInputValue(record.paidAmount),
  extraCharge: toInputValue(record.extraCharge),
  discount: toInputValue(record.discount),
  expenses: toInputValue(record.expenses),
  paymentDay: record.paymentDay ? String(record.paymentDay) : '',
  note: typeof record.note === 'string' ? record.note : '',
});

const buildMonthPayload = (draft, month) => ({
  month,
  otherIncome: parseNonNegativeNumber(draft?.otherIncome),
  otherExpenses: parseNonNegativeNumber(draft?.otherExpenses),
  incomeGoal: parseNonNegativeNumber(draft?.incomeGoal),
  note: typeof draft?.note === 'string' ? draft.note.trim() : '',
});

const buildStudentPayload = (draft, month) => ({
  month,
  pricingMode: draft?.pricingMode === 'monthly' ? 'monthly' : 'perLesson',
  lessonPrice: parseNonNegativeNumber(draft?.lessonPrice),
  monthlyRate: parseNonNegativeNumber(draft?.monthlyRate),
  plannedLessons: parseNonNegativeNumber(draft?.plannedLessons),
  completedLessons: parseNonNegativeNumber(draft?.completedLessons),
  cancelledLessons: parseNonNegativeNumber(draft?.cancelledLessons),
  paidAmount: parseNonNegativeNumber(draft?.paidAmount),
  extraCharge: parseNonNegativeNumber(draft?.extraCharge),
  discount: parseNonNegativeNumber(draft?.discount),
  expenses: parseNonNegativeNumber(draft?.expenses),
  paymentDay: parsePaymentDay(draft?.paymentDay),
  note: typeof draft?.note === 'string' ? draft.note.trim() : '',
});

const calculateDraftMetrics = (draft) => {
  const pricingMode = draft?.pricingMode === 'monthly' ? 'monthly' : 'perLesson';
  const lessonPrice = parseNonNegativeNumber(draft?.lessonPrice);
  const monthlyRate = parseNonNegativeNumber(draft?.monthlyRate);
  const plannedLessons = parseNonNegativeNumber(draft?.plannedLessons);
  const completedLessons = parseNonNegativeNumber(draft?.completedLessons);
  const paidAmount = parseNonNegativeNumber(draft?.paidAmount);
  const extraCharge = parseNonNegativeNumber(draft?.extraCharge);
  const discount = parseNonNegativeNumber(draft?.discount);
  const expenses = parseNonNegativeNumber(draft?.expenses);
  const plannedRevenue = pricingMode === 'monthly' ? monthlyRate : lessonPrice * plannedLessons;
  const accruedRevenue = pricingMode === 'monthly' ? monthlyRate : lessonPrice * completedLessons;
  const netAccrued = accruedRevenue + extraCharge - discount - expenses;
  const outstanding = netAccrued - paidAmount;
  const paymentStatus = netAccrued <= 0
    ? 'empty'
    : (outstanding <= 0 ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid'));
  return {
    plannedRevenue,
    accruedRevenue,
    netAccrued,
    outstanding,
    paymentStatus,
  };
};

const isSameDraft = (left, right) => JSON.stringify(left || {}) === JSON.stringify(right || {});

const FinanceMetricCard = ({ title, value, subtitle, icon, tone = 'emerald' }) => {
  const tones = {
    emerald: 'from-emerald-50 to-teal-50 border-emerald-200 text-emerald-700',
    blue: 'from-sky-50 to-blue-50 border-sky-200 text-sky-700',
    amber: 'from-amber-50 to-orange-50 border-amber-200 text-amber-700',
    rose: 'from-rose-50 to-red-50 border-rose-200 text-rose-700',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${tones[tone] || tones.emerald}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">{title}</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</div>
          {subtitle ? <div className="mt-1 text-xs font-medium text-slate-500">{subtitle}</div> : null}
        </div>
        <div className="rounded-2xl bg-white/80 p-2 shadow-sm">
          {icon ? React.createElement(icon, { size: 18 }) : null}
        </div>
      </div>
    </div>
  );
};

const FinanceField = ({ label, hint = '', children }) => (
  <label className="block space-y-1.5">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {hint ? <span className="text-[11px] text-slate-400">{hint}</span> : null}
    </div>
    {children}
  </label>
);

const FinanceInput = ({ ...props }) => (
  <input
    {...props}
    className={`w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 ${props.className || ''}`}
  />
);

const FinanceTextarea = ({ ...props }) => (
  <textarea
    {...props}
    className={`w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 ${props.className || ''}`}
  />
);

const TeacherFinanceSection = ({ teacherId, students, studentsLoading }) => {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [monthDraft, setMonthDraft] = useState(createMonthDraft());
  const [monthBaseline, setMonthBaseline] = useState(createMonthDraft());
  const [studentDrafts, setStudentDrafts] = useState({});
  const [studentBaselines, setStudentBaselines] = useState({});
  const [savingMonth, setSavingMonth] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterId, setFilterId] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const loadSnapshot = async () => {
      setLoading(true);
      try {
        const data = await api.getTeacherFinance(selectedMonth, teacherId);
        if (cancelled) return;
        const nextSnapshot = data && typeof data === 'object' ? data : {};
        const nextMonthDraft = createMonthDraft(nextSnapshot.monthSettings);
        const nextStudentDrafts = {};
        const snapshotStudents = Array.isArray(nextSnapshot.students) ? nextSnapshot.students : [];
        snapshotStudents.forEach((student) => {
          nextStudentDrafts[student.id] = createStudentDraft(student.record);
        });
        setSnapshot(nextSnapshot);
        setMonthDraft(nextMonthDraft);
        setMonthBaseline(nextMonthDraft);
        setStudentDrafts(nextStudentDrafts);
        setStudentBaselines(nextStudentDrafts);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, teacherId]);

  const monthDirty = useMemo(
    () => !isSameDraft(monthDraft, monthBaseline),
    [monthDraft, monthBaseline]
  );

  const studentRows = useMemo(() => {
    const list = Array.isArray(snapshot?.students) ? snapshot.students : [];
    const query = searchQuery.trim().toLowerCase();
    return list
      .map((student) => {
        const draft = studentDrafts[student.id] || createStudentDraft(student.record);
        const metrics = calculateDraftMetrics(draft);
        const dirty = !isSameDraft(draft, studentBaselines[student.id]);
        return {
          ...student,
          draft,
          draftMetrics: metrics,
          dirty,
        };
      })
      .filter((student) => {
        if (filterId === 'debt' && student.draftMetrics.outstanding <= 0) return false;
        if (filterId === 'paid' && student.draftMetrics.paymentStatus !== 'paid') return false;
        if (filterId === 'archived' && !student.deletedAt) return false;
        if (query) {
          const haystack = `${student.displayName} ${student.name} ${student.nickname}`.toLowerCase();
          return haystack.includes(query);
        }
        return true;
      })
      .sort((left, right) => {
        const leftDeleted = Boolean(left.deletedAt);
        const rightDeleted = Boolean(right.deletedAt);
        if (leftDeleted !== rightDeleted) return leftDeleted ? 1 : -1;
        const debtDiff = right.draftMetrics.outstanding - left.draftMetrics.outstanding;
        if (debtDiff !== 0) return debtDiff;
        return left.displayName.localeCompare(right.displayName, 'ru');
      });
  }, [filterId, searchQuery, snapshot?.students, studentBaselines, studentDrafts]);

  const summary = snapshot?.summary || {};
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  const availableMonths = Array.isArray(snapshot?.availableMonths) ? snapshot.availableMonths : [];
  const selectedMonthLabel = formatMonthLabel(selectedMonth);
  const currentStudentsCount = Array.isArray(students) ? students.length : 0;

  const handleMonthFieldChange = (field, value) => {
    setMonthDraft((prev) => ({
      ...prev,
      [field]: field === 'note' ? value : normalizeNumberInput(value),
    }));
  };

  const handleStudentFieldChange = (studentId, field, value) => {
    setStudentDrafts((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [field]: field === 'note' || field === 'pricingMode' ? value : normalizeNumberInput(value),
      },
    }));
  };

  const applySnapshot = (data) => {
    const nextSnapshot = data && typeof data === 'object' ? data : {};
    const nextMonthDraft = createMonthDraft(nextSnapshot.monthSettings);
    const nextStudentDrafts = {};
    (Array.isArray(nextSnapshot.students) ? nextSnapshot.students : []).forEach((student) => {
      nextStudentDrafts[student.id] = createStudentDraft(student.record);
    });
    setSnapshot(nextSnapshot);
    setMonthDraft(nextMonthDraft);
    setMonthBaseline(nextMonthDraft);
    setStudentDrafts(nextStudentDrafts);
    setStudentBaselines(nextStudentDrafts);
  };

  const handleSaveMonth = async () => {
    setSavingMonth(true);
    try {
      const data = await api.updateTeacherFinanceMonth(buildMonthPayload(monthDraft, selectedMonth), teacherId);
      applySnapshot(data);
      setError('');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSavingMonth(false);
    }
  };

  const handleSaveStudent = async (studentId) => {
    const draft = studentDrafts[studentId];
    if (!draft) return;
    setSavingStudentId(studentId);
    try {
      const data = await api.updateTeacherFinanceStudent(studentId, buildStudentPayload(draft, selectedMonth), teacherId);
      applySnapshot(data);
      setError('');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSavingStudentId('');
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await api.getTeacherFinance(selectedMonth, teacherId);
      applySnapshot(data);
      setError('');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/40 to-teal-50/70 shadow-[0_16px_35px_rgba(16,185,129,0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
              <Wallet size={14} />
              Финансы преподавателя
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">{selectedMonthLabel}</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Полный учёт доходов по всем ученикам: сколько занятий прошло, сколько начислено, сколько уже оплачено и какой итог по месяцу.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white/85 px-3 py-1 ring-1 ring-slate-200">
                Ученики в разделе: {summary.studentsCount || currentStudentsCount}
              </span>
              <span className="rounded-full bg-white/85 px-3 py-1 ring-1 ring-slate-200">
                С долгом: {summary.studentsWithDebtCount || 0}
              </span>
              <span className="rounded-full bg-white/85 px-3 py-1 ring-1 ring-slate-200">
                Проведено занятий: {summary.completedLessons || 0}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:max-w-[460px] lg:justify-end">
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white/90 p-2">
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, -1))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                Назад
              </button>
              <FinanceInput
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value || getCurrentMonthKey())}
                className="min-w-[156px] border-transparent bg-transparent px-2 py-2 focus:border-emerald-300"
              />
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, 1))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                Вперёд
              </button>
            </div>
            <Button variant="secondary" onClick={() => setSelectedMonth(getCurrentMonthKey())}>
              <Calendar size={16} />
              Текущий месяц
            </Button>
            <Button variant="secondary" onClick={handleRefresh} disabled={loading}>
              <RefreshCcw size={16} />
              Обновить
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-4">
        <FinanceMetricCard
          title="К начислению"
          value={formatMoney(summary.totalNetAccrued || 0)}
          subtitle={`План: ${formatMoney(summary.plannedRevenue || 0)}`}
          icon={TrendingUp}
          tone="emerald"
        />
        <FinanceMetricCard
          title="Получено"
          value={formatMoney(summary.totalCashflow || 0)}
          subtitle={`Доп. доход: ${formatMoney(summary.otherIncome || 0)}`}
          icon={Wallet}
          tone="blue"
        />
        <FinanceMetricCard
          title="Осталось собрать"
          value={formatMoney(summary.outstanding || 0)}
          subtitle={`Учеников с долгом: ${summary.studentsWithDebtCount || 0}`}
          icon={AlertTriangle}
          tone="rose"
        />
        <FinanceMetricCard
          title="Цель месяца"
          value={summary.incomeGoal ? `${summary.goalProgress || 0}%` : 'Не задана'}
          subtitle={summary.incomeGoal ? formatMoney(summary.incomeGoal) : 'Можно задать ниже'}
          icon={Target}
          tone="amber"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border border-slate-200 bg-white">
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Месяц целиком</div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">Дополнительные доходы, расходы и цель</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Здесь можно вести общий финансовый итог по месяцу: реклама, сервисы, бонусные оплаты, налоги и любые другие внеученические суммы.
                </p>
              </div>
              <Button onClick={handleSaveMonth} disabled={!monthDirty || savingMonth}>
                <Save size={16} />
                {savingMonth ? 'Сохраняю...' : 'Сохранить месяц'}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <FinanceField label="Доп. доход">
                <FinanceInput
                  inputMode="decimal"
                  value={monthDraft.otherIncome}
                  onChange={(e) => handleMonthFieldChange('otherIncome', e.target.value)}
                  placeholder="0"
                />
              </FinanceField>
              <FinanceField label="Расходы месяца">
                <FinanceInput
                  inputMode="decimal"
                  value={monthDraft.otherExpenses}
                  onChange={(e) => handleMonthFieldChange('otherExpenses', e.target.value)}
                  placeholder="0"
                />
              </FinanceField>
              <FinanceField label="Финансовая цель">
                <FinanceInput
                  inputMode="decimal"
                  value={monthDraft.incomeGoal}
                  onChange={(e) => handleMonthFieldChange('incomeGoal', e.target.value)}
                  placeholder="0"
                />
              </FinanceField>
            </div>

            <FinanceField label="Комментарий по месяцу">
              <FinanceTextarea
                rows={4}
                value={monthDraft.note}
                onChange={(e) => handleMonthFieldChange('note', e.target.value)}
                placeholder="Например: оплачен сервис, поступил аванс, были переносы занятий..."
              />
            </FinanceField>
          </div>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">История</div>
              <h3 className="mt-1 text-lg font-bold text-slate-900">Доходы по месяцам</h3>
            </div>
            <div className="space-y-2">
              {history.length > 0 ? history.map((item) => {
                const isActive = item.month === selectedMonth;
                return (
                  <button
                    key={item.month}
                    type="button"
                    onClick={() => setSelectedMonth(item.month)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      isActive
                        ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                        : 'border-slate-200 bg-slate-50/70 hover:border-emerald-200 hover:bg-emerald-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{formatMonthLabel(item.month)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Получено: {formatMoney(item.totalCashflow || 0)}
                        </div>
                      </div>
                      <div className={`text-right text-sm font-bold ${Number(item.outstanding || 0) > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {formatMoney(item.outstanding || 0)}
                        <div className="text-[11px] font-medium text-slate-400">остаток</div>
                      </div>
                    </div>
                  </button>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  История появится после первых сохранённых месяцев.
                </div>
              )}
            </div>
            {availableMonths.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
                Доступные месяцы: {availableMonths.map((item) => formatMonthLabel(item)).join(' • ')}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Ученики</div>
            <h3 className="mt-1 text-lg font-bold text-slate-900">Финансы по каждому ученику</h3>
            <p className="mt-1 text-sm text-slate-500">
              Настраивайте тариф, отмечайте проведённые уроки и фиксируйте фактическую оплату. Все суммы сразу попадают в общую месячную сводку.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[260px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <FinanceInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по ученикам"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilterId(item.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    filterId === item.id
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
          Загружаю финансовый кабинет...
        </div>
      ) : null}

      {!loading && studentRows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
          {studentsLoading
            ? 'Список учеников ещё загружается.'
            : 'По этому фильтру пока ничего нет. Попробуйте другой месяц или сбросьте фильтр.'}
        </div>
      ) : null}

      {!loading && studentRows.length > 0 ? (
        <div className="space-y-4">
          {studentRows.map((student) => {
            const draft = student.draft;
            const metrics = student.draftMetrics;
            const isSaving = savingStudentId === student.id;
            const isMonthlyMode = draft.pricingMode === 'monthly';
            return (
              <Card key={student.id} className="border border-slate-200 bg-white shadow-sm">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-bold text-slate-900">{student.displayName}</div>
                        {student.name && student.nickname && student.nickname !== student.name ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                            {student.name}
                          </span>
                        ) : null}
                        {student.deletedAt ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">
                            Архив
                          </span>
                        ) : null}
                        {student.dirty ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                            Есть изменения
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-3 py-1">
                          {isMonthlyMode ? 'Абонемент' : 'Оплата за занятие'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1">
                          День оплаты: {draft.paymentDay || 'не задан'}
                        </span>
                      </div>
                    </div>

                    <Button onClick={() => handleSaveStudent(student.id)} disabled={!student.dirty || isSaving}>
                      <Save size={16} />
                      {isSaving ? 'Сохраняю...' : 'Сохранить ученика'}
                    </Button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-4">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">Начислено</div>
                      <div className="mt-1 text-xl font-black text-slate-900">{formatMoney(metrics.netAccrued)}</div>
                      <div className="mt-1 text-xs text-slate-500">База: {formatMoney(metrics.accruedRevenue)}</div>
                    </div>
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">Получено</div>
                      <div className="mt-1 text-xl font-black text-slate-900">{formatMoney(parseNonNegativeNumber(draft.paidAmount))}</div>
                      <div className="mt-1 text-xs text-slate-500">План по сумме: {formatMoney(metrics.plannedRevenue)}</div>
                    </div>
                    <div className={`rounded-2xl border p-3 ${metrics.outstanding > 0 ? 'border-rose-200 bg-rose-50/80' : 'border-emerald-200 bg-emerald-50/70'}`}>
                      <div className={`text-[11px] font-bold uppercase tracking-[0.14em] ${metrics.outstanding > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        Остаток
                      </div>
                      <div className="mt-1 text-xl font-black text-slate-900">{formatMoney(metrics.outstanding)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {metrics.paymentStatus === 'paid' ? 'Оплачено полностью' : (metrics.paymentStatus === 'partial' ? 'Оплачено частично' : 'Оплаты пока нет')}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Занятия</div>
                      <div className="mt-1 text-xl font-black text-slate-900">
                        {parseNonNegativeNumber(draft.completedLessons)} / {parseNonNegativeNumber(draft.plannedLessons)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Переносов/отмен: {parseNonNegativeNumber(draft.cancelledLessons)}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="text-sm font-bold text-slate-900">Тариф и уроки</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <FinanceField label="Модель оплаты">
                          <select
                            value={draft.pricingMode}
                            onChange={(e) => handleStudentFieldChange(student.id, 'pricingMode', e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          >
                            <option value="perLesson">За занятие</option>
                            <option value="monthly">Абонемент</option>
                          </select>
                        </FinanceField>
                        <FinanceField label="День оплаты" hint="1-31">
                          <FinanceInput
                            inputMode="numeric"
                            value={draft.paymentDay}
                            onChange={(e) => handleStudentFieldChange(student.id, 'paymentDay', e.target.value)}
                            placeholder="Например, 5"
                          />
                        </FinanceField>
                        <FinanceField label="Стоимость урока" hint={isMonthlyMode ? 'не влияет на расчёт' : 'используется в расчёте'}>
                          <FinanceInput
                            inputMode="decimal"
                            value={draft.lessonPrice}
                            onChange={(e) => handleStudentFieldChange(student.id, 'lessonPrice', e.target.value)}
                            placeholder="0"
                          />
                        </FinanceField>
                        <FinanceField label="Стоимость месяца" hint={isMonthlyMode ? 'используется в расчёте' : 'для шаблона'}>
                          <FinanceInput
                            inputMode="decimal"
                            value={draft.monthlyRate}
                            onChange={(e) => handleStudentFieldChange(student.id, 'monthlyRate', e.target.value)}
                            placeholder="0"
                          />
                        </FinanceField>
                        <FinanceField label="План занятий">
                          <FinanceInput
                            inputMode="decimal"
                            value={draft.plannedLessons}
                            onChange={(e) => handleStudentFieldChange(student.id, 'plannedLessons', e.target.value)}
                            placeholder="0"
                          />
                        </FinanceField>
                        <FinanceField label="Проведено занятий">
                          <FinanceInput
                            inputMode="decimal"
                            value={draft.completedLessons}
                            onChange={(e) => handleStudentFieldChange(student.id, 'completedLessons', e.target.value)}
                            placeholder="0"
                          />
                        </FinanceField>
                        <FinanceField label="Отмены / переносы" hint="не входят в оплату">
                          <FinanceInput
                            inputMode="decimal"
                            value={draft.cancelledLessons}
                            onChange={(e) => handleStudentFieldChange(student.id, 'cancelledLessons', e.target.value)}
                            placeholder="0"
                          />
                        </FinanceField>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="text-sm font-bold text-slate-900">Оплата и корректировки</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <FinanceField label="Получено денег">
                          <FinanceInput
                            inputMode="decimal"
                            value={draft.paidAmount}
                            onChange={(e) => handleStudentFieldChange(student.id, 'paidAmount', e.target.value)}
                            placeholder="0"
                          />
                        </FinanceField>
                        <FinanceField label="Доп. начисление">
                          <FinanceInput
                            inputMode="decimal"
                            value={draft.extraCharge}
                            onChange={(e) => handleStudentFieldChange(student.id, 'extraCharge', e.target.value)}
                            placeholder="0"
                          />
                        </FinanceField>
                        <FinanceField label="Скидка">
                          <FinanceInput
                            inputMode="decimal"
                            value={draft.discount}
                            onChange={(e) => handleStudentFieldChange(student.id, 'discount', e.target.value)}
                            placeholder="0"
                          />
                        </FinanceField>
                        <FinanceField label="Расход по ученику">
                          <FinanceInput
                            inputMode="decimal"
                            value={draft.expenses}
                            onChange={(e) => handleStudentFieldChange(student.id, 'expenses', e.target.value)}
                            placeholder="0"
                          />
                        </FinanceField>
                      </div>
                      <FinanceField label="Заметка по ученику">
                        <FinanceTextarea
                          rows={4}
                          value={draft.note}
                          onChange={(e) => handleStudentFieldChange(student.id, 'note', e.target.value)}
                          placeholder="Например: оплатил частями, был отпуск, добавлены пробники..."
                        />
                      </FinanceField>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      <Card className="border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Users size={16} />
              Активные ученики
            </div>
            <div className="mt-2 text-3xl font-black">{summary.activeStudentsCount || currentStudentsCount || 0}</div>
            <div className="mt-1 text-xs text-slate-300">Количество действующих учеников в кабинете.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Calendar size={16} />
              Нагрузка месяца
            </div>
            <div className="mt-2 text-3xl font-black">{summary.completedLessons || 0}</div>
            <div className="mt-1 text-xs text-slate-300">
              Из запланированных {summary.plannedLessons || 0} занятий.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              {Number(summary.otherExpenses || 0) > 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
              Прочие операции
            </div>
            <div className="mt-2 text-3xl font-black">
              {formatMoney((summary.otherIncome || 0) - (summary.otherExpenses || 0))}
            </div>
            <div className="mt-1 text-xs text-slate-300">
              Доходы: {formatMoney(summary.otherIncome || 0)} · Расходы: {formatMoney(summary.otherExpenses || 0)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TeacherFinanceSection;
