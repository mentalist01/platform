import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyTeacherPaymentAccess } from './verify-teacher-payment-access.mjs';

const overdue = { accessAllowed: false, status: 'overdue', month: '2026-10' };
const active = { accessAllowed: true, status: 'paid', month: '2026-10' };
const fixture = ({ subscription = overdue, status = 402, payload = { error: 'Доступ приостановлен', subscription: overdue }, subscriptionStatus = 200 } = {}) => {
  const calls = [];
  return { calls, request: async (route, options) => {
    calls.push({route, token: options.token});
    return new Response(JSON.stringify(route === '/api/teacher-subscription' ? subscription : payload), {status: route === '/api/teacher-subscription' ? subscriptionStatus : status});
  }};
};
test('active teacher continues to the complete API verification', async () => {
  const f=fixture({subscription:active});
  assert.equal(await verifyTeacherPaymentAccess(f.request,'fictional-token'),true);
  assert.equal(f.calls.length,1);
});
test('overdue teacher must be denied all three financial endpoints', async () => {
  const f=fixture();
  assert.equal(await verifyTeacherPaymentAccess(f.request,'fictional-token'),false);
  assert.deepEqual(f.calls.map(c=>c.route),['/api/teacher-subscription','/api/teacher-payment-connection','/api/payment-sender-links','/api/payment-notifications']);
  assert.ok(f.calls.every(c=>c.token==='fictional-token'));
});
for(const status of [200,401,403,500]) test(`unexpected financial HTTP ${status} remains a release failure`,async()=>{
  const f=fixture({status});await assert.rejects(verifyTeacherPaymentAccess(f.request,'fictional-token'));
});
for(const field of ['connection','links','notifications','history','secret','token']) test(`suspended response cannot leak ${field}`,async()=>{
  const f=fixture({payload:{error:'Доступ приостановлен',subscription:overdue,[field]:[]}});await assert.rejects(verifyTeacherPaymentAccess(f.request,'fictional-token'));
});
test('a missing access flag cannot silently skip verification',async()=>{
  const f=fixture({subscription:{status:'overdue'}});await assert.rejects(verifyTeacherPaymentAccess(f.request,'fictional-token'));
});
test('another subscription state cannot silently skip verification',async()=>{
  const f=fixture({subscription:{...overdue,status:'unpaid'}});await assert.rejects(verifyTeacherPaymentAccess(f.request,'fictional-token'));
});
test('subscription lookup failure remains a release failure',async()=>{
  const f=fixture({subscriptionStatus:401});await assert.rejects(verifyTeacherPaymentAccess(f.request,'fictional-token'));
});
test('inconsistent suspension payload remains a release failure',async()=>{
  const f=fixture({payload:{error:'Доступ приостановлен',subscription:{...overdue,accessAllowed:true}}});await assert.rejects(verifyTeacherPaymentAccess(f.request,'fictional-token'));
});
