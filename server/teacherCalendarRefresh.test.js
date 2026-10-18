import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const start = source.indexOf('const runTeacherCalendarRefresh =');
const declaration = source.slice(start, source.indexOf('\nconst ', start + 1));
function fixture() {
  const calls = { fetch: 0, sync: 0, validate: 0 };
  const context = {
    Date, Promise, console: { warn() {} }, GOOGLE_CALENDAR_SYNC_CACHE_TTL_MS: 300000,
    teacherCalendarRefreshInFlight: new Map(), teacherCalendarRefreshResultCache: new Map(),
    getTeacherCalendarSyncSettings: () => ({ enabled: true, icalUrl: 'fixture' }),
    getTeacherCalendarRefreshSettingsKey: () => 'fixture',
    fetchTeacherGoogleCalendarEntries: async () => { calls.fetch++; return []; },
    syncTeacherStudentSchedulesFromGoogleCalendar: async () => { calls.sync++; return { updatedStudentCount: 0 }; },
    reconcileTeacherPaymentCredits: async (_id, options) => { assert.equal(options.validateAllocated, true); calls.validate++; },
    notifyScheduleSyncUpdate() {}, buildTeacherCalendarSyncSettingsResponse: value => value,
  };
  vm.runInNewContext(declaration + '\nglobalThis.refresh = runTeacherCalendarRefresh;', context);
  return { context, calls };
}
test('concurrent and cached calendar polls validate balances once, forced refresh still validates', async () => {
  const { context, calls } = fixture();
  await Promise.all([context.refresh('teacher', {}), context.refresh('teacher', {}), context.refresh('teacher', {})]);
  await context.refresh('teacher', {});
  assert.deepEqual(calls, { fetch: 1, sync: 1, validate: 1 });
  await context.refresh('teacher', {}, { force: true });
  assert.deepEqual(calls, { fetch: 2, sync: 2, validate: 2 });
});
test('a failed balance validation preserves calendar availability and is retried on the next fresh refresh', async () => {
  const { context, calls } = fixture();
  context.reconcileTeacherPaymentCredits = async () => { calls.validate++; throw new Error('fixture failure'); };
  assert.equal((await context.refresh('teacher', {})).ok, true);
  await context.refresh('teacher', {});
  assert.equal(calls.validate, 1);
  await context.refresh('teacher', {}, { force: true });
  assert.equal(calls.validate, 2);
});
