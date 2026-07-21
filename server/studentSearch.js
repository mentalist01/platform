export const STUDENT_SEARCH_QUERY_MAX_LENGTH = 120;
export const STUDENT_SEARCH_SNIPPET_MAX_LENGTH = 320;

const normalizeWhitespace = (value) => String(value ?? '')
  .replace(/[\u0000\u200B-\u200D\u2060\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export const normalizeStudentSearchText = (value) => normalizeWhitespace(value)
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е');

export const buildStudentSearchQuery = (value) => {
  const raw = normalizeWhitespace(value).slice(0, STUDENT_SEARCH_QUERY_MAX_LENGTH);
  const normalized = normalizeStudentSearchText(raw);
  const tokens = Array.from(new Set(normalized.split(' ').filter(Boolean))).slice(0, 12);
  return { raw, normalized, tokens };
};

const findRawMatchIndex = (value, query) => {
  const raw = String(value ?? '');
  if (!raw || !query?.normalized) return -1;
  const comparable = raw.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const exactIndex = comparable.indexOf(query.normalized);
  if (exactIndex >= 0) return exactIndex;
  let firstIndex = -1;
  query.tokens.forEach((token) => {
    const index = comparable.indexOf(token);
    if (index >= 0 && (firstIndex < 0 || index < firstIndex)) firstIndex = index;
  });
  return firstIndex;
};

export const createStudentSearchSnippet = (
  value,
  query,
  maxLength = STUDENT_SEARCH_SNIPPET_MAX_LENGTH
) => {
  const raw = String(value ?? '').replace(/\0/g, '').trim();
  if (!raw) return '';
  const safeLimit = Math.max(80, Math.min(500, Math.floor(Number(maxLength) || STUDENT_SEARCH_SNIPPET_MAX_LENGTH)));
  const matchIndex = findRawMatchIndex(raw, query);
  const center = matchIndex >= 0 ? matchIndex : 0;
  let start = Math.max(0, center - Math.floor(safeLimit * 0.32));
  let end = Math.min(raw.length, start + safeLimit);

  if (start > 0) {
    const lineStart = raw.lastIndexOf('\n', center);
    if (lineStart >= Math.max(0, center - Math.floor(safeLimit * 0.45))) {
      start = lineStart + 1;
      end = Math.min(raw.length, start + safeLimit);
    }
  }
  if (end < raw.length) {
    const lineEnd = raw.indexOf('\n', Math.max(center, end - Math.floor(safeLimit * 0.2)));
    if (lineEnd >= 0 && lineEnd - start <= safeLimit) end = lineEnd;
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < raw.length ? '…' : '';
  const contentLimit = Math.max(1, safeLimit - prefix.length - suffix.length);
  let snippet = raw.slice(start, end).trim();
  if (snippet.length > contentLimit) snippet = snippet.slice(0, contentLimit).trimEnd();
  return `${prefix}${snippet}${suffix}`;
};

const normalizeCandidateFields = (fields) => (Array.isArray(fields) ? fields : [])
  .map((field) => ({
    name: String(field?.name || 'metadata').trim() || 'metadata',
    text: String(field?.text ?? ''),
    normalized: normalizeStudentSearchText(field?.text),
    weight: Number.isFinite(Number(field?.weight)) ? Number(field.weight) : 0,
  }))
  .filter((field) => field.normalized);

export const matchStudentSearchCandidate = (candidate, queryLike) => {
  const query = typeof queryLike === 'string' ? buildStudentSearchQuery(queryLike) : queryLike;
  if (!query?.normalized || !Array.isArray(query?.tokens) || query.tokens.length === 0) return null;
  const fields = normalizeCandidateFields(candidate?.fields);
  if (!fields.length) return null;
  const allText = fields.map((field) => field.normalized).join(' ');
  if (!query.tokens.every((token) => allText.includes(token))) return null;

  let bestField = fields[0];
  let bestFieldScore = Number.NEGATIVE_INFINITY;
  fields.forEach((field) => {
    const exact = field.normalized.includes(query.normalized);
    const tokenCount = query.tokens.reduce((count, token) => count + (field.normalized.includes(token) ? 1 : 0), 0);
    const startsWith = field.normalized.startsWith(query.normalized);
    const equals = field.normalized === query.normalized;
    const score = field.weight
      + (equals ? 900 : startsWith ? 620 : exact ? 420 : 0)
      + tokenCount * 28;
    if (score > bestFieldScore) {
      bestField = field;
      bestFieldScore = score;
    }
  });

  const base = candidate?.result && typeof candidate.result === 'object' ? candidate.result : {};
  const timestampMs = Date.parse(String(base.timestamp || ''));
  const recencyBonus = Number.isFinite(timestampMs)
    ? Math.max(0, Math.min(40, 40 - ((Date.now() - timestampMs) / (365 * 24 * 60 * 60 * 1000))))
    : 0;
  return {
    ...base,
    snippet: createStudentSearchSnippet(bestField.text, query),
    matchedField: bestField.name,
    score: Math.round((bestFieldScore + recencyBonus) * 100) / 100,
  };
};
