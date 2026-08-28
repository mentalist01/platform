'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const nodeIcal = require('node-ical');

const toText = (value) => {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
};

const serializeEvent = (event, calendarName) => {
  const start = event?.start instanceof Date ? event.start : new Date(event?.start);
  const end = event?.end instanceof Date ? event.end : new Date(event?.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    type: 'VEVENT',
    status: toText(event?.status),
    start: start.toISOString(),
    end: end.toISOString(),
    isFullDay: Boolean(event?.isFullDay || event?.start?.dateOnly),
    summary: toText(event?.summary),
    description: toText(event?.description),
    location: toText(event?.location),
    url: toText(event?.url),
    uid: toText(event?.uid),
    id: toText(event?.id),
    calendarName,
  };
};

try {
  const parsed = nodeIcal.sync.parseICS(String(workerData?.icalText || ''));
  const calendar = Object.values(parsed || {}).find((entry) => entry?.type === 'VCALENDAR');
  const calendarName = toText(calendar?.['WR-CALNAME'] || calendar?.calendarName).trim();
  const to = new Date(Number(workerData?.toMs));
  const maxEvents = Math.max(1, Number(workerData?.maxEvents) || 50_000);
  const events = [];

  Object.values(parsed || {}).forEach((event) => {
    if (!event || event.type !== 'VEVENT') return;
    const eventStartMs = event?.start instanceof Date ? event.start.getTime() : Date.parse(event?.start);
    const recurrenceFrom = Number.isFinite(eventStartMs) ? new Date(eventStartMs) : new Date(0);
    const instances = event.rrule
      ? nodeIcal.expandRecurringEvent(event, { from: recurrenceFrom, to, expandOngoing: true })
      : [event];
    instances.forEach((instance) => {
      if (events.length >= maxEvents) {
        throw new Error(`Calendar contains more than ${maxEvents} expanded events.`);
      }
      const serialized = serializeEvent({ ...event, ...instance }, calendarName);
      if (serialized) events.push(serialized);
    });
  });

  parentPort.postMessage({ calendarName, events });
} catch (error) {
  parentPort.postMessage({
    error: error?.message || 'Failed to parse Google Calendar.',
  });
}
