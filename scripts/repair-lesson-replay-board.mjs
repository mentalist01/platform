import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { normalizeLessonReplay } from '../server/lessonReplay.js';
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

const replay = JSON.parse(zlib.gunzipSync(fs.readFileSync(replayPath)).toString('utf8'));
if (String(replay?.occurrence?.key || '') !== occurrenceKey) {
  throw new Error('Replay occurrence key does not match the requested key');
}
const boardDoc = new Y.Doc();
Y.applyUpdate(boardDoc, fs.readFileSync(boardPath));
const finalItems = boardDoc.getArray('items').toArray().map((entry) => entry?.toJSON?.() ?? entry);
const recovery = buildLessonReplayBoardRecovery(replay, finalItems);
const repaired = normalizeLessonReplay({
  ...replay,
  updatedAt: new Date().toISOString(),
  events: [...replay.events, ...recovery.events],
});
const verification = verifyAtMs > 0
  ? {
      verifyAtMs,
      beforeItemCount: getLessonReplayStateAt(replay, verifyAtMs).board.items.length,
      afterItemCount: getLessonReplayStateAt(repaired, verifyAtMs).board.items.length,
    }
  : null;

console.log(JSON.stringify({
  apply: shouldApply,
  replayPath,
  boardPath,
  originalEventCount: replay.events.length,
  repairedEventCount: repaired.events.length,
  ...recovery.stats,
  verification,
}, null, 2));

if (shouldApply && recovery.events.length > 0) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${replayPath}.before-board-recovery-${timestamp}.bak`;
  const temporaryPath = `${replayPath}.${process.pid}.${Date.now()}.tmp`;
  fs.copyFileSync(replayPath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(temporaryPath, zlib.gzipSync(Buffer.from(JSON.stringify(repaired), 'utf8')));
  fs.renameSync(temporaryPath, replayPath);
  console.log(JSON.stringify({ applied: true, backupPath }));
}
