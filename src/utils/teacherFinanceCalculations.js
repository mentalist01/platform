import { isCurrentStudent } from './studentStudyStatus.js';

export const TEACHER_FINANCE_WEEKS_PER_MONTH = 52 / 12;
export const TEACHER_FINANCE_GOAL_INCOME_PER_STUDENT = 16_000;
export const TEACHER_FINANCE_INCOME_GOALS = [200_000, 250_000, 300_000, 350_000, 400_000];
const MAX_STUDENT_COUNT = 9999;
const MAX_HOURLY_RATE = 1_000_000;
const MAX_LESSONS_PER_WEEK = 14;
const MAX_WORKING_DAYS_PER_WEEK = 7;
export const countCurrentTeacherStudents = (students) => (
  (Array.isArray(students) ? students : []).filter(isCurrentStudent).length
);

export const calculateTeacherCommissionPaybackSummary = (students) => (
  (Array.isArray(students) ? students : [])
    .filter(isCurrentStudent)
    .reduce((summary, student) => {
      const metrics = student?.metrics && typeof student.metrics === 'object'
        ? student.metrics
        : (student?.profitability && typeof student.profitability === 'object'
          ? student.profitability
          : student);
      const commissionAmount = Math.max(0, Number(metrics?.commissionAmount) || 0);
      if (commissionAmount <= 0) return summary;
      const reportedRemaining = Number(metrics?.remainingToPayback);
      const grossRevenue = Math.max(0, Number(metrics?.grossRevenue) || 0);
      const receivedRevenue = Math.max(0, Number(metrics?.receivedRevenue) || 0);
      const paybackRevenue = Math.max(
        grossRevenue,
        receivedRevenue,
        Math.max(0, Number(metrics?.paybackRevenue) || 0)
      );
      const remainingToPayback = Math.max(
        0,
        Number.isFinite(reportedRemaining)
          ? reportedRemaining
          : commissionAmount - paybackRevenue
      );
      const recoveredCommission = Math.max(0, commissionAmount - remainingToPayback);
      return {
        commissionAmount: roundToTwoDecimals(summary.commissionAmount + commissionAmount),
        recoveredCommission: roundToTwoDecimals(summary.recoveredCommission + recoveredCommission),
        remainingCommission: roundToTwoDecimals(summary.remainingCommission + remainingToPayback),
        studentCount: summary.studentCount + 1,
        remainingStudentCount: summary.remainingStudentCount + (remainingToPayback > 0 ? 1 : 0),
      };
    }, {
      commissionAmount: 0,
      recoveredCommission: 0,
      remainingCommission: 0,
      studentCount: 0,
      remainingStudentCount: 0,
    })
);

const roundToTwoDecimals = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const rounded = Math.round((number + Number.EPSILON) * 100) / 100;
  return Number.isFinite(rounded) ? rounded : 0;
};

const sumMoney = (values) => roundToTwoDecimals(
  (Array.isArray(values) ? values : [])
    .reduce((total, value) => total + Math.max(0, Number(value) || 0), 0)
);

