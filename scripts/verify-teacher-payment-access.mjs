import assert from 'node:assert/strict';

// Existing sessions can outlive the subscription due date. Verify their gate,
// while the caller still checks the full APIs for at least one active teacher.
export async function verifyTeacherPaymentAccess(request, token) {
  const response = await request('/api/teacher-subscription', { token });
  assert.equal(response.status, 200, `Teacher subscription status: HTTP ${response.status}`);
  const subscription = await response.json();
  assert.equal(typeof subscription.accessAllowed, 'boolean', 'Subscription access flag required');
  if (subscription.accessAllowed) return true;
  assert.equal(subscription.status, 'overdue', 'Only an overdue subscription may suspend access');
  for (const route of ['/api/teacher-payment-connection', '/api/payment-sender-links', '/api/payment-notifications']) {
    const gated = await request(route, { token });
    assert.equal(gated.status, 402, `Suspended teacher must be denied ${route}`);
    const payload = await gated.json();
    assert.equal(payload.subscription?.accessAllowed, false);
    assert.equal(payload.subscription?.status, 'overdue');
    assert.equal(payload.subscription?.month, subscription.month);
    assert.ok(typeof payload.error === 'string' && payload.error.length, 'Access explanation required');
    for (const field of ['connection', 'links', 'notifications', 'history', 'secret', 'token']) {
      assert.equal(Object.hasOwn(payload, field), false, `Suspended response must not expose ${field}`);
    }
  }
  return false;
}
