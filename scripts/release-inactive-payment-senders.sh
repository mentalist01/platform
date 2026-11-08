#!/usr/bin/env bash
set -euo pipefail
cd /root/app
expected=${1:?Expected revision required}
base=${2:?Previous production revision required}
test "$(git rev-parse HEAD)" = "$expected"
git merge-base --is-ancestor "$base" "$expected"
git diff --quiet -- src server scripts docs package.json package-lock.json
git diff --cached --quiet
backup=$(mktemp -d /root/inactive-payment-senders-backup-XXXXXX)
chmod 700 "$backup"
stage=$(mktemp -d /root/app/.release-stage-inactive-payers-XXXXXX)
git show "$base:server/index.js" > "$backup/server-index.js"
cp -p dist/index.html dist/index.html.gz "$backup/"
sha256sum ecosystem.config.cjs .env.production > "$backup/config.sha256"
mkdir -m 700 "$backup/data"
for name in students teacher-finances teacher-calendar-marks payment-notifications payment-sender-links teacher-subscriptions; do
  if [[ -f "/root/platform-data/$name.json" ]]; then
    cp -p "/root/platform-data/$name.json" "$backup/data/"
  fi
done
restarted=0
published=0
rollback() {
  code=$?
  if [[ "$code" != 0 ]]; then
    if [[ "$published" == 1 ]]; then
      cp -p "$backup/index.html" dist/index.html
      cp -p "$backup/index.html.gz" dist/index.html.gz
    fi
    if [[ "$restarted" == 1 ]]; then
      cp -p "$backup/server-index.js" server/index.js
      pm2 restart ecosystem.config.cjs --only ege --update-env
    fi
    echo "INACTIVE_PAYERS_RELEASE_FAILED backup=$backup stage=$stage" >&2
  fi
  exit "$code"
}
trap rollback EXIT
node --check server/index.js
node --test server/paymentSenderLinks.integration.test.js server/studentStudyStatus.test.js src/utils/paymentSenderLinks.test.js server/paymentSmsReview.integration.test.js server/paymentSmsReviewActions.integration.test.js server/teacherPaymentConnections.integration.test.js server/teacherPlatformPayments.integration.test.js > "$backup/tests.log" 2>&1
node --max-old-space-size=2048 scripts/build.mjs --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-payment-keys-release.mjs local "$stage"
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
sha256sum -c "$backup/config.sha256"
# Preserve chunks still used by open lesson tabs.
cp -a "$stage/assets/." dist/assets/
if [[ -d "$stage/vendor" ]]; then cp -a "$stage/vendor/." dist/vendor/; fi
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
sha256sum -c "$backup/config.sha256"
pm2 save
printf '\nINACTIVE_PAYERS_RELEASE_OK %s backup=%s stage=%s\n' "$expected" "$backup" "$stage"
