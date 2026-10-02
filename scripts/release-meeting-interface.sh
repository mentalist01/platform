#!/usr/bin/env bash
set -euo pipefail
cd /root/app
git diff --quiet -- src server scripts package.json package-lock.json
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/meeting-interface-backup-XXXXXX)
cp -a dist "$backup/dist"
published=0
rollback_on_error() {
  status=$?
  if [[ "$status" != 0 && "$published" == 1 ]]; then
    cp -a "$backup/dist/index.html" dist/index.html
    cp -a "$backup/dist/index.html.gz" dist/index.html.gz
    printf '\nMEETING_INTERFACE_ROLLED_BACK backup=%s\n' "$backup" >&2
  fi
  exit "$status"
}
trap rollback_on_error EXIT
node --test server/guestMeetings.test.js server/guestMeetings.integration.test.js server/publicMeetings.integration.test.js src/utils/rtcRooms.test.js > "$backup/tests.log" 2>&1
stage="dist-meeting-interface-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
node scripts/check-guest-meetings-release.mjs local "$stage"
# Existing meeting and lesson tabs continue using their current bundles.
cp -a "$stage/assets/." dist/assets/
cp -a "$stage/vendor/." dist/vendor/
cp -a "$stage/index.html" dist/index.html.next
gzip -9 -c "$stage/index.html" > dist/index.html.gz.next
published=1
mv dist/index.html.next dist/index.html
mv dist/index.html.gz.next dist/index.html.gz
node scripts/check-guest-meetings-release.mjs verify "$stage"
printf '\nMEETING_INTERFACE_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
