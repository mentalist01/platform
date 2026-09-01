import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calculator,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  Save,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { api } from '../services/api';
import {
  calculateTeacherCommissionPaybackSummary,
  calculateTeacherIncomeScenario,
  countCurrentTeacherStudents,
  getTeacherFinanceCurrentMonthKey,
  shiftTeacherFinanceMonthKey,
} from '../utils/teacherFinanceCalculations';
import { isCurrentStudent } from '../utils/studentStudyStatus';
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

const normalizeNumberInput = (value) => {
  const sanitized = String(value ?? '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');
  const decimalIndex = sanitized.indexOf('.');
  if (decimalIndex < 0) return sanitized;
  return `${sanitized.slice(0, decimalIndex + 1)}${sanitized.slice(decimalIndex + 1).replace(/\./g, '')}`;
};

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

const formatDecimal = (value, maximumFractionDigits = 1) => new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits,
}).format(Math.max(0, Number(value) || 0));

const formatWorkingDayCount = (value) => {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14
    ? 'рабочих дней'
    : (mod10 === 1 ? 'рабочий день' : (mod10 >= 2 && mod10 <= 4 ? 'рабочих дня' : 'рабочих дней'));
  return `${count} ${word}`;
};

const normalizeCalendarPlanMetric = (value, fallback = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    revenue: Math.max(0, Number(source.revenue ?? fallback.revenue) || 0),
    lessonCount: Math.max(0, Math.floor(Number(source.lessonCount ?? fallback.lessonCount) || 0)),
    hours: Math.max(0, Number(source.hours ?? fallback.hours) || 0),
    workingDayCount: Math.max(0, Math.floor(Number(source.workingDayCount ?? fallback.workingDayCount) || 0)),
  };
};

const SCHEDULE_WEEKDAY_META = [
  { order: 1, label: 'Пн', aliases: ['monday', 'mon', 'понедельник', 'пн'] },
  { order: 2, label: 'Вт', aliases: ['tuesday', 'tue', 'вторник', 'вт'] },
  { order: 3, label: 'Ср', aliases: ['wednesday', 'wed', 'среда', 'ср'] },
  { order: 4, label: 'Чт', aliases: ['thursday', 'thu', 'четверг', 'чт'] },
  { order: 5, label: 'Пт', aliases: ['friday', 'fri', 'пятница', 'пт'] },
  { order: 6, label: 'Сб', aliases: ['saturday', 'sat', 'суббота', 'сб'] },
  { order: 7, label: 'Вс', aliases: ['sunday', 'sun', 'воскресенье', 'вс'] },
];

const normalizeScheduleWeekday = (value) => {
  const raw = String(value || '').trim();
  const normalized = raw.toLocaleLowerCase('ru-RU').replace(/\.$/u, '');
  const match = SCHEDULE_WEEKDAY_META.find((item) => item.aliases.includes(normalized));
  return {
    label: match?.label || raw || 'День',
    order: match?.order || 99,
  };
};

const normalizeCurrentStudentsSummary = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const normalizedStudents = (Array.isArray(source.students) ? source.students : [])
    .map((student, index) => {
      const scheduleSlots = (Array.isArray(student?.scheduleSlots) ? student.scheduleSlots : [])
        .map((slot) => {
          const weekday = normalizeScheduleWeekday(slot?.weekday ?? slot?.weekdayKey);
          const reportedWeekdayOrder = Number(slot?.weekdayOrder);
          const weekdayOrder = Number.isInteger(reportedWeekdayOrder)
            && reportedWeekdayOrder >= 1
            && reportedWeekdayOrder <= 7
            ? reportedWeekdayOrder
            : weekday.order;
          const weekdayLabel = SCHEDULE_WEEKDAY_META.find((item) => item.order === weekdayOrder)?.label
            || weekday.label;
          return {
            dayKey: String(slot?.dayKey || '').trim(),
            weekday: weekdayLabel,
            weekdayOrder,
            time: String(slot?.time || '').trim(),
            durationMinutes: Math.max(0, Math.round(Number(slot?.durationMinutes) || 0)),
          };
        })
        .sort((left, right) => (
          (left.weekdayOrder - right.weekdayOrder)
          || left.time.localeCompare(right.time, 'ru')
        ));
      const lessonCountRaw = Number(student?.lessonCountPerWeek);
      const hoursRaw = Number(student?.hoursPerWeek);
      const lessonCountPerWeek = Number.isFinite(lessonCountRaw) && lessonCountRaw >= 0
        ? lessonCountRaw
        : scheduleSlots.length;
      const hoursPerWeek = Number.isFinite(hoursRaw) && hoursRaw >= 0
        ? hoursRaw
        : scheduleSlots.reduce((total, slot) => total + (slot.durationMinutes / 60), 0);
      return {
        studentId: String(student?.studentId || '').trim(),
        name: String(student?.name || '').trim() || 'Ученик',
        lessonCountPerWeek,
        hoursPerWeek,
        scheduleSlots,
        fallbackKey: `calendar-student-${index}`,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'ru', { sensitivity: 'base' }));
  const reportedStudentCount = Number(source.studentCount);
  const reportedLessonCount = Number(source.weeklyLessonCount);
  const reportedHours = Number(source.weeklyHours);
  return {
    weekStartDayKey: String(source.weekStartDayKey || '').trim(),
    weekEndDayKey: String(source.weekEndDayKey || '').trim(),
    studentCount: Number.isFinite(reportedStudentCount) && reportedStudentCount >= 0
      ? Math.floor(reportedStudentCount)
      : normalizedStudents.length,
    weeklyLessonCount: Number.isFinite(reportedLessonCount) && reportedLessonCount >= 0
      ? reportedLessonCount
      : normalizedStudents.reduce((total, student) => total + student.lessonCountPerWeek, 0),
    weeklyHours: Number.isFinite(reportedHours) && reportedHours >= 0
      ? reportedHours
      : normalizedStudents.reduce((total, student) => total + student.hoursPerWeek, 0),
    students: normalizedStudents,
  };
};

