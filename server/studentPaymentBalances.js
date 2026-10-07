import crypto from 'node:crypto';

const copy = value => structuredClone(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const balanceError = (message, code = 'balance_invalid', status = 409) => Object.assign(new Error(message), { code, status });
export function balanceCents(value) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || Math.abs(cents) > 100_000_000_000) {
    throw balanceError('Некорректная сумма.', 'balance_invalid', 400);
  }
  return cents;
}
const month = date => String(date || '').slice(0, 7);
const total = entries => entries.reduce((sum, entry) => sum + entry.creditCents, 0);
const spent = account => Object.values(account.allocations).reduce((sum, allocation) => sum + allocation.cents, 0);
export const availableCents = account => total(account.entries) - spent(account);

export function normalizeStudentBalances(value) {
  if (value == null) return null;
  if (!object(value) || value.version !== 1 || !object(value.accounts)) throw balanceError('Повреждён журнал балансов. Изменения остановлены.', 'balance_corrupt', 503);
  for (const account of Object.values(value.accounts)) {
    if (!object(account) || !Array.isArray(account.entries) || !object(account.allocations) || !object(account.blocked)
      || !Array.isArray(account.knownReceiptIds) || !object(account.pending)) throw balanceError('Повреждён журнал ученика.', 'balance_corrupt', 503);
    const ids = new Set();
    for (const entry of account.entries) {
      if (!entry.id || ids.has(entry.id) || !Number.isSafeInteger(entry.creditCents) || entry.creditCents < 0
        || !Number.isSafeInteger(entry.cents) || entry.cents < 0) throw balanceError('Повреждена операция баланса.', 'balance_corrupt', 503);
      ids.add(entry.id);
    }
    if (Object.entries(account.allocations).some(([key, a]) => !object(a) || key !== a.markKey || !Number.isSafeInteger(a.cents) || a.cents <= 0
      || !/^\d{4}-\d{2}-\d{2}$/.test(a.dayKey) || !/^\d{2}:\d{2}$/.test(a.time))) throw balanceError('Повреждено списание баланса.', 'balance_corrupt', 503);
    if (!Number.isSafeInteger(total(account.entries)) || !Number.isSafeInteger(spent(account)) || availableCents(account) < 0) throw balanceError('Нарушена сумма баланса.', 'balance_corrupt', 503);
  }
  return copy(value);
}

function journal(account, type, cents, fields, now, creditCents = 0) {
  const entry = { id: crypto.randomUUID(), type, cents, creditCents, recordedAt: now, at: now, ...fields };
  account.entries.push(entry);
  entry.balanceCents = availableCents(account);
  return entry;
}

export function createBalanceAccount({ openingByMonth = {}, paid = [], knownReceiptIds = [], now }) {
  const account = { entries: [], allocations: {}, blocked: {}, knownReceiptIds: [...new Set(knownReceiptIds)], pending: {}, enabledAt: now };
  for (const [key, amount] of Object.entries(openingByMonth).sort()) {
    const cents = balanceCents(amount);
    if (cents < 0) throw balanceError('Отрицательная исходная сумма требует сверки.');
    if (cents) journal(account, 'opening', cents, { month: key, note: 'Учтено до перехода на баланс' }, now, cents);
  }
  for (const occurrence of paid) {
    const cents = occurrence.cents;
    if (!occurrence.markKey || cents <= 0 || account.allocations[occurrence.markKey]) continue;
    account.allocations[occurrence.markKey] = { ...occurrence, imported: true, paidAt: occurrence.paidAt || now };
  }
  if (availableCents(account) < 0) {
    throw balanceError('Сумма оплаченных занятий больше учтённых поступлений. Сначала нужна сверка.', 'balance_migration_conflict');
  }
  journal(account, 'migration', 0, { note: 'Старые оплаты сохранены, новых денег не начислено' }, now);
  return account;
}

export function addBalanceReceipt(account, { id, amount, at, senderName = '', note = '', source = 'manual', aliases = [] }, now) {
  const cents = balanceCents(amount);
  if (cents <= 0 || !id) throw balanceError('Укажите положительную сумму и идентификатор платежа.', 'balance_invalid', 400);
  const ids = [id, ...aliases].filter(Boolean);
  if (ids.some(key => account.knownReceiptIds.includes(key))) {
    const existing = account.entries.find(e => e.receiptId === id && e.type === 'receipt')
      || account.entries.find(e => e.bankConfirmed === id);
    if (existing && existing.cents !== cents) throw balanceError('Этот идентификатор уже использован для другой суммы.');
    return { duplicate: true };
  }
  if (!Number.isFinite(Date.parse(at))) throw balanceError('Некорректная дата платежа.', 'balance_invalid', 400);
  journal(account, 'receipt', cents, { receiptId: id, source, senderName, note, at, month: month(at) }, now, cents);
  account.knownReceiptIds.push(...ids);
  return { duplicate: false };
}

export function confirmBalancePending(account, id, manualEntryId, now) {
  const receipt = account.pending[id];
  if (!receipt) throw balanceError('Уведомление уже обработано или не найдено.');
  if (manualEntryId) {
    const manual = account.entries.find(e => e.id === manualEntryId && e.type === 'receipt' && e.source === 'manual');
    if (!manual || manual.bankConfirmed || !receipt.manualReceiptIds.includes(manualEntryId)) throw balanceError('Ручной платёж не подходит для этого уведомления.');
    manual.bankConfirmed = id;
    account.knownReceiptIds.push(id, ...(receipt.aliases || []));
    journal(account, 'receipt-link', 0, { receiptId: id, note: 'Банковское уведомление связано с ручным платежом' }, now);
  } else addBalanceReceipt(account, receipt, now);
  delete account.pending[id];
}

