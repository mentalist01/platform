import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableCents, balanceCents, balancePaidByMonth, balanceSummary, normalizeStudentBalances, releaseBalanceAllocation } from '../server/studentPaymentBalances.js';

export function repairStudentLessonPayment(financeDb, marksDb, { teacherId, studentId, from, to, correctionLesson, adjustmentId, now = new Date().toISOString() }) {
  const finance = structuredClone(financeDb), marks = structuredClone(marksDb);
  const teacher = finance[teacherId];
  if (!teacher?.studentPaymentBalances?.accounts?.[studentId]) throw new Error('Student balance not found');
  teacher.studentPaymentBalances = normalizeStudentBalances(teacher.studentPaymentBalances);
  const account = teacher.studentPaymentBalances.accounts[studentId];
  const repairKey = `lesson-repair:${from}:${to}:${adjustmentId}`;
  if (account.entries.some(entry => entry.repairKey === repairKey)) return { duplicate: true, finance, marks, before: balanceSummary(account), after: balanceSummary(account) };
  const parts = value => {
    if (!/^\d{4}-\d{2}-\d{2}@\d{2}:\d{2}$/.test(value || '')) throw new Error('Expected YYYY-MM-DD@HH:MM');
    const [dayKey, time] = value.split('@'); return { dayKey, time };
  };
  const sourceDate = parts(from), targetDate = parts(to), correctionDate = parts(correctionLesson);
  const find = date => {
    const rows = Object.values(account.allocations).filter(a => a.dayKey === date.dayKey && a.time === date.time);
    if (rows.length !== 1 || rows[0].imported || !rows[0].markKey.startsWith(`${teacherId}:`)
      || !rows[0].markKey.endsWith(`:${studentId}:${date.time}:paid`)) throw new Error('Expected one non-imported allocation');
    return rows[0];
  };
  const source = find(sourceDate), correction = find(correctionDate);
  const adjustment = account.entries.find(entry => entry.id === adjustmentId && entry.type === 'adjustment' && entry.adjustmentCents > 0);
  if (!adjustment || correction.cents !== adjustment.adjustmentCents || correction.funds?.length !== 1
    || correction.funds[0].entryId !== adjustment.id || correction.funds[0].cents !== adjustment.adjustmentCents) {
    throw new Error('Correction is not exclusively funded by the specified adjustment');
  }
  if (!Array.isArray(source.funds) || source.funds.reduce((sum, fund) => sum + fund.cents, 0) !== source.cents
    || source.funds.some(fund => !account.entries.some(entry => entry.id === fund.entryId && entry.type === 'receipt' && entry.source === 'bank'))) {
    throw new Error('Source is not an identified bank-funded payment');
  }
  const ledgers = Object.values(teacher.lessonLedger || {}).filter(row => row.studentId === studentId && row.dayKey === targetDate.dayKey && row.time === targetDate.time);
  if (ledgers.length !== 1 || !ledgers[0].sourceEntryId || balanceCents(ledgers[0].lessonPrice) !== source.cents) throw new Error('Target price or ledger does not match');
  const ledger = ledgers[0];
  const targetKey = `${teacherId}:${ledger.sourceEntryId}:${targetDate.dayKey}:${studentId}:${targetDate.time}:paid`;
  if (account.allocations[targetKey]) throw new Error('Target is already paid; review instead of crediting again');
  const before = balanceSummary(account);
  releaseBalanceAllocation(account, source.markKey, now, { block: true, reason: 'Исправление ошибочного распределения банковского перевода' });
  releaseBalanceAllocation(account, correction.markKey, now, { block: true, reason: 'Отмена распределения повторной корректировки' });
  const correctionBefore = availableCents(account);
  const reversal = { id: crypto.randomUUID(), type: 'adjustment', cents: adjustment.adjustmentCents, creditCents: 0,
    adjustmentCents: -adjustment.adjustmentCents, mode: 'subtract', requestedCents: adjustment.adjustmentCents,
    expectedAvailableCents: correctionBefore, beforeAvailableCents: correctionBefore,
    afterAvailableCents: correctionBefore - adjustment.adjustmentCents, idempotencyKey: repairKey,
    reversesEntryId: adjustment.id, funds: [{ entryId: adjustment.id, cents: adjustment.adjustmentCents }],
    note: 'Отмена повторной корректировки: банковский перевод уже учтён', at: now, recordedAt: now,
  };
  account.entries.push(reversal); reversal.balanceCents = availableCents(account);
  account.allocations[targetKey] = { ...source, ...targetDate, markKey: targetKey, eventId: ledger.sourceEntryId,
    durationMinutes: ledger.durationMinutes || 60, identity: '', paidAt: now, imported: false };
  delete account.blocked[targetKey];
  account.entries.push({ id: crypto.randomUUID(), type: 'move', cents: source.cents, creditCents: 0, at: now, recordedAt: now,
    markKey: source.markKey, targetMarkKey: targetKey, ...targetDate, repairKey,
    note: `Исправление распределения: оплата занятия ${targetDate.dayKey}`, balanceCents: availableCents(account) });
  normalizeStudentBalances(teacher.studentPaymentBalances);
  const after = balanceSummary(account);
  if (before.received !== after.received || after.adjusted !== before.adjusted - adjustment.adjustmentCents / 100) throw new Error('Money conservation check failed');
  marks[teacherId] ||= {};
  delete marks[teacherId][source.markKey]; delete marks[teacherId][correction.markKey]; marks[teacherId][targetKey] = now;
  for (const row of Object.values(teacher.paymentAllocations || {})) {
    if (row.studentId === studentId && [source.markKey, correction.markKey].includes(row.currentMarkKey)) {
      row.status = 'credit'; row.currentMarkKey = ''; row.targetMarkKey = ''; row.updatedAt = now;
    }
  }
  const monthly = balancePaidByMonth(account);
  for (const key of new Set([...Object.keys(teacher.months || {}), ...Object.keys(monthly)])) {
    teacher.months[key] ||= { students: {} }; teacher.months[key].students ||= {};
    if (!teacher.months[key].students[studentId] && !monthly[key]) continue;
    teacher.months[key].students[studentId] = { ...teacher.months[key].students[studentId], paidAmount: monthly[key] || 0 };
  }
  for (const row of Object.values(teacher.lessonLedger || {})) if (row.studentId === studentId) {
    row.paid = Object.values(account.allocations).some(allocation => allocation.dayKey === row.dayKey && allocation.time === row.time);
  }
  return { duplicate: false, finance, marks, before, after, targetKey };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter(arg => arg.includes('=')).map(arg => {
    const split = arg.indexOf('='); return [arg.slice(2, split), arg.slice(split + 1)];
  }));
  const dataDir = path.resolve(args['data-dir'] || 'server/data');
  const files = ['teacher-finances.json', 'teacher-calendar-marks.json'].map(file => path.join(dataDir, file));
  const original = files.map(file => fs.readFileSync(file, 'utf8'));
  const result = repairStudentLessonPayment(...original.map(value => JSON.parse(value)), {
    teacherId: args.teacher, studentId: args.student, from: args.from, to: args.to,
    correctionLesson: args['correction-lesson'], adjustmentId: args['reverse-adjustment'],
  });
  const summary = value => ({ received: value.received, adjusted: value.adjusted, allocated: value.allocated, available: value.available, paidLessons: value.paidLessons });
  console.log(JSON.stringify({ duplicate: result.duplicate, before: summary(result.before), after: summary(result.after), targetKey: result.targetKey }));
  if (process.argv.includes('--apply') && !result.duplicate) {
    if (!process.argv.includes('--confirm-offline')) throw new Error('Stop all writers and confirm offline before applying');
    const backup = path.join(dataDir, `lesson-payment-repair-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify({ createdAt: new Date().toISOString(), files: Object.fromEntries(files.map((file, i) => [path.basename(file), JSON.parse(original[i])])) }), { mode: 0o600, flag: 'wx' });
    for (let i = 0; i < files.length; i += 1) if (fs.readFileSync(files[i], 'utf8') !== original[i]) throw new Error('Data changed during preview');
    for (const [index, value] of [result.finance, result.marks].entries()) {
      const temporary = `${files[index]}.repair-${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, files[index]);
    }
    console.log(JSON.stringify({ applied: true, backup }));
  }
}
