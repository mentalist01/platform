import test from 'node:test';
import assert from 'node:assert/strict';
import { getMockTaskRuleNumber } from './mockTaskIdentity.js';

test('answer format follows the source card, not its current exam position', () => {
  assert.equal(getMockTaskRuleNumber(10, { sourceTaskNumber: 17 }), 17);
  assert.equal(getMockTaskRuleNumber(25, { sourceTaskNumber: 13 }), 13);
  assert.equal(getMockTaskRuleNumber(6, { sourceTaskNumber: 25 }), 25);
  assert.equal(getMockTaskRuleNumber(23, { sourceTaskNumber: 28 }), 28);
  assert.equal(getMockTaskRuleNumber(10), 10);
});

test('expanded game theory keeps the per-slot one/two/one answer format', () => {
  for (const slot of [19, 20, 21]) assert.equal(getMockTaskRuleNumber(slot, { sourceTaskNumber: 19 }), slot);
});
