#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts package.json package-lock.json
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/group-availability-notifications-backup-XXXXXX)
cp -a dist "$backup/dist"
cp -a ecosystem.config.cjs "$backup/"
cp -a /root/platform-data/group-availability.json /root/platform-data/teachers.json "$backup/"
if [ -f /root/platform-data/guest-meetings.json ]; then cp -a /root/platform-data/guest-meetings.json "$backup/"; fi
node --test server/groupAvailability.test.js server/groupAvailability.integration.test.js server/teacherMockNotifications.test.js server/guestMeetings.test.js server/guestMeetings.integration.test.js server/publicMeetings.integration.test.js server/learningGroups.integration.test.js > "$backup/tests.log" 2>&1
stage="dist-group-availability-notifications-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-group-availability-notifications-release.mjs local "$stage"
node scripts/check-guest-meetings-release.mjs local "$stage"
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
# Keep older chunks available for lesson tabs opened before this release.
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
node scripts/check-group-availability-notifications-release.mjs verify "$stage" /root/platform-data
node scripts/check-guest-meetings-release.mjs verify "$stage"
node scripts/check-scheduling-hours-release.mjs local "$stage"
node scripts/check-board-pages-release.mjs verify "$stage"
node scripts/check-recorder-ui-release.mjs verify "$stage"
pm2 save
printf '\nGROUP_AVAILABILITY_NOTIFICATIONS_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
