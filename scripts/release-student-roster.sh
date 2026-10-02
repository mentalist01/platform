#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts tools/lesson-recorder package.json package-lock.json
git diff --cached --quiet
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/student-roster-backup-XXXXXX)
cp -a dist "$backup/dist"
stage="dist-student-roster-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-student-roster-release.mjs local "$stage"
node scripts/check-scheduling-hours-release.mjs local "$stage"
node scripts/check-board-pages-release.mjs local "$stage"
# Only client assets changed; retain chunks used by already open lesson tabs.
cp -a "$stage/assets/." dist/assets/
cp -a "$stage/vendor/." dist/vendor/
cp -a "$stage/index.html" dist/index.html.next
gzip -9 -c "$stage/index.html" > dist/index.html.gz.next
mv dist/index.html.next dist/index.html
mv dist/index.html.gz.next dist/index.html.gz
node scripts/check-student-roster-release.mjs verify "$stage" /root/platform-data
node scripts/check-scheduling-hours-release.mjs verify "$stage" /root/platform-data
node scripts/check-board-pages-release.mjs verify "$stage"
node scripts/check-recorder-ui-release.mjs verify "$stage"
printf '\nSTUDENT_ROSTER_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
