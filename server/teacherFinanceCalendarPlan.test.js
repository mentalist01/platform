import test from 'node:test';
import assert from 'node:assert/strict';

import {
  expandTeacherFinanceMonthOccurrences,
  summarizeCurrentTeacherStudentsSchedule,
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

test('summary keeps earned inactive, graduate and deleted lessons but filters their remaining lessons', () => {
  const students = [
    { id: 'active', grade: 11, lessonPrice: 2000 },
    { id: 'unpriced', grade: 10, lessonPrice: 0 },
    { id: 'graduate', grade: 'graduate', lessonPrice: 3000 },
    { id: 'former', grade: 11, studyStatus: 'inactive', lessonPrice: 3500 },
    { id: 'deleted', grade: 11, deletedAt: '2026-07-10T00:00:00.000Z', lessonPrice: 4000 },
  ];
  const completedOccurrences = [
    occurrence({ studentId: 'graduate', dayKey: '2026-07-01', lessonPrice: 3000 }),
    occurrence({ studentId: 'former', dayKey: '2026-07-02', lessonPrice: 3500 }),
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
      occurrence({ studentId: 'former', dayKey: '2026-07-22', lessonPrice: 3500 }),
      occurrence({ studentId: 'deleted', dayKey: '2026-07-22', lessonPrice: 4000 }),
    ],
  });

  assert.deepEqual(result, {
    month: '2026-07',
    activeStudentCount: 2,
    actual: { revenue: 10500, lessonCount: 3, hours: 3, workingDayCount: 2 },
    remaining: { revenue: 2000, lessonCount: 2, hours: 2, workingDayCount: 1 },
    total: { revenue: 12500, lessonCount: 5, hours: 5, workingDayCount: 3 },
    completionPercent: 60,
    averageHoursPerWorkingDay: 1.67,
    unpricedLessonCount: 1,
    unpricedStudentCount: 1,
    pricedLessonCount: 4,
    studentCount: 5,
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

test('current student summary reflects the effective Monday-to-Sunday schedule', () => {
  const result = summarizeCurrentTeacherStudentsSchedule({
    weekStartDayKey: '2026-07-13',
    students: [
      { id: 'active-a', name: 'Анна', grade: 11, createdAt: '2026-06-01T12:00:00.000Z' },
      { id: 'active-b', name: 'Борис', nickname: 'Боря', grade: 10 },
      { id: 'graduate', name: 'Выпускник', grade: 'graduate' },
      { id: 'deleted', name: 'Удалённый', grade: 11, deletedAt: '2026-07-01T00:00:00.000Z' },
      { id: 'without-lessons', name: 'Нет занятий', grade: 11 },
    ],
    entries: [
      { id: 'anna-monday', studentId: 'active-a', weekdayKey: 'monday', time: '10:00', durationMinutes: 60 },
      {
        id: 'anna-wednesday-cancelled',
        studentId: 'active-a',
        weekdayKey: 'wednesday',
        time: '10:00',
        durationMinutes: 90,
        excludedDates: ['2026-07-15'],
      },
      { id: 'anna-friday', studentId: 'active-a', date: '2026-07-17', time: '12:30', durationMinutes: 30 },
      { id: 'anna-friday-copy', studentId: 'active-a', date: '2026-07-17', time: '12:30', durationMinutes: 30 },
      { id: 'boris-tuesday', studentId: 'active-b', weekdayKey: 'tuesday', time: '18:00', durationMinutes: 45 },
      { id: 'graduate-slot', studentId: 'graduate', weekdayKey: 'tuesday', time: '11:00' },
      { id: 'deleted-slot', studentId: 'deleted', weekdayKey: 'thursday', time: '11:00' },
      { id: 'trial-slot', studentId: 'active-b', weekdayKey: 'friday', time: '11:00', trial: true },
      { id: 'cancelled-slot', studentId: 'active-b', weekdayKey: 'saturday', time: '11:00', status: 'cancelled' },
      { id: 'unmatched-google', studentId: '', date: '2026-07-16', time: '11:00' },
      { id: 'teacher-slot', studentId: 'active-a', isTeacherSlot: true, date: '2026-07-18', time: '11:00' },
      { id: 'outside-week', studentId: 'active-a', date: '2026-07-20', time: '11:00' },
    ],
  });

  assert.deepEqual(result, {
    weekStartDayKey: '2026-07-13',
    weekEndDayKey: '2026-07-19',
    studentCount: 2,
    weeklyLessonCount: 3,
    weeklyHours: 2.25,
    students: [
      {
        studentId: 'active-a',
        name: 'Анна',
        lessonCountPerWeek: 2,
        hoursPerWeek: 1.5,
        scheduleSlots: [
          {
            dayKey: '2026-07-13',
            weekdayOrder: 1,
            weekdayKey: 'monday',
            time: '10:00',
            durationMinutes: 60,
          },
          {
            dayKey: '2026-07-17',
            weekdayOrder: 5,
            weekdayKey: 'friday',
            time: '12:30',
            durationMinutes: 30,
          },
        ],
      },
      {
        studentId: 'active-b',
        name: 'Боря',
        lessonCountPerWeek: 1,
        hoursPerWeek: 0.75,
        lessonDurationMinutes: 45,
        scheduleSlots: [{
          dayKey: '2026-07-14',
          weekdayOrder: 2,
          weekdayKey: 'tuesday',
          time: '18:00',
          durationMinutes: 45,
        }],
      },
    ],
  });
});

test('current student summary respects entry and student creation dates', () => {
  const result = summarizeCurrentTeacherStudentsSchedule({
    weekStartDayKey: '2026-07-13',
    students: [
      { id: 'entry-bound', name: 'Entry bound', grade: 11 },
      { id: 'student-bound', name: 'Student bound', grade: 11, createdAt: '2026-07-17T10:00:00.000Z' },
    ],
    entries: [
      {
        id: 'created-after-monday',
        studentId: 'entry-bound',
        weekdayKey: 'monday',
        time: '10:00',
        createdAt: '2026-07-15T10:00:00.000Z',
      },
      {
        id: 'created-before-thursday',
        studentId: 'entry-bound',
        weekdayKey: 'thursday',
        time: '10:00',
        createdAt: '2026-07-15T10:00:00.000Z',
      },
      { id: 'before-student', studentId: 'student-bound', weekdayKey: 'thursday', time: '12:00' },
      { id: 'after-student', studentId: 'student-bound', weekdayKey: 'saturday', time: '12:00' },
    ],
  });

  assert.equal(result.studentCount, 2);
  assert.equal(result.weeklyLessonCount, 2);
  assert.deepEqual(
    result.students.map((student) => [student.studentId, student.scheduleSlots[0].dayKey]),
    [
      ['entry-bound', '2026-07-16'],
      ['student-bound', '2026-07-18'],
    ]
  );
});

test('current student summary handles a week crossing month boundaries and invalid input', () => {
  const result = summarizeCurrentTeacherStudentsSchedule({
    weekStartDayKey: '2026-06-29',
    students: [{ id: 'active', name: 'Ученик', grade: 11 }],
    entries: [
      { id: 'wednesday', studentId: 'active', weekdayKey: 'wednesday', time: '9:00', durationMinutes: 0 },
      { id: 'sunday', studentId: 'active', date: '2026-07-05', time: '13:00', durationMinutes: 120 },
      { id: 'next-monday', studentId: 'active', date: '2026-07-06', time: '13:00' },
    ],
  });

  assert.equal(result.studentCount, 1);
  assert.equal(result.weeklyLessonCount, 2);
  assert.equal(result.weeklyHours, 3);
  assert.deepEqual(result.students[0].scheduleSlots.map((slot) => slot.dayKey), [
    '2026-07-01',
    '2026-07-05',
  ]);
  assert.deepEqual(summarizeCurrentTeacherStudentsSchedule({
    weekStartDayKey: 'invalid',
    students: [{ id: 'active', name: 'Ученик', grade: 11 }],
  }), {
    weekStartDayKey: '',
    weekEndDayKey: '',
    studentCount: 0,
    weeklyLessonCount: 0,
    weeklyHours: 0,
    students: [],
  });
});
