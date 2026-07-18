import test from 'node:test';
import assert from 'node:assert/strict';

import {
  expandTeacherFinanceMonthOccurrences,
  summarizeTeacherFinanceCalendarPlan,
} from './teacherFinanceCalendarPlan.js';

const occurrence = ({
  studentId,
  dayKey,
  time = '10:00',
  durationMinutes = 60,
  lessonPrice,
  occurrenceKey,
  ...rest
}) => ({
  studentId,
  dayKey,
  time,
  durationMinutes,
  occurrenceKey: occurrenceKey || `${studentId}:${dayKey}:${time}:${durationMinutes}`,
  ...(typeof lessonPrice === 'undefined' ? {} : { lessonPrice }),
  ...rest,
});

test('expands explicit and weekly entries inside the requested month', () => {
  const explicitEntry = {
    id: 'explicit',
    studentId: 'student-a',
    date: '2026-07-03',
    weekdayKey: 'monday',
    time: '9:05',
    durationMinutes: 90,
  };
  const weeklyEntry = {
    id: 'weekly',
    studentId: 'student-b',
    weekdayKey: 'monday',
    time: '16:00',
    durationMinutes: 45,
  };

  const result = expandTeacherFinanceMonthOccurrences({
    entries: [weeklyEntry, explicitEntry],
    monthKey: '2026-07',
  });

  assert.deepEqual(result.map((item) => item.dayKey), [
    '2026-07-03',
    '2026-07-06',
    '2026-07-13',
    '2026-07-20',
    '2026-07-27',
  ]);
  assert.deepEqual(result[0], {
    entry: explicitEntry,
    sourceEntryId: 'explicit',
    occurrenceKey: 'student-a:2026-07-03:09:05:90',
    studentId: 'student-a',
    dayKey: '2026-07-03',
    time: '09:05',
    durationMinutes: 90,
    startMinutes: 545,
    endMinutes: 635,
  });
});

test('weekly expansion respects excluded dates, entry creation and student start lower bounds', () => {
  const result = expandTeacherFinanceMonthOccurrences({
    entries: [{
      id: 'bounded-weekly',
      studentId: 'student-a',
      weekdayKey: 'monday',
      time: '10:00',
      durationMinutes: 60,
      createdAt: '2026-07-10T20:00:00.000Z',
      excludedDates: ['2026-07-20', 'invalid', '2026-07-20'],
    }],
    monthKey: '2026-07',
    studentStartDayById: new Map([['student-a', '2026-07-18']]),
  });

  assert.deepEqual(result.map((item) => item.dayKey), ['2026-07-27']);
});

test('expansion normalizes durations, skips invalid entries and deliberately keeps duplicates', () => {
  const duplicate = {
    id: 'duplicate',
    studentId: 'student-a',
    date: '2026-07-08',
    time: '08:00',
    durationMinutes: 0,
  };
  const result = expandTeacherFinanceMonthOccurrences({
    entries: [
      duplicate,
      { ...duplicate, id: 'duplicate-copy' },
      { id: 'min', studentId: 'student-a', date: '2026-07-09', time: '08:00', durationMinutes: 15 },
      { id: 'max', studentId: 'student-a', date: '2026-07-10', time: '08:00', durationMinutes: 360 },
      { id: 'too-long', studentId: 'student-a', date: '2026-07-11', time: '08:00', durationMinutes: 361 },
      { id: 'excluded-explicit', studentId: 'student-a', date: '2026-07-12', time: '08:00', excludedDates: ['2026-07-12'] },
      { id: 'outside', studentId: 'student-a', date: '2026-08-01', time: '08:00' },
      { id: 'bad-time', studentId: 'student-a', date: '2026-07-13', time: '25:00' },
      { id: 'teacher-slot', studentId: '', date: '2026-07-13', time: '10:00' },
      { id: 'cancelled', studentId: 'student-a', date: '2026-07-13', time: '10:00', status: 'cancelled' },
    ],
    monthKey: '2026-07',
  });

  assert.equal(result.length, 5);
  assert.deepEqual(result.map((item) => item.durationMinutes), [60, 60, 15, 360, 60]);
  assert.equal(result[0].occurrenceKey, result[1].occurrenceKey);
});

