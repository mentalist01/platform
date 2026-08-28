import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

const parseInWorker = (icalText, toMs) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./googleCalendarParseWorker.cjs', import.meta.url), {
    workerData: { icalText, toMs, maxEvents: 100 },
  });
  worker.once('message', (result) => {
    void worker.terminate();
    if (result?.error) reject(new Error(result.error));
    else resolve(result);
  });
  worker.once('error', reject);
});

test('calendar worker expands recurring events without blocking the server process', async () => {
  const icalText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'X-WR-CALNAME:Worker calendar',
    'BEGIN:VEVENT',
    'UID:recurring@example.test',
    'DTSTART:20260901T140000Z',
    'DTEND:20260901T150000Z',
    'RRULE:FREQ=DAILY;COUNT=3',
    'SUMMARY:Student A',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  const result = await parseInWorker(icalText, Date.parse('2026-09-10T00:00:00Z'));

  assert.equal(result.calendarName, 'Worker calendar');
  assert.deepEqual(
    result.events.map((event) => event.start),
    [
      '2026-09-01T14:00:00.000Z',
      '2026-09-02T14:00:00.000Z',
      '2026-09-03T14:00:00.000Z',
    ]
  );
});