export const calculateTeacherStudentProfitability = ({
  commissionAmount = 0,
  lessonPrice = 0,
  completedOccurrences = [],
  monthlyPaidAmounts = [],
  paymentAllocations = [],
  paidCalendarOccurrences = [],
} = {}) => {
  const completed = Array.isArray(completedOccurrences) ? completedOccurrences : [];
  const paidCalendar = Array.isArray(paidCalendarOccurrences) ? paidCalendarOccurrences : [];
  const activeAllocations = (Array.isArray(paymentAllocations) ? paymentAllocations : [])
    .filter((allocation) => ['allocated', 'credit'].includes(String(allocation?.status || '').trim()));
  const normalizedCommission = roundToTwoDecimals(Math.max(0, Number(commissionAmount) || 0));
  const normalizedLessonPrice = roundToTwoDecimals(Math.max(0, Number(lessonPrice) || 0));
  const grossRevenue = sumMoney(completed.map((occurrence) => occurrence?.lessonPrice));
  const ledgerReceivedRevenue = sumMoney(
    completed.filter((occurrence) => occurrence?.paid).map((occurrence) => occurrence?.lessonPrice)
  );
  const recordedReceivedRevenue = sumMoney(monthlyPaidAmounts);
  const allocatedReceivedRevenue = sumMoney(activeAllocations.map((allocation) => allocation?.amount));
  const calendarReceivedRevenue = sumMoney(paidCalendar.map((occurrence) => occurrence?.lessonPrice));
  const receivedRevenue = Math.max(
    ledgerReceivedRevenue,
    recordedReceivedRevenue,
    allocatedReceivedRevenue,
    calendarReceivedRevenue
  );
  const inferredPaidLessonCount = normalizedLessonPrice > 0
    ? Math.floor((receivedRevenue + 0.001) / normalizedLessonPrice)
    : 0;
  const paidLessonCount = Math.max(
    completed.filter((occurrence) => occurrence?.paid).length,
    activeAllocations.length,
    paidCalendar.length,
    inferredPaidLessonCount
  );
  // Preserve accrued lesson income while also counting money received ahead
  // of the calendar. Commission payback must never move backwards merely
  // because a payment was allocated to a future lesson.
  const paybackRevenue = Math.max(grossRevenue, receivedRevenue);
  const paybackLessonCount = Math.max(completed.length, paidLessonCount);
  const remainingToPayback = normalizedCommission > 0
    ? roundToTwoDecimals(Math.max(0, normalizedCommission - paybackRevenue))
    : 0;
  const netAfterCommission = roundToTwoDecimals(paybackRevenue - normalizedCommission);
  const paybackPercent = normalizedCommission > 0
    ? Math.max(0, Math.min(100, Math.round((paybackRevenue / normalizedCommission) * 100)))
    : 0;

  return {
    commissionAmount: normalizedCommission,
    lessonCount: completed.length,
    paidLessonCount,
    paybackLessonCount,
    grossRevenue,
    receivedRevenue,
    paybackRevenue,
    netAfterCommission,
    remainingToPayback,
    paybackPercent,
    isPaidBack: normalizedCommission > 0 && paybackRevenue >= normalizedCommission,
    lessonsRemaining: normalizedCommission > 0 && normalizedLessonPrice > 0
      ? Math.ceil(remainingToPayback / normalizedLessonPrice)
      : null,
  };
};

const toNumber = (value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s+/g, '').replace(',', '.');
    if (!normalized) return 0;
    return Number(normalized);
  }
  return Number(value);
};

