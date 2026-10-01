#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts package.json package-lock.json
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/scheduling-hours-backup-XXXXXX)
cp -a dist "$backup/dist"
cp -a ecosystem.config.cjs "$backup/"
cp -a /root/platform-data/group-availability.json "$backup/"
node --test server/groupAvailability.test.js server/weeklySchedule.test.js server/lessonReschedule.test.js server/groupAvailability.integration.test.js server/googleCalendarLearningGroups.integration.test.js server/individualScheduleAccess.integration.test.js server/weeklySchedule.integration.test.js server/lessonReschedule.integration.test.js > "$backup/tests.log" 2>&1
stage="dist-scheduling-hours-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-scheduling-hours-release.mjs local "$stage"
# Reread live calls after the build. Retain chunks used by open lesson tabs.
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
cp -a "$stage/assets/." dist/assets/
cp -a "$stage/vendor/." dist/vendor/
pm2 restart ecosystem.config.cjs --only ege --update-env
for attempt in {1..20}; do
  if curl --max-time 8 -fsS https://ivan100.ru/api/availability > "$backup/health.json"; then break; fi
  sleep 1
done
curl --max-time 8 -fsS https://ivan100.ru/api/availability > "$backup/health.json"
cp -a "$stage/index.html" dist/index.html.next
gzip -9 -c "$stage/index.html" > dist/index.html.gz.next
mv dist/index.html.next dist/index.html
mv dist/index.html.gz.next dist/index.html.gz
node scripts/check-scheduling-hours-release.mjs verify "$stage" /root/platform-data
node scripts/check-board-pages-release.mjs verify "$stage"
node scripts/check-recorder-ui-release.mjs verify "$stage"
pm2 save
printf '\nSCHEDULING_HOURS_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
