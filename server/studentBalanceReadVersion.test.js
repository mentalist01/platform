import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

test('actual read coordinator version invalidates every financial, roster and calendar input', () => {
  const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const start = source.indexOf('const studentBalanceReadVersion =');
  const end = source.indexOf('// Coalesce unchanged schedule polls', start);
  assert.ok(start > 0 && end > start);
  const names = ['teacherFinanceFile', 'teacherCalendarMarksFile', 'studentsFile', 'progressFile',
    'teacherCalendarSyncFile', 'teacherCalendarGoogleFile', 'learningGroupsFile',
    'learningLessonSessionsFile', 'paymentNotificationsFile'];
  const stats = new Map();
  const calendar = { sourceKey: 'calendar', loadedAtMs: 1, toMs: 2 };
  const context = { path, dataDir: 'fixture', learningSubscriptions: { file: 'subscriptions' },
    teacherCalendarSyncCache: new Map([['teacher', calendar]]),
    getStudentSchedulePaymentNowInfo: () => ({ todayKey: '2026-10-08' }),
    fs: { statSync(file) {
      if (!stats.has(file)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
      return stats.get(file);
    } },
  };
  for (const name of names) context[name] = name;
  const files = [...names, 'subscriptions', ...['group-availability.json', 'lesson-reschedules.json',
    'weekly-schedules.json', 'lesson-pace.json', 'desktop-recordings.json', 'lesson-replay-storage-index.json',
    'lesson-replay-receipts'].map(name => path.join('fixture', name))];
  for (const file of files) stats.set(file, { ino: 1, size: 10, mtimeMs: 1, ctimeMs: 1 });
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.version = studentBalanceReadVersion;`, context);
  const original = context.version('teacher');
  assert.equal(context.version('teacher'), original);
  for (const file of files) {
    stats.get(file).mtimeMs = 2;
    assert.notEqual(context.version('teacher'), original, `${file} must invalidate cached reconciliation`);
    stats.get(file).mtimeMs = 1;
  }
  calendar.loadedAtMs = 3;
  assert.notEqual(context.version('teacher'), original);
  calendar.loadedAtMs = 1;
  context.getStudentSchedulePaymentNowInfo = () => ({ todayKey: '2026-10-09' });
  assert.notEqual(context.version('teacher'), original);
  stats.delete('subscriptions');
  assert.doesNotThrow(() => context.version('teacher'));
  context.fs.statSync = () => { throw Object.assign(new Error('Unreadable'), { code: 'EACCES' }); };
  assert.throws(() => context.version('teacher'), /Unreadable/);
});