const toNonNegativeNumber = (value) => {
  const number = toNumber(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const toNonNegativeInteger = (value) => Math.floor(toNonNegativeNumber(value));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const calculateTeacherIncomeGoals = ({
  currentMonthlyIncome = 0,
  targets = TEACHER_FINANCE_INCOME_GOALS,
  monthlyIncomePerStudent = TEACHER_FINANCE_GOAL_INCOME_PER_STUDENT,
} = {}) => {
  const normalizedCurrentIncome = roundToTwoDecimals(toNonNegativeNumber(currentMonthlyIncome));
  const normalizedIncomePerStudent = roundToTwoDecimals(toNonNegativeNumber(monthlyIncomePerStudent));
  const normalizedTargets = Array.from(new Set(
    (Array.isArray(targets) ? targets : [])
      .map((target) => roundToTwoDecimals(toNonNegativeNumber(target)))
      .filter((target) => target > 0)
  )).sort((left, right) => left - right);

  return {
    currentMonthlyIncome: normalizedCurrentIncome,
    monthlyIncomePerStudent: normalizedIncomePerStudent,
    goals: normalizedTargets.map((target) => {
      const remainingIncome = roundToTwoDecimals(Math.max(0, target - normalizedCurrentIncome));
      const achieved = remainingIncome <= 0;
      const studentsNeeded = achieved
        ? 0
        : (normalizedIncomePerStudent > 0
          ? Math.ceil(remainingIncome / normalizedIncomePerStudent)
          : null);
      const projectedIncome = studentsNeeded === null
        ? normalizedCurrentIncome
        : roundToTwoDecimals(
          normalizedCurrentIncome + (studentsNeeded * normalizedIncomePerStudent)
        );

      return {
        target,
        achieved,
        remainingIncome,
        studentsNeeded,
        projectedIncome,
        progressPercent: Math.max(
          0,
          Math.min(100, Math.round((normalizedCurrentIncome / target) * 100))
        ),
      };
    }),
  };
};

export const normalizeTeacherFinanceMonthKey = (value) => {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};
const normalizeMonthKey = normalizeTeacherFinanceMonthKey;

const toValidDate = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLocalMonthKey = (date) => [
  String(date.getFullYear()).padStart(4, '0'),
  String(date.getMonth() + 1).padStart(2, '0'),
].join('-');

export const getTeacherFinanceCurrentMonthKey = (value = new Date()) => {
  const date = toValidDate(value);
  return date ? getLocalMonthKey(date) : '';
};

export const shiftTeacherFinanceMonthKey = (value, offset = 0) => {
  const monthKey = normalizeTeacherFinanceMonthKey(value);
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-').map(Number);
  const delta = Number.isFinite(Number(offset)) ? Math.trunc(Number(offset)) : 0;
  return getLocalMonthKey(new Date(year, month - 1 + delta, 1, 12));
};

const getDaysInMonth = (monthKey) => {
  const match = String(monthKey).match(/^(\d{4})-(\d{2})$/);
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
};

export const calculateCurrentMonthForecast = ({
  monthKey,
  income = {},
  now = new Date(),
} = {}) => {
  const date = toValidDate(now);
  const currentMonthKey = date ? getLocalMonthKey(date) : '';
  const requestedMonthKey = String(monthKey ?? '').trim();
  const normalizedMonthKey = requestedMonthKey
    ? normalizeMonthKey(requestedMonthKey)
    : currentMonthKey;
  const daysInMonth = getDaysInMonth(normalizedMonthKey);
  const isCurrentMonth = Boolean(
    date
    && normalizedMonthKey
    && normalizedMonthKey === currentMonthKey
  );
  const actualRevenue = roundToTwoDecimals(toNonNegativeNumber(income?.grossRevenue));
  const actualLessonCount = toNonNegativeInteger(income?.lessonCount);
  const elapsedDays = isCurrentMonth ? date.getDate() : 0;
  const progressPercent = isCurrentMonth && daysInMonth > 0
    ? Math.max(0, Math.min(100, Math.round((elapsedDays / daysInMonth) * 100)))
    : 0;

  if (!isCurrentMonth || elapsedDays <= 0 || daysInMonth <= 0) {
    return {
      monthKey: normalizedMonthKey,
      isCurrentMonth,
      elapsedDays,
      daysInMonth,
      actualRevenue,
      projectedRevenue: actualRevenue,
      additionalRevenue: 0,
      actualLessonCount,
      projectedLessonCount: actualLessonCount,
      progressPercent,
    };
  }

  const monthRunRate = daysInMonth / elapsedDays;
  const projectedRevenue = Math.max(
    actualRevenue,
    roundToTwoDecimals(actualRevenue * monthRunRate)
  );
  const projectedLessonCount = Math.max(
    actualLessonCount,
    Math.round(actualLessonCount * monthRunRate)
  );

  return {
    monthKey: normalizedMonthKey,
    isCurrentMonth,
    elapsedDays,
    daysInMonth,
    actualRevenue,
    projectedRevenue,
    additionalRevenue: roundToTwoDecimals(projectedRevenue - actualRevenue),
    actualLessonCount,
    projectedLessonCount,
    progressPercent,
  };
};

export const calculateTeacherIncomeScenario = ({
  studentCount = 0,
  hourlyRate = 2000,
  lessonsPerWeek = 1,
  workingDaysPerWeek = 5,
} = {}) => {
  const normalizedStudentCount = clamp(toNonNegativeInteger(studentCount), 0, MAX_STUDENT_COUNT);
  const normalizedHourlyRate = roundToTwoDecimals(clamp(toNonNegativeNumber(hourlyRate), 0, MAX_HOURLY_RATE));
  const normalizedLessonsPerWeek = roundToTwoDecimals(clamp(
    toNonNegativeNumber(lessonsPerWeek),
    0,
    MAX_LESSONS_PER_WEEK
  ));
  const normalizedWorkingDaysPerWeek = clamp(
    toNonNegativeInteger(workingDaysPerWeek),
    0,
    MAX_WORKING_DAYS_PER_WEEK
  );
  const weeklyLessons = roundToTwoDecimals(normalizedStudentCount * normalizedLessonsPerWeek);
  const monthlyLessons = roundToTwoDecimals(weeklyLessons * TEACHER_FINANCE_WEEKS_PER_MONTH);
  const weeklyIncome = roundToTwoDecimals(weeklyLessons * normalizedHourlyRate);
  const monthlyIncome = roundToTwoDecimals(
    weeklyIncome * TEACHER_FINANCE_WEEKS_PER_MONTH
  );
  const dailyHours = normalizedWorkingDaysPerWeek > 0
    ? roundToTwoDecimals(weeklyLessons / normalizedWorkingDaysPerWeek)
    : 0;
  const dailyIncome = normalizedWorkingDaysPerWeek > 0
    ? roundToTwoDecimals(weeklyIncome / normalizedWorkingDaysPerWeek)
    : 0;

  return {
    studentCount: normalizedStudentCount,
    hourlyRate: normalizedHourlyRate,
    lessonsPerWeek: normalizedLessonsPerWeek,
    workingDaysPerWeek: normalizedWorkingDaysPerWeek,
    weeksPerMonth: TEACHER_FINANCE_WEEKS_PER_MONTH,
    weeklyLessons,
    monthlyLessons,
    weeklyIncome,
    monthlyIncome,
    dailyHours,
    dailyIncome,
  };
};
