import crypto from 'crypto';

export const createAccessCodeLookupHash = (code, secret) => {
  const normalizedCode = typeof code === 'string' ? code.trim() : String(code ?? '').trim();
  const normalizedSecret = typeof secret === 'string' ? secret : String(secret ?? '');
  if (!normalizedCode || !normalizedSecret) return '';
  return crypto
    .createHmac('sha256', normalizedSecret)
    .update(normalizedCode)
    .digest('base64url');
};

export const getAccessCodeCandidates = (records, lookupHash, predicate = null) => {
  const matching = [];
  const legacy = [];
  const normalizedLookupHash = typeof lookupHash === 'string' ? lookupHash.trim() : '';
  const filter = typeof predicate === 'function' ? predicate : () => true;

  (Array.isArray(records) ? records : []).forEach((record) => {
    if (!record || typeof record !== 'object' || !filter(record)) return;
    const storedLookupHash = typeof record.codeLookupHash === 'string'
      ? record.codeLookupHash.trim()
      : '';
    if (!storedLookupHash) {
      legacy.push(record);
      return;
    }
    if (normalizedLookupHash && storedLookupHash === normalizedLookupHash) {
      matching.push(record);
    }
  });

  return [...matching, ...legacy];
};

export const getAccessCodeRecoveryCandidates = (records, lookupHash, predicate = null) => {
  const normalizedLookupHash = typeof lookupHash === 'string' ? lookupHash.trim() : '';
  const filter = typeof predicate === 'function' ? predicate : () => true;
  return (Array.isArray(records) ? records : []).filter((record) => {
    if (!record || typeof record !== 'object' || !filter(record)) return false;
    const storedLookupHash = typeof record.codeLookupHash === 'string'
      ? record.codeLookupHash.trim()
      : '';
    return Boolean(storedLookupHash && storedLookupHash !== normalizedLookupHash);
  });
};
