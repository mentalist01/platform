import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaymentHistoryReport, paymentHistoryCsv, paymentHistoryDay, paymentHistoryPeriod } from './paymentHistory.js';
const entry = (id, extra = {}) => ({ id, studentId:'s1', studentName:'Дима', senderName:'Иван П.', amount:2000, currency:'RUB', status:'applied', markKeys:[id], receivedAt:'2026-10-05T12:00:00Z', ...extra });
const records = [
  entry('a', {amount:4000,markKeys:['l1','l2','l1'],receivedAt:'2026-09-30T20:59:59Z'}),
  entry('b', {senderName:'Елена С',markKeys:['l3'],receivedAt:'2026-09-30T21:00:00Z'}),
  entry('c', {status:'pending',amount:1000,markKeys:[]}),
  entry('d', {status:'ignored',amount:99999}),
  entry('e', {status:'duplicate',amount:4000,markKeys:['l1','l2']}),
  entry('f', {studentId:'s2',amount:3000,markKeys:['l4'],receivedAt:'2026-10-02T12:00:00Z'}),
  entry('g', {studentId:'',studentName:'',senderName:'Ольга С',status:'pending',amount:1000,markKeys:[]}),
  entry('h', {studentId:'s3',status:'pending',amount:0,markKeys:[]}),
  entry('i', {currency:'USD',amount:100}),
];
test('receipt totals separate pending, applied, ignored, duplicates and foreign currencies', () => {
  const report=buildPaymentHistoryReport(records);
  assert.equal(report.summary.received,11000);assert.equal(report.summary.applied,9000);assert.equal(report.summary.pending,2000);
  assert.equal(report.summary.payments,5);assert.equal(report.summary.average,2200);assert.equal(report.summary.students,2);assert.equal(report.summary.payerNames,3);
  assert.equal(report.summary.lessons,4);assert.equal(report.summary.foreignCurrency,1);
  assert.deepEqual(report.summary.counts,{applied:4,pending:3,ignored:1,duplicate:1});
});
test('same bank name and same student name never merge different student ids', () => {
  const people=buildPaymentHistoryReport(records,{query:'иван п'}).people;
  assert.equal(people.length,3); // Includes the zero pending record on a third profile.
  assert.equal(people.find(p=>p.studentId==='s1').lifetime.received,7000);
  assert.equal(people.find(p=>p.studentId==='s2').lifetime.received,3000);
});
test('payer search counts that payer receipts and reports the full student history separately', () => {
  const report=buildPaymentHistoryReport(records,{query:'Елена'});
  assert.equal(report.summary.received,2000);assert.equal(report.searchLifetime.received,2000);assert.equal(report.lifetime.received,7000);assert.equal(report.people.length,1);
  assert.equal(buildPaymentHistoryReport(records,{query:'Дима Иван'}).summary.received,8000);
});
test('Russian ё, punctuation, accents, renamed students and empty searches are normalized', () => {
  const rows=[entry('old',{studentName:'Данил',senderName:'Пётр П.'}),entry('new',{studentName:'Данила',senderName:'Мария'})];
  assert.equal(buildPaymentHistoryReport(rows,{query:'петр п'}).summary.received,2000);
  assert.equal(buildPaymentHistoryReport(rows,{query:'Данил'}).people[0].senders.length,2);
  assert.equal(buildPaymentHistoryReport(rows,{query:'несуществующий'}).rows.length,0);
});
test('Moscow midnight assigns transactions to the correct day and month', () => {
  assert.equal(paymentHistoryDay('2026-09-30T20:59:59Z'),'2026-09-30');
  assert.equal(paymentHistoryDay('2026-09-30T21:00:00Z'),'2026-10-01');
  const report=buildPaymentHistoryReport(records,{from:'2026-10-01',to:'2026-10-31'});
  assert.equal(report.summary.received,7000);assert.equal(report.lifetime.received,11000);
  assert.equal(report.months[0].month,'2026-10');assert.equal(report.months[0].received,7000);
});
test('period shortcuts handle leap February, year boundary and Moscow today', () => {
  assert.deepEqual(paymentHistoryPeriod('previous',new Date('2024-03-01T00:00Z')),{from:'2024-02-01',to:'2024-02-29'});
  assert.deepEqual(paymentHistoryPeriod('previous',new Date('2026-01-10T00:00Z')),{from:'2025-12-01',to:'2025-12-31'});
  assert.deepEqual(paymentHistoryPeriod('week',new Date('2026-10-05T21:30Z')),{from:'2026-09-30',to:'2026-10-06'});
});
test('cents use integer arithmetic and unknown lesson counts are not inferred from amounts', () => {
  const report=buildPaymentHistoryReport([entry('x',{amount:0.1,markKeys:[]}),entry('y',{amount:0.2,markKeys:[]}),entry('z',{amount:'NaN'})]);
  assert.equal(report.summary.received,0.3);assert.equal(report.summary.lessons,0);assert.equal(report.summary.missingLessons,2);
  assert.equal(buildPaymentHistoryReport([entry('unsafe',{amount:1e307})]).summary.received,0);
});
test('duplicate ids and repeated lesson marks are counted once without mutating input', () => {
  const rows=[entry('x',{markKeys:['one','one']}),entry('x'),entry('y',{markKeys:['one']})],before=JSON.stringify(rows);
  const report=buildPaymentHistoryReport(rows);assert.equal(report.summary.received,4000);assert.equal(report.summary.lessons,1);
  assert.equal(JSON.stringify(rows),before);
});
test('status, amount, source and selected person filters compose and preserve lifetime sums', () => {
  const rows=[entry('a',{authMode:'personal-key'}),entry('b',{amount:1000,status:'pending',authMode:'legacy-key'}),entry('c',{studentId:'s2',amount:500})];
  assert.equal(buildPaymentHistoryReport(rows,{status:'pending'}).lifetime.received,3000);
  assert.equal(buildPaymentHistoryReport(rows,{minAmount:'1,00',maxAmount:'1500',authMode:'legacy-key'}).summary.received,1000);
  assert.equal(buildPaymentHistoryReport(rows,{minAmount:'1 000',maxAmount:'1 500'}).summary.received,1000);
  assert.equal(buildPaymentHistoryReport(rows,{personId:'student:s2'}).summary.received,500);
  assert.equal(buildPaymentHistoryReport(rows,{authMode:'unknown'}).summary.received,500);
});
test('invalid ranges and invalid dates never throw or create misleading sums', () => {
  assert.equal(buildPaymentHistoryReport(records,{from:'2026-11-01',to:'2026-10-01'}).invalidRange,true);
  assert.equal(buildPaymentHistoryReport(records,{minAmount:'2000',maxAmount:'1000'}).invalidAmount,true);
  assert.equal(buildPaymentHistoryReport(records,{minAmount:'not-a-number'}).summary.received,0);
  assert.equal(buildPaymentHistoryReport([entry('bad',{receivedAt:'invalid'})],{from:'2026-01-01'}).rows.length,0);
});
test('all history participates in totals beyond both the old 100-row UI and 500-row journal caps', () => {
  const report=buildPaymentHistoryReport(Array.from({length:640},(_,i)=>entry(`r${i}`,{amount:1})));
  assert.equal(report.rows.length,640);assert.equal(report.summary.received,640);assert.equal(report.summary.lessons,640);
  assert.equal(buildPaymentHistoryReport(records,{sort:'largest'}).rows[0].id,'d');
});
test('CSV exports the entire selection with UTF-8 BOM, quotes and formula protection', () => {
  const report=buildPaymentHistoryReport([entry('export',{senderName:'=HYPERLINK("bad")',studentName:'@SUM(1)',reason:'line\n"quoted"'})]);
  const csv=paymentHistoryCsv(report.rows);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes("'@SUM"));assert.ok(csv.includes('""quoted""'));
  assert.ok(!csv.includes('secret'));assert.ok(csv.includes('2000,00'));
  const repeated=paymentHistoryCsv(buildPaymentHistoryReport([entry('repeat',{status:'duplicate'})]).rows);
  assert.ok(repeated.includes('"Повтор";"0,00";"0,00";"0,00"'));
});
