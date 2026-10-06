#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts package.json package-lock.json
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/payment-keys-backup-XXXXXX)
cp -a dist "$backup/dist"
cp -a ecosystem.config.cjs "$backup/"
cp -a server/index.js "$backup/server-index.js"
for name in teacher-finances teacher-calendar-marks teacher-subscriptions payment-notifications payment-sender-links teacher-payment-connections; do
  if [[ -f "/root/platform-data/$name.json" ]]; then cp -a "/root/platform-data/$name.json" "$backup/"; fi
done
published=0
rollback_client_on_error() {
  status=$?
  if [[ "$status" != 0 && "$published" == 1 ]]; then
    cp -a "$backup/dist/index.html" dist/index.html
    cp -a "$backup/dist/index.html.gz" dist/index.html.gz
    printf '\nPAYMENT_KEYS_CLIENT_ROLLED_BACK backup=%s\n' "$backup" >&2
  fi
  if [[ "$status" != 0 ]]; then printf '\nPAYMENT_KEYS_RELEASE_FAILED backup=%s\n' "$backup" >&2; fi
  exit "$status"
}
trap rollback_client_on_error EXIT
node --test server/teacherPaymentConnections.test.js server/teacherPaymentConnections.integration.test.js server/teacherPlatformPayments.test.js server/teacherPlatformPayments.integration.test.js server/lessonPricing.integration.test.js server/securityBoundaries.integration.test.js server/accountSecurity.integration.test.js server/teacherSubscription.integration.test.js server/learningSubscriptions.integration.test.js > "$backup/tests.log" 2>&1
node --test src/utils/paymentHistory.test.js server/paymentNotificationHistory.integration.test.js > "$backup/payment-history-tests.log" 2>&1
node --test src/utils/paymentSenderLinks.test.js server/paymentSenderLinks.integration.test.js > "$backup/payment-sender-links-tests.log" 2>&1
stage="dist-payment-keys-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-payment-keys-release.mjs local "$stage"
node scripts/check-group-library-payments-release.mjs local "$stage"
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
# Keep old chunks available to already open clients.
cp -a "$stage/assets/." dist/assets/
cp -a "$stage/vendor/." dist/vendor/
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
pm2 restart ecosystem.config.cjs --only ege --update-env
for attempt in {1..20}; do
  if curl --max-time 8 -fsS https://ivan100.ru/api/availability > "$backup/health.json"; then break; fi
  sleep 1
done
curl --max-time 8 -fsS https://ivan100.ru/api/availability > "$backup/health.json"
cp -a "$stage/index.html" dist/index.html.next
gzip -9 -c "$stage/index.html" > dist/index.html.gz.next
published=1
mv dist/index.html.next dist/index.html
mv dist/index.html.gz.next dist/index.html.gz
node scripts/check-payment-keys-release.mjs verify "$stage" /root/platform-data
cmp -s ecosystem.config.cjs "$backup/ecosystem.config.cjs"
pm2 save
printf '\nPAYMENT_KEYS_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
