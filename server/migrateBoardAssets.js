import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import {
  buildBoardAssetStorageName,
  detectBoardAssetMimeType,
  getBoardAssetHash,
  normalizeBoardAssetEntries,
  normalizeBoardAssetEntry,
} from './boardAssets.js';

const require = createRequire(import.meta.url);
const Y = require('yjs');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveStoragePath = (value, fallbackPath) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallbackPath;
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, raw);
};

const dataDir = resolveStoragePath(
  process.env.PLATFORM_DATA_DIR || process.env.APP_DATA_DIR || process.env.DATA_DIR,
  path.join(__dirname, 'data')
);
const uploadsDir = resolveStoragePath(
  process.env.PLATFORM_UPLOADS_DIR || process.env.APP_UPLOADS_DIR || process.env.UPLOADS_DIR,
  path.join(__dirname, 'uploads')
);
const collabDir = resolveStoragePath(
  process.env.PLATFORM_COLLAB_DIR || process.env.APP_COLLAB_DIR,
  path.join(dataDir, 'collab')
);
const snapshotsDir = path.join(collabDir, 'board-snapshots');
const studentsFile = path.join(dataDir, 'students.json');
const boardAssetsFile = path.join(dataDir, 'board-assets.json');
const applyChanges = process.argv.includes('--apply');
const confirmedOffline = process.argv.includes('--confirm-offline');