export function possibleManualReceipts(account, receipt) {
  const cents = balanceCents(receipt.amount);
  const at = Date.parse(receipt.at);
  const key = value => String(value || '').toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
  return account.entries.filter(entry => entry.type === 'receipt' && entry.source === 'manual'
    && !entry.bankConfirmed && entry.creditCents === cents
    && Math.abs(Date.parse(entry.at) - at) <= 3 * 86_400_000
    && (!entry.senderName || key(entry.senderName) === key(receipt.senderName)));
}

export function releaseBalanceAllocation(account, markKey, now, { block = false, reason = 'Оплата освобождена' } = {}) {
  const allocation = account.allocations[markKey];
  if (block) account.blocked[markKey] = now;
  if (!allocation) return false;
  delete account.allocations[markKey];
  journal(account, 'release', allocation.cents, { markKey, dayKey: allocation.dayKey, time: allocation.time, note: reason }, now);
  return true;
}

export function reserveBalanceAllocation(account, occurrence, now, { force = false } = {}) {
  if (account.allocations[occurrence.markKey]) return false;
  if (!force && account.blocked[occurrence.markKey]) return false;
  if (!occurrence.eligible || occurrence.cents <= 0) throw balanceError('Нельзя оплатить отменённое, пробное или неподходящее занятие.');
  if (availableCents(account) < occurrence.cents) throw balanceError('Недостаточно денег на балансе ученика. Внесите полученный платёж в разделе «Балансы».', 'balance_insufficient');
  delete account.blocked[occurrence.markKey];
  account.allocations[occurrence.markKey] = { ...occurrence, paidAt: now };
  journal(account, 'reserve', occurrence.cents, { markKey: occurrence.markKey, dayKey: occurrence.dayKey, time: occurrence.time, note: 'Занятие оплачено из баланса' }, now);
  return true;
}

export function reconcileBalanceAccount(account, occurrences, now, { removedKeys = [], allocate = true } = {}) {
  const byKey = new Map(occurrences.map(o => [o.markKey, o]));
  const moves = new Map();
  for (const occurrence of occurrences) {
    for (const key of occurrence.moveFromKeys || []) {
      if (!moves.has(key)) moves.set(key, []);
      moves.get(key).push(occurrence);
    }
  }
  const removed = new Set(removedKeys);
  const issues = [];
  for (const [key, allocation] of Object.entries(account.allocations)) {
    const occurrence = byKey.get(key);
    if (removed.has(key) || (occurrence && !occurrence.eligible)) {
      releaseBalanceAllocation(account, key, now, { reason: 'Занятие отменено или стало пробным' });
      continue;
    }
    if (occurrence) {
      allocation.identity = occurrence.identity || allocation.identity;
      continue;
    }
    const replacements = moves.get(key) || occurrences.filter(o => allocation.identity && o.identity === allocation.identity);
    if (replacements.length === 1) {
      const target = replacements[0];
      releaseBalanceAllocation(account, key, now, { reason: `Перенос занятия на ${target.dayKey}` });
      if (target.eligible && !account.allocations[target.markKey] && !account.blocked[target.markKey]) {
        reserveBalanceAllocation(account, { ...target, cents: allocation.cents }, now);
      }
      journal(account, 'move', allocation.cents, { markKey: key, targetMarkKey: target.markKey, dayKey: target.dayKey, time: target.time, note: 'Подтверждённый перенос Google Calendar' }, now);
    } else {
      issues.push({ markKey: key, dayKey: allocation.dayKey, time: allocation.time, amount: allocation.cents / 100, reason: 'Оплаченное занятие отсутствует в календаре; отмена не подтверждена' });
    }
  }
  if (allocate) {
    const candidates = occurrences.filter(o => o.eligible && !account.allocations[o.markKey] && !account.blocked[o.markKey])
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.time.localeCompare(b.time) || a.markKey.localeCompare(b.markKey));
    for (const occurrence of candidates) {
      if (occurrence.cents <= 0) continue;
      if (availableCents(account) < occurrence.cents) break;
      reserveBalanceAllocation(account, occurrence, now);
    }
  }
  return issues;
}

// Project money into the existing monthly finance reports. Funds not assigned
// to a lesson remain in their receipt month; a transfer never creates income.
export function balancePaidByMonth(account) {
  const funds = account.entries.filter(e => e.creditCents > 0).map(e => ({ month: e.month || month(e.at), cents: e.creditCents }));
  const result = {};
  let index = 0;
  for (const allocation of Object.values(account.allocations).sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.time.localeCompare(b.time))) {
    let remaining = allocation.cents;
    while (remaining > 0 && index < funds.length) {
      const used = Math.min(remaining, funds[index].cents);
      funds[index].cents -= used;
      remaining -= used;
      if (!funds[index].cents) index += 1;
    }
    result[month(allocation.dayKey)] = (result[month(allocation.dayKey)] || 0) + allocation.cents;
  }
  for (const fund of funds) result[fund.month] = (result[fund.month] || 0) + fund.cents;
  return Object.fromEntries(Object.entries(result).map(([key, cents]) => [key, cents / 100]));
}

export function balanceSummary(account, issues = []) {
  return {
    available: availableCents(account) / 100,
    received: total(account.entries) / 100,
    allocated: spent(account) / 100,
    paidLessons: Object.keys(account.allocations).length,
    entries: [...account.entries].reverse().map(e => ({ ...e, amount: e.cents / 100, balance: (e.balanceCents || 0) / 100 })),
    pending: Object.values(account.pending || {}),
    issues,
  };
}
