#!/usr/bin/env bash
set -euo pipefail
cd /root/app
revision=$(git rev-parse --short HEAD)
backup=$(mktemp -d /root/weekly-backup-XXXXXX)
cp -a dist "$backup/dist"
cp -a ecosystem.config.cjs "$backup/"
mkdir "$backup/data"
cp -a /root/platform-data/*.json "$backup/data/"
node --test server/weeklySchedule*.test.js server/lessonReschedule*.test.js server/groupAvailability*.test.js > "$backup/tests.log" 2>&1
stage="dist-weekly-$revision"
npm run build -- --outDir "$stage" > "$backup/build.log" 2>&1
pm2 restart ecosystem.config.cjs --only ege --update-env
for attempt in {1..20}; do
  if curl --max-time 8 -fsS https://ivan100.ru/api/availability > "$backup/health.json"; then break; fi
  sleep 1
done
curl --max-time 8 -fsS https://ivan100.ru/api/availability
cp -a "$stage/assets/." dist/assets/
cp -a "$stage/." dist/
node scripts/check-weekly-release.mjs /root/platform-data
printf '\nWEEKLY_RELEASE_OK %s backup=%s\n' "$revision" "$backup"
