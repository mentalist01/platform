import assert from 'node:assert/strict';
import test from 'node:test';
import { findPaymentSenderConflict, normalizePaymentSenderKey } from './paymentSenderLinks.js';

test('bank name comparisons catch casing, periods, whitespace and ё without conflating different initials', () => {
  const links = [{ senderName: 'Ольга К.', studentId: 'first' }, { senderName: 'Алёна М', studentId: 'third', manualReview: true }];
  for (const name of ['Ольга К', '  ОЛЬГА  К. ', 'Ольга\u00a0К']) assert.equal(findPaymentSenderConflict(links, name, 'second'), links[0]);
  assert.equal(findPaymentSenderConflict(links, 'Алена м.', 'second'), links[1]);
  assert.equal(findPaymentSenderConflict(links, 'Ольга М', 'second'), null);
  assert.equal(findPaymentSenderConflict(links, 'Ольга K', 'second'), null, 'Latin and Cyrillic initials remain different bank identities');
  assert.equal(normalizePaymentSenderKey('Ольга K.'), 'ольгаk');
});

test('editing own payer is allowed; a missing old profile or manual mode still reserves a name', () => {
  const links = [{ senderKey: 'ольгак', senderName: 'Ольга К', studentId: 'first', missingStudent: true, manualReview: true }];
  const before = JSON.stringify(links);
  assert.equal(findPaymentSenderConflict(links, 'Ольга К', 'first'), null);
  assert.equal(findPaymentSenderConflict(links, 'Ольга К', 'second'), links[0]);
  assert.equal(findPaymentSenderConflict(links, '', 'second'), null);
  assert.equal(findPaymentSenderConflict(undefined, 'Ольга К', 'second'), null);
  assert.equal(JSON.stringify(links), before);
});
