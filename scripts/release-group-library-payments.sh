#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts package.json package-lock.json
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/group-library-payments-backup-XXXXXX)
cp -a dist "$backup/dist"
cp -a ecosystem.config.cjs "$backup/"
for name in teacher-finances teacher-calendar-marks learning-groups learning-lesson-sessions learning-subscriptions mock-exams desktop-recordings teacher-subscriptions payment-notifications payment-sender-links; do
  if [[ -f "/root/platform-data/$name.json" ]]; then cp -a "/root/platform-data/$name.json" "$backup/"; fi
done
published=0
rollback_client_on_error() {
  status=$?
  if [[ "$status" != 0 && "$published" == 1 ]]; then
    cp -a "$backup/dist/index.html" dist/index.html
    cp -a "$backup/dist/index.html.gz" dist/index.html.gz
    printf '\nGROUP_LIBRARY_PAYMENTS_CLIENT_ROLLED_BACK backup=%s\n' "$backup" >&2
  fi
  if [[ "$status" != 0 ]]; then printf '\nGROUP_LIBRARY_PAYMENTS_RELEASE_FAILED backup=%s\n' "$backup" >&2; fi
  exit "$status"
}
trap rollback_client_on_error EXIT
node --test server/groupLibrary.test.js server/groupLibrary.integration.test.js server/teacherPlatformPayments.test.js server/teacherPlatformPayments.integration.test.js server/teacherSubscription.integration.test.js server/learningVoiceChannels.integration.test.js server/learningGroups.test.js server/learningGroups.integration.test.js server/learningSubscriptions.test.js server/learningSubscriptions.integration.test.js src/utils/rtcRooms.test.js > "$backup/tests.log" 2>&1
node --test tools/lesson-recorder/*.test.mjs src/utils/recordingHealth.test.js server/recorderPackage.test.js server/desktopRecording.test.js server/desktopRecording.integration.test.js > "$backup/recorder-tests.log" 2>&1
node --test src/utils/pythonTaskPractice.test.js src/utils/pythonProgress.test.js server/weeklyTaskPractice.test.js server/pythonTaskPractice.integration.test.js server/questionAnswerCheck.integration.test.js server/mockExamCorrections.integration.test.js server/mockExamTaskAnalytics.integration.test.js > "$backup/python-practice-tests.log" 2>&1
node --test src/utils/boardTaskClipboard.test.js > "$backup/board-task-clipboard-tests.log" 2>&1
node --test src/utils/collabSolutions.test.js > "$backup/code-sections-tests.log" 2>&1
stage="dist-group-library-payments-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-group-library-payments-release.mjs local "$stage"
node scripts/check-learning-subscriptions-release.mjs local "$stage"
node scripts/check-teacher-desktop-release.mjs local "$stage"
node scripts/check-board-pages-release.mjs local "$stage"
node scripts/check-monthly-mock-release.mjs local "$stage"
node scripts/check-recorder-ui-release.mjs local "$stage"
node scripts/check-recording-reliability-release.mjs local "$stage"
node scripts/check-python-practice-release.mjs local "$stage"
node scripts/check-board-task-clipboard-release.mjs local "$stage"
node scripts/check-lesson-tools-release.mjs local "$stage"
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
# Preserve old chunks for users with an already open client.
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
node scripts/check-group-library-payments-release.mjs verify "$stage" /root/platform-data
node scripts/check-learning-subscriptions-release.mjs verify "$stage" /root/platform-data
node scripts/check-teacher-desktop-release.mjs verify "$stage"
node scripts/check-board-pages-release.mjs verify "$stage"
node scripts/check-monthly-mock-release.mjs verify "$stage" /root/platform-data
node scripts/check-lesson-tools-release.mjs verify "$stage" /root/platform-data
node scripts/check-recorder-ui-release.mjs verify "$stage"
node scripts/check-recording-reliability-release.mjs verify "$stage"
node scripts/check-python-practice-release.mjs verify "$stage"
node scripts/check-board-task-clipboard-release.mjs verify "$stage"
cmp -s ecosystem.config.cjs "$backup/ecosystem.config.cjs"
pm2 save
printf '\nGROUP_LIBRARY_PAYMENTS_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
