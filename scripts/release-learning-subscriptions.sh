#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts package.json package-lock.json
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/learning-subscriptions-backup-XXXXXX)
cp -a dist "$backup/dist"
cp -a ecosystem.config.cjs "$backup/"
for name in teacher-finances teacher-calendar-marks learning-groups learning-lesson-sessions learning-subscriptions; do
  if [[ -f "/root/platform-data/$name.json" ]]; then cp -a "/root/platform-data/$name.json" "$backup/"; fi
done
published=0
rollback_client_on_error() {
  status=$?
  if [[ "$status" != 0 && "$published" == 1 ]]; then
    cp -a "$backup/dist/index.html" dist/index.html
    cp -a "$backup/dist/index.html.gz" dist/index.html.gz
    printf '\nSUBSCRIPTIONS_CLIENT_ROLLED_BACK backup=%s\n' "$backup" >&2
  fi
  if [[ "$status" != 0 ]]; then printf '\nSUBSCRIPTIONS_RELEASE_FAILED backup=%s\n' "$backup" >&2; fi
  exit "$status"
}
trap rollback_client_on_error EXIT
node --test server/learningSubscriptions.test.js server/learningSubscriptions.integration.test.js server/teacherFinanceCalculations.test.js server/teacherFinanceCalendarPlan.test.js server/lessonPricing.test.js server/lessonPricing.integration.test.js server/googleCalendarFinance.integration.test.js server/learningGroups.integration.test.js server/learningVoiceChannels.integration.test.js server/learningLessonAccess.test.js server/groupParticipation.integration.test.js server/parentCabinet.integration.test.js server/monthlyMockAssignment.integration.test.js server/monthlyMockStatus.integration.test.js > "$backup/tests.log" 2>&1
stage="dist-learning-subscriptions-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-learning-subscriptions-release.mjs local "$stage"
node scripts/check-teacher-desktop-release.mjs local "$stage"
node scripts/check-board-pages-release.mjs local "$stage"
node scripts/check-monthly-mock-release.mjs local "$stage"
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
# Retain old chunks so open clients can finish loading their own revision.
cp -a "$stage/assets/." dist/assets/
cp -a "$stage/vendor/." dist/vendor/
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
pm2 restart ecosystem.config.cjs --only ege --update-env
for attempt in {1..20}; do
  if curl --max-time 8 -fsS https://ivan100.ru/api/availability > "$backup/health.json"; then break; fi
  sleep 1
done
curl --max-time 8 -fsS https://ivan100.ru/api/availability > "$backup/health.json"
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
cp -a "$stage/index.html" dist/index.html.next
gzip -9 -c "$stage/index.html" > dist/index.html.gz.next
published=1
mv dist/index.html.next dist/index.html
mv dist/index.html.gz.next dist/index.html.gz
node scripts/check-learning-subscriptions-release.mjs verify "$stage" /root/platform-data
node scripts/check-teacher-desktop-release.mjs verify "$stage"
node scripts/check-board-pages-release.mjs verify "$stage"
node scripts/check-monthly-mock-release.mjs verify "$stage" /root/platform-data
node scripts/check-lesson-tools-release.mjs verify "$stage" /root/platform-data
node scripts/check-recorder-ui-release.mjs verify "$stage"
cmp -s ecosystem.config.cjs "$backup/ecosystem.config.cjs"
pm2 save
printf '\nLEARNING_SUBSCRIPTIONS_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
