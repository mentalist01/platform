#!/usr/bin/env bash
set -euo pipefail
cd /root/app
node scripts/check-pricing-release.mjs preflight /root/platform-data
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/pricing-backup-XXXXXX)
cp -a dist "$backup/dist"
cp -a ecosystem.config.cjs "$backup/"
mkdir "$backup/data"
cp -a /root/platform-data/*.json "$backup/data/"
node --test server/lessonPricing*.test.js server/teacherFinanceCalendarPlan.test.js server/teacherFinanceCalculations.test.js server/googleCalendarFinance.integration.test.js server/teacherCalendarCancellation.integration.test.js server/desktopRecording*.test.js tools/lesson-recorder/engine.test.mjs > "$backup/tests.log" 2>&1
stage="dist-pricing-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
# A lesson may have started while the build was running.
node scripts/check-pricing-release.mjs preflight /root/platform-data
cp -a "$stage/assets/." dist/assets/
pm2 restart ecosystem.config.cjs --only ege --update-env
for attempt in {1..20}; do
  if curl --max-time 8 -fsS https://ivan100.ru/api/availability > "$backup/health.json"; then break; fi
  sleep 1
done
curl --max-time 8 -fsS https://ivan100.ru/api/availability > "$backup/health.json"
cp -a "$stage/." dist/
node scripts/check-pricing-release.mjs verify /root/platform-data
pm2 save
printf '\nPRICING_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
