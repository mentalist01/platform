import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_AVAILABILITY_DAY_LABELS,
  CALENDAR_AVAILABILITY_EXPORT_END_HOUR,
  CALENDAR_AVAILABILITY_EXPORT_START_HOUR,
  formatAvailabilityShareWeekLabel,
  getAvailabilityShareWeekStart,
  getCalendarFreeIntervalsByDay,
} from './calendarAvailabilityShare.js';

test('availability image uses full weekday names without calendar dates', () => {
  assert.deepEqual(CALENDAR_AVAILABILITY_DAY_LABELS, [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье',
  ]);
});

test('availability image shows the readable part of the day', () => {
  assert.equal(CALENDAR_AVAILABILITY_EXPORT_START_HOUR, 8);
  assert.equal(CALENDAR_AVAILABILITY_EXPORT_END_HOUR, 24);
});

test('availability share week starts on Monday four weeks ahead', () => {
  const start = getAvailabilityShareWeekStart(new Date(2026, 7, 26), 4);
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 8);
  assert.equal(start.getDate(), 21);
  assert.equal(start.getDay(), 1);
});

test('availability share supports the fifth week option', () => {
  const start = getAvailabilityShareWeekStart(new Date(2026, 7, 26), 5);
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 8);
  assert.equal(start.getDate(), 28);
  assert.equal(start.getDay(), 1);
});

test('availability share week label covers Monday through Sunday', () => {
  assert.equal(
    formatAvailabilityShareWeekLabel(new Date(2026, 8, 21)),
    '21 сент. – 27 сент.'
  );
});

test('free time retains every weekday, including days without lessons', () => {
  assert.deepEqual(getCalendarFreeIntervalsByDay(), Array.from({ length: 7 }, () => [
    { startMinutes: 480, endMinutes: 1440 },
  ]));
});

test('free time excludes lessons at their exact boundaries', () => {
  const days = getCalendarFreeIntervalsByDay([
    { dayIndex: 0, startMinutes: 600, endMinutes: 840 },
    { dayIndex: 0, startMinutes: 1080, endMinutes: 1260 },
    { dayIndex: 6, startMinutes: 480, endMinutes: 1440 },
  ]);
  assert.deepEqual(days[0], [
    { startMinutes: 480, endMinutes: 600 },
    { startMinutes: 840, endMinutes: 1080 },
    { startMinutes: 1260, endMinutes: 1440 },
  ]);
  assert.deepEqual(days[6], []);
  assert.deepEqual(days[1], [{ startMinutes: 480, endMinutes: 1440 }]);
});

test('overlaps, duplicates and adjacent lessons never create false free time', () => {
  const days = getCalendarFreeIntervalsByDay([
    { dayIndex: 2, startMinutes: 780, endMinutes: 960 },
    { dayIndex: 2, startMinutes: 600, endMinutes: 840 },
    { dayIndex: 2, startMinutes: 600, endMinutes: 840 },
    { dayIndex: 2, startMinutes: 660, endMinutes: 720 },
    { dayIndex: 2, startMinutes: 960, endMinutes: 1005 },
  ]);
  assert.deepEqual(days[2], [
    { startMinutes: 480, endMinutes: 600 },
    { startMinutes: 1005, endMinutes: 1440 },
  ]);
});

test('free time clips lessons spanning the exported day and keeps minute precision', () => {
  const days = getCalendarFreeIntervalsByDay([
    { dayIndex: 3, startMinutes: 420, endMinutes: 495 },
    { dayIndex: 3, startMinutes: 1385, endMinutes: 1500 },
    { dayIndex: 4, startMinutes: 0, endMinutes: 420 },
    { dayIndex: 4, startMinutes: 1500, endMinutes: 1560 },
  ]);
  assert.deepEqual(days[3], [{ startMinutes: 495, endMinutes: 1385 }]);
  assert.deepEqual(days[4], [{ startMinutes: 480, endMinutes: 1440 }]);
});

test('malformed intervals cannot corrupt another weekday', () => {
  const invalid = [null, {},
    { dayIndex: -1, startMinutes: 480, endMinutes: 1440 },
    { dayIndex: 7, startMinutes: 480, endMinutes: 1440 },
    { dayIndex: 0.5, startMinutes: 480, endMinutes: 1440 },
    { dayIndex: 0, startMinutes: NaN, endMinutes: 1440 },
    { dayIndex: 0, startMinutes: 480, endMinutes: Infinity },
    { dayIndex: 0, startMinutes: 600, endMinutes: 590 },
    { dayIndex: 0, startMinutes: 600, endMinutes: 600 },
  ];
  assert.deepEqual(getCalendarFreeIntervalsByDay(invalid), getCalendarFreeIntervalsByDay());
  assert.deepEqual(getCalendarFreeIntervalsByDay(null), getCalendarFreeIntervalsByDay());
});
