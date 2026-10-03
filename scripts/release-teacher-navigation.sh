#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts tools package.json package-lock.json
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/teacher-navigation-backup-XXXXXX)
cp -a dist "$backup/dist"
cp -a ecosystem.config.cjs "$backup/"
published=0
rollback_on_error() {
  status=$?
  if [[ "$status" != 0 && "$published" == 1 ]]; then
    cp -a "$backup/dist/index.html" dist/index.html
    cp -a "$backup/dist/index.html.gz" dist/index.html.gz
    printf '\nTEACHER_NAVIGATION_UI_ROLLED_BACK backup=%s\n' "$backup" >&2
  fi
  exit "$status"
}
trap rollback_on_error EXIT
node --test src/utils/teacherNavigation.test.js src/utils/studentMonthlyReport.test.js server/studentMonthlyReport.integration.test.js tools/teacher-desktop/test/*.test.cjs tools/lesson-recorder/office-follow.test.mjs tools/lesson-recorder/obs.test.mjs > "$backup/tests.log" 2>&1
stage="dist-teacher-navigation-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-teacher-navigation-release.mjs local "$stage"
node scripts/check-teacher-desktop-release.mjs local "$stage"
node scripts/check-recorder-ui-release.mjs local "$stage"
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
# The API imports the report formatter at startup. Its restart applies the report change.
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
published=1
mv dist/index.html.next dist/index.html
mv dist/index.html.gz.next dist/index.html.gz
node scripts/check-teacher-navigation-release.mjs verify "$stage" /root/platform-data
node scripts/check-teacher-desktop-release.mjs verify "$stage"
node scripts/check-recorder-ui-release.mjs verify "$stage"
node scripts/check-guest-meetings-release.mjs verify "$stage"
pm2 save
printf '\nTEACHER_NAVIGATION_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
