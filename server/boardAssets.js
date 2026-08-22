import crypto from 'crypto';
import path from 'path';

const MIME_EXTENSION = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
});

const isPng = (buffer) => (
  buffer.length >= 8
  && buffer[0] === 0x89
  && buffer[1] === 0x50
  && buffer[2] === 0x4e
  && buffer[3] === 0x47
  && buffer[4] === 0x0d
  && buffer[5] === 0x0a
  && buffer[6] === 0x1a
  && buffer[7] === 0x0a
);

const isJpeg = (buffer) => (
  buffer.length >= 3
  && buffer[0] === 0xff
  && buffer[1] === 0xd8
  && buffer[2] === 0xff
);

const isWebp = (buffer) => (
  buffer.length >= 12
  && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
  && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
);

const isGif = (buffer) => {
  if (buffer.length < 6) return false;
  const signature = buffer.subarray(0, 6).toString('ascii');
  return signature === 'GIF87a' || signature === 'GIF89a';
};

export const detectBoardAssetMimeType = (value) => {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  if (isPng(buffer)) return 'image/png';
  if (isJpeg(buffer)) return 'image/jpeg';
  if (isWebp(buffer)) return 'image/webp';
  if (isGif(buffer)) return 'image/gif';
  return '';
};

export const getBoardAssetExtension = (mimeType) => MIME_EXTENSION[String(mimeType || '').trim()] || '';

export const getBoardAssetHash = (value) => crypto
  .createHash('sha256')
  .update(Buffer.isBuffer(value) ? value : Buffer.from(value || []))
  .digest('hex');

export const buildBoardAssetStorageName = (hash, mimeType) => {
  const normalizedHash = String(hash || '').trim().toLowerCase();
  const extension = getBoardAssetExtension(mimeType);
  if (!/^[a-f0-9]{64}$/.test(normalizedHash) || !extension) return '';
  return `board-asset-${normalizedHash}${extension}`;
};

export const normalizeBoardAssetEntry = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = String(value.id || '').trim();
  const studentId = String(value.studentId || '').trim();
  const teacherId = String(value.teacherId || '').trim();
  const groupId = String(value.groupId || value.learningGroupId || '').trim();
  const lessonId = String(value.lessonId || value.learningLessonId || value.sessionId || '').trim();
  const storageName = path.basename(String(value.storageName || '').trim());
  const mimeType = String(value.mimeType || '').trim().toLowerCase();
  const hash = String(value.hash || '').trim().toLowerCase();
  const sizeBytes = Math.max(0, Math.floor(Number(value.sizeBytes) || 0));
  const createdAt = String(value.createdAt || '').trim();
  if (!id || (!studentId && !lessonId) || !storageName || !getBoardAssetExtension(mimeType)) return null;
  if (lessonId && (!groupId || !teacherId)) return null;
  if (!storageName.startsWith('board-asset-')) return null;
  return {
    id,
    studentId,
    teacherId,
    storageName,
    mimeType,
    hash: /^[a-f0-9]{64}$/.test(hash) ? hash : '',
    sizeBytes,
    createdAt,
    ...(lessonId ? { groupId, lessonId } : {}),
  };
};

export const normalizeBoardAssetEntries = (value) => (
  Array.isArray(value) ? value.map(normalizeBoardAssetEntry).filter(Boolean) : []
);
