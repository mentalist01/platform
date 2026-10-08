import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { retainWalletPaymentProjections, selectBalanceReconciliationStudents } from './studentBalanceCore.js';
import { createBalanceAccount, normalizeStudentBalances } from './studentPaymentBalances.js';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const projectStart = source.indexOf('const projectStudentBalances =');
const projectEnd = source.indexOf('// All wallet mutations', projectStart);
const makeProjection = () => {
  const context = {
    findStudentById: () => ({ id: 'student' }), walletStudentEligible: () => true,
    balancePaidByMonth: () => ({}),
    getTeacherFinanceStudentRecordForMonth: () => ({ profile: {}, monthData: { students: {} }, record: {} }),
    normalizeTeacherFinancePaymentAllocation: (allocation, originMarkKey) => ({ ...allocation, originMarkKey }),
  };
  vm.runInNewContext(`${source.slice(projectStart, projectEnd)}\nglobalThis.project = projectStudentBalances;`, context);
  return context.project;
};
function walletFixture(count) {
  const allocations = Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const markKey = `teacher:event-${index}:2026-10-08:student:20:00:paid`;
    return [markKey, { markKey, cents: 90000, dayKey: '2026-10-08', time: '20:00', eventId: `event-${index}`, paidAt: 'paid' }];
  }));
  const account = createBalanceAccount({ paid: Object.values(allocations), openingByMonth: { '2026-01': count * 900 }, now: '2026-10-08T17:00:00Z' });
  const balances = normalizeStudentBalances({ version: 1, accounts: { student: account } });
  return { balances, entry: { studentPaymentBalances: balances, months: {}, studentProfiles: {}, paymentAllocations: {}, lessonLedger: {} } };
}

for (const count of [1999, 2000, 2001, 2500]) test(`${count} active wallet projections stabilize after the initial projection`, () => {
  const { balances, entry } = walletFixture(count);
  const originalWallet = structuredClone(balances);
  const project = makeProjection();
  const marks = {};
  project('teacher', entry, marks);
  entry.paymentAllocations = retainWalletPaymentProjections(entry.paymentAllocations, balances);
  assert.equal(Object.keys(entry.paymentAllocations).length, count);
  const persisted = JSON.stringify(entry);
  const persistedMarks = JSON.stringify(marks);
  for (let pass = 0; pass < 3; pass += 1) {
    project('teacher', entry, marks);
    entry.paymentAllocations = retainWalletPaymentProjections(entry.paymentAllocations, balances);
    assert.equal(JSON.stringify(entry), persisted, 'a repeated GET must not report a changed financial projection');
    assert.equal(JSON.stringify(marks), persistedMarks);
  }
  assert.deepEqual(balances, originalWallet, 'projection retention never changes the monetary journal');
});

test('only unmanaged legacy records are capped, preserving their order and wallet prices', () => {
  const wallet = { accounts: { student: { allocations: { paid: {} } } } };
  const entries = {
    oldLegacy: { studentId: 'other', amount: 100 },
    oldWalletOrigin: { studentId: 'student', originMarkKey: 'oldWalletOrigin', currentMarkKey: 'paid', amount: 900 },
    newerLegacy: { studentId: 'other', amount: 200 },
    newestLegacy: { studentId: 'other', amount: 300 },
  };
  const snapshot = structuredClone(entries);
  assert.deepEqual(retainWalletPaymentProjections(entries, wallet, 2), {
    oldWalletOrigin: entries.oldWalletOrigin, newerLegacy: entries.newerLegacy, newestLegacy: entries.newestLegacy,
  });
  assert.deepEqual(retainWalletPaymentProjections(entries, null, 2), {
    newerLegacy: entries.newerLegacy, newestLegacy: entries.newestLegacy,
  });
  assert.deepEqual(entries, snapshot);
});

test('one student cannot retain another student\'s allocation through a matching mark key', () => {
  const wallet = { accounts: { owner: { allocations: { shared: {} } } } };
  const entries = { shared: { studentId: 'other', currentMarkKey: 'shared' }, newest: { studentId: 'other' } };
  assert.deepEqual(retainWalletPaymentProjections(entries, wallet, 1), { newest: entries.newest });
});

test('student reads select one pupil while migrations and teacher reads keep every teacher pupil', () => {
  const students = [{ id: 'egor', teacherId: 'teacher' }, { id: 'egor1', teacherId: 'teacher' }, { id: 'external', teacherId: 'another' }];
  const snapshot = structuredClone(students);
  assert.deepEqual(selectBalanceReconciliationStudents(students, 'teacher', { studentId: 'egor1' }), [students[1]]);
  for (const options of [{}, { studentId: 'egor1', enable: true }, { studentId: 'egor1', preview: true }]) {
    assert.deepEqual(selectBalanceReconciliationStudents(students, 'teacher', options), students.slice(0, 2));
  }
  assert.deepEqual(selectBalanceReconciliationStudents(students, 'teacher', { studentId: 'external' }), []);
  assert.deepEqual(students, snapshot);
});