const formatMonthLabel = (monthKey) => {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return 'Без месяца';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(' г.', '');
};

const formatCalendarWeekRange = (startDayKey, endDayKey) => {
  const parseDayKey = (value) => {
    const normalized = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
    const date = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const startDate = parseDayKey(startDayKey);
  const endDate = parseDayKey(endDayKey);
  if (!startDate || !endDate) return '';
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();
  const dayMonth = (date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (sameMonth) return `${startDate.getDate()}–${dayMonth(endDate)}`;
  if (sameYear) return `${dayMonth(startDate)} — ${dayMonth(endDate)}`;
  return `${startDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} — ${endDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
};

const formatCalendarPlanLessonDate = (dayKey) => {
  const match = String(dayKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'Дата не указана';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return date.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
};

const normalizeCalendarPlanUnpricedLessons = (value) => (
  (Array.isArray(value) ? value : [])
    .map((lesson, index) => {
      const studentId = String(lesson?.studentId || '').trim();
      const dayKey = String(lesson?.dayKey || '').trim();
      if (!studentId || !dayKey) return null;
      return {
        occurrenceKey: String(lesson?.occurrenceKey || '').trim()
          || `${studentId}:${dayKey}:${lesson?.time || ''}:${index}`,
        studentId,
        studentName: String(lesson?.studentName || '').trim() || 'Ученик',
        subject: String(lesson?.subject || '').trim(),
        dayKey,
        time: String(lesson?.time || '').trim(),
        durationMinutes: Math.max(0, Math.round(Number(lesson?.durationMinutes) || 0)),
        status: lesson?.status === 'completed' ? 'completed' : 'remaining',
      };
    })
    .filter(Boolean)
);

const groupCalendarPlanUnpricedLessons = (lessons) => {
  const groupsByStudentId = new Map();
  lessons.forEach((lesson) => {
    const current = groupsByStudentId.get(lesson.studentId) || {
      studentId: lesson.studentId,
      studentName: lesson.studentName,
      lessons: [],
    };
    current.lessons.push(lesson);
    groupsByStudentId.set(lesson.studentId, current);
  });
  return Array.from(groupsByStudentId.values()).sort((left, right) => (
    left.studentName.localeCompare(right.studentName, 'ru', { sensitivity: 'base', numeric: true })
  ));
};

const getStudentProfitability = (student, commissionDraft) => {
  const profitability = student?.profitability && typeof student.profitability === 'object'
    ? student.profitability
    : {};
  const commissionAmount = parseAmount(commissionDraft);
  const lessonCount = Math.max(0, Math.floor(Number(profitability.lessonCount) || 0));
  const grossRevenue = Math.max(0, Number(profitability.grossRevenue) || 0);
  const receivedRevenue = Math.max(0, Number(profitability.receivedRevenue) || 0);
  const availableCredit = Math.max(0, Number(student?.availableCredit) || 0);
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
    availableCredit,
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
    amber: 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-700',
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

const TeacherFinanceSection = ({ teacherId, students = [], studentsLoading }) => {
  const [snapshot, setSnapshot] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => getTeacherFinanceCurrentMonthKey());
  const [commissionDrafts, setCommissionDrafts] = useState({});
  const [commissionBaselines, setCommissionBaselines] = useState({});
  const [lessonPriceDrafts, setLessonPriceDrafts] = useState({});
  const [lessonPriceErrors, setLessonPriceErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState('');
  const [savingLessonPriceStudentId, setSavingLessonPriceStudentId] = useState('');
  const [error, setError] = useState('');
  const [calculatorStudents, setCalculatorStudents] = useState('');
  const [calculatorLessonsPerWeek, setCalculatorLessonsPerWeek] = useState('1');
  const [calculatorHourlyRate, setCalculatorHourlyRate] = useState('2000');
  const [calculatorWorkingDays, setCalculatorWorkingDays] = useState('5');
  const financeLoadedRef = useRef(false);

  const applySnapshot = (data) => {
    const nextSnapshot = data && typeof data === 'object' ? data : {};
    const drafts = {};
    const priceDrafts = {};
    (Array.isArray(nextSnapshot.students) ? nextSnapshot.students : []).forEach((student) => {
      drafts[student.id] = toInputValue(student?.profile?.commissionAmount);
      const recordPrice = Number(student?.record?.lessonPrice);
      const profilePrice = Number(student?.profile?.lessonPrice);
      priceDrafts[student.id] = toInputValue(
        Number.isFinite(recordPrice) && recordPrice > 0 ? recordPrice : profilePrice
      );
    });
    setSnapshot(nextSnapshot);
    setCommissionDrafts(drafts);
    setCommissionBaselines(drafts);
    setLessonPriceDrafts(priceDrafts);
    setLessonPriceErrors({});
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (financeLoadedRef.current) setMonthLoading(true);
      else setLoading(true);
      try {
        const data = await api.getTeacherFinance(selectedMonth, teacherId);
        if (cancelled) return;
        applySnapshot(data);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      } finally {
        if (!cancelled) {
          financeLoadedRef.current = true;
          setLoading(false);
          setMonthLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, teacherId]);

  const studentRows = useMemo(() => (
    (Array.isArray(snapshot?.students) ? snapshot.students : [])
      .filter(isCurrentStudent)
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
    acc.availableCredit += student.metrics.availableCredit;
    acc.commissionAmount += student.metrics.commissionAmount;
    acc.netAfterCommission += student.metrics.netAfterCommission;
    return acc;
  }, {
    lessonCount: 0,
    grossRevenue: 0,
    receivedRevenue: 0,
    availableCredit: 0,
    commissionAmount: 0,
    netAfterCommission: 0,
  }), [studentRows]);
  const commissionPaybackSummary = useMemo(
    () => calculateTeacherCommissionPaybackSummary(studentRows),
    [studentRows]
  );
  const commissionRemainingHint = commissionPaybackSummary.studentCount === 0
    ? 'Комиссии пока не указаны'
    : (commissionPaybackSummary.remainingStudentCount > 0
      ? `${formatStudentCount(commissionPaybackSummary.remainingStudentCount)} с остатком`
      : 'Все комиссии окупились');

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

  const rosterCurrentStudentCount = useMemo(() => countCurrentTeacherStudents(students), [students]);
  const nestedCurrentStudentsSummary = snapshot?.calendarPlan?.currentStudentsSummary;
  const topLevelCurrentStudentsSummary = snapshot?.currentStudentsSummary;
  const hasCurrentStudentsSummary = Boolean(
    (nestedCurrentStudentsSummary && typeof nestedCurrentStudentsSummary === 'object')
    || (topLevelCurrentStudentsSummary && typeof topLevelCurrentStudentsSummary === 'object')
  );
  const currentStudentsSummary = normalizeCurrentStudentsSummary(
    nestedCurrentStudentsSummary && typeof nestedCurrentStudentsSummary === 'object'
      ? nestedCurrentStudentsSummary
      : topLevelCurrentStudentsSummary
  );
  const currentStudentCount = hasCurrentStudentsSummary
    ? currentStudentsSummary.studentCount
    : rosterCurrentStudentCount;
  const currentCalendarWeekRange = formatCalendarWeekRange(
    currentStudentsSummary.weekStartDayKey,
    currentStudentsSummary.weekEndDayKey
  );

  useEffect(() => {
    if (loading || studentsLoading) return;
    setCalculatorStudents((current) => current || String(
      hasCurrentStudentsSummary ? currentStudentCount : (currentStudentCount || 10)
    ));
  }, [currentStudentCount, hasCurrentStudentsSummary, loading, studentsLoading]);

  const currentMonthKey = String(snapshot?.month || '').trim();
  const currentMonthIncome = incomeByMonth.find((item) => item.month === currentMonthKey) || {
    month: currentMonthKey,
    lessonCount: 0,
    grossRevenue: 0,
    receivedRevenue: 0,
  };
  const rawCalendarPlan = snapshot?.calendarPlan && typeof snapshot.calendarPlan === 'object'
    ? snapshot.calendarPlan
    : {};
  const calendarPlanMonthKey = String(rawCalendarPlan.month || currentMonthKey).trim();
  const calendarPlanActual = normalizeCalendarPlanMetric(rawCalendarPlan.actual, {
    revenue: currentMonthIncome.grossRevenue,
    lessonCount: currentMonthIncome.lessonCount,
  });
  const calendarPlanRemaining = normalizeCalendarPlanMetric(rawCalendarPlan.remaining);
  const calendarPlanTotal = normalizeCalendarPlanMetric(rawCalendarPlan.total, {
    revenue: calendarPlanActual.revenue + calendarPlanRemaining.revenue,
    lessonCount: calendarPlanActual.lessonCount + calendarPlanRemaining.lessonCount,
    hours: calendarPlanActual.hours + calendarPlanRemaining.hours,
    workingDayCount: calendarPlanActual.workingDayCount + calendarPlanRemaining.workingDayCount,
  });
  const calendarPlanCompletionPercent = Math.max(
    0,
    Math.min(100, Math.round(Number(rawCalendarPlan.completionPercent) || 0))
  );
  const calendarPlanAverageHours = Math.max(0, Number(rawCalendarPlan.averageHoursPerWorkingDay) || 0);
  const calendarPlanStudentCount = Math.max(0, Math.floor(Number(rawCalendarPlan.studentCount) || 0));
  const calendarPlanUnpricedLessonCount = Math.max(
    0,
    Math.floor(Number(rawCalendarPlan.unpricedLessonCount) || 0)
  );
  const calendarPlanUnpricedStudentCount = Math.max(
    0,
    Math.floor(Number(rawCalendarPlan.unpricedStudentCount) || 0)
  );
  const calendarPlanUnpricedStudentGroups = groupCalendarPlanUnpricedLessons(
    normalizeCalendarPlanUnpricedLessons(rawCalendarPlan.unpricedLessons)
  );
  const calendarPlanMonthLabel = formatMonthLabel(calendarPlanMonthKey).toLowerCase();
  const calendarPlanMonthName = calendarPlanMonthLabel
    .replace(/\s+\d{4}$/u, '')
    .trim();
  const calendarPlanTotalValue = `${calendarPlanUnpricedLessonCount > 0 ? 'от ' : ''}${formatMoney(calendarPlanTotal.revenue)}`;
  const currentCalendarMonthKey = getTeacherFinanceCurrentMonthKey();
  const isCurrentCalendarMonth = selectedMonth === currentCalendarMonthKey;
  const incomeScenario = calculateTeacherIncomeScenario({
    studentCount: calculatorStudents,
    lessonsPerWeek: calculatorLessonsPerWeek,
    hourlyRate: calculatorHourlyRate,
    workingDaysPerWeek: calculatorWorkingDays,
  });
  const calculatorStudentPresets = Array.from(new Set([
    currentStudentCount,
    10,
    15,
    20,
    30,
  ])).filter((count) => count > 0);

  const moveCalendarMonth = (offset) => {
    const nextMonth = shiftTeacherFinanceMonthKey(selectedMonth, offset);
    if (nextMonth) setSelectedMonth(nextMonth);
  };

  const handleCommissionChange = (studentId, value) => {
    setCommissionDrafts((prev) => ({
      ...prev,
      [studentId]: normalizeNumberInput(value),
    }));
    setError('');
  };

  const handleLessonPriceChange = (studentId, value) => {
    setLessonPriceDrafts((current) => ({
      ...current,
      [studentId]: normalizeNumberInput(value),
    }));
    setLessonPriceErrors((current) => ({ ...current, [studentId]: '' }));
  };

  const handleSaveLessonPrice = async (studentId) => {
    const lessonPrice = parseAmount(lessonPriceDrafts[studentId]);
    if (lessonPrice <= 0) {
      setLessonPriceErrors((current) => ({
        ...current,
        [studentId]: 'Укажите стоимость больше нуля.',
      }));
      return;
    }
    setSavingLessonPriceStudentId(studentId);
    setLessonPriceErrors((current) => ({ ...current, [studentId]: '' }));
    try {
      const data = await api.updateTeacherFinanceStudent(
        studentId,
        {
          month: calendarPlanMonthKey || snapshot?.month || new Date().toISOString().slice(0, 7),
          lessonPrice,
        },
        teacherId
      );
      applySnapshot(data);
      setError('');
    } catch (err) {
      setLessonPriceErrors((current) => ({
        ...current,
        [studentId]: err?.message || String(err),
      }));
    } finally {
      setSavingLessonPriceStudentId('');
    }
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
            {formatStudentCount(currentStudentCount)}
          </div>
        </div>

        {!loading ? (
          <div className={`mt-5 grid gap-3 md:grid-cols-2 ${
            totals.availableCredit > 0 ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
          }`}>
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
            <SummaryMetric
              icon={CircleDollarSign}
              label="Осталось по комиссиям"
              value={formatMoney(commissionPaybackSummary.remainingCommission)}
              hint={commissionRemainingHint}
              tone="amber"
            />
            <SummaryMetric
              icon={CalendarClock}
              label={`План на ${calendarPlanMonthName || 'текущий месяц'}`}
              value={calendarPlanTotalValue}
              hint={calendarPlanTotal.lessonCount > 0
                ? `${formatLessonCount(calendarPlanTotal.lessonCount)} · ${formatDecimal(calendarPlanTotal.hours)} ч по календарю`
                : 'В календаре пока нет занятий'}
              tone="amber"
            />
            {totals.availableCredit > 0 ? (
              <SummaryMetric
                icon={WalletCards}
                label="Аванс учеников"
                value={formatMoney(totals.availableCredit)}
                hint="Доступен для следующих занятий"
                tone="emerald"
              />
            ) : null}
          </div>
        ) : null}
      </Card>

      {!loading ? (
        <Card className="teacher-finance-simple__calendar-plan overflow-hidden border border-sky-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="teacher-finance-simple__calendar-plan-icon rounded-2xl border border-sky-200 bg-sky-50 p-2.5 text-sky-700">
                <CalendarClock size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-700">План по календарю</div>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  План начислений на {calendarPlanMonthLabel || 'текущий месяц'}
                </h3>
                <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">
                  Реальные занятия и ставки учеников — без экстраполяции по среднему темпу.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="teacher-finance-simple__month-picker inline-flex items-center rounded-2xl border border-sky-200 bg-sky-50 p-1 text-sky-700 shadow-sm">
                <button
                  type="button"
                  onClick={() => moveCalendarMonth(-1)}
                  disabled={monthLoading}
                  className="grid h-8 w-8 place-items-center rounded-xl transition hover:bg-white disabled:cursor-wait disabled:opacity-50"
                  aria-label="Предыдущий месяц"
                  title="Предыдущий месяц"
                >
                  <ChevronLeft size={17} />
                </button>
                <label className="relative inline-flex h-8 min-w-[156px] items-center justify-center gap-2 rounded-xl bg-white px-2 text-xs font-black text-sky-800">
                  {monthLoading ? <LoaderCircle size={14} className="animate-spin" /> : <CalendarDays size={14} />}
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => {
                      if (/^\d{4}-\d{2}$/.test(event.target.value)) setSelectedMonth(event.target.value);
                    }}
                    disabled={monthLoading}
                    className="min-w-0 border-0 bg-transparent text-xs font-black text-sky-800 outline-none disabled:cursor-wait"
                    aria-label="Выбрать месяц финансового плана"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => moveCalendarMonth(1)}
                  disabled={monthLoading}
                  className="grid h-8 w-8 place-items-center rounded-xl transition hover:bg-white disabled:cursor-wait disabled:opacity-50"
                  aria-label="Следующий месяц"
                  title="Следующий месяц"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
              {!isCurrentCalendarMonth ? (
                <button
                  type="button"
                  onClick={() => setSelectedMonth(currentCalendarMonthKey)}
                  disabled={monthLoading}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-violet-700 transition hover:bg-violet-100 disabled:cursor-wait disabled:opacity-50"
                >
                  Текущий месяц
                </button>
              ) : null}
              <span className="teacher-finance-simple__calendar-plan-badge inline-flex h-10 w-fit items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-sky-700">
                По расписанию
              </span>
            </div>
          </div>

          {calendarPlanTotal.lessonCount > 0 ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.18fr)]">
              <div className="teacher-finance-simple__calendar-plan-hero flex min-w-0 flex-col justify-between rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-600 via-blue-600 to-violet-600 p-5 text-white shadow-[0_16px_34px_rgba(37,99,235,0.2)]" aria-live="polite">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-100">
                    Ожидаемые начисления к концу месяца
                  </div>
                  <output className="mt-2 block text-3xl font-black tracking-tight sm:text-4xl">
                    {calendarPlanTotalValue}
                  </output>
                  <div className="mt-2 text-xs font-semibold text-sky-100/85">
                    {formatMoney(calendarPlanActual.revenue)} начислено + {formatMoney(calendarPlanRemaining.revenue)} впереди
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 text-xs font-semibold text-sky-50/90">
                  <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15">
                    <span className="block text-[9px] uppercase tracking-[0.1em] text-sky-100/75">Всего занятий</span>
                    <strong className="mt-0.5 block text-sm text-white">{formatLessonCount(calendarPlanTotal.lessonCount)}</strong>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15">
                    <span className="block text-[9px] uppercase tracking-[0.1em] text-sky-100/75">Часов в месяце</span>
                    <strong className="mt-0.5 block text-sm text-white">{formatDecimal(calendarPlanTotal.hours)} ч</strong>
                  </div>
                </div>
              </div>

              <div className="teacher-finance-simple__calendar-plan-details min-w-0 rounded-3xl border border-slate-200 bg-slate-50/75 p-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="teacher-finance-simple__calendar-plan-stat rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3" data-tone="emerald">
                    <div className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">Уже начислено</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{formatMoney(calendarPlanActual.revenue)}</div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                      {formatLessonCount(calendarPlanActual.lessonCount)} · {formatDecimal(calendarPlanActual.hours)} ч
                    </div>
                  </div>
                  <div className="teacher-finance-simple__calendar-plan-stat rounded-2xl border border-sky-200 bg-sky-50/80 p-3" data-tone="sky">
                    <div className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-700">Осталось по плану</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{formatMoney(calendarPlanRemaining.revenue)}</div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                      {formatLessonCount(calendarPlanRemaining.lessonCount)} · {formatDecimal(calendarPlanRemaining.hours)} ч
                    </div>
                  </div>
                  <div className="teacher-finance-simple__calendar-plan-stat rounded-2xl border border-violet-200 bg-violet-50/80 p-3" data-tone="violet">
                    <div className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-700">Нагрузка</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{formatWorkingDayCount(calendarPlanTotal.workingDayCount)}</div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                      ≈ {formatDecimal(calendarPlanAverageHours)} ч в рабочий день
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
                    <span>Проведено {calendarPlanActual.lessonCount} из {calendarPlanTotal.lessonCount}</span>
                    <span>{calendarPlanCompletionPercent}%</span>
                  </div>
                  <div className="teacher-finance-simple__calendar-plan-progress mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-500 transition-[width]"
                      style={{ width: `${calendarPlanCompletionPercent}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
                    <span>Участники месяца: {formatStudentCount(calendarPlanStudentCount)}</span>
                    <span>{formatWorkingDayCount(calendarPlanRemaining.workingDayCount)} впереди</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="teacher-finance-simple__calendar-plan-empty mt-5 rounded-3xl border border-dashed border-sky-200 bg-sky-50/55 px-5 py-8 text-center">
              <CalendarDays className="mx-auto text-sky-500" size={24} />
              <div className="mt-3 text-sm font-black text-slate-900">На {calendarPlanMonthName || 'текущий месяц'} пока нет занятий</div>
              <p className="mt-1 text-xs font-medium text-slate-500">Добавьте занятия в календарь — план появится автоматически.</p>
            </div>
          )}

          {calendarPlanUnpricedLessonCount > 0 ? (
            <div className="teacher-finance-simple__calendar-plan-warning mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div>
                  <div className="text-xs font-black">
                    В сумму не вошло {formatLessonCount(calendarPlanUnpricedLessonCount)} без указанной стоимости.
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-relaxed text-amber-700">
                    Стоимость не заполнена для {formatStudentCount(calendarPlanUnpricedStudentCount)}. Итог показан как минимальный.
                  </p>
                </div>
                <span className="w-fit shrink-0 rounded-full border border-amber-300 bg-white/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-amber-700">
                  Нужна стоимость
                </span>
              </div>

              {calendarPlanUnpricedStudentGroups.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {calendarPlanUnpricedStudentGroups.map((group) => {
                    const savingLessonPrice = savingLessonPriceStudentId === group.studentId;
                    const lessonPriceError = lessonPriceErrors[group.studentId] || '';
                    return (
                      <div
                        key={group.studentId}
                        className="teacher-finance-simple__unpriced-student rounded-xl border border-amber-200 bg-white/75 p-3"
                      >
                        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,auto)] xl:items-end">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-black text-slate-950">{group.studentName}</div>
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-amber-700">
                                {formatLessonCount(group.lessons.length)}
                              </span>
                            </div>
                            <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                              {group.lessons.map((lesson) => {
                                const normalizedSubject = lesson.subject.toLocaleLowerCase('ru-RU');
                                const normalizedStudentName = group.studentName.toLocaleLowerCase('ru-RU');
                                const lessonTitle = lesson.subject && normalizedSubject !== normalizedStudentName
                                  ? lesson.subject
                                  : 'Занятие';
                                return (
                                  <div
                                    key={lesson.occurrenceKey}
                                    className="teacher-finance-simple__unpriced-lesson rounded-lg border border-amber-100 bg-amber-50/65 px-2.5 py-2"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-[11px] font-black text-slate-900">{lessonTitle}</span>
                                      <span className={`text-[9px] font-black uppercase tracking-[0.08em] ${
                                        lesson.status === 'completed' ? 'text-emerald-700' : 'text-sky-700'
                                      }`}>
                                        {lesson.status === 'completed' ? 'Проведено' : 'По плану'}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-slate-500">
                                      <span className="inline-flex items-center gap-1">
                                        <CalendarDays size={11} />
                                        {formatCalendarPlanLessonDate(lesson.dayKey)}
                                      </span>
                                      {lesson.time ? <span>{lesson.time}</span> : null}
                                      {lesson.durationMinutes > 0 ? <span>{lesson.durationMinutes} мин</span> : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end xl:min-w-[420px]">
                            <label className="min-w-0 flex-1">
                              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-amber-700">
                                Стоимость занятия
                              </span>
                              <div className="relative">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={lessonPriceDrafts[group.studentId] ?? ''}
                                  onChange={(event) => handleLessonPriceChange(group.studentId, event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      handleSaveLessonPrice(group.studentId);
                                    }
                                  }}
                                  placeholder="Например, 2 000"
                                  aria-label={`Стоимость занятия для ${group.studentName}`}
                                  aria-invalid={Boolean(lessonPriceError)}
                                  className="teacher-finance-simple__input w-full rounded-xl border border-amber-200 bg-white py-2.5 pl-3 pr-9 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                                />
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₽</span>
                              </div>
                            </label>
                            <Button
                              type="button"
                              onClick={() => handleSaveLessonPrice(group.studentId)}
                              disabled={savingLessonPrice}
                              className="shrink-0 sm:min-w-48"
                            >
                              <CircleDollarSign size={15} />
                              {savingLessonPrice ? 'Сохраняю…' : 'Указать стоимость'}
                            </Button>
                          </div>
                        </div>
                        {lessonPriceError ? (
                          <p className="mt-2 text-[11px] font-bold text-rose-600" role="alert">{lessonPriceError}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="mt-4 text-[11px] font-medium leading-relaxed text-slate-500">
            Будущие занятия считаются только для текущих учеников. Пробные, отменённые и события без ученика не учитываются. Это план начислений; фактические оплаты отмечаются отдельно.
          </p>
        </Card>
      ) : null}

      {!loading ? (
        <Card className="teacher-finance-simple__students-overview overflow-hidden border border-emerald-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="teacher-finance-simple__students-overview-icon rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-700">
                <Users size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                  Текущая неделя · пн–вс{currentCalendarWeekRange ? ` · ${currentCalendarWeekRange}` : ''}
                </div>
                <h3 className="mt-1 text-lg font-black text-slate-950">Ученики по календарю</h3>
                <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-500">
                  Только текущие ученики, у которых есть занятие на этой неделе. Выпускники и пробные события не входят.
                </p>
              </div>
            </div>

            <dl className="teacher-finance-simple__students-overview-totals grid w-full grid-cols-3 gap-2 xl:w-auto xl:min-w-[430px]">
              <div className="teacher-finance-simple__students-overview-total rounded-2xl border border-emerald-200 bg-emerald-50/75 px-3 py-2.5" data-tone="emerald">
                <dt className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700">Учеников</dt>
                <dd className="mt-0.5 text-lg font-black text-slate-950">{formatDecimal(currentStudentsSummary.studentCount, 0)}</dd>
              </div>
              <div className="teacher-finance-simple__students-overview-total rounded-2xl border border-sky-200 bg-sky-50/75 px-3 py-2.5" data-tone="sky">
                <dt className="text-[9px] font-black uppercase tracking-[0.1em] text-sky-700">Занятий</dt>
                <dd className="mt-0.5 text-lg font-black text-slate-950">{formatDecimal(currentStudentsSummary.weeklyLessonCount)}</dd>
              </div>
              <div className="teacher-finance-simple__students-overview-total rounded-2xl border border-violet-200 bg-violet-50/75 px-3 py-2.5" data-tone="violet">
                <dt className="text-[9px] font-black uppercase tracking-[0.1em] text-violet-700">Часов</dt>
                <dd className="mt-0.5 text-lg font-black text-slate-950">{formatDecimal(currentStudentsSummary.weeklyHours)} ч</dd>
              </div>
            </dl>
          </div>

          {currentStudentsSummary.students.length > 0 ? (
            <ul className="mt-4 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {currentStudentsSummary.students.map((student) => {
                const visibleSlots = student.scheduleSlots.slice(0, 4);
                const hiddenSlotCount = Math.max(0, student.scheduleSlots.length - visibleSlots.length);
                return (
                  <li
                    key={student.studentId || student.fallbackKey}
                    className="teacher-finance-simple__student-week-row min-w-0 rounded-2xl border border-slate-200 bg-slate-50/75 p-3"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="teacher-finance-simple__student-week-avatar grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-200 bg-emerald-100 text-sm font-black text-emerald-700">
                          {student.name.charAt(0).toLocaleUpperCase('ru-RU')}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-slate-950" title={student.name}>{student.name}</div>
                          <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                            {formatLessonCount(student.lessonCountPerWeek)} на неделе · {formatDecimal(student.hoursPerWeek)} ч
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex min-h-6 flex-wrap items-center gap-1.5">
                      {visibleSlots.length > 0 ? visibleSlots.map((slot, slotIndex) => (
                        <span
                          key={`${slot.weekday}-${slot.time}-${slot.durationMinutes}-${slotIndex}`}
                          className="teacher-finance-simple__student-week-slot inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
                        >
                          <CalendarDays size={11} />
                          {slot.weekday}{slot.time ? ` ${slot.time}` : ''}
                          {slot.durationMinutes > 0 && slot.durationMinutes !== 60 ? ` · ${slot.durationMinutes} мин` : ''}
                        </span>
                      )) : (
                        <span className="text-[10px] font-semibold text-slate-400">Время занятий не указано</span>
                      )}
                      {hiddenSlotCount > 0 ? (
                        <span className="teacher-finance-simple__student-week-more rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                          +{hiddenSlotCount}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="teacher-finance-simple__students-overview-empty mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/55 px-5 py-7 text-center">
              <CalendarDays className="mx-auto text-emerald-500" size={22} />
              <div className="mt-2 text-sm font-black text-slate-900">На этой неделе занятий с текущими учениками нет</div>
              <p className="mt-1 text-xs font-medium text-slate-500">Сводка обновится автоматически, когда занятия появятся в календаре.</p>
            </div>
          )}
        </Card>
      ) : null}

      {!loading ? (
        <Card className="teacher-finance-simple__calculator overflow-hidden border border-violet-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] xl:items-stretch">
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <div className="teacher-finance-simple__calculator-icon rounded-2xl border border-violet-200 bg-violet-50 p-2.5 text-violet-700">
                  <Calculator size={20} />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Планирование</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black text-slate-950">Калькулятор дохода</h3>
                    <span className="teacher-finance-simple__current-students rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                      Сейчас: {formatStudentCount(currentStudentCount)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                    Посчитайте средний месяц при занятиях по 60 минут. В стартовом значении — только текущие ученики, без выпускников.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <label className="teacher-finance-simple__calculator-field min-w-0">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Учеников</span>
                  <div className="relative">
                    <Users className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500" size={16} />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={calculatorStudents}
                      onChange={(event) => setCalculatorStudents(event.target.value.replace(/\D/g, '').slice(0, 4))}
                      aria-label="Количество учеников для расчёта"
                      className="teacher-finance-simple__input w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-black text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                </label>

                <label className="teacher-finance-simple__calculator-field min-w-0">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Занятий в неделю</span>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500" size={16} />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={calculatorLessonsPerWeek}
                      onChange={(event) => setCalculatorLessonsPerWeek(normalizeNumberInput(event.target.value).slice(0, 4))}
                      aria-label="Занятий в неделю на одного ученика"
                      className="teacher-finance-simple__input w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-black text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                </label>

                <label className="teacher-finance-simple__calculator-field min-w-0">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Ставка за час</span>
                  <div className="relative">
                    <CircleDollarSign className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500" size={16} />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={calculatorHourlyRate}
                      onChange={(event) => setCalculatorHourlyRate(normalizeNumberInput(event.target.value).slice(0, 8))}
                      aria-label="Ставка за один час"
                      className="teacher-finance-simple__input w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-9 text-sm font-black text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">₽</span>
                  </div>
                </label>

                <label className="teacher-finance-simple__calculator-field min-w-0">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Рабочих дней</span>
                  <div className="relative">
                    <Clock3 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500" size={16} />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={calculatorWorkingDays}
                      onChange={(event) => setCalculatorWorkingDays(event.target.value.replace(/\D/g, '').slice(0, 1))}
                      aria-label="Рабочих дней в неделю"
                      className="teacher-finance-simple__input w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-black text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Быстро выбрать</span>
                {calculatorStudentPresets.map((count) => {
                  const active = incomeScenario.studentCount === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setCalculatorStudents(String(count))}
                      aria-pressed={active}
                      className={`teacher-finance-simple__preset rounded-full border px-3 py-1.5 text-xs font-black transition ${
                        active
                          ? 'border-violet-300 bg-violet-100 text-violet-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 hover:bg-violet-50'
                      }`}
                    >
                      {count}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="teacher-finance-simple__calculator-result flex min-w-0 flex-col justify-between rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-600 p-5 text-white shadow-[0_16px_34px_rgba(79,70,229,0.22)]" aria-live="polite">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-100">Ожидаемый доход в месяц</div>
                <output className="mt-2 block text-3xl font-black tracking-tight sm:text-4xl">
                  ≈ {formatMoney(Math.round(incomeScenario.monthlyIncome))}
                </output>
              </div>
              <div className="mt-5 space-y-2 text-xs font-semibold text-violet-50/90">
                <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15">
                  {formatDecimal(incomeScenario.studentCount, 0)} × {formatDecimal(incomeScenario.lessonsPerWeek)} × {formatDecimal(incomeScenario.weeksPerMonth, 2)} × {formatMoney(incomeScenario.hourlyRate)}
                </div>
                <div className="teacher-finance-simple__workload-grid grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                    <span className="block text-[9px] uppercase tracking-[0.1em] text-violet-100/75">В день</span>
                    <strong className="mt-0.5 block text-sm text-white">≈ {formatDecimal(incomeScenario.dailyHours)} ч</strong>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                    <span className="block text-[9px] uppercase tracking-[0.1em] text-violet-100/75">В неделю</span>
                    <strong className="mt-0.5 block text-sm text-white">{formatDecimal(incomeScenario.weeklyLessons)} ч</strong>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                    <span className="block text-[9px] uppercase tracking-[0.1em] text-violet-100/75">В месяц</span>
                    <strong className="mt-0.5 block text-sm text-white">≈ {formatDecimal(incomeScenario.monthlyLessons)} занятий</strong>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                    <span className="block text-[9px] uppercase tracking-[0.1em] text-violet-100/75">Доход в день</span>
                    <strong className="mt-0.5 block text-sm text-white">≈ {formatMoney(Math.round(incomeScenario.dailyIncome))}</strong>
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed text-violet-100/80">
                  {formatMoney(incomeScenario.weeklyIncome)} в неделю · {formatDecimal(incomeScenario.workingDaysPerWeek, 0)} рабочих дней · до налогов, комиссий и отмен
                </p>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

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
                        {metrics.availableCredit > 0 ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700">
                            Аванс {formatMoney(metrics.availableCredit)}
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

                  {metrics.availableCredit > 0 ? (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      <WalletCards size={14} />
                      {formatMoney(metrics.availableCredit)} перенесено в аванс и автоматически применится к следующему занятию.
                    </div>
                  ) : null}

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
