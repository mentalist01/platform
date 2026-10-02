#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts package.json package-lock.json
git diff --cached --quiet
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/calendar-student-ownership-backup-XXXXXX)
for file in progress.json lesson-history.json teacher-finances.json teacher-calendar-marks.json; do
  cp -a "/root/platform-data/$file" "$backup/"
done
node --check server/index.js
node --test server/googleCalendarStudentMatch.test.js server/googleCalendarNamesakes.integration.test.js server/googleCalendarLearningGroups.integration.test.js server/teacherFinanceCalendarPlan.test.js server/lessonHistory.test.js > "$backup/tests.log" 2>&1
node scripts/check-calendar-student-ownership.mjs inspect /root/platform-data
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
# Client assets are unchanged. Restart only the API after checking live lessons.
pm2 restart ecosystem.config.cjs --only ege --update-env
for attempt in {1..20}; do
  if curl --max-time 8 -fsS https://ivan100.ru/api/client-build-version > "$backup/health.json"; then break; fi
  sleep 1
done
curl --max-time 8 -fsS https://ivan100.ru/api/client-build-version > "$backup/health.json"
node scripts/check-calendar-student-ownership.mjs verify /root/platform-data
pm2 save
printf '\nCALENDAR_STUDENT_OWNERSHIP_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
