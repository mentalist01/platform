#!/usr/bin/env bash
set -euo pipefail
cd /root/app

revision=${1:?Expected release revision required}
base=${2:?Expected production base required}
current=$(git rev-parse HEAD)
if [[ "$current" != "$base" ]]; then
  echo "Production HEAD is $current; this release expects $base. No changes made." >&2
  exit 1
fi
git merge-base --is-ancestor "$base" "$revision"
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
if [[ -n "$(git status --porcelain --untracked-files=no -- . ':(exclude)ecosystem.config.cjs')" ]] || ! git diff --cached --quiet; then
  echo 'Production has pending tracked changes. No changes made.' >&2
  exit 1
fi

backup=$(mktemp -d /root/payment-review-window-backup-XXXXXX)
stage=$(mktemp -d /root/app/.release-stage-payment-window-XXXXXX)
module=server/studentPaymentBalances.js
cp -p "$module" dist/index.html dist/index.html.gz "$backup/"
sha256sum ecosystem.config.cjs .env.production > "$backup/config.sha256"
merged=0
restart_started=0
published=0

rollback_on_error() {
  local code=$?
  if (( code != 0 )); then
    set +e
    if (( published )); then
      cp -p "$backup/index.html" "$backup/index.html.gz" dist/
    fi
    if (( merged )); then
      cp -p "$backup/studentPaymentBalances.js" "$module"
    fi
    if (( restart_started )); then
      pm2 restart ecosystem.config.cjs --only ege --update-env || true
    fi
    echo "PAYMENT_WINDOW_RELEASE_FAILED backup=$backup stage=$stage" >&2
  fi
  exit "$code"
}
trap rollback_on_error EXIT

git merge --ff-only "$revision"
merged=1
node --test server/studentPaymentBalances.test.js server/studentPaymentBalances.integration.test.js server/paymentSmsReview.integration.test.js server/paymentSmsReviewActions.integration.test.js > "$backup/tests.log" 2>&1
node --max-old-space-size=2048 scripts/build.mjs --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-payment-keys-release.mjs local "$stage"
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
sha256sum -c "$backup/config.sha256"

cp -a "$stage/assets/." dist/assets/
cp -a "$stage/vendor/." dist/vendor/
restart_started=1
pm2 restart ecosystem.config.cjs --only ege --update-env
curl -fsS --max-time 5 --retry 15 --retry-delay 1 --retry-connrefused http://127.0.0.1:5175/api/availability > "$backup/health.json"

cp -p "$stage/index.html" dist/index.html.next
gzip -9 -c "$stage/index.html" > dist/index.html.gz.next
published=1
mv dist/index.html.next dist/index.html
mv dist/index.html.gz.next dist/index.html.gz
curl -fsS --max-time 15 https://ivan100.ru/ -o "$backup/public-index.html"
cmp "$stage/index.html" "$backup/public-index.html"
sha256sum -c "$backup/config.sha256"
pm2 save
echo "PAYMENT_WINDOW_RELEASE_OK $revision backup=$backup"
