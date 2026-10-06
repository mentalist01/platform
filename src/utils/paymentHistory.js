const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const statuses = new Set(['applied', 'pending', 'ignored', 'duplicate']);
export const paymentHistoryNameKey = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
export function paymentHistoryDay(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? dayFormat.format(new Date(timestamp)) : '';
}
export function paymentHistoryPeriod(period, now = new Date()) {
  const today = paymentHistoryDay(now.toISOString());
  const date = new Date(`${today}T12:00:00Z`);
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (period === 'previous') {
    date.setUTCDate(0);
    return { from: `${date.toISOString().slice(0, 7)}-01`, to: date.toISOString().slice(0, 10) };
  }
  if (period === 'week' || period === '30days') {
    date.setUTCDate(date.getUTCDate() - (period === 'week' ? 6 : 29));
    return { from: date.toISOString().slice(0, 10), to: today };
  }
  return { from: '', to: '' };
}
const sum = rows => {
  const marks = new Set(), studentIds = new Set(), payerNames = new Set();
  let received = 0, applied = 0, pending = 0, payments = 0, missingLessons = 0, foreignCurrency = 0;
  const counts = { applied: 0, pending: 0, ignored: 0, duplicate: 0 };
  for (const row of rows) {
    counts[row.status]++;
    if (row.currency !== 'RUB') { foreignCurrency++; continue; }
    if (!['applied', 'pending'].includes(row.status) || row.cents <= 0) continue;
    received += row.cents; payments++;
    if (row.studentId) studentIds.add(row.studentId);
    if (row.senderName) payerNames.add(paymentHistoryNameKey(row.senderName));
    if (row.status === 'pending') pending += row.cents;
    else {
      applied += row.cents;
      if (!row.markKeys.length) missingLessons++;
      row.markKeys.forEach(key => marks.add(`${row.personId}:${key}`));
    }
  }
  return { received: received / 100, applied: applied / 100, pending: pending / 100, payments,
    students: studentIds.size, payerNames: payerNames.size, lessons: marks.size, missingLessons, foreignCurrency,
    average: payments ? Math.round(received / payments) / 100 : 0, counts, notifications: rows.length };
};
export function buildPaymentHistoryReport(entries, filters = {}) {
  const seen = new Set(), people = new Map();
  const all = (Array.isArray(entries) ? entries : []).filter(entry => {
    if (!entry?.id || seen.has(entry.id)) return false;
    seen.add(entry.id); return true;
  }).map(entry => {
    const studentId = String(entry.studentId || '').trim();
    const senderName = String(entry.senderName || '').trim(), studentName = String(entry.studentName || '').trim();
    const senderKey = paymentHistoryNameKey(senderName);
    const personId = studentId ? `student:${studentId}` : `unmatched:${senderKey || entry.id}:${paymentHistoryNameKey(studentName)}`;
    const amount = Number(entry.amount);
    const rawCents = Math.round(amount * 100);
    const cents = Number.isSafeInteger(rawCents) ? Math.max(0, rawCents) : 0;
    const date = entry.receivedAt || entry.createdAt;
    return { ...entry, studentId, studentName, senderName, personId, cents, amount: cents / 100,
      currency: String(entry.currency || 'RUB').toUpperCase(), day: paymentHistoryDay(date), timestamp: Date.parse(date) || 0,
      status: statuses.has(entry.status) ? entry.status : 'pending',
      markKeys: [...new Set((Array.isArray(entry.markKeys) ? entry.markKeys : []).filter(key => typeof key === 'string' && key.trim()))],
    };
  }).sort((a, b) => b.timestamp - a.timestamp || String(a.id).localeCompare(String(b.id)));
  for (const row of all) {
    if (!people.has(row.personId)) people.set(row.personId, { id: row.personId, studentId: row.studentId, name: row.studentName || row.senderName || 'Без имени', names: new Set(), senders: new Set(), rows: [] });
    const person = people.get(row.personId);
    if (row.studentName) person.names.add(row.studentName);
    if (row.senderName) person.senders.add(row.senderName);
    person.rows.push(row);
  }
  const tokens = String(filters.query || '').trim().split(/\s+/).map(paymentHistoryNameKey).filter(Boolean);
  const searchRows = all.filter(row => {
    const names = [...people.get(row.personId).names, row.senderName].map(paymentHistoryNameKey).join(' ');
    return tokens.every(token => names.includes(token));
  });
  const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);
  const bound = value => { const text = String(value ?? '').replace(/\s+/g, '').replace(',', '.'); return text ? Number(text) : null; };
  const min = bound(filters.minAmount), max = bound(filters.maxAmount);
  const invalidAmount = (min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0)) || (min !== null && max !== null && min > max);
  let rows = invalidRange || invalidAmount ? [] : searchRows.filter(row => (!filters.personId || filters.personId === row.personId)
    && (!filters.status || row.status === filters.status)
    && (!filters.authMode || (row.authMode || 'unknown') === filters.authMode)
    && (!filters.from || (row.day && row.day >= filters.from))
    && (!filters.to || (row.day && row.day <= filters.to))
    && (min === null || row.amount >= min) && (max === null || row.amount <= max));
  const sort = filters.sort || 'newest';
  rows = [...rows].sort((a, b) => {
    if (sort === 'oldest') return a.timestamp - b.timestamp;
    if (sort === 'largest') return b.cents - a.cents || b.timestamp - a.timestamp;
    if (sort === 'smallest') return a.cents - b.cents || b.timestamp - a.timestamp;
    return b.timestamp - a.timestamp;
  });
  const visibleIds = new Set(rows.map(row => row.personId));
  const filteredByPerson = new Map();
  for (const row of rows) {
    if (!filteredByPerson.has(row.personId)) filteredByPerson.set(row.personId, []);
    filteredByPerson.get(row.personId).push(row);
  }
  const lifetimeRows = all.filter(row => visibleIds.has(row.personId));
  const searchLifetimeRows = searchRows.filter(row => visibleIds.has(row.personId));
  const personRows = [...people.values()].filter(person => visibleIds.has(person.id)).map(person => {
    const filtered = filteredByPerson.get(person.id);
    return { id: person.id, studentId: person.studentId, name: person.name, names: [...person.names], senders: [...person.senders],
      summary: sum(filtered), lifetime: sum(person.rows), firstDay: person.rows.filter(row => row.day).at(-1)?.day || '', lastDay: person.rows.find(row => row.day)?.day || '',
      lastPaymentDay: person.rows.find(row => row.cents > 0 && row.currency === 'RUB' && ['applied','pending'].includes(row.status))?.day || '' };
  }).sort((a, b) => b.summary.received - a.summary.received || a.name.localeCompare(b.name, 'ru'));
  const months = new Map();
  for (const row of rows) {
    if (!row.day) continue;
    const key = row.day.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(row);
  }
  return { rows, people: personRows, summary: sum(rows), lifetime: sum(lifetimeRows), searchLifetime: sum(searchLifetimeRows), total: sum(all),
    months: [...months].sort(([a], [b]) => b.localeCompare(a)).map(([month, entries]) => ({ month, ...sum(entries) })),
    earliestDay: all.filter(row => row.day).at(-1)?.day || '', latestDay: all.find(row => row.day)?.day || '',
    invalidRange, invalidAmount };
}
export function paymentHistoryCsv(rows) {
  const labels = { applied: 'Учтено', pending: 'Требует проверки', ignored: 'Не учтено', duplicate: 'Повтор' };
  const safe = value => {
    let text = String(value ?? '');
    if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const decimal = value => value.toFixed(2).replace('.', ',');
  const data = rows.map(row => {
    const payment = row.currency === 'RUB' && ['applied', 'pending'].includes(row.status) ? row.amount : 0;
    const receivedAt = row.receivedAt || row.createdAt;
    const received = Number.isFinite(Date.parse(receivedAt)) ? new Date(receivedAt).toLocaleString('ru-RU', {timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}) : '';
    return [received, row.senderName, row.studentName, decimal(row.amount), row.currency, labels[row.status],
      decimal(payment), decimal(row.status === 'applied' ? payment : 0), decimal(row.status === 'pending' ? payment : 0),
      row.status === 'applied' ? row.markKeys.length : 0, row.reason || '', row.authMode === 'personal-key' ? 'Личный ключ' : row.authMode === 'legacy-key' ? 'Старый ключ' : 'Неизвестно'];
  });
  return '\uFEFF' + [['Получено (Москва)', 'Плательщик', 'Ученик', 'Сумма уведомления', 'Валюта', 'Результат', 'Поступления, ₽', 'Учтено, ₽', 'На проверке, ₽', 'Отметок занятий', 'Причина', 'Подключение'], ...data].map(row => row.map(safe).join(';')).join('\r\n');
}