if (applyChanges && !confirmedOffline) {
  throw new Error('Apply mode requires --confirm-offline. Stop the platform and close active board tabs first.');
}

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeFileAtomic = (filePath, contents, encoding) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(5).toString('hex')}.tmp`
  );
  try {
    fs.writeFileSync(tempPath, contents, encoding);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Keep the original failure as the actionable error.
    }
    throw error;
  }
};

const buildSnapshotPath = (storageKey) => {
  const base = String(storageKey || '').split('/').pop() || String(storageKey || '');
  const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'board';
  const hash = crypto.createHash('sha1').update(String(storageKey || '')).digest('hex').slice(0, 12);
  return path.join(snapshotsDir, `${safeBase}-${hash}.bin`);
};

const parseLegacyImageDataUrl = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = raw.match(/^data:([^;,]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const contents = Buffer.from(match[2], 'base64');
  const mimeType = detectBoardAssetMimeType(contents);
  if (!mimeType || contents.length === 0) return null;
  return { contents, mimeType };
};

const storedStudents = readJson(studentsFile, []);
const students = Array.isArray(storedStudents) ? storedStudents : [];
const initialAssets = normalizeBoardAssetEntries(readJson(boardAssetsFile, []));
const nextAssets = [...initialAssets];
const assetByStudentHash = new Map(
  nextAssets.map((entry) => [`${entry.studentId}:${entry.hash}`, entry])
);
const filesToCreate = new Map();
const snapshotPlans = [];
const blockedSnapshots = [];
const consideredSnapshotPaths = new Set();
const createdAt = new Date().toISOString();

const getOrCreateAsset = (student, parsed, stagedAssets, stagedAssetByStudentHash, stagedFiles) => {
  const hash = getBoardAssetHash(parsed.contents);
  const key = `${student.id}:${hash}`;
  const existing = assetByStudentHash.get(key) || stagedAssetByStudentHash.get(key);
  if (existing) return existing;
  const storageName = buildBoardAssetStorageName(hash, parsed.mimeType);
  const entry = normalizeBoardAssetEntry({
    id: crypto.randomUUID(),
    studentId: student.id,
    teacherId: String(student.teacherId || '').trim(),
    storageName,
    mimeType: parsed.mimeType,
    hash,
    sizeBytes: parsed.contents.length,
    createdAt,
  });
  if (!entry) return null;
  stagedAssets.push(entry);
  stagedAssetByStudentHash.set(key, entry);
  if (!fs.existsSync(path.join(uploadsDir, storageName))) {
    stagedFiles.set(storageName, parsed.contents);
  }
  return entry;
};

for (const student of students) {
  const studentId = String(student?.id || '').trim();
  const teacherId = String(student?.teacherId || '').trim();
  if (!studentId || !teacherId) continue;
  const docName = `board-${teacherId}-${studentId}`;
  const candidatePaths = [buildSnapshotPath(docName), buildSnapshotPath(`collab/${docName}`)];
  const snapshotPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  candidatePaths.forEach((candidate) => consideredSnapshotPaths.add(path.resolve(candidate)));
  if (!snapshotPath) continue;

  try {
    const raw = fs.readFileSync(snapshotPath);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(raw));
    const items = doc.getArray('items').toArray().map((item) => item?.toJSON?.() ?? item);
    const legacyImages = items.filter((item) => item?.type === 'image' && typeof item.dataUrl === 'string' && item.dataUrl);
    if (legacyImages.length === 0) {
      doc.destroy();
      continue;
    }

    const stagedAssets = [];
    const stagedAssetByStudentHash = new Map();
    const stagedFiles = new Map();
    let convertedImages = 0;
    let conversionFailed = false;
    const nextItems = items.map((item) => {
      if (item?.type !== 'image' || typeof item.dataUrl !== 'string' || !item.dataUrl) return item;
      const parsed = parseLegacyImageDataUrl(item.dataUrl);
      const asset = parsed
        ? getOrCreateAsset(
          { id: studentId, teacherId },
          parsed,
          stagedAssets,
          stagedAssetByStudentHash,
          stagedFiles
        )
        : null;
      if (!asset) {
        conversionFailed = true;
        return item;
      }
      convertedImages += 1;
      const rest = { ...item };
      delete rest.dataUrl;
      delete rest.imageUrl;
      return {
        ...rest,
        assetId: asset.id,
        assetUrl: `/uploads/${asset.storageName}`,
      };
    });
    doc.destroy();

    if (conversionFailed || convertedImages !== legacyImages.length) {
      blockedSnapshots.push({ snapshotPath, reason: 'one or more image data URLs are invalid' });
      continue;
    }

    const compactedDoc = new Y.Doc();
    compactedDoc.getArray('items').push(nextItems);
    const compacted = Buffer.from(Y.encodeStateAsUpdate(compactedDoc));
    const verificationItems = compactedDoc.getArray('items').toArray();
    compactedDoc.destroy();
    if (verificationItems.length !== items.length) {
      blockedSnapshots.push({ snapshotPath, reason: 'item count changed during compaction' });
      continue;
    }
    for (const entry of stagedAssets) {
      nextAssets.unshift(entry);
      assetByStudentHash.set(`${entry.studentId}:${entry.hash}`, entry);
    }
    for (const [storageName, contents] of stagedFiles.entries()) {
      filesToCreate.set(storageName, contents);
    }
    snapshotPlans.push({
      snapshotPath,
      docName,
      itemCount: items.length,
      convertedImages,
      beforeBytes: raw.length,
      afterBytes: compacted.length,
      contents: compacted,
    });
  } catch (error) {
    blockedSnapshots.push({ snapshotPath, reason: error?.message || String(error) });
  }
}

const existingSnapshotFiles = fs.existsSync(snapshotsDir)
  ? fs.readdirSync(snapshotsDir)
    .filter((name) => name.endsWith('.bin'))
    .map((name) => path.resolve(snapshotsDir, name))
  : [];
const unmatchedSnapshotCount = existingSnapshotFiles.filter((filePath) => !consideredSnapshotPaths.has(filePath)).length;
const summary = {
  mode: applyChanges ? 'apply' : 'dry-run',
  dataDir,
  uploadsDir,
  snapshotsDir,
  scannedStudents: students.length,
  plannedSnapshots: snapshotPlans.length,
  plannedImages: snapshotPlans.reduce((sum, plan) => sum + plan.convertedImages, 0),
  filesToCreate: filesToCreate.size,
  newAssetGrants: nextAssets.length - initialAssets.length,
  beforeBytes: snapshotPlans.reduce((sum, plan) => sum + plan.beforeBytes, 0),
  afterBytes: snapshotPlans.reduce((sum, plan) => sum + plan.afterBytes, 0),
  blockedSnapshots,
  unmatchedSnapshotCount,
};

if (!applyChanges) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

if (blockedSnapshots.length > 0 || unmatchedSnapshotCount > 0) {
  throw new Error(
    `Migration refused: ${blockedSnapshots.length} blocked and ${unmatchedSnapshotCount} unmatched snapshots require review.`
  );
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(dataDir, 'migration-backups', `board-assets-${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });
if (fs.existsSync(boardAssetsFile)) {
  fs.copyFileSync(boardAssetsFile, path.join(backupDir, 'board-assets.json'));
}
for (const plan of snapshotPlans) {
  fs.copyFileSync(plan.snapshotPath, path.join(backupDir, path.basename(plan.snapshotPath)));
}
for (const [storageName, contents] of filesToCreate.entries()) {
  const filePath = path.join(uploadsDir, storageName);
  if (!fs.existsSync(filePath)) writeFileAtomic(filePath, contents);
}
writeFileAtomic(boardAssetsFile, `${JSON.stringify(nextAssets, null, 2)}\n`, 'utf8');
for (const plan of snapshotPlans) {
  writeFileAtomic(plan.snapshotPath, plan.contents);
}

console.log(JSON.stringify({ ...summary, backupDir }, null, 2));
