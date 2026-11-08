# Inactive Student Payers

Payer names are reserved only for current students, using `isCurrentStudent`
(including legacy graduate grade spellings and inactive study statuses).

- Existing inactive links are excluded from the payer API and automatic matching
  without modifying data on GET. The next explicit payer edit prunes these links
  for that teacher. New bindings have new timestamps and no inherited review mode.
- Saving an inactive/graduate student removes only that student's payer links.
  Returning to active study also removes any legacy inactive links before saving,
  so re-enrollment never resurrects a payer reservation.
- Inactive students cannot claim payer names through the API or student editor.
- Nickname/payment-code fallback cannot credit an inactive student either.
- Notifications, calendar payment marks, receipts, balances and subscriptions are
  not rewritten. Historical notifications retain their saved student IDs.
- A name shared by two current students still returns the existing conflict.

Names are not bank transaction identities: after a released name is explicitly
assigned to another student, new pushes with that name follow the new binding.
An old parent's debt payment with the same name must be reviewed manually.

Verification:

```sh
node --test server/paymentSenderLinks.integration.test.js server/studentStudyStatus.test.js src/utils/paymentSenderLinks.test.js server/paymentSmsReview.integration.test.js server/paymentSmsReviewActions.integration.test.js server/teacherPaymentConnections.integration.test.js server/teacherPlatformPayments.integration.test.js
```
