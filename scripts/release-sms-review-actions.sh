#!/usr/bin/env bash
set -euo pipefail
cd /root/app
base=${2:?Previous production revision required}
revision=$(git rev-parse HEAD)
test "$revision" = "${1:?Expected release revision required}"
git merge-base --is-ancestor "$base" "$revision"
git diff --quiet -- src server scripts package.json package-lock.json
backup=$(mktemp -d /root/sms-review-actions-backup-XXXXXX)
chmod 700 "$backup"
stage=$(mktemp -d /root/app/.release-stage-sms-review-XXXXXX)
cp -a dist/index.html dist/index.html.gz ecosystem.config.cjs "$backup/"
git show "$base:server/index.js" > "$backup/server-index.js"
git show "$base:server/studentPaymentBalances.js" > "$backup/studentPaymentBalances.js"
mkdir -m 700 "$backup/data"
for name in teacher-finances teacher-calendar-marks payment-notifications payment-sender-links teacher-payment-connections; do
  if [[ -f "/root/platform-data/$name.json" ]]; then
    cp -p "/root/platform-data/$name.json" "$backup/data/"
    sha256sum "/root/platform-data/$name.json" >> "$backup/data.sha256"
  fi
done
sha256sum ecosystem.config.cjs .env.production > "$backup/config.sha256"
restarted=0
published=0
rollback() {
  result=$?
  if [[ "$result" != 0 ]]; then
    if [[ "$published" == 1 ]]; then cp -p "$backup/index.html" dist/index.html; cp -p "$backup/index.html.gz" dist/index.html.gz; fi
    if [[ "$restarted" == 1 ]]; then
      cp -p "$backup/server-index.js" server/index.js
      cp -p "$backup/studentPaymentBalances.js" server/studentPaymentBalances.js
      pm2 restart ecosystem.config.cjs --only ege --update-env
    fi
    printf '\nSMS_REVIEW_RELEASE_FAILED backup=%s stage=%s\n' "$backup" "$stage" >&2
  fi
  exit "$result"
}
trap rollback EXIT
node --check server/index.js
node --test server/paymentSmsReview.integration.test.js server/paymentSmsReviewActions.integration.test.js server/studentPaymentBalances.test.js server/studentPaymentBalances.integration.test.js server/teacherPaymentConnections.integration.test.js server/teacherPlatformPayments.integration.test.js server/paymentNotificationHistory.integration.test.js src/utils/paymentHistory.test.js src/utils/paymentSmsReview.test.js > "$backup/tests.log" 2>&1
node --max-old-space-size=2048 scripts/build.mjs --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-payment-keys-release.mjs local "$stage"
node --input-type=module - "$stage" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const assets = path.join(process.argv[2], 'assets');
const source = fs.readdirSync(assets).filter(name => name.endsWith('.js'))
  .map(name => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n');
for (const text of ['Учесть оплату', 'Связать без начисления', 'Это отдельный перевод, не один из найденных.', '/review?teacherId=']) {
  if (!source.includes(text)) throw Error(`SMS review bundle missing: ${text}`);
}
console.log('SMS review dialog and API bundle verified.');
JS
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
cp -a "$stage/assets/." dist/assets/
cp -a "$stage/vendor/." dist/vendor/
sha256sum -c "$backup/config.sha256"
restarted=1
pm2 restart ecosystem.config.cjs --only ege --update-env
for attempt in {1..30}; do
  if curl --max-time 5 -fsS http://127.0.0.1:5175/api/availability > "$backup/health.json"; then break; fi
  sleep 1
done
curl --max-time 8 -fsS http://127.0.0.1:5175/api/availability > "$backup/health.json"
cp -p "$stage/index.html" dist/index.html.next
gzip -9 -c "$stage/index.html" > dist/index.html.gz.next
published=1
mv dist/index.html.next dist/index.html
mv dist/index.html.gz.next dist/index.html.gz
curl --max-time 15 -fsS https://ivan100.ru/ -o "$backup/public-index.html"
cmp "$stage/index.html" "$backup/public-index.html"
node --input-type=module - <<'JS'
const response = await fetch('https://ivan100.ru/api/payment-notifications/release-check/review');
if (![401,403].includes(response.status)) throw Error(`Unauthenticated review: ${response.status}`);
console.log('SMS review authentication verified.');
JS
sha256sum -c "$backup/config.sha256"
if sha256sum -c "$backup/data.sha256" > "$backup/data-check.log" 2>&1; then
  echo 'SMS_REVIEW_FINANCES_UNCHANGED'
else
  echo 'Live data changed during deployment; inspect backup/data-check.log before crediting anything.'
fi
pm2 save
printf '\nSMS_REVIEW_RELEASE_OK %s backup=%s stage=%s\n' "$revision" "$backup" "$stage"
