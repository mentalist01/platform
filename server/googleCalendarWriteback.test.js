import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendGoogleCalendarCancelledSuffix,
  createGoogleCalendarOAuthState,
  decryptGoogleCalendarTokens,
  encryptGoogleCalendarTokens,
  patchGoogleCalendarOccurrenceCancellation,
  removeGoogleCalendarCancelledSuffix,
  verifyGoogleCalendarOAuthState,
} from './googleCalendarWriteback.js';
import { googleCalendarTitleMatchesStudent } from './googleCalendarStudentMatch.js';

test('cancelled suffix is idempotent and remains invisible to student title matching', () => {
  assert.equal(appendGoogleCalendarCancelledSuffix('Роман'), 'Роман (ОТМЕНЕНО)');
  assert.equal(appendGoogleCalendarCancelledSuffix('Роман (ОТМЕНЕНО)'), 'Роман (ОТМЕНЕНО)');
  assert.equal(removeGoogleCalendarCancelledSuffix('Роман (ОТМЕНЕНО)'), 'Роман');
  assert.equal(googleCalendarTitleMatchesStudent('Роман (ОТМЕНЕНО)', { name: 'Роман' }), true);
});

test('OAuth state is bound to the current platform session and expires', () => {
  const state = createGoogleCalendarOAuthState({
    teacherId: 'teacher-1',
    authToken: 'session-a',
    secret: 'state-secret',
    expiresAtMs: 20_000,
  });
  assert.equal(verifyGoogleCalendarOAuthState({
    state,
    authToken: 'session-a',
    secret: 'state-secret',
    nowMs: 19_999,
  })?.teacherId, 'teacher-1');
  assert.equal(verifyGoogleCalendarOAuthState({
    state,
    authToken: 'session-b',
    secret: 'state-secret',
    nowMs: 10_000,
  }), null);
  assert.equal(verifyGoogleCalendarOAuthState({
    state,
    authToken: 'session-a',
    secret: 'state-secret',
    nowMs: 20_000,
  }), null);
});

test('Google tokens are encrypted at rest and can be restored', () => {
  const tokens = { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAtMs: 123 };
  const encrypted = encryptGoogleCalendarTokens(tokens, 'encryption-secret');
  assert.equal(encrypted.includes('access-secret'), false);
  assert.deepEqual(decryptGoogleCalendarTokens(encrypted, 'encryption-secret'), tokens);
  assert.throws(() => decryptGoogleCalendarTokens(encrypted, 'wrong-secret'));
});

test('only the selected recurring occurrence is marked cancelled and can be restored', async () => {
  const startAt = '2026-09-03T15:00:00.000Z';
  const requests = [];
  let currentEvent = {
    id: 'instance-123',
    iCalUID: 'series@example.com',
    summary: 'Роман',
    start: { dateTime: startAt },
    originalStartTime: { dateTime: startAt },
    status: 'confirmed',
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'email', minutes: 1440 },
      ],
    },
    extendedProperties: { private: { keepMe: 'yes' } },
  };
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (!options.method || options.method === 'GET') {
      return new Response(JSON.stringify({ items: [currentEvent] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const patch = JSON.parse(options.body);
    currentEvent = {
      ...currentEvent,
      ...patch,
      extendedProperties: patch.extendedProperties,
    };
    return new Response(JSON.stringify(currentEvent), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await patchGoogleCalendarOccurrenceCancellation({
    accessToken: 'token',
    calendarId: 'primary',
    iCalUid: 'series@example.com',
    expectedStartAt: startAt,
    occurrenceKey: 'mark-1',
    cancelled: true,
    fetchImpl,
  });
  const cancelPatch = JSON.parse(requests[1].options.body);
  assert.match(requests[0].url, /iCalUID=series%40example\.com/);
  assert.match(requests[1].url, /events\/instance-123\?sendUpdates=none$/);
  assert.equal(cancelPatch.summary, 'Роман (ОТМЕНЕНО)');
  assert.equal(cancelPatch.colorId, '11');
  assert.deepEqual(cancelPatch.reminders, { useDefault: false, overrides: [] });
  assert.equal(cancelPatch.extendedProperties.private.keepMe, 'yes');
  assert.equal(cancelPatch.extendedProperties.private.ivan100OriginalSummary, 'Роман');
  assert.deepEqual(
    JSON.parse(cancelPatch.extendedProperties.private.ivan100OriginalReminders),
    {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'email', minutes: 1440 },
      ],
    }
  );

  await patchGoogleCalendarOccurrenceCancellation({
    accessToken: 'token',
    calendarId: 'primary',
    iCalUid: 'series@example.com',
    expectedStartAt: startAt,
    occurrenceKey: 'mark-1',
    cancelled: true,
    fetchImpl,
  });
  const repeatedCancelPatch = JSON.parse(requests[3].options.body);
  assert.deepEqual(
    JSON.parse(repeatedCancelPatch.extendedProperties.private.ivan100OriginalReminders),
    {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'email', minutes: 1440 },
      ],
    }
  );

  await patchGoogleCalendarOccurrenceCancellation({
    accessToken: 'token',
    calendarId: 'primary',
    iCalUid: 'series@example.com',
    expectedStartAt: startAt,
    occurrenceKey: 'mark-1',
    cancelled: false,
    fetchImpl,
  });
  const restorePatch = JSON.parse(requests[5].options.body);
  assert.equal(restorePatch.summary, 'Роман');
  assert.equal(restorePatch.colorId, null);
  assert.deepEqual(restorePatch.reminders, {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 30 },
      { method: 'email', minutes: 1440 },
    ],
  });
  assert.equal(restorePatch.extendedProperties.private.keepMe, 'yes');
  assert.equal(restorePatch.extendedProperties.private.ivan100Cancelled, null);
  assert.equal(restorePatch.extendedProperties.private.ivan100OriginalReminders, null);
});