test('summary keeps earned graduate and deleted lessons but filters their remaining lessons', () => {
  const students = [
    { id: 'active', grade: 11, lessonPrice: 2000 },
    { id: 'unpriced', grade: 10, lessonPrice: 0 },
    { id: 'graduate', grade: 'graduate', lessonPrice: 3000 },
    { id: 'deleted', grade: 11, deletedAt: '2026-07-10T00:00:00.000Z', lessonPrice: 4000 },
  ];
  const completedOccurrences = [
    occurrence({ studentId: 'graduate', dayKey: '2026-07-01', lessonPrice: 3000 }),
    occurrence({ studentId: 'deleted', dayKey: '2026-07-02', lessonPrice: 4000 }),
  ];
  const activeRemaining = occurrence({
    studentId: 'active',
    dayKey: '2026-07-20',
    durationMinutes: 90,
  });
  const result = summarizeTeacherFinanceCalendarPlan({
    monthKey: '2026-07',
    students,
    completedOccurrences,
    remainingOccurrences: [
      activeRemaining,
      { ...activeRemaining },
      occurrence({ studentId: 'unpriced', dayKey: '2026-07-20', durationMinutes: 30 }),
      occurrence({ studentId: 'graduate', dayKey: '2026-07-21', lessonPrice: 3000 }),
      occurrence({ studentId: 'deleted', dayKey: '2026-07-22', lessonPrice: 4000 }),
    ],
  });

  assert.deepEqual(result, {
    month: '2026-07',
    activeStudentCount: 2,
    actual: { revenue: 7000, lessonCount: 2, hours: 2, workingDayCount: 2 },
    remaining: { revenue: 2000, lessonCount: 2, hours: 2, workingDayCount: 1 },
    total: { revenue: 9000, lessonCount: 4, hours: 4, workingDayCount: 3 },
    completionPercent: 50,
    averageHoursPerWorkingDay: 1.33,
    unpricedLessonCount: 1,
    unpricedStudentCount: 1,
    pricedLessonCount: 3,
    studentCount: 4,
  });
});

test('summary recognizes every graduate alias and preserves only their completed work', () => {
  const aliases = ['graduate', 'graduates', 'alumni', 'alumnus', 'выпускник', 'выпускники'];
  const students = [
    { id: 'active', grade: 11, lessonPrice: 1000 },
    ...aliases.map((grade, index) => ({ id: `graduate-${index}`, grade, lessonPrice: 1000 })),
  ];
  const completedOccurrences = aliases.map((_, index) => occurrence({
    studentId: `graduate-${index}`,
    dayKey: `2026-07-${String(index + 1).padStart(2, '0')}`,
    lessonPrice: 1000,
  }));
  const remainingOccurrences = [
    occurrence({ studentId: 'active', dayKey: '2026-07-20' }),
    ...aliases.map((_, index) => occurrence({
      studentId: `graduate-${index}`,
      dayKey: '2026-07-20',
      time: `${String(11 + index).padStart(2, '0')}:00`,
    })),
  ];

  const result = summarizeTeacherFinanceCalendarPlan({
    monthKey: '2026-07',
    students,
    completedOccurrences,
    remainingOccurrences,
  });

  assert.equal(result.activeStudentCount, 1);
  assert.equal(result.actual.lessonCount, 6);
  assert.equal(result.remaining.lessonCount, 1);
  assert.equal(result.total.revenue, 7000);
  assert.equal(result.studentCount, 7);
});

test('summary removes trial, cancelled and duplicate occurrences with completed taking precedence', () => {
  const students = [{ id: 'active', grade: 11, lessonPrice: 2000 }];
  const completed = occurrence({ studentId: 'active', dayKey: '2026-07-05', lessonPrice: 1500 });
  const result = summarizeTeacherFinanceCalendarPlan({
    monthKey: '2026-07',
    students,
    completedOccurrences: [
      completed,
      { ...completed, lessonPrice: 9999 },
      occurrence({ studentId: 'active', dayKey: '2026-07-06', trial: true }),
      occurrence({ studentId: 'active', dayKey: '2026-07-07', status: 'cancelled' }),
    ],
    remainingOccurrences: [
      { ...completed, lessonPrice: 2000 },
      occurrence({ studentId: 'active', dayKey: '2026-07-20', entry: { status: 'trial' } }),
      occurrence({ studentId: 'active', dayKey: '2026-07-21', entry: { cancelled: true } }),
    ],
  });

  assert.deepEqual(result.actual, {
    revenue: 1500,
    lessonCount: 1,
    hours: 1,
    workingDayCount: 1,
  });
  assert.deepEqual(result.remaining, {
    revenue: 0,
    lessonCount: 0,
    hours: 0,
    workingDayCount: 0,
  });
  assert.equal(result.pricedLessonCount, 1);
});

test('lesson price is flat per occurrence while durations determine hours and working days', () => {
  const result = summarizeTeacherFinanceCalendarPlan({
    monthKey: '2026-07',
    students: [{ id: 'active', grade: 11, lessonPrice: 2000 }],
    remainingOccurrences: [
      occurrence({ studentId: 'active', dayKey: '2026-07-20', time: '09:00', durationMinutes: 30 }),
      occurrence({ studentId: 'active', dayKey: '2026-07-20', time: '10:00', durationMinutes: 120 }),
      occurrence({ studentId: 'active', dayKey: '2026-07-21', time: '09:00', durationMinutes: 60 }),
    ],
  });

  assert.deepEqual(result.remaining, {
    revenue: 6000,
    lessonCount: 3,
    hours: 3.5,
    workingDayCount: 2,
  });
  assert.equal(result.averageHoursPerWorkingDay, 1.75);
  assert.equal(result.pricedLessonCount, 3);
  assert.equal(result.unpricedLessonCount, 0);
});
