import crypto from 'crypto';

export const WORKBOOK_HELPER_TICKET_TTL_MS = 3 * 60 * 1000;
export const WORKBOOK_HELPER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const WORKBOOK_HELPER_MAX_SESSIONS = 5000;
export const WORKBOOK_HELPER_MAX_TICKETS = 1000;
export const WORKBOOK_SOLUTION_NAME_MAX_LENGTH = 100;
export const WORKBOOK_HELPER_SOLUTION_FOLDER = 'Решённые задания';

const WORKBOOK_EXTENSIONS = new Set([
  '.xls',
  '.xlsx',
  '.xlsm',
  '.xlsb',
  '.ods',
  '.fods',
]);

const normalizeText = (value) => String(value || '').replace(/\0/g, '').trim();

export const getWorkbookExtension = (name) => {
  const match = normalizeText(name).match(/(\.[^.\\/]+)$/);
  return match ? match[1].toLowerCase() : '';
};

export const isWorkbookFileName = (name) => WORKBOOK_EXTENSIONS.has(getWorkbookExtension(name));

export const buildWorkbookSolutionName = (name) => {
  const sourceName = normalizeText(name) || 'Таблица.ods';
  const extension = getWorkbookExtension(sourceName);
  const base = extension ? sourceName.slice(0, -extension.length) : sourceName;
  if (/решен/i.test(base)) return sourceName;
  return `${base} — решение${extension}`;
};

export const buildWorkbookSolutionKey = (studentId, sourceFileId) => {
  const normalizedStudentId = normalizeText(studentId);
  const normalizedSourceFileId = normalizeText(sourceFileId);
  if (!normalizedStudentId || !normalizedSourceFileId) return '';
  return crypto
    .createHash('sha256')
    .update(`${normalizedStudentId}\0${normalizedSourceFileId}`)
    .digest('hex');
};

export const createWorkbookSolutionBindingKey = () => crypto.randomBytes(32).toString('hex');

export const buildNamedWorkbookSolutionName = (value, sourceName) => {
  const raw = String(value ?? '');
  if (Array.from(raw).some((character) => character.charCodeAt(0) < 32)) return '';
  const sourceExtension = getWorkbookExtension(sourceName);
  if (!WORKBOOK_EXTENSIONS.has(sourceExtension)) return '';
  let base = raw.trim().replace(/\s+/g, ' ');
  const inputExtension = getWorkbookExtension(base);
  if (WORKBOOK_EXTENSIONS.has(inputExtension)) {
    if (inputExtension !== sourceExtension) return '';
    base = base.slice(0, -inputExtension.length).trim();
  }
  if (
    !base
    || base.length > WORKBOOK_SOLUTION_NAME_MAX_LENGTH
    || base === '.'
    || base === '..'
    || base.endsWith('.')
    || /[<>:"/\\|?*]/.test(base)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)
  ) return '';
  return `${base}${sourceExtension}`;
};

export const createWorkbookHelperToken = () => crypto.randomBytes(32).toString('base64url');

export const hashWorkbookHelperToken = (token) => {
  const normalized = normalizeText(token);
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(normalized)) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

export const normalizeWorkbookContentHash = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : '';
};

export const parseWorkbookHelperAuthorization = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const match = normalized.match(/^Workbook\s+([A-Za-z0-9_-]{32,160})$/i);
  return match?.[1] || '';
};

export const workbookHelperTokenMatchesHash = (token, storedHash) => {
  const actualHash = hashWorkbookHelperToken(token);
  const normalizedStoredHash = normalizeWorkbookContentHash(storedHash);
  if (!actualHash || !normalizedStoredHash) return false;
  const actual = Buffer.from(actualHash, 'hex');
  const stored = Buffer.from(normalizedStoredHash, 'hex');
  return actual.length === stored.length && crypto.timingSafeEqual(actual, stored);
};

export const resolveWorkbookRevisionWrite = ({
  currentRevision = 0,
  currentContentHash = '',
  expectedRevision,
  incomingContentHash = '',
} = {}) => {
  const revision = Math.max(0, Math.floor(Number(currentRevision) || 0));
  const contentHash = normalizeWorkbookContentHash(currentContentHash);
  const incomingHash = normalizeWorkbookContentHash(incomingContentHash);
  const hasExpectedRevision = expectedRevision !== ''
    && expectedRevision !== null
    && typeof expectedRevision !== 'undefined';
  const parsedExpectedRevision = Number(expectedRevision);

  if (!incomingHash) {
    return { action: 'invalid', revision, contentHash };
  }
  if (contentHash && incomingHash === contentHash) {
    return { action: 'unchanged', revision, contentHash };
  }
  if (
    hasExpectedRevision
    && (!Number.isInteger(parsedExpectedRevision) || parsedExpectedRevision < 0)
  ) {
    return { action: 'invalid', revision, contentHash };
  }
  if (hasExpectedRevision && parsedExpectedRevision !== revision) {
    return { action: 'conflict', revision, contentHash };
  }
  return {
    action: 'write',
    revision: revision + 1,
    contentHash: incomingHash,
  };
};

export const normalizeWorkbookHelperSessions = (value, options = {}) => {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const source = Array.isArray(value) ? value : [];
  const seenTokens = new Set();
  return source
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = normalizeText(entry.id);
      const tokenHash = normalizeText(entry.tokenHash).toLowerCase();
      const studentId = normalizeText(entry.studentId);
      const sourceFileId = normalizeText(entry.sourceFileId);
      const launchFileId = normalizeText(entry.launchFileId || sourceFileId);
      const solutionKey = normalizeText(entry.solutionKey).toLowerCase();
      const solutionFileId = normalizeText(entry.solutionFileId);
      const nameRequired = typeof entry.nameRequired === 'boolean' ? entry.nameRequired : false;
      const contentHash = normalizeWorkbookContentHash(entry.contentHash);
      const createdAtMs = Number(entry.createdAtMs);
      const lastUsedAtMs = Number(entry.lastUsedAtMs);
      const expiresAtMs = Number(entry.expiresAtMs);
      const revision = Math.max(0, Math.floor(Number(entry.revision) || 0));
      if (
        !id
        || !/^[0-9a-f]{64}$/.test(tokenHash)
        || seenTokens.has(tokenHash)
        || !studentId
        || !sourceFileId
        || !launchFileId
        || !/^[0-9a-f]{64}$/.test(solutionKey)
        || !Number.isFinite(expiresAtMs)
        || expiresAtMs <= nowMs
        || entry.revokedAt
      ) return null;
      seenTokens.add(tokenHash);
      return {
        id,
        tokenHash,
        studentId,
        sourceFileId,
        launchFileId,
        solutionKey,
        solutionFileId,
        nameRequired,
        revision,
        contentHash,
        createdAtMs: Number.isFinite(createdAtMs) ? Math.floor(createdAtMs) : nowMs,
        lastUsedAtMs: Number.isFinite(lastUsedAtMs) ? Math.floor(lastUsedAtMs) : nowMs,
        expiresAtMs: Math.floor(expiresAtMs),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.lastUsedAtMs - left.lastUsedAtMs)
    .slice(0, WORKBOOK_HELPER_MAX_SESSIONS);
};
