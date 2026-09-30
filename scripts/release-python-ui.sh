#!/usr/bin/env bash
set -euo pipefail
cd /root/app

# This release changes client files only. Keep PM2, calls and recordings running.
git diff --quiet -- src scripts/release-python-ui.sh scripts/check-python-ui-release.mjs
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/python-ui-backup-XXXXXX)
cp -a dist "$backup/dist"
stage="dist-python-ui-$revision"

node --test src/utils/pythonTestData.test.js src/utils/questionDifficulty.test.js server/pythonCoreCurriculaMigration.test.js server/pythonExecutionLimiter.test.js > "$backup/tests.log" 2>&1
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-python-ui-release.mjs local "$stage"

# Add new assets without deleting chunks used by already open lesson tabs.
cp -a "$stage/assets/." dist/assets/
cp -a "$stage/vendor/." dist/vendor/
cp -a "$stage/index.html" dist/index.html.next
gzip -9 -c "$stage/index.html" > dist/index.html.gz.next
mv dist/index.html.next dist/index.html
mv dist/index.html.gz.next dist/index.html.gz

if ! node scripts/check-python-ui-release.mjs verify "$stage"; then
  # Restore only the entry page; retained old assets make this rollback safe.
  cp -a "$backup/dist/index.html" dist/index.html.next
  gzip -9 -c "$backup/dist/index.html" > dist/index.html.gz.next
  mv dist/index.html.next dist/index.html
  mv dist/index.html.gz.next dist/index.html.gz
  printf '\nPYTHON_UI_RELEASE_FAILED entry page restored, backup=%s\n' "$backup" >&2
  exit 1
fi
printf '\nPYTHON_UI_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
