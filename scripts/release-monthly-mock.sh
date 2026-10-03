#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts package.json package-lock.json
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/monthly-mock-backup-XXXXXX)
cp -a dist "$backup/dist"
cp -a ecosystem.config.cjs "$backup/"
cp -a /root/platform-data/mock-exams.json "$backup/"
published=0
rollback_on_error() {
  status=$?
  if [[ "$status" != 0 && "$published" == 1 ]]; then
    cp -a "$backup/dist/index.html" dist/index.html
    cp -a "$backup/dist/index.html.gz" dist/index.html.gz
    printf '\nMONTHLY_MOCK_CLIENT_ROLLED_BACK backup=%s\n' "$backup" >&2
  fi
  exit "$status"
}
trap rollback_on_error EXIT
node --test src/utils/monthlyMockExam.test.js server/monthlyMockAssignment.integration.test.js server/monthlyMockStatus.integration.test.js server/mockExamMode.test.js server/mockExamCorrections.integration.test.js src/utils/mockExamVersioning.test.js > "$backup/tests.log" 2>&1
stage="dist-monthly-mock-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-monthly-mock-release.mjs local "$stage"
node scripts/check-teacher-desktop-release.mjs local "$stage"
node scripts/check-board-pages-release.mjs local "$stage"
node scripts/check-recorder-ui-release.mjs local "$stage"
# The release touches the API, so check again immediately before restarting it.
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
cp -a "$stage/assets/." dist/assets/
cp -a "$stage/vendor/." dist/vendor/
node scripts/check-scheduling-hours-release.mjs preflight /root/platform-data
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
node scripts/check-monthly-mock-release.mjs verify "$stage" /root/platform-data
node scripts/check-teacher-desktop-release.mjs verify "$stage"
node scripts/check-board-pages-release.mjs verify "$stage"
node scripts/check-recorder-ui-release.mjs verify "$stage"
pm2 save
printf '\nMONTHLY_MOCK_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
