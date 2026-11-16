import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRosterMoney } from './rosterMoney.js';

test('cached formatters preserve whole, fractional, negative balances and rounding', () => {
  for (const amount of [0, -0, 1, 1500, 1520.5, -2345, -0.01, 0.001, 99999999.999, 500.005]) {
    const previous = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
    assert.equal(formatRosterMoney(amount), previous, String(amount));
  }
});
