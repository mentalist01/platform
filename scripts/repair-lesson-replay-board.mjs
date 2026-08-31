import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { LESSON_REPLAY_MAX_FILE_BYTES, normalizeLessonReplay } from '../server/lessonReplay.js';
import { buildLessonReplayBoardRecovery } from '../server/lessonReplayBoardRecovery.js';
import { getLessonReplayStateAt } from '../src/utils/lessonReplayTimeMachine.js';

const require = createRequire(import.meta.url);
const Y = require('yjs');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(scriptDirectory, '..', 'server');

const readArgument = (name) => {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
};

const occurrenceKey = readArgument('occurrence-key').trim();
const boardDocName = readArgument('board-doc').trim();
const verifyAtMs = Math.max(0, Math.round(Number(readArgument('verify-at-ms')) || 0));
const shouldApply = process.argv.includes('--apply');
const expectedReplayHash = readArgument('expected-replay-sha256');
const expectedBoardHash = readArgument('expected-board-sha256');
if (!occurrenceKey || !boardDocName) {
  throw new Error('Required: --occurrence-key=... --board-doc=... [--verify-at-ms=...] [--apply]');
}

const resolveStoragePath = (value, fallbackPath) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallbackPath;
  return path.isAbsolute(normalized) ? normalized : path.resolve(serverDirectory, normalized);
};
const dataDirectory = resolveStoragePath(
  process.env.PLATFORM_DATA_DIR || process.env.APP_DATA_DIR || process.env.DATA_DIR,
  path.join(serverDirectory, 'data')
);
const collabDirectory = resolveStoragePath(
  process.env.PLATFORM_COLLAB_DIR || process.env.APP_COLLAB_DIR,
  path.join(dataDirectory, 'collab')
);
const occurrenceHash = crypto.createHash('sha256').update(occurrenceKey).digest('hex');
const replayPath = path.join(dataDirectory, 'lesson-replays', `${occurrenceHash}.json.gz`);
const boardBaseName = boardDocName.split('/').pop() || boardDocName;
const safeBoardName = boardBaseName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'board';
const boardHash = crypto.createHash('sha1').update(boardDocName).digest('hex').slice(0, 12);
const boardPath = path.join(collabDirectory, 'board-snapshots', `${safeBoardName}-${boardHash}.bin`);

if (!fs.existsSync(replayPath)) throw new Error(`Replay not found: ${replayPath}`);
if (!fs.existsSync(boardPath)) throw new Error(`Board snapshot not found: ${boardPath}`);

const replayBytes = fs.readFileSync(replayPath);
const boardBytes = fs.readFileSync(boardPath);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const replaySha256 = sha256(replayBytes);
const boardSha256 = sha256(boardBytes);
if (shouldApply && (expectedReplayHash !== replaySha256 || expectedBoardHash !== boardSha256)) {
  throw new Error('Apply requires matching --expected-replay-sha256 and --expected-board-sha256 from a reviewed dry run');
}
const replay = normalizeLessonReplay(JSON.parse(zlib.gunzipSync(replayBytes).toString('utf8')));
if (String(replay?.occurrence?.key || '') !== occurrenceKey) {
  throw new Error('Replay occurrence key does not match the requested key');
}
if (replay.events.some((event) => event.id.startsWith('board-recovery-'))) {
  throw new Error('Replay already contains board recovery events; inspect the backup before another repair');
}
const boardDoc = new Y.Doc();
Y.applyUpdate(boardDoc, boardBytes);
const finalItems = boardDoc.getArray('items').toArray().map((entry) => entry?.toJSON?.() ?? entry);
const recovery = buildLessonReplayBoardRecovery(replay, finalItems, {
  includeUnanchoredTail: process.argv.includes('--include-unanchored-tail'),
});
const repaired = normalizeLessonReplay({
  ...replay,
  updatedAt: new Date().toISOString(),
  events: [...replay.events, ...recovery.events],
});
const reloaded = normalizeLessonReplay(repaired);
const repairedBytes = Buffer.from(JSON.stringify(repaired), 'utf8');
if (repairedBytes.length > LESSON_REPLAY_MAX_FILE_BYTES) throw new Error('Repaired replay exceeds the storage limit');
if (JSON.stringify(reloaded) !== JSON.stringify(repaired)) throw new Error('Recovery does not survive server normalization');
const nonBoardEvents = (source) => JSON.stringify(source.events.filter((event) => event.type !== 'board'));
if (nonBoardEvents(replay) !== nonBoardEvents(repaired)) throw new Error('Recovery would change non-board events');
if (repaired.events.length !== replay.events.length + recovery.events.length) throw new Error('Recovery events were dropped');
const gapCount = (items) => items.filter((item) => {
  const y = item.type === 'stroke' && Array.isArray(item.points) && item.points.length
    ? Math.min(...item.points.map((point) => Number(point.y)))
    : Number(item.y ?? item.start?.y);
  return y >= 8200 && y < 12400;
}).length;
const verification = [verifyAtMs, 1_290_000, 1_293_000, 1_409_000, 1_417_000, 1_420_000]
  .filter((value, index, all) => value > 0 && all.indexOf(value) === index)
  .sort((left, right) => left - right)
  .map((positionMs) => {
    const before = getLessonReplayStateAt(replay, positionMs).board.items;
    const after = getLessonReplayStateAt(reloaded, positionMs).board.items;
    const afterIds = new Set(after.map((item) => item.id));
    const lostItemCount = before.filter((item) => !afterIds.has(item.id)).length;
    if (lostItemCount) throw new Error(`Recovery loses ${lostItemCount} existing objects at ${positionMs}`);
    return { positionMs, before: before.length, after: after.length, gapBefore: gapCount(before), gapAfter: gapCount(after) };
  });

console.log(JSON.stringify({
  apply: shouldApply,
  replayPath,
  boardPath,
  replaySha256,
  boardSha256,
  boardModifiedAt: fs.statSync(boardPath).mtime.toISOString(),
  repairedBytes: repairedBytes.length,
  originalEventCount: replay.events.length,
  repairedEventCount: repaired.events.length,
  ...recovery.stats,
  verification,
}, null, 2));

if (shouldApply && recovery.events.length > 0) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${replayPath}.before-board-recovery-${timestamp}.bak`;
  const temporaryPath = `${replayPath}.${process.pid}.${Date.now()}.tmp`;
  if (sha256(fs.readFileSync(replayPath)) !== replaySha256 || sha256(fs.readFileSync(boardPath)) !== boardSha256) {
    throw new Error('Source files changed during recovery; run a new dry run');
  }
  fs.copyFileSync(replayPath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(temporaryPath, zlib.gzipSync(repairedBytes), { flag: 'wx', mode: fs.statSync(replayPath).mode });
  fs.renameSync(temporaryPath, replayPath);
  console.log(JSON.stringify({ applied: true, backupPath }));
}
