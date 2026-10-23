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

Open Finance > Auto Payment and select the pending/review status. Each SMS states that no money has been credited. Check the bank history and any matching bank-app payment before manually recording a missing receipt through the balance or lesson payment form. Never confirm a matching SMS merely because it is visible in this list.

Notification totals describe saved messages, not a bank statement. A bank push and its SMS may both appear; this does not credit money twice because the SMS cannot create a receipt.

Verification: `node --test server/paymentSmsReview.integration.test.js` covers the screenshot format, read-only wallet and legacy behavior, teacher isolation, retries, SMS/push identity separation, and platform-subscription protection.
