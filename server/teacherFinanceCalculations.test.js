import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEACHER_FINANCE_WEEKS_PER_MONTH,
  calculateCurrentMonthForecast,
  calculateTeacherCommissionPaybackSummary,
  calculateTeacherIncomeScenario,
  countCurrentTeacherStudents,
} from '../src/utils/teacherFinanceCalculations.js';

test('current student count excludes inactive, graduate and deleted students', () => {
  assert.equal(countCurrentTeacherStudents([
    { id: 'active-11', grade: 11, deletedAt: null },
    { id: 'former-11', grade: 11, studyStatus: 'inactive' },
    { id: 'active-10', grade: '10' },
    { id: 'graduate-en', grade: 'graduate' },
    { id: 'graduate-ru', grade: 'Выпускник' },
    { id: 'graduate-alumni', grade: 'alumni' },
    { id: 'graduate-alumnus', grade: 'alumnus' },
    { id: 'deleted', grade: 11, deletedAt: '2026-07-01T00:00:00.000Z' },
  ]), 2);
  assert.equal(countCurrentTeacherStudents(null), 0);
});

test('commission payback summary adds remaining amounts only for current students', () => {
  const summary = calculateTeacherCommissionPaybackSummary([
    {
      id: 'active-explicit',
      grade: 11,
      metrics: { commissionAmount: 10_000, remainingToPayback: 4_000, grossRevenue: 6_000 },
    },
    {
      id: 'active-fallback',
      grade: 10,
      profitability: { commissionAmount: 5_000, grossRevenue: 2_000 },
    },
    {
      id: 'active-paid-back',
      grade: 11,
      metrics: { commissionAmount: 3_000, remainingToPayback: 0, grossRevenue: 4_000 },
    },
    {
      id: 'inactive',
      grade: 11,
      studyStatus: 'inactive',
      metrics: { commissionAmount: 20_000, remainingToPayback: 20_000 },
    },
  ]);

  assert.deepEqual(summary, {
    commissionAmount: 18_000,
    recoveredCommission: 11_000,
    remainingCommission: 7_000,
    studentCount: 3,
    remainingStudentCount: 2,
  });
});

test('current-month forecast extrapolates revenue and lessons using elapsed calendar days', () => {
  const result = calculateCurrentMonthForecast({
    monthKey: '2026-07',
    income: { grossRevenue: 24_000, lessonCount: 13 },
    now: new Date(2026, 6, 18, 12),
  });

  assert.deepEqual(result, {
    monthKey: '2026-07',
    isCurrentMonth: true,
    elapsedDays: 18,
    daysInMonth: 31,
    actualRevenue: 24_000,
    projectedRevenue: 41_333.33,
    additionalRevenue: 17_333.33,
    actualLessonCount: 13,
    projectedLessonCount: 22,
    progressPercent: 58,
  });
});

test('forecast equals actual values on the final day of the month', () => {
  const result = calculateCurrentMonthForecast({
    monthKey: '2026-07',
    income: { grossRevenue: 24_000, lessonCount: 13 },
    now: new Date(2026, 6, 31, 23, 59, 59),
  });

  assert.equal(result.projectedRevenue, 24_000);
  assert.equal(result.additionalRevenue, 0);
  assert.equal(result.projectedLessonCount, 13);
  assert.equal(result.progressPercent, 100);
});

test('forecast observes leap-year month length', () => {
  const result = calculateCurrentMonthForecast({
    monthKey: '2024-02',
    income: { grossRevenue: 15_000, lessonCount: 10 },
    now: new Date(2024, 1, 15, 12),
  });

  assert.equal(result.daysInMonth, 29);
  assert.equal(result.projectedRevenue, 29_000);
  assert.equal(result.projectedLessonCount, 19);
  assert.equal(result.progressPercent, 52);
});

test('non-current month preserves actuals without inventing a forecast', () => {
  const result = calculateCurrentMonthForecast({
    monthKey: '2026-06',
    income: { grossRevenue: 93_950, lessonCount: 53 },
    now: new Date(2026, 6, 18, 12),
  });

  assert.equal(result.isCurrentMonth, false);
  assert.equal(result.elapsedDays, 0);
  assert.equal(result.daysInMonth, 30);
  assert.equal(result.projectedRevenue, 93_950);
  assert.equal(result.additionalRevenue, 0);
  assert.equal(result.projectedLessonCount, 53);
  assert.equal(result.progressPercent, 0);
});

