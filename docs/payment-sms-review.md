# Bank SMS Review

`POST /api/payment-notifications/tbank/sms` accepts the same personal teacher key and notification JSON as the normal T-Bank endpoint. Only this new endpoint is suitable for SMS forwarding.

- Incoming payment SMS are stored as `pending` with no paid marks.
- The server returns before wallet, legacy payment allocation, and platform subscription processing. Body flags cannot enable automatic credit on this endpoint.
- SMS IDs and raw hashes have their own namespace. A reviewed SMS never suppresses a later genuine bank push, even when IDs and text happen to match.
- Repeated delivery of the same SMS returns `duplicate`, without another journal row or financial change.
- Personal teacher keys keep SMS history isolated between teachers.
- Outgoing purchases and messages without an incoming payment amount are ignored.
- `test: true` remains a dry-run connection check and creates no financial record.

## Phone Setup

Keep the existing bank-app flow unchanged. Use a separate Automate flow listening to the installed Messages package (`com.android.mms` on the configured realme), limited to the bank notification title and incoming top-up text. Forward the newest notification message, not the SMS inbox, OTP messages, or an expanded conversation history. No READ_SMS or RECEIVE_SMS permission is required when using the existing notification listener.

Use a stable notification ID and timestamp across retries. POST only to the `/tbank/sms` endpoint, not `/tbank`. Start with future notification transitions; do not replay the whole inbox.

## Teacher Workflow

Open Finance > Auto Payment and select the pending/review status. Each SMS states that no money has been credited. Check the bank history and any matching bank-app payment, then use the SMS row's review action. Never confirm a matching SMS merely because it is visible in this list.

The review dialog offers a new receipt or a link to an existing equal-amount receipt within three days. A new receipt requires explicit confirmation; if similar receipts exist, it also requires confirmation that this is a separate transfer. Linking changes the SMS to `duplicate` and credits nothing. Only active per-lesson student balance accounts are supported.

`GET /api/payment-notifications/:id/review` is read-only and returns a preview token. `POST` to the same path requires strict JSON with `confirmed`, the preview token, and mode `new` or `link`. Only the owning teacher may act. Amount and pupil are resolved from the saved SMS, never the submitted fields. Receipt plus SMS resolution are persisted together in the wallet ledger; repeated or concurrent submissions reuse that resolution. A lost notification-status write can be repaired without crediting again.

New SMS receipts are manual receipts. The existing delayed bank-push check routes a matching push within three days to manual confirmation. Linking that bank notification to a reviewed SMS receipt marks it as a duplicate in notification totals. This is a similarity safeguard, not a bank transaction ID or unlimited proof of economic identity.

Notification totals describe saved messages, not a bank statement. Pending SMS are not credited automatically. Reviewed SMS and explicitly linked bank pushes are counted once.

Verification: `node --test server/paymentSmsReview.integration.test.js` covers the screenshot format, read-only wallet and legacy behavior, teacher isolation, retries, SMS/push identity separation, and platform-subscription protection.

`node --test server/paymentSmsReviewActions.integration.test.js src/utils/paymentSmsReview.test.js` also covers review authorization, read-only previews, double submission, late pushes, links without credit, conflicting/stale decisions, and recovery after process restart.
