import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureGoogleCalendarPreparationLesson } from './googleCalendarWriteback.js';

test('Google preparation events are dated, idempotent and cancelled with ownership and etag checks', async () => {
  let event = null; const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, ...options });
    const method = options.method || 'GET';
    if (method === 'GET') return new Response(JSON.stringify(event || { error: { message: 'Not found' } }), { status: event ? 200 : 404 });
    const body = JSON.parse(options.body);
    event = { ...event, ...body, iCalUID: 'own@google', etag: 'revision' };
    return new Response(JSON.stringify(event));
  };
  const args = { accessToken: 'test', calendarId: 'calendar', plan: { teacherId: 'teacher', studentName: 'Ученица' }, lesson: { id: 'lesson-1', date: '2026-11-10', time: '16:00', durationMinutes: 40 }, fetchImpl };
  const first = await ensureGoogleCalendarPreparationLesson(args);
  assert.equal(first.iCalUID, 'own@google');
  assert.equal(event.recurrence, undefined);
  assert.equal(event.summary, 'Ученица (предподготовка)');
  assert.equal(Date.parse(event.end.dateTime) - Date.parse(event.start.dateTime), 40 * 60000);
  await ensureGoogleCalendarPreparationLesson(args);
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
  await ensureGoogleCalendarPreparationLesson({ ...args, lesson: { ...args.lesson, cancelled: true } });
  assert.equal(event.status, 'cancelled');
  assert.equal(requests.at(-1).headers['If-Match'], 'revision');
  const before = requests.length;
  await ensureGoogleCalendarPreparationLesson({ ...args, lesson: { ...args.lesson, cancelled: true } });
  assert.equal(requests.length, before + 1);
  await assert.rejects(ensureGoogleCalendarPreparationLesson({ ...args, plan: { ...args.plan, teacherId: 'foreign' } }), /не принадлежит/);
});
