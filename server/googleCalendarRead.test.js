import test from 'node:test';
import assert from 'node:assert/strict';
import { googleCalendarReadId, googleApiEventToCalendarEvent } from './googleCalendarRead.js';
import { listGoogleCalendarLessonEvents } from './googleCalendarWriteback.js';

test('API import uses the subscribed calendar, not another selected writeback calendar', () => {
  const url = 'https://calendar.google.com/calendar/ical/lessons%40group.calendar.google.com/private-fixture/basic.ics';
  const id = 'lessons@group.calendar.google.com';
  assert.equal(googleCalendarReadId(url, { encryptedTokens: 'fixture', calendarId: id }), id);
  assert.equal(googleCalendarReadId(url, { encryptedTokens: 'fixture', calendarId: 'other' }), '');
  assert.equal(googleCalendarReadId(url, { encryptedTokens: 'fixture', calendarId: 'other', calendars: [{ id }] }), id);
  assert.equal(googleCalendarReadId(url, { calendarId: id }), '');
  assert.equal(googleCalendarReadId(url.replace('calendar.google.com/', 'example.test/'), { encryptedTokens: 'fixture', calendarId: id }), '');
});

test('API occurrence retains canonical iCal UID, cancellation and all-day metadata', () => {
  const event = googleApiEventToCalendarEvent({ id: 'instance', iCalUID: 'series', status: 'cancelled', start: { date: '2026-09-25' }, end: { date: '2026-09-26' } });
  assert.equal(event.uid, 'series');
  assert.equal(event.status, 'CANCELLED');
  assert.equal(event.isFullDay, true);
});

test('API import follows empty pages and preserves history without a lower date bound', async () => {
  const requests = [];
  const events = await listGoogleCalendarLessonEvents({ accessToken: 'fixture', calendarId: 'lessons', timeMax: '2027-01-01T00:00:00Z', fetchImpl: async url => {
    requests.push(new URL(url));
    return new Response(JSON.stringify(requests.length === 1 ? { items: [], nextPageToken: 'next' } : { items: [{ id: 'past' }, { id: 'moved' }] }));
  } });
  assert.deepEqual(events.map(e => e.id), ['past', 'moved']);
  assert.equal(requests[0].searchParams.has('timeMin'), false);
  assert.equal(requests[1].searchParams.get('pageToken'), 'next');
  assert.equal(requests[0].searchParams.get('singleEvents'), 'true');
  assert.equal(requests[0].searchParams.get('showDeleted'), 'false');
});

test('API import rejects incomplete pagination instead of returning a truncated calendar', async () => {
  await assert.rejects(listGoogleCalendarLessonEvents({ accessToken: 'fixture', calendarId: 'lessons', fetchImpl: async () => new Response(JSON.stringify({ items: [], nextPageToken: 'repeated' })) }), /слишком большой/);
});