test('forecast normalizes missing, negative and invalid income values', () => {
  const negative = calculateCurrentMonthForecast({
    monthKey: '2026-07',
    income: { grossRevenue: -100, lessonCount: -2 },
    now: new Date(2026, 6, 18, 12),
  });
  const invalid = calculateCurrentMonthForecast({
    monthKey: 'not-a-month',
    income: { grossRevenue: Number.POSITIVE_INFINITY, lessonCount: Number.NaN },
    now: 'not-a-date',
  });

  assert.equal(negative.actualRevenue, 0);
  assert.equal(negative.projectedRevenue, 0);
  assert.equal(negative.actualLessonCount, 0);
  assert.equal(negative.projectedLessonCount, 0);
  assert.deepEqual(invalid, {
    monthKey: '',
    isCurrentMonth: false,
    elapsedDays: 0,
    daysInMonth: 0,
    actualRevenue: 0,
    projectedRevenue: 0,
    additionalRevenue: 0,
    actualLessonCount: 0,
    projectedLessonCount: 0,
    progressPercent: 0,
  });
});

test('income scenario uses 52 weeks divided by 12 months', () => {
  const result = calculateTeacherIncomeScenario({
    studentCount: 17,
    hourlyRate: 2000,
    lessonsPerWeek: 1,
    workingDaysPerWeek: 5,
  });

  assert.equal(TEACHER_FINANCE_WEEKS_PER_MONTH, 52 / 12);
  assert.deepEqual(result, {
    studentCount: 17,
    hourlyRate: 2000,
    lessonsPerWeek: 1,
    workingDaysPerWeek: 5,
    weeksPerMonth: 52 / 12,
    weeklyLessons: 17,
    monthlyLessons: 73.67,
    weeklyIncome: 34_000,
    monthlyIncome: 147_333.33,
    dailyHours: 3.4,
    dailyIncome: 6_800,
  });
});

test('income scenario supports decimal Russian input and fractional weekly frequency', () => {
  const result = calculateTeacherIncomeScenario({
    studentCount: '10.9',
    hourlyRate: '2 000,50',
    lessonsPerWeek: '1,5',
    workingDaysPerWeek: 6,
  });

  assert.equal(result.studentCount, 10);
  assert.equal(result.hourlyRate, 2000.5);
  assert.equal(result.lessonsPerWeek, 1.5);
  assert.equal(result.weeklyLessons, 15);
  assert.equal(result.monthlyLessons, 65);
  assert.equal(result.weeklyIncome, 30_007.5);
  assert.equal(result.monthlyIncome, 130_032.5);
  assert.equal(result.dailyHours, 2.5);
  assert.equal(result.dailyIncome, 5_001.25);
});

test('forecast uses the teacher local month near a UTC boundary', () => {
  const result = calculateCurrentMonthForecast({
    monthKey: '2026-07',
    income: { grossRevenue: 1_000, lessonCount: 1 },
    now: new Date(2026, 6, 1, 0, 30),
  });

  assert.equal(result.isCurrentMonth, true);
  assert.equal(result.elapsedDays, 1);
  assert.equal(result.projectedRevenue, 31_000);
});

test('income scenario clamps negative, empty, invalid and oversized inputs', () => {
  assert.deepEqual(calculateTeacherIncomeScenario({
    studentCount: -3,
    hourlyRate: '',
    lessonsPerWeek: Number.NaN,
    workingDaysPerWeek: 0,
  }), {
    studentCount: 0,
    hourlyRate: 0,
    lessonsPerWeek: 0,
    workingDaysPerWeek: 0,
    weeksPerMonth: 52 / 12,
    weeklyLessons: 0,
    monthlyLessons: 0,
    weeklyIncome: 0,
    monthlyIncome: 0,
    dailyHours: 0,
    dailyIncome: 0,
  });

  const overflow = calculateTeacherIncomeScenario({
    studentCount: Number.MAX_SAFE_INTEGER,
    hourlyRate: Number.MAX_VALUE,
    lessonsPerWeek: Number.MAX_VALUE,
    workingDaysPerWeek: Number.MAX_VALUE,
  });
  assert.equal(overflow.studentCount, 9999);
  assert.equal(overflow.hourlyRate, 1_000_000);
  assert.equal(overflow.lessonsPerWeek, 14);
  assert.equal(overflow.workingDaysPerWeek, 7);
  assert.equal(overflow.weeklyLessons, 139_986);
  assert.equal(overflow.weeklyIncome, 139_986_000_000);
  assert.equal(overflow.monthlyIncome, 606_606_000_000);
  assert.equal(overflow.dailyHours, 19_998);
  assert.equal(overflow.dailyIncome, 19_998_000_000);
});
