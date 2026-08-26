import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_AVAILABILITY_EXPORT_END_HOUR,
  CALENDAR_AVAILABILITY_EXPORT_START_HOUR,
  formatAvailabilityShareWeekLabel,
  getAvailabilityShareWeekStart,
} from './calendarAvailabilityShare.js';

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
