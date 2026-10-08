import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { balanceError } from './studentPaymentBalances.js';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const declaration = name => {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0);
  const end = source.indexOf('\nconst ', start + 1);
  return source.slice(start, end);
};
const helpers = ['isStudentBalanceMaintenance', 'studentBalanceMaintenanceError'].map(declaration).join('\n')
  + '\n' + source.slice(source.indexOf('const walletResponseError ='), source.indexOf("app.use('/api/student-payment-balances',"));
const unavailable = () => { throw new Error('Financial/calendar work must not execute in maintenance'); };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('maintenance rejects wallet endpoints before writes and passes through when disabled', () => {
  let handler;
  const context = { process: { env: { BALANCE_MAINTENANCE: '1' } }, balanceError,
    app: { use(path, callback) { assert.equal(path, '/api/student-payment-balances'); handler = callback; } } };
  const start = source.indexOf("app.use('/api/student-payment-balances',");
  const end = source.indexOf("app.get('/api/student-payment-balances',", start);
  vm.runInNewContext(`${helpers}\n${source.slice(start, end)}`, context);
  const res = response();
  handler({}, res, unavailable);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'balance_maintenance');
  context.process.env.BALANCE_MAINTENANCE = '0';
  let next = false;
  handler({}, response(), () => { next = true; });
  assert.ok(next);
});

test('maintenance stops wallet mutations and reconciliation before all financial/calendar work', async () => {
  const context = { process: { env: { BALANCE_MAINTENANCE: '1' } }, balanceError,
    walletEnabled: unavailable, loadWalletCalendar: unavailable, readTeacherFinanceDb: unavailable,
    normalizeTeacherId: unavailable };
  vm.runInNewContext(`${helpers}\n${declaration('mutateStudentBalances')}\n${declaration('reconcileTeacherPaymentCredits')}
    globalThis.mutate = mutateStudentBalances; globalThis.reconcile = reconcileTeacherPaymentCredits;`, context);
  let actionRan = false;
  await assert.rejects(context.mutate('teacher', { action: () => { actionRan = true; } }),
    error => error.status === 503 && error.code === 'balance_maintenance');
  assert.equal(actionRan, false);
  const result = await context.reconcile('teacher');
  assert.equal(result.changed, false);
  assert.equal(result.transfers.length, 0);
});

test('calendar marks remain readable without wallet validation or mutation', async () => {
  let handler;
  const original = { existingPaid: '2026-10-08T17:00:00Z' };
  const context = { process: { env: { BALANCE_MAINTENANCE: '1' } }, balanceError,
    app: { get(_path, callback) { handler = callback; } },
    isTeacherRole: () => true, ensureTeacherAccess: () => ({ id: 'teacher' }),
    walletEnabled: unavailable, enqueuePaymentNotification: unavailable, mutateStudentBalances: unavailable,
    readTeacherCalendarMarksDb: () => ({ teacher: original }), normalizeTeacherCalendarMarks: value => value,
  };
  const start = source.indexOf("app.get('/api/teacher-calendar-marks',");
  const end = source.indexOf("app.patch('/api/teacher-calendar-marks',", start);
  vm.runInNewContext(`${helpers}\n${source.slice(start, end)}`, context);
  const res = response();
  await handler({ query: {}, auth: { id: 'teacher' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.marks, original);
  assert.deepEqual(original, { existingPaid: '2026-10-08T17:00:00Z' });
});
